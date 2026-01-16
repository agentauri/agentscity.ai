/**
 * Inject Info Action Handler - Phase 4: Information Cascade Experiments
 *
 * Admin-only action that injects beliefs into agents for experiments.
 * This is NOT an agent action - it's triggered by the experiment system
 * to create "patient zero" agents with false beliefs.
 *
 * Used for:
 * - Misinformation cascade studies
 * - Information propagation experiments
 * - Trust network research
 */

import { createHash } from 'crypto';
import { v4 as uuid } from 'uuid';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { db } from '../../db';
import { informationBeliefs } from '../../db/schema';
import type { NewInformationBelief } from '../../db/schema';
import type { WorldEvent } from '../../cache/pubsub';

// =============================================================================
// Types
// =============================================================================

export type ClaimType =
  | 'resource_location'
  | 'danger_warning'
  | 'trade_offer'
  | 'agent_reputation'
  | 'shelter_location'
  | 'custom';

export interface InjectInfoParams {
  /** The agent to inject the belief into */
  agentId: string;
  /** Type of claim */
  claimType: ClaimType;
  /** The claim content (the actual misinformation or information) */
  claim: string | Record<string, unknown>;
  /** Whether the claim is true (null = unverifiable, true/false = verifiable) */
  isTrue: boolean | null;
  /** Optional description of the actual state (for experiment tracking) */
  actualState?: string;
  /** Optional tenant ID for multi-tenancy */
  tenantId?: string;
}

export interface InjectInfoResult {
  success: boolean;
  beliefId?: string;
  infoHash?: string;
  error?: string;
  event?: WorldEvent;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Hash a claim to create a unique identifier for deduplication.
 */
export function hashClaim(claim: string | Record<string, unknown>): string {
  const content = typeof claim === 'string' ? claim : JSON.stringify(claim);
  return createHash('sha256')
    .update(content)
    .digest('hex')
    .slice(0, 32);
}

// =============================================================================
// Main Handler
// =============================================================================

/**
 * Inject a belief/information into an agent's memory.
 *
 * This is used by the experiment system to create "patient zero" agents
 * that have false beliefs which may then spread through the agent network.
 *
 * @param params - Injection parameters
 * @param tick - Current simulation tick
 * @returns Result with belief ID if successful
 */
export async function handleInjectInfo(
  params: InjectInfoParams,
  tick: number
): Promise<InjectInfoResult> {
  const { agentId, claimType, claim, isTrue, actualState, tenantId } = params;

  try {
    // Validate claim type
    const validTypes: ClaimType[] = [
      'resource_location',
      'danger_warning',
      'trade_offer',
      'agent_reputation',
      'shelter_location',
      'custom',
    ];

    if (!validTypes.includes(claimType)) {
      return {
        success: false,
        error: `Invalid claim type. Must be one of: ${validTypes.join(', ')}`,
      };
    }

    // Create the claim content
    const claimContent = typeof claim === 'string'
      ? { claim, actualState }
      : { ...claim, actualState };

    const infoHash = hashClaim(claim);

    // Create the belief record
    const beliefId = uuid();
    const beliefRecord: NewInformationBelief = {
      id: beliefId,
      tenantId: tenantId ?? null,
      agentId,
      infoHash,
      claimType,
      claimContent,
      isTrue,
      sourceAgentId: null, // NULL indicates experimental injection
      receivedTick: tick,
      actedOnTick: null,
      correctedTick: null,
      correctionSourceId: null,
      spreadCount: 0,
    };

    // Insert the belief
    await db.insert(informationBeliefs).values(beliefRecord);

    // Create event for tracking
    const event: WorldEvent = {
      id: uuid(),
      type: 'info_injected',
      tick,
      timestamp: Date.now(),
      agentId,
      payload: {
        beliefId,
        infoHash,
        claimType,
        isTrue,
        isInjected: true,
      },
    };

    return {
      success: true,
      beliefId,
      infoHash,
      event,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[InjectInfo] Error injecting information:', error);
    return {
      success: false,
      error: `Failed to inject information: ${errorMessage}`,
    };
  }
}

/**
 * Batch inject beliefs into multiple agents.
 *
 * Used for experiment setup to create multiple patient zero agents.
 *
 * @param agentIds - Array of agent IDs to inject into
 * @param params - Common injection parameters (excluding agentId)
 * @param tick - Current simulation tick
 * @returns Array of results
 */
export async function batchInjectInfo(
  agentIds: string[],
  params: Omit<InjectInfoParams, 'agentId'>,
  tick: number
): Promise<InjectInfoResult[]> {
  const results: InjectInfoResult[] = [];

  for (const agentId of agentIds) {
    const result = await handleInjectInfo(
      { ...params, agentId },
      tick
    );
    results.push(result);
  }

  return results;
}

// =============================================================================
// Query Helpers
// =============================================================================

/**
 * Check if an agent already has a specific belief.
 */
export async function agentHasBelief(
  agentId: string,
  infoHash: string
): Promise<boolean> {
  const existing = await db
    .select({ id: informationBeliefs.id })
    .from(informationBeliefs)
    .where(
      and(
        eq(informationBeliefs.agentId, agentId),
        eq(informationBeliefs.infoHash, infoHash)
      )
    )
    .limit(1);

  return existing.length > 0;
}

/**
 * Update an agent's belief when they act on it.
 */
export async function markBeliefActedOn(
  agentId: string,
  infoHash: string,
  tick: number
): Promise<void> {
  await db
    .update(informationBeliefs)
    .set({ actedOnTick: tick })
    .where(
      and(
        eq(informationBeliefs.agentId, agentId),
        eq(informationBeliefs.infoHash, infoHash),
        isNull(informationBeliefs.actedOnTick)
      )
    );
}

/**
 * Update an agent's belief when they learn it was false.
 */
export async function markBeliefCorrected(
  agentId: string,
  infoHash: string,
  correctionSourceId: string | null,
  tick: number
): Promise<void> {
  await db
    .update(informationBeliefs)
    .set({
      correctedTick: tick,
      correctionSourceId,
    })
    .where(
      and(
        eq(informationBeliefs.agentId, agentId),
        eq(informationBeliefs.infoHash, infoHash),
        isNull(informationBeliefs.correctedTick)
      )
    );
}

/**
 * Increment the spread count when an agent shares a belief.
 */
export async function incrementSpreadCount(
  agentId: string,
  infoHash: string
): Promise<void> {
  await db
    .update(informationBeliefs)
    .set({
      spreadCount: sql`${informationBeliefs.spreadCount} + 1`,
    })
    .where(
      and(
        eq(informationBeliefs.agentId, agentId),
        eq(informationBeliefs.infoHash, infoHash)
      )
    );
}
