/**
 * Authentication Service
 *
 * Handles user registration, login, token management, and session handling.
 *
 * Security features:
 * - Argon2id password hashing (resistant to GPU/ASIC attacks)
 * - JWT access tokens (short-lived, 15 minutes)
 * - Refresh tokens stored as hashes in database
 * - Timing-safe password comparison
 */

import { hash, verify } from '@node-rs/argon2';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { eq, and, lt, gt } from 'drizzle-orm';
import { db } from '../db';
import { users, sessions, type User, type NewUser, type Session } from '../db/schema';

// =============================================================================
// Configuration
// =============================================================================

const CONFIG = {
  // Argon2id parameters (OWASP recommended)
  argon2: {
    memoryCost: 65536, // 64 MB
    timeCost: 3,
    parallelism: 4,
  },
  // JWT settings
  jwt: {
    accessTokenExpiry: process.env.JWT_ACCESS_TOKEN_EXPIRY || '15m',
    refreshTokenExpiry: process.env.JWT_REFRESH_TOKEN_EXPIRY || '30d',
    algorithm: 'HS256' as const,
  },
  // Session settings
  session: {
    refreshTokenBytes: 32, // 256 bits
    maxSessionsPerUser: 5,
  },
};

// =============================================================================
// Types
// =============================================================================

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds until access token expires
}

export interface TokenPayload extends JWTPayload {
  sub: string; // User ID
  email: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  displayName?: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface OAuthUserInfo {
  provider: 'google' | 'github';
  providerId: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
}

// =============================================================================
// Auth Service Class
// =============================================================================

export class AuthService {
  private jwtSecret: Uint8Array;

  constructor(jwtSecret?: string) {
    const secret = jwtSecret || process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is required');
    }
    this.jwtSecret = new TextEncoder().encode(secret);
  }

  // ===========================================================================
  // Registration
  // ===========================================================================

  /**
   * Register a new user with email and password.
   * @throws Error if email already exists
   */
  async register(input: RegisterInput): Promise<User> {
    const { email, password, displayName } = input;

    // Validate email format
    if (!this.isValidEmail(email)) {
      throw new Error('Invalid email format');
    }

    // Validate password strength
    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }

