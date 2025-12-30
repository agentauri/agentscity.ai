/**
 * Experiments queries for A/B Testing Framework
 */

import { eq, sql, desc, and } from 'drizzle-orm';
import { db } from '../index';
import {
  experiments,
  experimentVariants,
  variantSnapshots,
  agents,
  type Experiment,
  type NewExperiment,
  type ExperimentVariant,
  type NewExperimentVariant,
  type VariantSnapshot,
  type NewVariantSnapshot,
} from '../schema';
import { getAnalyticsSnapshot } from './analytics';

// =============================================================================
// Types
// =============================================================================

export type ExperimentStatus = 'planning' | 'running' | 'completed' | 'cancelled';
export type VariantStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface ExperimentWithVariants extends Experiment {
  variants: ExperimentVariant[];
}

export interface VariantComparisonResult {
  variantId: string;
  variantName: string;
  ticksRun: number;
  metrics: {
    avgGiniCoefficient: number;
    avgCooperationIndex: number;
    avgWealth: number;
    avgHealth: number;
    avgHunger: number;
    avgEnergy: number;
    survivalRate: number;
    totalEvents: number;
    tradeCount: number;
    conflictCount: number;
  };
  finalState: {
    aliveAgents: number;
    avgBalance: number;
    avgHealth: number;
  };
}

// =============================================================================
// Experiment CRUD
// =============================================================================

/**
 * Create a new experiment
 */
export async function createExperiment(data: {
  name: string;
  description?: string;
  hypothesis?: string;
  metrics?: string[];
}): Promise<Experiment> {
  const result = await db
    .insert(experiments)
    .values({
      name: data.name,
      description: data.description,
      hypothesis: data.hypothesis,
      metrics: data.metrics,
    })
    .returning();

  return result[0];
}

/**
 * Get experiment by ID
 */
export async function getExperiment(id: string): Promise<Experiment | null> {
  const result = await db
    .select()
    .from(experiments)
    .where(eq(experiments.id, id));

  return result[0] || null;
}

/**
 * Get experiment with all variants
 */
export async function getExperimentWithVariants(id: string): Promise<ExperimentWithVariants | null> {
  const experiment = await getExperiment(id);
  if (!experiment) return null;

  const variants = await db
    .select()
    .from(experimentVariants)
    .where(eq(experimentVariants.experimentId, id))
    .orderBy(experimentVariants.createdAt);

  return {
    ...experiment,
    variants,
  };
}

/**
 * List all experiments
 */
export async function listExperiments(): Promise<Experiment[]> {
  return db
    .select()
    .from(experiments)
    .orderBy(desc(experiments.createdAt));
}

/**
 * Update experiment status
 */
export async function updateExperimentStatus(
  id: string,
  status: ExperimentStatus
): Promise<Experiment | null> {
  const updates: Partial<Experiment> = { status };

  if (status === 'running') {
    updates.startedAt = new Date();
  } else if (status === 'completed' || status === 'cancelled') {
    updates.completedAt = new Date();
  }

  const result = await db
    .update(experiments)
    .set(updates)
    .where(eq(experiments.id, id))
    .returning();

  return result[0] || null;
}

/**
 * Delete experiment (cascades to variants and snapshots)
 */
export async function deleteExperiment(id: string): Promise<boolean> {
  const result = await db
    .delete(experiments)
    .where(eq(experiments.id, id))
    .returning({ id: experiments.id });

  return result.length > 0;
}

// =============================================================================
// Variant CRUD
// =============================================================================

/**
 * Create a new variant for an experiment
 */
export async function createVariant(
  experimentId: string,
  data: {
    name: string;
    description?: string;
    configOverrides?: Record<string, unknown>;
    agentConfigs?: Array<{
      llmType: string;
      name: string;
      color: string;
      startX: number;
      startY: number;
    }>;
    worldSeed?: number;
    durationTicks?: number;
  }
): Promise<ExperimentVariant> {
  const result = await db
    .insert(experimentVariants)
    .values({
      experimentId,
      name: data.name,
      description: data.description,
      configOverrides: data.configOverrides,
      agentConfigs: data.agentConfigs,
      worldSeed: data.worldSeed,
      durationTicks: data.durationTicks || 100,
    })
    .returning();

  return result[0];
}

/**
 * Get variant by ID
 */
export async function getVariant(id: string): Promise<ExperimentVariant | null> {
  const result = await db
    .select()
    .from(experimentVariants)
    .where(eq(experimentVariants.id, id));

  return result[0] || null;
}

/**
 * Get all variants for an experiment
 */
export async function getExperimentVariants(experimentId: string): Promise<ExperimentVariant[]> {
  return db
    .select()
    .from(experimentVariants)
    .where(eq(experimentVariants.experimentId, experimentId))
    .orderBy(experimentVariants.createdAt);
}

