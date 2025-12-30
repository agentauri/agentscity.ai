/**
 * Authentication Middleware for External Agents (Phase 3: A2A Protocol)
 *
 * Provides API key verification for external agent endpoints.
 * API keys are hashed using SHA-256 for secure storage.
 */

import { createHash, randomBytes } from 'crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq } from 'drizzle-orm';
import { db, externalAgents } from '../db';
import type { ExternalAgent } from '../db/schema';

/**
 * Generate a new API key with prefix
 * Format: ac_<64 hex chars>
 */
export function generateApiKey(): string {
  return `ac_${randomBytes(32).toString('hex')}`;
}

/**
 * Hash an API key using SHA-256
 */
export function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Verify an API key and return the associated external agent
 */
export async function verifyApiKey(apiKey: string): Promise<ExternalAgent | null> {
  if (!apiKey || !apiKey.startsWith('ac_')) {
    return null;
  }

  const keyHash = hashApiKey(apiKey);

  const result = await db
    .select()
    .from(externalAgents)
    .where(eq(externalAgents.apiKeyHash, keyHash))
    .limit(1);

  const agent = result[0];

  if (!agent || !agent.isActive) {
    return null;
  }

  // Update last seen timestamp (async, don't wait)
  db.update(externalAgents)
    .set({ lastSeenAt: new Date() })
    .where(eq(externalAgents.id, agent.id))
    .execute()
    .catch(console.error);

  return agent;
}

/**
 * Verify API key from request headers
 * Returns the external agent or null if invalid
 */
export async function verifyApiKeyFromRequest(
  request: FastifyRequest
): Promise<ExternalAgent | null> {
  const apiKey = request.headers['x-api-key'] as string | undefined;

  if (!apiKey) {
    return null;
  }

  return verifyApiKey(apiKey);
}

/**
 * Fastify preHandler hook for API key authentication
 * Attaches the external agent to request on success
 */
export async function requireApiKey(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const apiKey = request.headers['x-api-key'] as string | undefined;

  if (!apiKey) {
    reply.code(401).send({
      error: 'Unauthorized',
      message: 'Missing X-API-Key header',
    });
    return;
  }

  const externalAgent = await verifyApiKey(apiKey);

  if (!externalAgent) {
    reply.code(401).send({
      error: 'Unauthorized',
      message: 'Invalid or inactive API key',
    });
    return;
  }

  // Attach external agent to request for use in handlers
  (request as any).externalAgent = externalAgent;
}

/**
 * Get external agent from request (after requireApiKey middleware)
 */
export function getExternalAgentFromRequest(request: FastifyRequest): ExternalAgent | null {
  return (request as any).externalAgent || null;
}
