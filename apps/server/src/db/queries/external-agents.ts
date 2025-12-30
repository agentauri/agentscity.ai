/**
 * External Agents Queries (Phase 3: A2A Protocol)
 *
 * CRUD operations for external agent registration and management.
 */

import { eq, sql } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { db, externalAgents, agents, apiUsage } from '../index';
import { generateApiKey, hashApiKey } from '../../middleware/auth';
import type { ExternalAgent, NewExternalAgent, Agent } from '../schema';

// =============================================================================
// Registration
// =============================================================================

export interface RegisterExternalAgentInput {
  name: string;
  endpoint?: string;
  ownerEmail?: string;
  spawnPosition?: { x: number; y: number };
}

export interface RegisterExternalAgentResult {
  externalAgent: ExternalAgent;
  agent: Agent;
  apiKey: string; // Only returned on registration, not stored in plaintext
}

/**
 * Register a new external agent
 * Creates both the simulation agent and external agent record
 */
export async function registerExternalAgent(
  input: RegisterExternalAgentInput
): Promise<RegisterExternalAgentResult> {
  // Generate spawn position if not provided
  const x = input.spawnPosition?.x ?? Math.floor(Math.random() * 100);
  const y = input.spawnPosition?.y ?? Math.floor(Math.random() * 100);

  // Generate a random color for the agent
  const color = `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`;

  // Create the simulation agent first
  const agentResult = await db
    .insert(agents)
    .values({
      id: uuid(),
      llmType: 'external',
      x,
      y,
      hunger: 100,
      energy: 100,
      health: 100,
      balance: 100,
      state: 'idle',
      color,
    })
    .returning();

  const agent = agentResult[0];

  // Generate API key
  const apiKey = generateApiKey();
  const apiKeyHash = hashApiKey(apiKey);

  // Create external agent record
  const externalAgentResult = await db
    .insert(externalAgents)
    .values({
      agentId: agent.id,
      apiKeyHash,
      name: input.name,
      endpoint: input.endpoint,
      ownerEmail: input.ownerEmail,
      rateLimitPerTick: 1,
      rateLimitPerMinute: 60,
      isActive: true,
    })
    .returning();

  return {
    externalAgent: externalAgentResult[0],
    agent,
    apiKey, // Only time the plaintext key is returned
  };
}

// =============================================================================
// Queries
// =============================================================================

/**
 * Get external agent by ID
 */
export async function getExternalAgent(id: string): Promise<ExternalAgent | null> {
  const result = await db
    .select()
    .from(externalAgents)
    .where(eq(externalAgents.id, id))
    .limit(1);

  return result[0] || null;
}

/**
 * Get external agent by API key hash
 */
export async function getExternalAgentByKeyHash(
  keyHash: string
): Promise<ExternalAgent | null> {
  const result = await db
    .select()
    .from(externalAgents)
    .where(eq(externalAgents.apiKeyHash, keyHash))
    .limit(1);

  return result[0] || null;
}

/**
 * Get external agent by simulation agent ID
 */
export async function getExternalAgentByAgentId(
  agentId: string
): Promise<ExternalAgent | null> {
  const result = await db
    .select()
    .from(externalAgents)
    .where(eq(externalAgents.agentId, agentId))
    .limit(1);

  return result[0] || null;
}

/**
 * Get all external agents
 */
export async function getAllExternalAgents(): Promise<ExternalAgent[]> {
  return db.select().from(externalAgents);
}

/**
 * Get all active external agents
 */
export async function getActiveExternalAgents(): Promise<ExternalAgent[]> {
  return db
    .select()
    .from(externalAgents)
    .where(eq(externalAgents.isActive, true));
}

/**
 * Get external agents with their simulation agent data
 */
export async function getExternalAgentsWithAgents(): Promise<
  Array<{ externalAgent: ExternalAgent; agent: Agent }>
> {
  const result = await db
    .select({
      externalAgent: externalAgents,
      agent: agents,
    })
    .from(externalAgents)
    .innerJoin(agents, eq(externalAgents.agentId, agents.id));

  return result;
}

// =============================================================================
// Updates
// =============================================================================

/**
 * Update external agent endpoint
 */
