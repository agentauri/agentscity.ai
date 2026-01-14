/**
 * Authentication Routes (OAuth Only)
 *
 * Handles OAuth authentication with Google and GitHub.
 *
 * Endpoints:
 * - GET /api/auth/google - Redirect to Google OAuth
 * - GET /api/auth/google/callback - Google OAuth callback
 * - GET /api/auth/github - Redirect to GitHub OAuth
 * - GET /api/auth/github/callback - GitHub OAuth callback
 * - POST /api/auth/refresh - Refresh access token using refresh token
 * - POST /api/auth/logout - Logout (invalidate refresh token)
 * - GET /api/auth/me - Get current user info (requires auth)
 */

import type { FastifyInstance } from 'fastify';
import { getAuthService } from '../services/auth-service';
import { requireJwtAuth, type AuthenticatedRequest } from '../middleware/jwt-auth';

// =============================================================================
// OAuth Configuration
// =============================================================================

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '';

// Callback URL base - determined from request or env
const getCallbackBase = (request: { protocol: string; hostname: string }) => {
  const base = process.env.AUTH_CALLBACK_URL || `${request.protocol}://${request.hostname}:3000`;
  return base;
};

// Frontend URL for redirects after auth
const getFrontendUrl = () => {
  return process.env.FRONTEND_URL || 'http://localhost:5173';
};

// =============================================================================
// Response Types
// =============================================================================

interface RefreshResponse {
  accessToken: string;
  expiresIn: number;
}

interface UserResponse {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  isVerified: boolean;
  createdAt: string;
}

interface ErrorResponse {
  error: string;
  message: string;
}

// =============================================================================
// Cookie Configuration
// =============================================================================

const REFRESH_TOKEN_COOKIE = 'refreshToken';

const refreshTokenCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const, // 'lax' needed for OAuth redirects
  path: '/api/auth',
  maxAge: 30 * 24 * 60 * 60, // 30 days in seconds
};

// =============================================================================
// Route Registration
// =============================================================================

