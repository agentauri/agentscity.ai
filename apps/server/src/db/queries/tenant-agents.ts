/**
 * Tenant-Scoped Agent Queries
 *
 * All agent queries filtered by tenant_id for multi-tenant isolation.
 * These functions ensure data isolation between tenants.
 */

import { eq, and, sql, ne } from 'drizzle-orm';
import { db } from '../index';
import { agents, tenants, type Agent, type NewAgent } from '../schema';

// =============================================================================
// Read Operations
// =============================================================================

/**
 * Get all agents for a tenant
 */
export async function getTenantAgents(tenantId: string): Promise<Agent[]> {
  return db
    .select()
    .from(agents)
    .where(eq(agents.tenantId, tenantId));
}

/**
 * Get all alive agents for a tenant
 */
export async function getTenantAliveAgents(tenantId: string): Promise<Agent[]> {
  return db
    .select()
    .from(agents)
    .where(and(
      eq(agents.tenantId, tenantId),
      ne(agents.state, 'dead')
    ));
}

/**
 * Get agent by ID within a tenant
 */
export async function getTenantAgentById(
  tenantId: string,
  agentId: string
): Promise<Agent | undefined> {
  const result = await db
    .select()
    .from(agents)
    .where(and(
      eq(agents.tenantId, tenantId),
      eq(agents.id, agentId)
    ))
    .limit(1);

  return result[0];
}

/**
 * Get agents at a position within a tenant
 */
export async function getTenantAgentsAtPosition(
  tenantId: string,
  x: number,
  y: number
): Promise<Agent[]> {
  return db
    .select()
    .from(agents)
    .where(and(
      eq(agents.tenantId, tenantId),
      eq(agents.x, x),
      eq(agents.y, y),
      ne(agents.state, 'dead')
    ));
}

/**
 * Count agents for a tenant
 */
export async function countTenantAgents(tenantId: string): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agents)
    .where(eq(agents.tenantId, tenantId));

  return result[0]?.count ?? 0;
}

/**
 * Count alive agents for a tenant
 */
export async function countTenantAliveAgents(tenantId: string): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agents)
    .where(and(
      eq(agents.tenantId, tenantId),
      ne(agents.state, 'dead')
    ));

  return result[0]?.count ?? 0;
}

// =============================================================================
// Write Operations
// =============================================================================

/**
 * Create agent for a tenant
 */
export async function createTenantAgent(
  tenantId: string,
  agent: Omit<NewAgent, 'tenantId'>
): Promise<Agent> {
  // Check tenant agent limit
  const tenant = await db
    .select({ maxAgents: tenants.maxAgents })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant[0]) {
    throw new Error(`Tenant ${tenantId} not found`);
  }

  const currentCount = await countTenantAgents(tenantId);
  if (currentCount >= tenant[0].maxAgents) {
    throw new Error(`Agent limit exceeded for tenant ${tenantId} (${currentCount}/${tenant[0].maxAgents})`);
  }

  const result = await db
    .insert(agents)
    .values({
      ...agent,
      tenantId,
    })
    .returning();

  return result[0];
}

/**
 * Update agent within a tenant
 * Returns undefined if agent not found or doesn't belong to tenant
 */
export async function updateTenantAgent(
  tenantId: string,
  agentId: string,
  updates: Partial<Omit<Agent, 'id' | 'tenantId' | 'createdAt'>>
): Promise<Agent | undefined> {
  const result = await db
    .update(agents)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(and(
      eq(agents.tenantId, tenantId),
      eq(agents.id, agentId)
    ))
    .returning();

  return result[0];
}

/**
 * Update agent needs within a tenant
 */
export async function updateTenantAgentNeeds(
  tenantId: string,
  agentId: string,
  hunger: number,
  energy: number,
  health: number
): Promise<Agent | undefined> {
  return updateTenantAgent(tenantId, agentId, { hunger, energy, health });
}

/**
 * Update agent position within a tenant
 */
export async function updateTenantAgentPosition(
  tenantId: string,
  agentId: string,
  x: number,
  y: number
): Promise<Agent | undefined> {
  return updateTenantAgent(tenantId, agentId, { x, y });
}

/**
 * Update agent balance within a tenant
 */
export async function updateTenantAgentBalance(
  tenantId: string,
  agentId: string,
  balance: number
): Promise<Agent | undefined> {
  return updateTenantAgent(tenantId, agentId, { balance });
}

/**
 * Kill agent within a tenant
 */
export async function killTenantAgent(
  tenantId: string,
  agentId: string
): Promise<Agent | undefined> {
  return updateTenantAgent(tenantId, agentId, {
    state: 'dead',
    diedAt: new Date(),
  });
}

// =============================================================================
// Delete Operations
// =============================================================================

/**
 * Delete agent within a tenant
 */
export async function deleteTenantAgent(
  tenantId: string,
  agentId: string
): Promise<boolean> {
  const result = await db
    .delete(agents)
    .where(and(
      eq(agents.tenantId, tenantId),
      eq(agents.id, agentId)
    ))
    .returning({ id: agents.id });

  return result.length > 0;
}

/**
 * Delete all agents for a tenant
 */
export async function deleteAllTenantAgents(tenantId: string): Promise<number> {
  const result = await db
    .delete(agents)
    .where(eq(agents.tenantId, tenantId))
    .returning({ id: agents.id });

  return result.length;
}

// =============================================================================
// Bulk Operations
// =============================================================================

/**
 * Create multiple agents for a tenant
 */
export async function createTenantAgentsBulk(
  tenantId: string,
  agentsList: Omit<NewAgent, 'tenantId'>[]
): Promise<Agent[]> {
  if (agentsList.length === 0) {
    return [];
  }

  // Check tenant agent limit
  const tenant = await db
    .select({ maxAgents: tenants.maxAgents })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant[0]) {
    throw new Error(`Tenant ${tenantId} not found`);
  }

  const currentCount = await countTenantAgents(tenantId);
  if (currentCount + agentsList.length > tenant[0].maxAgents) {
    throw new Error(
      `Agent limit would be exceeded for tenant ${tenantId} ` +
      `(current: ${currentCount}, adding: ${agentsList.length}, max: ${tenant[0].maxAgents})`
    );
  }

  const agentsWithTenant = agentsList.map(agent => ({
    ...agent,
    tenantId,
  }));

  return db.insert(agents).values(agentsWithTenant).returning();
}

/**
 * Update multiple agents for a tenant
 */
export async function updateTenantAgentsBulk(
  tenantId: string,
  updates: Array<{ id: string; changes: Partial<Omit<Agent, 'id' | 'tenantId' | 'createdAt'>> }>
): Promise<void> {
  // Use transaction for bulk updates
  await db.transaction(async (tx) => {
    for (const { id, changes } of updates) {
      await tx
        .update(agents)
        .set({
          ...changes,
          updatedAt: new Date(),
        })
        .where(and(
          eq(agents.tenantId, tenantId),
          eq(agents.id, id)
        ));
    }
  });
}