export async function updateExternalAgentEndpoint(
  id: string,
  endpoint: string | null
): Promise<ExternalAgent | null> {
  const result = await db
    .update(externalAgents)
    .set({ endpoint })
    .where(eq(externalAgents.id, id))
    .returning();

  return result[0] || null;
}

/**
 * Update external agent active status
 */
export async function setExternalAgentActive(
  id: string,
  isActive: boolean
): Promise<ExternalAgent | null> {
  const result = await db
    .update(externalAgents)
    .set({ isActive })
    .where(eq(externalAgents.id, id))
    .returning();

  return result[0] || null;
}

/**
 * Update external agent rate limits
 */
export async function updateExternalAgentRateLimits(
  id: string,
  rateLimitPerTick: number,
  rateLimitPerMinute: number
): Promise<ExternalAgent | null> {
  const result = await db
    .update(externalAgents)
    .set({ rateLimitPerTick, rateLimitPerMinute })
    .where(eq(externalAgents.id, id))
    .returning();

  return result[0] || null;
}

/**
 * Update last seen timestamp
 */
export async function updateLastSeen(id: string): Promise<void> {
  await db
    .update(externalAgents)
    .set({ lastSeenAt: new Date() })
    .where(eq(externalAgents.id, id));
}

/**
 * Regenerate API key for an external agent
 * Returns the new plaintext key (only time it's available)
 */
export async function regenerateApiKey(id: string): Promise<string | null> {
  const apiKey = generateApiKey();
  const apiKeyHash = hashApiKey(apiKey);

  const result = await db
    .update(externalAgents)
    .set({ apiKeyHash })
    .where(eq(externalAgents.id, id))
    .returning();

  if (!result[0]) {
    return null;
  }

  return apiKey;
}

// =============================================================================
// Deletion
// =============================================================================

/**
 * Deregister an external agent
 * Also marks the simulation agent as dead
 */
export async function deregisterExternalAgent(id: string): Promise<boolean> {
  // Get the external agent first
  const externalAgent = await getExternalAgent(id);
  if (!externalAgent) {
    return false;
  }

  // Mark simulation agent as dead
  await db
    .update(agents)
    .set({ state: 'dead', diedAt: new Date() })
    .where(eq(agents.id, externalAgent.agentId));

  // Delete external agent record
  await db.delete(externalAgents).where(eq(externalAgents.id, id));

  return true;
}

/**
 * Delete all external agents (for reset)
 */
export async function deleteAllExternalAgents(): Promise<number> {
  // Get all external agent IDs
  const allExternal = await getAllExternalAgents();

  // Mark all their agents as dead
  for (const ext of allExternal) {
    await db
      .update(agents)
      .set({ state: 'dead', diedAt: new Date() })
      .where(eq(agents.id, ext.agentId));
  }

  // Delete all external agents
  const result = await db.delete(externalAgents);

  return allExternal.length;
}

// =============================================================================
// Statistics
// =============================================================================

/**
 * Get external agent statistics
 */
export async function getExternalAgentStats(): Promise<{
  total: number;
  active: number;
  withEndpoint: number;
  avgActionsPerTick: number;
}> {
  const result = await db.execute<{
    total: number;
    active: number;
    with_endpoint: number;
  }>(sql`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE is_active = true) as active,
      COUNT(*) FILTER (WHERE endpoint IS NOT NULL) as with_endpoint
    FROM external_agents
  `);

  const rows = Array.isArray(result) ? result : (result as any).rows || [];
  const stats = rows[0] || { total: 0, active: 0, with_endpoint: 0 };

  // Get average actions per tick from recent usage
  const usageResult = await db.execute<{ avg_actions: number }>(sql`
    SELECT COALESCE(AVG(action_count), 0) as avg_actions
    FROM api_usage
    WHERE created_at > NOW() - INTERVAL '1 hour'
  `);

  const usageRows = Array.isArray(usageResult) ? usageResult : (usageResult as any).rows || [];

  return {
    total: Number(stats.total) || 0,
    active: Number(stats.active) || 0,
    withEndpoint: Number(stats.with_endpoint) || 0,
    avgActionsPerTick: Number(usageRows[0]?.avg_actions) || 0,
  };
}
