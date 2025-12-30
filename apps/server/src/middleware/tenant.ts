/**
 * Tenant Authentication Middleware
 *
 * Provides multi-tenant isolation by extracting and validating tenant
 * context from API requests. All tenant-scoped endpoints must use this
 * middleware to ensure proper data isolation.
 */

import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { verifyTenantApiKey, getTenant, checkTenantTickLimit } from '../db/queries/tenants';
import type { Tenant } from '../db/schema';

// =============================================================================
// Tenant Context
// =============================================================================

/**
 * Tenant context attached to requests after authentication
 */
export interface TenantContext {
  tenant: Tenant;
  tenantId: string;
}

// Symbol for storing tenant context on request
const TENANT_CONTEXT_KEY = Symbol('tenantContext');

/**
 * Get tenant context from request
 */
export function getTenantContext(request: FastifyRequest): TenantContext | null {
  return (request as any)[TENANT_CONTEXT_KEY] || null;
}

/**
 * Set tenant context on request
 */
function setTenantContext(request: FastifyRequest, context: TenantContext): void {
  (request as any)[TENANT_CONTEXT_KEY] = context;
}

/**
 * Get tenant ID from request (convenience helper)
 */
export function getTenantId(request: FastifyRequest): string | null {
  return getTenantContext(request)?.tenantId || null;
}

/**
 * Require tenant context (throws if not present)
 */
export function requireTenantContext(request: FastifyRequest): TenantContext {
  const context = getTenantContext(request);
  if (!context) {
    throw new Error('Tenant context not found - ensure requireTenant middleware is applied');
  }
  return context;
}

// =============================================================================
// Authentication Middleware
// =============================================================================

/**
 * Extract tenant API key from request headers
 */
function extractTenantApiKey(request: FastifyRequest): string | null {
  return (request.headers['x-tenant-key'] as string) || null;
}

/**
 * Middleware: Require tenant authentication
 *
 * Extracts tenant from X-Tenant-Key header and attaches context to request.
 * Returns 401 if no key provided or key is invalid.
 */
export async function requireTenant(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const apiKey = extractTenantApiKey(request);

  if (!apiKey) {
    reply.code(401).send({
      error: 'Unauthorized',
      message: 'Missing X-Tenant-Key header',
    });
    return;
  }

  const tenant = await verifyTenantApiKey(apiKey);

  if (!tenant) {
    reply.code(401).send({
      error: 'Unauthorized',
      message: 'Invalid or inactive tenant API key',
    });
    return;
  }

  // Attach tenant context to request
  setTenantContext(request, {
    tenant,
    tenantId: tenant.id,
  });
}

/**
 * Middleware: Optional tenant authentication
 *
 * If X-Tenant-Key is provided, validates it and attaches context.
 * If not provided, continues without tenant context (for public endpoints).
 */
export async function optionalTenant(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const apiKey = extractTenantApiKey(request);

  if (!apiKey) {
    // No key provided - continue without tenant context
    return;
  }

  const tenant = await verifyTenantApiKey(apiKey);

  if (!tenant) {
    reply.code(401).send({
      error: 'Unauthorized',
      message: 'Invalid or inactive tenant API key',
    });
    return;
  }

  setTenantContext(request, {
    tenant,
    tenantId: tenant.id,
  });
}

// =============================================================================
// Tenant Path Parameter Middleware
// =============================================================================

/**
 * Middleware: Require tenant from URL path parameter
 *
 * For routes like /api/t/:tenantId/*, validates that the tenant exists
 * and optionally that the authenticated user has access to it.
 */
export async function requireTenantFromPath(
  request: FastifyRequest<{ Params: { tenantId: string } }>,
  reply: FastifyReply
): Promise<void> {
  const { tenantId } = request.params;

  if (!tenantId) {
    reply.code(400).send({
      error: 'Bad Request',
      message: 'Missing tenantId path parameter',
    });
    return;
  }

  const tenant = await getTenant(tenantId);

  if (!tenant) {
    reply.code(404).send({
      error: 'Not Found',
      message: 'Tenant not found',
    });
    return;
  }

  if (!tenant.isActive) {
    reply.code(403).send({
      error: 'Forbidden',
      message: 'Tenant is inactive',
    });
    return;
  }

  // Optionally verify API key matches tenant (if provided)
  const apiKey = extractTenantApiKey(request);
  if (apiKey) {
    const authenticatedTenant = await verifyTenantApiKey(apiKey);
    if (!authenticatedTenant || authenticatedTenant.id !== tenantId) {
      reply.code(403).send({
        error: 'Forbidden',
        message: 'API key does not match requested tenant',
      });
      return;
    }
  }

  setTenantContext(request, {
    tenant,
    tenantId: tenant.id,
  });
}

// =============================================================================
// Rate Limiting Middleware
// =============================================================================

/**
 * Middleware: Check tenant tick rate limit
 *
 * Ensures tenant hasn't exceeded their daily tick limit.
 * Use this before processing ticks.
 */
export async function checkTenantRateLimit(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const context = getTenantContext(request);

  if (!context) {
    reply.code(500).send({
      error: 'Internal Server Error',
      message: 'Tenant context not found',
    });
    return;
  }

  const { allowed, used, limit } = await checkTenantTickLimit(context.tenantId);

  // Set rate limit headers
  reply.header('X-RateLimit-Limit', limit.toString());
  reply.header('X-RateLimit-Remaining', Math.max(0, limit - used).toString());
  reply.header('X-RateLimit-Reset', getEndOfDayTimestamp().toString());

  if (!allowed) {
    reply.code(429).send({
      error: 'Too Many Requests',
      message: `Daily tick limit exceeded (${used}/${limit})`,
      retryAfter: getSecondsUntilMidnight(),
    });
    return;
  }
}

/**
 * Get seconds until midnight (for retry-after header)
 */
function getSecondsUntilMidnight(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setDate(midnight.getDate() + 1);
  midnight.setHours(0, 0, 0, 0);
  return Math.ceil((midnight.getTime() - now.getTime()) / 1000);
}

/**
 * Get end of day timestamp (for rate limit reset header)
 */
function getEndOfDayTimestamp(): number {
  const midnight = new Date();
  midnight.setDate(midnight.getDate() + 1);
  midnight.setHours(0, 0, 0, 0);
  return Math.floor(midnight.getTime() / 1000);
}

// =============================================================================
// Fastify Plugin
// =============================================================================

/**
 * Register tenant middleware decorators on Fastify instance
 */
export async function registerTenantMiddleware(server: FastifyInstance): Promise<void> {
  // Add request decorators
  server.decorateRequest('tenantContext', null);

  // Add hook to clean up context after request
  server.addHook('onResponse', async (request) => {
    (request as any)[TENANT_CONTEXT_KEY] = null;
  });
}

// =============================================================================
// Type Augmentation for Fastify
// =============================================================================

declare module 'fastify' {
  interface FastifyRequest {
    tenantContext?: TenantContext | null;
  }
}
