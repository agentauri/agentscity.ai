/**
 * Tenant Management Queries
 *
 * CRUD operations for multi-tenant support.
 * Handles tenant creation, authentication, usage tracking, and limits.
 */

import { eq, and, sql, gte, desc } from 'drizzle-orm';
import { createHash, randomBytes } from 'crypto';
import { db } from '../index';
import {
  tenants,
  tenantUsage,
  tenantWorldState,
  type Tenant,
  type TenantUsage,
  type TenantWorldState,
} from '../schema';

// =============================================================================
// API Key Management
// =============================================================================

/**
 * Generate a new tenant API key with prefix
 * Format: act_<64 hex chars>
 */
export function generateTenantApiKey(): string {
  return `act_${randomBytes(32).toString('hex')}`;
}

/**
 * Hash an API key using SHA-256
 */
export function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Verify a tenant API key and return the tenant
 */
export async function verifyTenantApiKey(apiKey: string): Promise<Tenant | null> {
  if (!apiKey || !apiKey.startsWith('act_')) {
    return null;
  }

  const keyHash = hashApiKey(apiKey);

  const result = await db
    .select()
    .from(tenants)
    .where(and(
      eq(tenants.apiKeyHash, keyHash),
      eq(tenants.isActive, true)
    ))
    .limit(1);

  const tenant = result[0];

  if (tenant) {
    // Update last active timestamp (async, don't wait)
    db.update(tenants)
      .set({ lastActiveAt: new Date() })
      .where(eq(tenants.id, tenant.id))
      .execute()
      .catch(console.error);
  }

  return tenant || null;
}

// =============================================================================
// Tenant CRUD
// =============================================================================

export interface CreateTenantInput {
  name: string;
  description?: string;
  ownerEmail?: string;
  maxAgents?: number;
  maxTicksPerDay?: number;
  maxEventsStored?: number;
  tickIntervalMs?: number;
  gridWidth?: number;
  gridHeight?: number;
}

export interface CreateTenantResult {
  tenant: Tenant;
  apiKey: string; // Only returned once at creation!
}

/**
 * Create a new tenant
 * Returns the tenant and the plaintext API key (only shown once!)
 */
export async function createTenant(input: CreateTenantInput): Promise<CreateTenantResult> {
  const apiKey = generateTenantApiKey();
  const apiKeyHash = hashApiKey(apiKey);

  const result = await db
    .insert(tenants)
    .values({
      name: input.name,
      description: input.description,
      ownerEmail: input.ownerEmail,
      apiKeyHash,
      maxAgents: input.maxAgents ?? 20,
      maxTicksPerDay: input.maxTicksPerDay ?? 1000,
      maxEventsStored: input.maxEventsStored ?? 100000,
      tickIntervalMs: input.tickIntervalMs ?? 60000,
      gridWidth: input.gridWidth ?? 100,
      gridHeight: input.gridHeight ?? 100,
    })
    .returning();

  const tenant = result[0];

  // Initialize world state for the tenant
  await db
    .insert(tenantWorldState)
    .values({
      tenantId: tenant.id,
      currentTick: 0,
    });

  return { tenant, apiKey };
}

/**
 * Get tenant by ID
 */
export async function getTenant(id: string): Promise<Tenant | null> {
  const result = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, id))
    .limit(1);

  return result[0] || null;
}

/**
 * Get tenant by API key hash (for internal use)
 */
export async function getTenantByApiKeyHash(apiKeyHash: string): Promise<Tenant | null> {
  const result = await db
    .select()
    .from(tenants)
    .where(eq(tenants.apiKeyHash, apiKeyHash))
    .limit(1);

  return result[0] || null;
}

/**
 * List all tenants
 */