export async function registerAuthRoutes(server: FastifyInstance): Promise<void> {
  // ===========================================================================
  // Google OAuth
  // ===========================================================================

  /**
   * GET /api/auth/google
   *
   * Redirect to Google OAuth consent screen.
   */
  server.get('/api/auth/google', async (request, reply) => {
    if (!GOOGLE_CLIENT_ID) {
      return reply.code(501).send({
        error: 'Not Configured',
        message: 'Google OAuth is not configured',
      });
    }

    const callbackUrl = `${getCallbackBase(request)}/api/auth/google/callback`;
    const state = Buffer.from(JSON.stringify({ redirect: getFrontendUrl() })).toString('base64');

    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'offline',
      prompt: 'consent',
    });

    return reply.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  });

  /**
   * GET /api/auth/google/callback
   *
   * Handle Google OAuth callback.
   */
  server.get<{
    Querystring: { code?: string; state?: string; error?: string };
  }>('/api/auth/google/callback', async (request, reply) => {
    const { code, state, error } = request.query;

    if (error) {
      return reply.redirect(`${getFrontendUrl()}?auth_error=${encodeURIComponent(error)}`);
    }

    if (!code) {
      return reply.redirect(`${getFrontendUrl()}?auth_error=missing_code`);
    }

    try {
      const callbackUrl = `${getCallbackBase(request)}/api/auth/google/callback`;

      // Exchange code for tokens
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          code,
          grant_type: 'authorization_code',
          redirect_uri: callbackUrl,
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error('Failed to exchange code for tokens');
      }

      const tokenData = await tokenResponse.json() as { access_token: string };

      // Get user info
      const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (!userResponse.ok) {
        throw new Error('Failed to get user info');
      }

      const userData = await userResponse.json() as {
        id: string;
        email: string;
        name?: string;
        picture?: string;
      };

      // Create session
      const authService = getAuthService();
      const tokens = await authService.loginOAuth(
        {
          provider: 'google',
          providerId: userData.id,
          email: userData.email,
          displayName: userData.name,
          avatarUrl: userData.picture,
        },
        {
          userAgent: request.headers['user-agent'],
          ipAddress: request.ip,
        }
      );

      // Set refresh token cookie
      reply.setCookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, refreshTokenCookieOptions);

      // Redirect to frontend with access token
      const frontendUrl = getFrontendUrl();
      return reply.redirect(
        `${frontendUrl}?access_token=${tokens.accessToken}&expires_in=${tokens.expiresIn}`
      );
    } catch (error) {
      console.error('[Auth] Google OAuth error:', error);
      return reply.redirect(`${getFrontendUrl()}?auth_error=oauth_failed`);
    }
  });

  // ===========================================================================
  // GitHub OAuth
  // ===========================================================================

  /**
   * GET /api/auth/github
   *
   * Redirect to GitHub OAuth consent screen.
   */
  server.get('/api/auth/github', async (request, reply) => {
    if (!GITHUB_CLIENT_ID) {
      return reply.code(501).send({
        error: 'Not Configured',
        message: 'GitHub OAuth is not configured',
      });
    }

    const callbackUrl = `${getCallbackBase(request)}/api/auth/github/callback`;
    const state = Buffer.from(JSON.stringify({ redirect: getFrontendUrl() })).toString('base64');

    const params = new URLSearchParams({
      client_id: GITHUB_CLIENT_ID,
      redirect_uri: callbackUrl,
      scope: 'read:user user:email',
      state,
    });

    return reply.redirect(`https://github.com/login/oauth/authorize?${params}`);
  });

  /**
   * GET /api/auth/github/callback
   *
   * Handle GitHub OAuth callback.
   */
  server.get<{
    Querystring: { code?: string; state?: string; error?: string };
  }>('/api/auth/github/callback', async (request, reply) => {
    const { code, error } = request.query;

    if (error) {
      return reply.redirect(`${getFrontendUrl()}?auth_error=${encodeURIComponent(error)}`);
    }

    if (!code) {
      return reply.redirect(`${getFrontendUrl()}?auth_error=missing_code`);
    }

    try {
      const callbackUrl = `${getCallbackBase(request)}/api/auth/github/callback`;

      // Exchange code for access token
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          client_id: GITHUB_CLIENT_ID,
          client_secret: GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: callbackUrl,
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error('Failed to exchange code for token');
      }

      const tokenData = await tokenResponse.json() as { access_token: string; error?: string };

      if (tokenData.error) {
        throw new Error(tokenData.error);
      }

      // Get user info
      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (!userResponse.ok) {
        throw new Error('Failed to get user info');
      }

      const userData = await userResponse.json() as {
        id: number;
        login: string;
        name?: string;
        email?: string;
        avatar_url?: string;
      };

      // Get email if not public
      let email = userData.email;
      if (!email) {
        const emailsResponse = await fetch('https://api.github.com/user/emails', {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            Accept: 'application/vnd.github.v3+json',
          },
        });

        if (emailsResponse.ok) {
          const emails = await emailsResponse.json() as Array<{
            email: string;
            primary: boolean;
            verified: boolean;
          }>;
          const primaryEmail = emails.find((e) => e.primary && e.verified);
          email = primaryEmail?.email || emails[0]?.email;
        }
      }

      if (!email) {
        return reply.redirect(`${getFrontendUrl()}?auth_error=no_email`);
      }

      // Create session
      const authService = getAuthService();
      const tokens = await authService.loginOAuth(
        {
          provider: 'github',
          providerId: String(userData.id),
          email,
          displayName: userData.name || userData.login,
          avatarUrl: userData.avatar_url,
        },
        {
          userAgent: request.headers['user-agent'],
          ipAddress: request.ip,
        }
      );

      // Set refresh token cookie
      reply.setCookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, refreshTokenCookieOptions);

      // Redirect to frontend with access token
      const frontendUrl = getFrontendUrl();
      return reply.redirect(
        `${frontendUrl}?access_token=${tokens.accessToken}&expires_in=${tokens.expiresIn}`
      );
    } catch (error) {
      console.error('[Auth] GitHub OAuth error:', error);
      return reply.redirect(`${getFrontendUrl()}?auth_error=oauth_failed`);
    }
  });

  // ===========================================================================
  // Token Management
  // ===========================================================================

  /**
   * POST /api/auth/refresh
   *
   * Refresh access token using refresh token from cookie.
   * Issues new refresh token (rotation).
   */
  server.post<{
    Reply: RefreshResponse | ErrorResponse;
  }>('/api/auth/refresh', async (request, reply) => {
    try {
      const refreshToken = request.cookies[REFRESH_TOKEN_COOKIE];

      if (!refreshToken) {
        return reply.code(401).send({
          error: 'Unauthorized',
          message: 'Refresh token not found',
        });
      }

      const authService = getAuthService();
      const tokens = await authService.refresh(refreshToken, {
        userAgent: request.headers['user-agent'],
        ipAddress: request.ip,
      });

      // Set new refresh token (rotation)
      reply.setCookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, refreshTokenCookieOptions);

      return reply.send({
        accessToken: tokens.accessToken,
        expiresIn: tokens.expiresIn,
      });
    } catch (error) {
      // Clear invalid cookie
      reply.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/api/auth' });

      return reply.code(401).send({
        error: 'Unauthorized',
        message: 'Invalid or expired refresh token',
      });
    }
  });

  /**
   * POST /api/auth/logout
   *
   * Logout user by invalidating refresh token.
   */
  server.post<{
    Reply: { success: boolean } | ErrorResponse;
  }>('/api/auth/logout', async (request, reply) => {
    try {
      const refreshToken = request.cookies[REFRESH_TOKEN_COOKIE];

      if (refreshToken) {
        const authService = getAuthService();
        await authService.logout(refreshToken);
      }

      // Clear cookie
      reply.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/api/auth' });

      return reply.send({ success: true });
    } catch (error) {
      // Still clear cookie even if logout fails
      reply.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/api/auth' });

      return reply.send({ success: true });
    }
  });

  /**
   * GET /api/auth/me (requires authentication)
   *
   * Get current authenticated user info.
   */
  server.get<{
    Reply: UserResponse | ErrorResponse;
  }>(
    '/api/auth/me',
    {
      preHandler: [requireJwtAuth],
    },
    async (request, reply) => {
      try {
        const { user } = request as AuthenticatedRequest;

        // Get full user info from database
        const { db } = await import('../db');
        const { users } = await import('../db/schema');
        const { eq } = await import('drizzle-orm');

        const fullUser = await db.query.users.findFirst({
          where: eq(users.id, user.id),
        });

        if (!fullUser) {
          return reply.code(404).send({
            error: 'Not Found',
            message: 'User not found',
          });
        }

        return reply.send({
          id: fullUser.id,
          email: fullUser.email,
          displayName: fullUser.displayName,
          avatarUrl: fullUser.avatarUrl,
          isVerified: fullUser.isVerified,
          createdAt: fullUser.createdAt?.toISOString() || new Date().toISOString(),
        });
      } catch (error) {
        return reply.code(500).send({
          error: 'Server Error',
          message: 'Failed to get user info',
        });
      }
    }
  );

  /**
   * POST /api/auth/logout-all (requires authentication)
   *
   * Logout from all devices.
   */
  server.post<{
    Reply: { success: boolean } | ErrorResponse;
  }>(
    '/api/auth/logout-all',
    {
      preHandler: [requireJwtAuth],
    },
    async (request, reply) => {
      try {
        const { user } = request as AuthenticatedRequest;
        const authService = getAuthService();

        await authService.logoutAll(user.id);

        // Clear current cookie
        reply.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/api/auth' });

        return reply.send({ success: true });
      } catch (error) {
        return reply.code(500).send({
          error: 'Server Error',
          message: 'Failed to logout from all devices',
        });
      }
    }
  );

  /**
   * GET /api/auth/providers
   *
   * Get available OAuth providers (useful for frontend to know what's configured).
   */
  server.get('/api/auth/providers', async (request, reply) => {
    return reply.send({
      providers: {
        google: !!GOOGLE_CLIENT_ID,
        github: !!GITHUB_CLIENT_ID,
      },
    });
  });
}
