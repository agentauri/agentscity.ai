/**
 * JWT Authentication Middleware
 *
 * Provides middleware for authenticating requests using JWT access tokens.
 * Used for user-authenticated endpoints (API key management, etc.)
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { getAuthService, type TokenPayload } from '../services/auth-service';

// =============================================================================
// Types
// =============================================================================

/**
 * Extended request with authenticated user info
 */
export interface AuthenticatedRequest extends FastifyRequest {
  user: {
    id: string;
    email: string;
  };
}

// =============================================================================
// Middleware
// =============================================================================

/**
 * Extract Bearer token from Authorization header.
 */
function extractBearerToken(request: FastifyRequest): string | null {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  return authHeader.slice(7); // Remove 'Bearer ' prefix
}

/**
 * Require JWT authentication.
 * Verifies the access token and attaches user info to the request.
 *
 * Usage:
 * ```typescript
 * fastify.get('/api/protected', {
 *   preHandler: [requireJwtAuth],
 *   handler: async (request: AuthenticatedRequest, reply) => {
 *     const userId = request.user.id;
 *     // ...
 *   }
 * });
 * ```
 */
export async function requireJwtAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const token = extractBearerToken(request);

  if (!token) {
    reply.code(401).send({
      error: 'Unauthorized',
      message: 'Missing or invalid Authorization header. Expected: Bearer <token>',
    });
    return;
  }

  try {
    const authService = getAuthService();
    const payload = await authService.verifyAccessToken(token);

    // Attach user info to request
    (request as AuthenticatedRequest).user = {
      id: payload.sub,
      email: payload.email,
    };
  } catch (error) {
    reply.code(401).send({
      error: 'Unauthorized',
      message: 'Invalid or expired access token',
    });
    return;
  }
}

/**
 * Optional JWT authentication.
 * If a valid token is provided, attaches user info to the request.
 * If no token or invalid token, continues without user info.
 *
 * Usage:
 * ```typescript
 * fastify.get('/api/public', {
 *   preHandler: [optionalJwtAuth],
 *   handler: async (request, reply) => {
 *     const user = (request as AuthenticatedRequest).user;
 *     if (user) {
 *       // Authenticated user
 *     } else {
 *       // Anonymous access
 *     }
 *   }
 * });
 * ```
 */
export async function optionalJwtAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const token = extractBearerToken(request);

  if (!token) {
    // No token provided, continue without auth
    return;
  }

  try {
    const authService = getAuthService();
    const payload = await authService.verifyAccessToken(token);

    // Attach user info to request
    (request as AuthenticatedRequest).user = {
      id: payload.sub,
      email: payload.email,
    };
  } catch {
    // Invalid token, continue without auth
    // Don't fail the request for optional auth
  }
}

/**
 * Get the authenticated user from a request.
 * Returns null if the request is not authenticated.
 */
export function getAuthenticatedUser(
  request: FastifyRequest
): { id: string; email: string } | null {
  return (request as AuthenticatedRequest).user || null;
}

/**
 * Check if a request is authenticated.
 */
export function isAuthenticated(request: FastifyRequest): boolean {
  return !!(request as AuthenticatedRequest).user;
}