/**
 * Update variant status
 */
export async function updateVariantStatus(
  id: string,
  status: VariantStatus,
  tickData?: { startTick?: number; endTick?: number }
): Promise<ExperimentVariant | null> {
  const updates: Partial<ExperimentVariant> = { status };

  if (tickData?.startTick !== undefined) {
    updates.startTick = tickData.startTick;
  }
  if (tickData?.endTick !== undefined) {
    updates.endTick = tickData.endTick;
  }
  if (status === 'completed' || status === 'failed') {
    updates.completedAt = new Date();
  }

  const result = await db
    .update(experimentVariants)
    .set(updates)
    .where(eq(experimentVariants.id, id))
    .returning();

  return result[0] || null;
}

/**
 * Get the currently running variant (if any)
 */
export async function getCurrentRunningVariant(): Promise<ExperimentVariant | null> {
  const result = await db
    .select()
    .from(experimentVariants)
    .where(eq(experimentVariants.status, 'running'))
    .limit(1);

  return result[0] || null;
}

/**
 * Get the next pending variant for an experiment
 */
export async function getNextPendingVariant(experimentId: string): Promise<ExperimentVariant | null> {
  const result = await db
    .select()
    .from(experimentVariants)
    .where(and(
      eq(experimentVariants.experimentId, experimentId),
      eq(experimentVariants.status, 'pending')
    ))
    .orderBy(experimentVariants.createdAt)
    .limit(1);

  return result[0] || null;
}

// =============================================================================
// Snapshot Management
// =============================================================================

/**
 * Capture a snapshot of current metrics for a variant
 */
export async function captureVariantSnapshot(
  variantId: string,
  tick: number
): Promise<VariantSnapshot> {
  // Get current analytics
  const analytics = await getAnalyticsSnapshot();

  // Get current agent states
  const agentStates = await db
    .select({
      id: agents.id,
      llmType: agents.llmType,
      x: agents.x,
      y: agents.y,
      hunger: agents.hunger,
      energy: agents.energy,
      health: agents.health,
      balance: agents.balance,
      state: agents.state,
    })
    .from(agents);

  const result = await db
    .insert(variantSnapshots)
    .values({
      variantId,
      tick,
      metricsSnapshot: {
        giniCoefficient: analytics.economy.giniCoefficient,
        cooperationIndex: analytics.emergence?.cooperationIndex,
        avgWealth: analytics.economy.balanceDistribution.mean,
        avgHealth: analytics.survival.byLlmType.reduce((sum, a) => sum + a.avgHealth, 0) /
          (analytics.survival.byLlmType.length || 1),
        avgHunger: analytics.survival.byLlmType.reduce((sum, a) => sum + a.avgHunger, 0) /
          (analytics.survival.byLlmType.length || 1),
        avgEnergy: analytics.survival.byLlmType.reduce((sum, a) => sum + a.avgEnergy, 0) /
          (analytics.survival.byLlmType.length || 1),
        aliveAgents: analytics.survival.overall.totalAlive,
        totalEvents: analytics.behavior.actionFrequency.reduce((sum, a) => sum + a.count, 0),
        tradeCount: analytics.emergence?.tradeNetwork.totalTrades || 0,
        conflictCount: analytics.phase2?.conflict.crimeRate.totalCrimeEvents || 0,
        clusteringCoefficient: analytics.emergence?.clustering.numClusters ?
          1 - (analytics.emergence.clustering.numClusters / (analytics.survival.overall.totalAlive || 1)) : undefined,
      },
      agentStates: agentStates.map(a => ({
        id: a.id,
        llmType: a.llmType,
        x: a.x,
        y: a.y,
        hunger: a.hunger,
        energy: a.energy,
        health: a.health,
        balance: a.balance,
        state: a.state,
      })),
    })
    .returning();

  return result[0];
}

/**
 * Get all snapshots for a variant
 */
export async function getVariantSnapshots(variantId: string): Promise<VariantSnapshot[]> {
  return db
    .select()
    .from(variantSnapshots)
    .where(eq(variantSnapshots.variantId, variantId))
    .orderBy(variantSnapshots.tick);
}

/**
 * Get latest snapshot for a variant
 */
export async function getLatestVariantSnapshot(variantId: string): Promise<VariantSnapshot | null> {
  const result = await db
    .select()
    .from(variantSnapshots)
    .where(eq(variantSnapshots.variantId, variantId))
    .orderBy(desc(variantSnapshots.tick))
    .limit(1);

  return result[0] || null;
}

// =============================================================================
// Comparison & Analysis
// =============================================================================

/**
 * Compare metrics across multiple variants
 */