    // Check if user already exists
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, email.toLowerCase()),
    });

    if (existingUser) {
      throw new Error('Email already registered');
    }

    // Hash password with Argon2id
    const passwordHash = await hash(password, CONFIG.argon2);

    // Create user
    const [user] = await db
      .insert(users)
      .values({
        email: email.toLowerCase(),
        passwordHash,
        displayName: displayName || null,
        isVerified: false, // TODO: Email verification
        isActive: true,
      })
      .returning();

    return user;
  }

  // ===========================================================================
  // Login
  // ===========================================================================

  /**
   * Authenticate user with email and password.
   * @returns Auth tokens on success
   * @throws Error if credentials are invalid
   */
  async login(
    input: LoginInput,
    metadata?: { userAgent?: string; ipAddress?: string }
  ): Promise<AuthTokens> {
    const { email, password } = input;

    // Find user by email
    const user = await db.query.users.findFirst({
      where: eq(users.email, email.toLowerCase()),
    });

    if (!user) {
      // Use constant-time comparison even for non-existent users
      await this.fakePasswordCheck();
      throw new Error('Invalid credentials');
    }

    // Check if user is active
    if (!user.isActive) {
      throw new Error('Account is disabled');
    }

    // Verify password (must have password hash for email login)
    if (!user.passwordHash) {
      throw new Error('Invalid credentials'); // OAuth-only user
    }

    const isValid = await verify(user.passwordHash, password);
    if (!isValid) {
      throw new Error('Invalid credentials');
    }

    // Update last login timestamp
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

    // Create tokens and session
    return this.createSession(user.id, user.email, metadata);
  }

  // ===========================================================================
  // OAuth Login
  // ===========================================================================

  /**
   * Find or create user from OAuth provider info, then create session.
   * @returns Auth tokens on success
   */
  async loginOAuth(
    oauthInfo: OAuthUserInfo,
    metadata?: { userAgent?: string; ipAddress?: string }
  ): Promise<AuthTokens> {
    const { provider, providerId, email, displayName, avatarUrl } = oauthInfo;

    // Try to find existing user by OAuth provider + ID
    let user = await db.query.users.findFirst({
      where: and(eq(users.oauthProvider, provider), eq(users.oauthId, providerId)),
    });

    if (!user) {
      // Check if user exists with this email (might have registered differently)
      user = await db.query.users.findFirst({
        where: eq(users.email, email.toLowerCase()),
      });

      if (user) {
        // Link OAuth to existing account
        await db
          .update(users)
          .set({
            oauthProvider: provider,
            oauthId: providerId,
            avatarUrl: avatarUrl || user.avatarUrl,
            isVerified: true, // OAuth emails are verified by provider
          })
          .where(eq(users.id, user.id));
      } else {
        // Create new user
        const [newUser] = await db
          .insert(users)
          .values({
            email: email.toLowerCase(),
            oauthProvider: provider,
            oauthId: providerId,
            displayName: displayName || null,
            avatarUrl: avatarUrl || null,
            isVerified: true, // OAuth emails are verified by provider
            isActive: true,
          })
          .returning();
        user = newUser;
      }
    }

    // Check if user is active
    if (!user.isActive) {
      throw new Error('Account is disabled');
    }

    // Update last login and avatar (might have changed)
    await db
      .update(users)
      .set({
        lastLoginAt: new Date(),
        avatarUrl: avatarUrl || user.avatarUrl,
        displayName: displayName || user.displayName,
      })
      .where(eq(users.id, user.id));

    // Create tokens and session
    return this.createSession(user.id, user.email, metadata);
  }

  // ===========================================================================
  // Token Management
  // ===========================================================================

  /**
   * Refresh access token using a valid refresh token.
   * @returns New auth tokens
   * @throws Error if refresh token is invalid or expired
   */
  async refresh(
    refreshToken: string,
    metadata?: { userAgent?: string; ipAddress?: string }
  ): Promise<AuthTokens> {
    // Hash the incoming refresh token
    const tokenHash = this.hashToken(refreshToken);

    // Find session by token hash
    const session = await db.query.sessions.findFirst({
      where: and(eq(sessions.refreshTokenHash, tokenHash), gt(sessions.expiresAt, new Date())),
    });

    if (!session) {
      throw new Error('Invalid or expired refresh token');
    }

    // Get user
    const user = await db.query.users.findFirst({
      where: eq(users.id, session.userId),
    });

    if (!user || !user.isActive) {
      throw new Error('User not found or disabled');
    }

    // Delete old session
    await db.delete(sessions).where(eq(sessions.id, session.id));

    // Create new session (token rotation)
    return this.createSession(user.id, user.email, metadata);
  }

  /**
   * Verify and decode an access token.
   * @returns Token payload with user info
   * @throws Error if token is invalid or expired
   */
  async verifyAccessToken(token: string): Promise<TokenPayload> {
    try {
      const { payload } = await jwtVerify(token, this.jwtSecret, {
        algorithms: [CONFIG.jwt.algorithm],
      });

      return payload as TokenPayload;
    } catch (error) {
      throw new Error('Invalid or expired access token');
    }
  }

  // ===========================================================================
  // Logout
  // ===========================================================================

  /**
   * Logout user by invalidating their refresh token.
   */
  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);

    await db.delete(sessions).where(eq(sessions.refreshTokenHash, tokenHash));
  }

  /**
   * Logout user from all devices.
   */
  async logoutAll(userId: string): Promise<void> {
    await db.delete(sessions).where(eq(sessions.userId, userId));
  }

  // ===========================================================================
  // Session Management
  // ===========================================================================

  /**
   * Get all active sessions for a user.
   */
  async getUserSessions(userId: string): Promise<Session[]> {
    return db.query.sessions.findMany({
      where: and(eq(sessions.userId, userId), gt(sessions.expiresAt, new Date())),
    });
  }

  /**
   * Clean up expired sessions (should be run periodically).
   */
  async cleanupExpiredSessions(): Promise<number> {
    const result = await db.delete(sessions).where(lt(sessions.expiresAt, new Date())).returning();

    return result.length;
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private async createSession(
    userId: string,
    email: string,
    metadata?: { userAgent?: string; ipAddress?: string }
  ): Promise<AuthTokens> {
    // Generate refresh token
    const refreshToken = this.generateRefreshToken();
    const refreshTokenHash = this.hashToken(refreshToken);

    // Calculate expiry
    const expiresIn = this.parseExpiry(CONFIG.jwt.accessTokenExpiry);
    const refreshExpiresAt = new Date(
      Date.now() + this.parseExpiry(CONFIG.jwt.refreshTokenExpiry) * 1000
    );

    // Enforce max sessions per user
    await this.enforceMaxSessions(userId);

    // Create session in database
    await db.insert(sessions).values({
      userId,
      refreshTokenHash,
      userAgent: metadata?.userAgent || null,
      ipAddress: metadata?.ipAddress || null,
      expiresAt: refreshExpiresAt,
    });

    // Generate access token
    const accessToken = await this.generateAccessToken(userId, email, expiresIn);

    return {
      accessToken,
      refreshToken,
      expiresIn,
    };
  }

  private async generateAccessToken(userId: string, email: string, expiresIn: number): Promise<string> {
    return new SignJWT({ sub: userId, email } as TokenPayload)
      .setProtectedHeader({ alg: CONFIG.jwt.algorithm })
      .setIssuedAt()
      .setExpirationTime(`${expiresIn}s`)
      .sign(this.jwtSecret);
  }

  private generateRefreshToken(): string {
    return randomBytes(CONFIG.session.refreshTokenBytes).toString('hex');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async enforceMaxSessions(userId: string): Promise<void> {
    // Get all sessions for user, ordered by creation date
    const userSessions = await db.query.sessions.findMany({
      where: eq(sessions.userId, userId),
      orderBy: (sessions, { asc }) => [asc(sessions.createdAt)],
    });

    // Delete oldest sessions if over limit
    const excess = userSessions.length - CONFIG.session.maxSessionsPerUser + 1;
    if (excess > 0) {
      const sessionsToDelete = userSessions.slice(0, excess);
      for (const session of sessionsToDelete) {
        await db.delete(sessions).where(eq(sessions.id, session.id));
      }
    }
  }

  private parseExpiry(expiry: string): number {
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new Error(`Invalid expiry format: ${expiry}`);
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 60 * 60;
      case 'd':
        return value * 60 * 60 * 24;
      default:
        throw new Error(`Unknown time unit: ${unit}`);
    }
  }

  private isValidEmail(email: string): boolean {
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private async fakePasswordCheck(): Promise<void> {
    // Perform a fake hash to prevent timing attacks on user enumeration
    await hash('fake-password-for-timing', CONFIG.argon2);
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let authServiceInstance: AuthService | null = null;

/**
 * Get the singleton AuthService instance.
 * Lazily initialized to allow JWT_SECRET to be set after module load.
 */
export function getAuthService(): AuthService {
  if (!authServiceInstance) {
    authServiceInstance = new AuthService();
  }
  return authServiceInstance;
}