export async function listTenants(options?: {
  activeOnly?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{ tenants: Tenant[]; total: number }> {
  const { activeOnly = false, limit = 50, offset = 0 } = options ?? {};

  const conditions = activeOnly ? eq(tenants.isActive, true) : undefined;

  const [results, countResult] = await Promise.all([
    db
      .select()
      .from(tenants)
      .where(conditions)
      .orderBy(desc(tenants.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(tenants)
      .where(conditions),
  ]);

  return {
    tenants: results,
    total: countResult[0]?.count ?? 0,
  };
}

/**
 * Update tenant settings
 */
export async function updateTenant(
  id: string,
  updates: Partial<Pick<Tenant,
    'name' | 'description' | 'ownerEmail' | 'maxAgents' | 'maxTicksPerDay' |
    'maxEventsStored' | 'tickIntervalMs' | 'gridWidth' | 'gridHeight' |
    'isActive' | 'isPaused'
  >>
): Promise<Tenant | null> {
  const result = await db
    .update(tenants)
    .set({
      ...updates,
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, id))
    .returning();

  return result[0] || null;
}

/**
 * Regenerate tenant API key
 * Returns the new plaintext API key (only shown once!)
 */
export async function regenerateTenantApiKey(id: string): Promise<string | null> {
  const apiKey = generateTenantApiKey();
  const apiKeyHash = hashApiKey(apiKey);

  const result = await db
    .update(tenants)
    .set({
      apiKeyHash,
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, id))
    .returning();

  if (!result[0]) {
    return null;
  }

  return apiKey;
}

/**
 * Soft delete tenant (sets isActive = false)
 */
export async function deactivateTenant(id: string): Promise<boolean> {
  const result = await db
    .update(tenants)
    .set({
      isActive: false,
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, id))
    .returning({ id: tenants.id });

  return result.length > 0;
}

/**
 * Hard delete tenant (cascades to all related data)
 */
export async function deleteTenant(id: string): Promise<boolean> {
  const result = await db
    .delete(tenants)
    .where(eq(tenants.id, id))
    .returning({ id: tenants.id });

  return result.length > 0;
}

// =============================================================================
// Tenant World State
// =============================================================================

/**
 * Get tenant world state
 */
export async function getTenantWorldState(tenantId: string): Promise<TenantWorldState | null> {
  const result = await db
    .select()
    .from(tenantWorldState)
    .where(eq(tenantWorldState.tenantId, tenantId))
    .limit(1);

  return result[0] || null;
}

/**
 * Get current tick for tenant
 */
export async function getTenantCurrentTick(tenantId: string): Promise<number> {
  const state = await getTenantWorldState(tenantId);
  return state?.currentTick ?? 0;
}

/**
 * Increment tick for tenant
 */
export async function incrementTenantTick(tenantId: string): Promise<TenantWorldState> {
  const result = await db
    .update(tenantWorldState)
    .set({
      currentTick: sql`${tenantWorldState.currentTick} + 1`,
      lastTickAt: new Date(),
    })
    .where(eq(tenantWorldState.tenantId, tenantId))
    .returning();

  return result[0];
}

/**
 * Reset tenant tick counter
 */
export async function resetTenantTick(tenantId: string): Promise<void> {
  await db
    .update(tenantWorldState)
    .set({
      currentTick: 0,
      startedAt: new Date(),
      lastTickAt: null,
    })
    .where(eq(tenantWorldState.tenantId, tenantId));
}

// =============================================================================
// Usage Tracking
// =============================================================================

/**
 * Record usage for a tenant (upsert daily usage)
 */
export async function recordTenantUsage(
  tenantId: string,
  usage: { ticks?: number; events?: number; llmCalls?: number }
): Promise<void> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Upsert daily usage
  await db
    .insert(tenantUsage)
    .values({
      tenantId,
      usageDate: today,
      ticksProcessed: usage.ticks ?? 0,
      eventsGenerated: usage.events ?? 0,
      llmCallsMade: usage.llmCalls ?? 0,
    })
    .onConflictDoUpdate({
      target: [tenantUsage.tenantId, tenantUsage.usageDate],
      set: {
        ticksProcessed: sql`${tenantUsage.ticksProcessed} + ${usage.ticks ?? 0}`,
        eventsGenerated: sql`${tenantUsage.eventsGenerated} + ${usage.events ?? 0}`,
        llmCallsMade: sql`${tenantUsage.llmCallsMade} + ${usage.llmCalls ?? 0}`,
        updatedAt: new Date(),
      },
    });
}

/**
 * Get tenant usage for today
 */
export async function getTenantUsageToday(tenantId: string): Promise<TenantUsage | null> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const result = await db
    .select()
    .from(tenantUsage)
    .where(and(
      eq(tenantUsage.tenantId, tenantId),
      gte(tenantUsage.usageDate, today)
    ))
    .limit(1);

  return result[0] || null;
}

/**
 * Check if tenant has exceeded daily tick limit
 */
export async function checkTenantTickLimit(tenantId: string): Promise<{
  allowed: boolean;
  used: number;
  limit: number;
}> {
  const [tenant, usage] = await Promise.all([
    getTenant(tenantId),
    getTenantUsageToday(tenantId),
  ]);

  if (!tenant) {
    return { allowed: false, used: 0, limit: 0 };
  }

  const used = usage?.ticksProcessed ?? 0;
  const limit = tenant.maxTicksPerDay;

  return {
    allowed: used < limit,
    used,
    limit,
  };
}

/**
 * Get tenant usage history (last N days)
 */
export async function getTenantUsageHistory(
  tenantId: string,
  days: number = 30
): Promise<TenantUsage[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  startDate.setHours(0, 0, 0, 0);

  return db
    .select()
    .from(tenantUsage)
    .where(and(
      eq(tenantUsage.tenantId, tenantId),
      gte(tenantUsage.usageDate, startDate)
    ))
    .orderBy(desc(tenantUsage.usageDate));
}

// =============================================================================
// Tenant Statistics
// =============================================================================

export interface TenantStats {
  id: string;
  name: string;
  isActive: boolean;
  isPaused: boolean;
  currentTick: number;
  todayTicks: number;
  todayEvents: number;
  todayLlmCalls: number;
  limits: {
    maxAgents: number;
    maxTicksPerDay: number;
    maxEventsStored: number;
  };
  createdAt: Date;
  lastActiveAt: Date | null;
}

/**
 * Get comprehensive tenant statistics
 */
export async function getTenantStats(tenantId: string): Promise<TenantStats | null> {
  const [tenant, worldState, usage] = await Promise.all([
    getTenant(tenantId),
    getTenantWorldState(tenantId),
    getTenantUsageToday(tenantId),
  ]);

  if (!tenant) {
    return null;
  }

  return {
    id: tenant.id,
    name: tenant.name,
    isActive: tenant.isActive,
    isPaused: tenant.isPaused,
    currentTick: worldState?.currentTick ?? 0,
    todayTicks: usage?.ticksProcessed ?? 0,
    todayEvents: usage?.eventsGenerated ?? 0,
    todayLlmCalls: usage?.llmCallsMade ?? 0,
    limits: {
      maxAgents: tenant.maxAgents,
      maxTicksPerDay: tenant.maxTicksPerDay,
      maxEventsStored: tenant.maxEventsStored,
    },
    createdAt: tenant.createdAt,
    lastActiveAt: tenant.lastActiveAt,
  };
}