export async function compareVariants(variantIds: string[]): Promise<VariantComparisonResult[]> {
  const results: VariantComparisonResult[] = [];

  for (const variantId of variantIds) {
    const variant = await getVariant(variantId);
    if (!variant) continue;

    const snapshots = await getVariantSnapshots(variantId);
    if (snapshots.length === 0) continue;

    // Calculate averages from snapshots
    const metricsSum = {
      giniCoefficient: 0,
      cooperationIndex: 0,
      avgWealth: 0,
      avgHealth: 0,
      avgHunger: 0,
      avgEnergy: 0,
      aliveAgents: 0,
      totalEvents: 0,
      tradeCount: 0,
      conflictCount: 0,
    };

    let count = 0;
    for (const snapshot of snapshots) {
      const metrics = snapshot.metricsSnapshot as typeof metricsSum;
      if (metrics) {
        metricsSum.giniCoefficient += metrics.giniCoefficient || 0;
        metricsSum.cooperationIndex += metrics.cooperationIndex || 0;
        metricsSum.avgWealth += metrics.avgWealth || 0;
        metricsSum.avgHealth += metrics.avgHealth || 0;
        metricsSum.avgHunger += metrics.avgHunger || 0;
        metricsSum.avgEnergy += metrics.avgEnergy || 0;
        metricsSum.aliveAgents += metrics.aliveAgents || 0;
        metricsSum.totalEvents += metrics.totalEvents || 0;
        metricsSum.tradeCount += metrics.tradeCount || 0;
        metricsSum.conflictCount += metrics.conflictCount || 0;
        count++;
      }
    }

    // Get final state from last snapshot
    const lastSnapshot = snapshots[snapshots.length - 1];
    const lastMetrics = lastSnapshot?.metricsSnapshot as typeof metricsSum;
    const lastAgentStates = lastSnapshot?.agentStates as Array<{
      id: string;
      balance: number;
      health: number;
      state: string;
    }>;

    const aliveAgentsData = lastAgentStates?.filter(a => a.state !== 'dead') || [];
    const ticksRun = variant.endTick && variant.startTick
      ? variant.endTick - variant.startTick
      : snapshots.length > 0
        ? Number(snapshots[snapshots.length - 1].tick) - Number(snapshots[0].tick)
        : 0;

    // Calculate survival rate (alive at end / total at start)
    const firstSnapshot = snapshots[0];
    const firstAgentStates = firstSnapshot?.agentStates as Array<{ state: string }>;
    const initialAlive = firstAgentStates?.filter(a => a.state !== 'dead').length || 7;
    const finalAlive = aliveAgentsData.length;
    const survivalRate = initialAlive > 0 ? finalAlive / initialAlive : 0;

    results.push({
      variantId,
      variantName: variant.name,
      ticksRun,
      metrics: count > 0 ? {
        avgGiniCoefficient: metricsSum.giniCoefficient / count,
        avgCooperationIndex: metricsSum.cooperationIndex / count,
        avgWealth: metricsSum.avgWealth / count,
        avgHealth: metricsSum.avgHealth / count,
        avgHunger: metricsSum.avgHunger / count,
        avgEnergy: metricsSum.avgEnergy / count,
        survivalRate,
        totalEvents: metricsSum.totalEvents,
        tradeCount: metricsSum.tradeCount,
        conflictCount: metricsSum.conflictCount,
      } : {
        avgGiniCoefficient: 0,
        avgCooperationIndex: 0,
        avgWealth: 0,
        avgHealth: 0,
        avgHunger: 0,
        avgEnergy: 0,
        survivalRate: 0,
        totalEvents: 0,
        tradeCount: 0,
        conflictCount: 0,
      },
      finalState: {
        aliveAgents: finalAlive,
        avgBalance: aliveAgentsData.length > 0
          ? aliveAgentsData.reduce((sum, a) => sum + a.balance, 0) / aliveAgentsData.length
          : 0,
        avgHealth: aliveAgentsData.length > 0
          ? aliveAgentsData.reduce((sum, a) => sum + a.health, 0) / aliveAgentsData.length
          : 0,
      },
    });
  }

  return results;
}

/**
 * Get experiment summary with comparison
 */
export async function getExperimentSummary(experimentId: string): Promise<{
  experiment: Experiment;
  variants: ExperimentVariant[];
  comparison: VariantComparisonResult[];
} | null> {
  const experiment = await getExperiment(experimentId);
  if (!experiment) return null;

  const variants = await getExperimentVariants(experimentId);
  const completedVariantIds = variants
    .filter(v => v.status === 'completed')
    .map(v => v.id);

  const comparison = completedVariantIds.length > 0
    ? await compareVariants(completedVariantIds)
    : [];

  return {
    experiment,
    variants,
    comparison,
  };
}
