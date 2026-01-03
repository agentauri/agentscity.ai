/**
 * Shock Tests Module - Scientific Experiment Perturbations
 *
 * Implements various world shocks for testing agent resilience and emergent behaviors.
 * Shocks are designed to stress-test the simulation and observe recovery patterns.
 *
 * Shock Types:
 * - resource_collapse: Sudden drop in all resource spawns
 * - resource_boom: Sudden increase in resources
 * - plague: Random agents take damage/die
 * - immigration: New agents suddenly appear
 * - communication_blackout: Agents can't see other agents temporarily
 * - wealth_redistribution: Reset all balances to equal
 *
 * Architecture:
 * - ShockManager class encapsulates all mutable state
 * - Default singleton instance for backward compatibility
 * - Factory function for creating isolated instances (testing)
 */

import { v4 as uuid } from 'uuid';
import { getAliveAgents, updateAgent, createAgent } from '../db/queries/agents';
import { getAllResourceSpawns, updateResourceSpawn } from '../db/queries/world';
import { appendEvent } from '../db/queries/events';
import { publishEvent, type WorldEvent } from '../cache/pubsub';
import { getCurrentTick } from '../db/queries/world';
import { random, randomBelow, randomChoice } from '../utils/random';
import type { Agent, NewAgent } from '../db/schema';

// =============================================================================
// Types
// =============================================================================

export type ShockType =
  | 'resource_collapse'
  | 'resource_boom'
  | 'plague'
  | 'immigration'
  | 'communication_blackout'
  | 'wealth_redistribution';

export interface ShockConfig {
  /** Type of shock to apply */
  type: ShockType;
  /** Tick at which to apply the shock */
  scheduledTick: number;
  /** Intensity from 0-1, affects magnitude of the shock */
  intensity: number;
  /** Duration in ticks for temporary effects (communication_blackout) */
  duration?: number;
  /** Optional description for logging */
  description?: string;
}

export interface ShockResult {
  /** Type of shock that was applied */
  type: ShockType;
  /** Tick when the shock was applied */
  tick: number;
  /** List of agent IDs affected by the shock */
  affectedAgents: string[];
  /** Human-readable description of what happened */
  description: string;
  /** Additional details about the shock effect */
  details?: Record<string, unknown>;
}

/**
 * Composite shock execution mode
 */
export type CompositeMode = 'parallel' | 'sequence' | 'cascade';

/**
 * Configuration for a composite shock (combines multiple shocks)
 */
export interface CompositeShockConfig {
  /** Unique identifier for this composite shock */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of what this composite shock does */
  description: string;
  /** How to execute the shocks: parallel, sequence, or cascade */
  mode: CompositeMode;
  /** Individual shocks that make up this composite */
  shocks: ShockConfig[];
  /** Delay between shocks in ticks (for sequence/cascade modes) */
  delayBetweenShocks?: number;
  /** For cascade mode: intensity reduction per step (multiplier) */
  cascadeDecay?: number;
}

/**
 * Result of a composite shock application
 */
export interface CompositeShockResult {
  /** ID of the composite shock */
  id: string;
  /** Name of the composite shock */
  name: string;
  /** Start tick */
  startTick: number;
  /** End tick (for sequence/cascade) */
  endTick: number;
  /** Mode used */
  mode: CompositeMode;
  /** Results from each individual shock */
  shockResults: ShockResult[];
  /** Total agents affected across all shocks */
  totalAffectedAgents: string[];
  /** Summary description */
  summary: string;
}

// =============================================================================
// Predefined Composite Shock Templates
// =============================================================================

/**
 * Predefined composite shock templates
 */
export const COMPOSITE_SHOCK_TEMPLATES: Record<string, Omit<CompositeShockConfig, 'id'>> = {
  /**
   * Economic Crisis: Resource collapse followed by wealth redistribution
   * Simulates a market crash with government intervention
   */
  economic_crisis: {
    name: 'Economic Crisis',
    description: 'Resource collapse followed by wealth redistribution - simulates market crash with government intervention',
    mode: 'sequence',
    shocks: [
      { type: 'resource_collapse', scheduledTick: 0, intensity: 0.2, description: 'Market crash' },
      { type: 'wealth_redistribution', scheduledTick: 0, intensity: 0.7, description: 'Government bailout' },
    ],
    delayBetweenShocks: 5,
  },

  /**
   * Perfect Storm: Multiple shocks hit simultaneously
   * Tests agent resilience under extreme pressure
   */
  perfect_storm: {
    name: 'Perfect Storm',
    description: 'Multiple simultaneous shocks - tests extreme resilience',
    mode: 'parallel',
    shocks: [
      { type: 'resource_collapse', scheduledTick: 0, intensity: 0.3 },
      { type: 'plague', scheduledTick: 0, intensity: 0.4 },
      { type: 'communication_blackout', scheduledTick: 0, intensity: 1.0, duration: 20 },
    ],
  },

  /**
   * Boom and Bust Cycle: Alternating resource boom and collapse
   * Simulates economic cycle
   */
  boom_bust_cycle: {
    name: 'Boom and Bust Cycle',
    description: 'Alternating boom and collapse - simulates economic cycle',
    mode: 'sequence',
    shocks: [
      { type: 'resource_boom', scheduledTick: 0, intensity: 1.0, description: 'Boom phase' },
      { type: 'resource_collapse', scheduledTick: 0, intensity: 0.1, description: 'Bust phase' },
      { type: 'resource_boom', scheduledTick: 0, intensity: 0.5, description: 'Recovery phase' },
    ],
    delayBetweenShocks: 15,
  },

  /**
   * Cascading Plague: Plague with decreasing intensity (waves)
   * Simulates epidemic with multiple waves
   */
  epidemic_waves: {
    name: 'Epidemic Waves',
    description: 'Multiple plague waves with decreasing intensity - simulates epidemic',
    mode: 'cascade',
    shocks: [
      { type: 'plague', scheduledTick: 0, intensity: 0.8, description: 'First wave' },
      { type: 'plague', scheduledTick: 0, intensity: 0.5, description: 'Second wave' },
      { type: 'plague', scheduledTick: 0, intensity: 0.3, description: 'Third wave' },
    ],
    delayBetweenShocks: 10,
    cascadeDecay: 0.6,
  },

  /**
   * Immigration Boom with Resources: New agents + extra resources
   * Simulates managed population growth
   */
  managed_growth: {
    name: 'Managed Growth',
    description: 'Immigration with resource increase - simulates managed population expansion',
    mode: 'parallel',
    shocks: [
      { type: 'immigration', scheduledTick: 0, intensity: 1.0 },
      { type: 'resource_boom', scheduledTick: 0, intensity: 0.8 },
    ],
  },

  /**
   * Isolation Test: Blackout followed by resource scarcity
   * Tests agent behavior when isolated and resources are low
   */
  isolation_scarcity: {
    name: 'Isolation Scarcity',
    description: 'Communication blackout with resource scarcity - tests individual survival',
    mode: 'sequence',
    shocks: [
      { type: 'communication_blackout', scheduledTick: 0, intensity: 1.0, duration: 30 },
      { type: 'resource_collapse', scheduledTick: 0, intensity: 0.3 },
    ],
    delayBetweenShocks: 5,
  },

  /**
   * Rapid Change: Fast alternating shocks
   * Tests agent adaptability to rapid environmental changes
   */
  rapid_change: {
    name: 'Rapid Change',
    description: 'Fast alternating shocks - tests adaptability',
    mode: 'sequence',
    shocks: [
      { type: 'resource_boom', scheduledTick: 0, intensity: 0.5 },
      { type: 'resource_collapse', scheduledTick: 0, intensity: 0.5 },
      { type: 'resource_boom', scheduledTick: 0, intensity: 0.3 },
      { type: 'resource_collapse', scheduledTick: 0, intensity: 0.7 },
    ],
    delayBetweenShocks: 3,
  },
};

// =============================================================================
// ShockManager Class
// =============================================================================

/**
 * Manages all shock-related state and operations.
 * Encapsulates mutable state for better testing and multi-tenancy support.
 */
export class ShockManager {
  /** In-memory registry of scheduled shocks */
  private scheduledShocks: ShockConfig[] = [];

  /** Communication blackout state */
  private blackoutEndTick: number | null = null;

  /** In-memory registry of scheduled composite shocks */
  private scheduledCompositeShocks: CompositeShockConfig[] = [];

  // ===========================================================================
  // Blackout State Management
  // ===========================================================================

  /**
   * Check if communication blackout is currently active
   */
  isBlackoutActive(currentTick: number): boolean {
    return this.blackoutEndTick !== null && currentTick < this.blackoutEndTick;
  }

  /**
   * Get the tick when blackout ends (or null if not active)
   */
  getBlackoutEndTick(): number | null {
    return this.blackoutEndTick;
  }

  /**
   * Clear the blackout state (for testing or reset)
   */
  clearBlackoutState(): void {
    this.blackoutEndTick = null;
  }

  /**
   * Set the blackout end tick (used internally by applyCommunicationBlackout)
   */
  setBlackoutEndTick(tick: number): void {
    this.blackoutEndTick = tick;
  }

  // ===========================================================================
  // Shock Scheduling
  // ===========================================================================

  /**
   * Schedule a shock to be applied at a specific tick
   */
  scheduleShock(config: ShockConfig): void {
    // Validate intensity
    if (config.intensity < 0 || config.intensity > 1) {
      throw new Error(`Invalid shock intensity: ${config.intensity}. Must be between 0 and 1.`);
    }

    // Validate duration for temporary effects
    if (config.type === 'communication_blackout' && !config.duration) {
      throw new Error('communication_blackout shock requires a duration parameter');
    }

    this.scheduledShocks.push(config);
    this.scheduledShocks.sort((a, b) => a.scheduledTick - b.scheduledTick);

    console.log(
      `[Shocks] Scheduled ${config.type} shock at tick ${config.scheduledTick} ` +
        `(intensity: ${config.intensity}${config.duration ? `, duration: ${config.duration}` : ''})`
    );
  }

  /**
   * Get all scheduled shocks
   */
  getScheduledShocks(): ShockConfig[] {
    return [...this.scheduledShocks];
  }

  /**
   * Clear all scheduled shocks
   */
  clearScheduledShocks(): void {
    this.scheduledShocks.length = 0;
    console.log('[Shocks] Cleared all scheduled shocks');
  }

  /**
   * Remove a specific scheduled shock by index
   */
  removeScheduledShock(index: number): ShockConfig | null {
    if (index < 0 || index >= this.scheduledShocks.length) {
      return null;
    }
    return this.scheduledShocks.splice(index, 1)[0];
  }

  /**
   * Check and apply any shocks scheduled for the current tick
   * Called by the tick engine each tick
   */
  async processScheduledShocks(currentTick: number): Promise<ShockResult[]> {
    const results: ShockResult[] = [];

    // Find all shocks scheduled for this tick
    const shocksToApply = this.scheduledShocks.filter((s) => s.scheduledTick === currentTick);

    for (const shock of shocksToApply) {
      try {
        const result = await this.applyShock(shock);
        results.push(result);

        // Log the shock event
        const shockEvent: WorldEvent = {
          id: uuid(),
          type: 'world_shock',
          tick: currentTick,
          timestamp: Date.now(),
          payload: {
            shockType: shock.type,
            intensity: shock.intensity,
            duration: shock.duration,
            affectedAgents: result.affectedAgents.length,
            description: result.description,
            details: result.details,
          },
        };

        try {
          await appendEvent({
            tick: currentTick,
            agentId: null,
            eventType: 'world_shock',
            payload: shockEvent.payload,
          });
        } catch (eventError) {
          console.warn(`[Shocks] Failed to persist shock event: ${eventError instanceof Error ? eventError.message : eventError}`);
          // Continue - event persistence failure shouldn't abort shock processing
        }

        try {
          await publishEvent(shockEvent);
        } catch (pubError) {
          console.warn(`[Shocks] Failed to publish shock event: ${pubError instanceof Error ? pubError.message : pubError}`);
          // Continue - pub/sub failure shouldn't abort shock processing
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[Shocks] Failed to apply ${shock.type} shock:`, errorMsg);

        // Add failed shock to results for tracking
        results.push({
          type: shock.type,
          tick: currentTick,
          affectedAgents: [],
          description: `FAILED: ${errorMsg}`,
          details: { error: true, errorMessage: errorMsg },
        });
      }
    }

    // Remove applied shocks from the schedule
    for (let i = this.scheduledShocks.length - 1; i >= 0; i--) {
      if (this.scheduledShocks[i].scheduledTick === currentTick) {
        this.scheduledShocks.splice(i, 1);
      }
    }

    return results;
  }

  // ===========================================================================
  // Shock Application
  // ===========================================================================

  /**
   * Apply a shock to the world immediately
   */
  async applyShock(config: ShockConfig): Promise<ShockResult> {
    const tick = config.scheduledTick || (await getCurrentTick());

    console.log(
      `[Shocks] Applying ${config.type} shock at tick ${tick} (intensity: ${config.intensity})`
    );

    switch (config.type) {
      case 'resource_collapse':
        return this.applyResourceCollapse(config, tick);
      case 'resource_boom':
        return this.applyResourceBoom(config, tick);
      case 'plague':
        return this.applyPlague(config, tick);
      case 'immigration':
        return this.applyImmigration(config, tick);
      case 'communication_blackout':
        return this.applyCommunicationBlackout(config, tick);
      case 'wealth_redistribution':
        return this.applyWealthRedistribution(config, tick);
      default:
        throw new Error(`Unknown shock type: ${config.type}`);
    }
  }

  // ===========================================================================
  // Individual Shock Implementations
  // ===========================================================================

  /**
   * Resource Collapse: Set all resource spawn currentAmount to intensity * maxAmount
   */
  private async applyResourceCollapse(config: ShockConfig, tick: number): Promise<ShockResult> {
    const resourceSpawns = await getAllResourceSpawns();
    const affectedAgents: string[] = [];
    let totalReduction = 0;

    for (const spawn of resourceSpawns) {
      const newAmount = Math.floor(spawn.maxAmount * config.intensity);
      const reduction = spawn.currentAmount - newAmount;
      totalReduction += Math.max(0, reduction);

      await updateResourceSpawn(spawn.id, {
        currentAmount: Math.max(0, newAmount),
      });
    }

    // All alive agents are indirectly affected
    const agents = await getAliveAgents();
    affectedAgents.push(...agents.map((a) => a.id));

    return {
      type: 'resource_collapse',
      tick,
      affectedAgents,
      description: `Resource collapse! All spawns reduced to ${(config.intensity * 100).toFixed(0)}% capacity.`,
      details: {
        spawnsAffected: resourceSpawns.length,
        totalResourceReduction: totalReduction,
        newCapacityPercent: config.intensity * 100,
      },
    };
  }

  /**
   * Resource Boom: Multiply all resource spawn currentAmount
   * intensity 0.5 = 150% resources, intensity 1.0 = 200% resources
   */
  private async applyResourceBoom(config: ShockConfig, tick: number): Promise<ShockResult> {
    const resourceSpawns = await getAllResourceSpawns();
    const affectedAgents: string[] = [];
    let totalIncrease = 0;

    const multiplier = 1 + config.intensity; // 0.5 intensity = 1.5x, 1.0 intensity = 2x

    for (const spawn of resourceSpawns) {
      const newAmount = Math.min(spawn.maxAmount, Math.floor(spawn.currentAmount * multiplier));
      const increase = newAmount - spawn.currentAmount;
      totalIncrease += Math.max(0, increase);

      await updateResourceSpawn(spawn.id, {
        currentAmount: newAmount,
      });
    }

    // All alive agents are indirectly affected
    const agents = await getAliveAgents();
    affectedAgents.push(...agents.map((a) => a.id));

    return {
      type: 'resource_boom',
      tick,
      affectedAgents,
      description: `Resource boom! All spawns increased by ${(config.intensity * 100).toFixed(0)}%.`,
      details: {
        spawnsAffected: resourceSpawns.length,
        totalResourceIncrease: totalIncrease,
        multiplier,
      },
    };
  }

  /**
   * Plague: Deal (100 * intensity) damage to random (intensity * agentCount) agents
   */
  private async applyPlague(config: ShockConfig, tick: number): Promise<ShockResult> {
    const agents = await getAliveAgents();
    const affectedAgents: string[] = [];

    // Calculate number of agents to affect
    const numToAffect = Math.max(1, Math.floor(agents.length * config.intensity));
    const damage = 100 * config.intensity;

    // Randomly select agents to affect
    const shuffled = [...agents].sort(() => random() - 0.5);
    const victims = shuffled.slice(0, numToAffect);

    let deaths = 0;

    for (const agent of victims) {
      const newHealth = Math.max(0, agent.health - damage);
      const died = newHealth <= 0;

      await updateAgent(agent.id, {
        health: newHealth,
        state: died ? 'dead' : agent.state,
        diedAt: died ? new Date() : undefined,
      });

      affectedAgents.push(agent.id);
      if (died) deaths++;

      // Emit individual plague damage events
      const damageEvent: WorldEvent = {
        id: uuid(),
        type: 'plague_damage',
        tick,
        timestamp: Date.now(),
        agentId: agent.id,
        payload: {
          damage,
          newHealth,
          died,
        },
      };
      await publishEvent(damageEvent);
    }

    return {
      type: 'plague',
      tick,
      affectedAgents,
      description: `Plague strikes! ${numToAffect} agents affected, ${deaths} died.`,
      details: {
        totalAgents: agents.length,
        affectedCount: numToAffect,
        damageDealt: damage,
        deaths,
      },
    };
  }

  /**
   * Immigration: Spawn (intensity * 5) new random agents
   */
  private async applyImmigration(config: ShockConfig, tick: number): Promise<ShockResult> {
    const numToSpawn = Math.max(1, Math.floor(config.intensity * 5));
    const affectedAgents: string[] = [];

    const llmTypes: Array<'claude' | 'gemini' | 'codex' | 'deepseek' | 'qwen' | 'glm' | 'grok'> = [
      'claude',
      'gemini',
      'codex',
      'deepseek',
      'qwen',
      'glm',
      'grok',
    ];

    const colors = ['#ef4444', '#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6'];

    for (let i = 0; i < numToSpawn; i++) {
      const llmType = randomChoice(llmTypes) ?? 'claude';
      const color = colors[llmTypes.indexOf(llmType)] ?? '#888888';

      const newAgent: NewAgent = {
        id: uuid(),
        llmType,
        x: randomBelow(100),
        y: randomBelow(100),
        hunger: 60 + randomBelow(30),
        energy: 60 + randomBelow(30),
        health: 80 + randomBelow(20),
        balance: 30 + randomBelow(40),
        state: 'idle',
        color,
      };

      const created = await createAgent(newAgent);
      affectedAgents.push(created.id);

      // Emit immigration event for each new agent
      const immigrationEvent: WorldEvent = {
        id: uuid(),
        type: 'agent_immigrated',
        tick,
        timestamp: Date.now(),
        agentId: created.id,
        payload: {
          llmType,
          x: newAgent.x,
          y: newAgent.y,
          shockTriggered: true,
        },
      };
      await publishEvent(immigrationEvent);
    }

    return {
      type: 'immigration',
      tick,
      affectedAgents,
      description: `Immigration wave! ${numToSpawn} new agents arrived.`,
      details: {
        newAgentCount: numToSpawn,
        llmTypesSpawned: affectedAgents.length,
      },
    };
  }

  /**
   * Communication Blackout: Set a flag that hides nearbyAgents for duration ticks
   */
  private async applyCommunicationBlackout(
    config: ShockConfig,
    tick: number
  ): Promise<ShockResult> {
    const duration = config.duration ?? 10;
    this.blackoutEndTick = tick + duration;

    const agents = await getAliveAgents();
    const affectedAgents = agents.map((a) => a.id);

    return {
      type: 'communication_blackout',
      tick,
      affectedAgents,
      description: `Communication blackout! Agents cannot see each other for ${duration} ticks.`,
      details: {
        duration,
        endTick: this.blackoutEndTick,
        agentsAffected: agents.length,
      },
    };
  }

  /**
   * Wealth Redistribution: Set all agents' balance to average balance
   */
  private async applyWealthRedistribution(config: ShockConfig, tick: number): Promise<ShockResult> {
    const agents = await getAliveAgents();
    const affectedAgents: string[] = [];

    if (agents.length === 0) {
      return {
        type: 'wealth_redistribution',
        tick,
        affectedAgents: [],
        description: 'No agents alive for wealth redistribution.',
        details: { avgBalance: 0 },
      };
    }

    // Calculate average balance
    const totalBalance = agents.reduce((sum, a) => sum + a.balance, 0);
    const avgBalance = totalBalance / agents.length;

    // Apply the redistribution based on intensity
    // intensity 0 = no change, intensity 1 = full equalization
    for (const agent of agents) {
      const newBalance = agent.balance + (avgBalance - agent.balance) * config.intensity;
      await updateAgent(agent.id, { balance: newBalance });
      affectedAgents.push(agent.id);
    }

    return {
      type: 'wealth_redistribution',
      tick,
      affectedAgents,
      description: `Wealth redistribution! Balances moved ${(config.intensity * 100).toFixed(0)}% toward average.`,
      details: {
        totalBalance,
        avgBalance,
        agentsAffected: agents.length,
        redistributionIntensity: config.intensity,
      },
    };
  }

  // ===========================================================================
  // Composite Shock Management
  // ===========================================================================

  /**
   * Schedule a composite shock
   */
  scheduleCompositeShock(config: CompositeShockConfig, startTick: number): void {
    // Calculate actual ticks for each shock based on mode
    const shocksWithTicks: ShockConfig[] = [];

    switch (config.mode) {
      case 'parallel':
        // All shocks at the same tick
        for (const shock of config.shocks) {
          shocksWithTicks.push({
            ...shock,
            scheduledTick: startTick,
          });
        }
        break;

      case 'sequence':
        // Shocks in order with delay between them
        const delay = config.delayBetweenShocks ?? 5;
        for (let i = 0; i < config.shocks.length; i++) {
          shocksWithTicks.push({
            ...config.shocks[i],
            scheduledTick: startTick + i * delay,
          });
        }
        break;

      case 'cascade':
        // Shocks with decreasing intensity and delay
        const cascadeDelay = config.delayBetweenShocks ?? 10;
        const decay = config.cascadeDecay ?? 0.7;
        let currentIntensity = config.shocks[0]?.intensity ?? 0.5;

        for (let i = 0; i < config.shocks.length; i++) {
          shocksWithTicks.push({
            ...config.shocks[i],
            scheduledTick: startTick + i * cascadeDelay,
            intensity: i === 0 ? currentIntensity : (currentIntensity *= decay),
          });
        }
        break;
    }

    // Schedule all individual shocks
    for (const shock of shocksWithTicks) {
      this.scheduleShock(shock);
    }

    // Store composite for tracking
    this.scheduledCompositeShocks.push({
      ...config,
      shocks: shocksWithTicks,
    });

    console.log(
      `[Shocks] Scheduled composite shock "${config.name}" (${config.mode}) starting at tick ${startTick} ` +
      `with ${config.shocks.length} sub-shocks`
    );
  }

  /**
   * Apply a composite shock immediately (for testing or immediate execution)
   */
  async applyCompositeShock(
    config: CompositeShockConfig,
    startTick?: number
  ): Promise<CompositeShockResult> {
    const tick = startTick ?? (await getCurrentTick());
    const results: ShockResult[] = [];
    const allAffectedAgents = new Set<string>();

    console.log(`[Shocks] Applying composite shock "${config.name}" at tick ${tick}`);

    switch (config.mode) {
      case 'parallel':
        // Apply all shocks at once
        for (const shock of config.shocks) {
          const result = await this.applyShock({ ...shock, scheduledTick: tick });
          results.push(result);
          result.affectedAgents.forEach((id) => allAffectedAgents.add(id));
        }
        break;

      case 'sequence':
      case 'cascade':
        // Apply shocks in sequence (for immediate application, we process them all now)
        // In scheduled mode, they would be applied at different ticks
        for (let i = 0; i < config.shocks.length; i++) {
          const shock = config.shocks[i];
          let intensity = shock.intensity;

          // Apply cascade decay
          if (config.mode === 'cascade' && i > 0) {
            intensity *= Math.pow(config.cascadeDecay ?? 0.7, i);
          }

          const result = await this.applyShock({
            ...shock,
            scheduledTick: tick,
            intensity,
          });
          results.push(result);
          result.affectedAgents.forEach((id) => allAffectedAgents.add(id));
        }
        break;
    }

    const endTick = config.mode === 'parallel'
      ? tick
      : tick + (config.shocks.length - 1) * (config.delayBetweenShocks ?? 5);

    return {
      id: config.id,
      name: config.name,
      startTick: tick,
      endTick,
      mode: config.mode,
      shockResults: results,
      totalAffectedAgents: Array.from(allAffectedAgents),
      summary: `Applied ${config.name} (${config.mode}): ${results.length} shocks affecting ${allAffectedAgents.size} unique agents`,
    };
  }

  /**
   * Get all scheduled composite shocks
   */
  getScheduledCompositeShocks(): CompositeShockConfig[] {
    return [...this.scheduledCompositeShocks];
  }

  /**
   * Clear all scheduled composite shocks
   */
  clearScheduledCompositeShocks(): void {
    this.scheduledCompositeShocks.length = 0;
  }

  // ===========================================================================
  // Full Reset
  // ===========================================================================

  /**
   * Reset all state (for testing or simulation reset)
   */
  reset(): void {
    this.scheduledShocks.length = 0;
    this.scheduledCompositeShocks.length = 0;
    this.blackoutEndTick = null;
    console.log('[Shocks] Reset all shock state');
  }
}

// =============================================================================
// Default Singleton Instance
// =============================================================================

/** Default shock manager instance for backward compatibility */
const defaultShockManager = new ShockManager();

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new isolated ShockManager instance.
 * Use this for testing or multi-tenant scenarios.
 */
export function createShockManager(): ShockManager {
  return new ShockManager();
}

/**
 * Get the default shock manager instance
 */
export function getDefaultShockManager(): ShockManager {
  return defaultShockManager;
}

// =============================================================================
// Backward-Compatible Function Exports
// =============================================================================

// These functions delegate to the default singleton instance for backward compatibility

export function isBlackoutActive(currentTick: number): boolean {
  return defaultShockManager.isBlackoutActive(currentTick);
}

export function getBlackoutEndTick(): number | null {
  return defaultShockManager.getBlackoutEndTick();
}

export function clearBlackoutState(): void {
  defaultShockManager.clearBlackoutState();
}

export function scheduleShock(config: ShockConfig): void {
  defaultShockManager.scheduleShock(config);
}

export function getScheduledShocks(): ShockConfig[] {
  return defaultShockManager.getScheduledShocks();
}

export function clearScheduledShocks(): void {
  defaultShockManager.clearScheduledShocks();
}

export function removeScheduledShock(index: number): ShockConfig | null {
  return defaultShockManager.removeScheduledShock(index);
}

export async function processScheduledShocks(currentTick: number): Promise<ShockResult[]> {
  return defaultShockManager.processScheduledShocks(currentTick);
}

export async function applyShock(config: ShockConfig): Promise<ShockResult> {
  return defaultShockManager.applyShock(config);
}

export function scheduleCompositeShock(config: CompositeShockConfig, startTick: number): void {
  defaultShockManager.scheduleCompositeShock(config, startTick);
}

export async function applyCompositeShock(
  config: CompositeShockConfig,
  startTick?: number
): Promise<CompositeShockResult> {
  return defaultShockManager.applyCompositeShock(config, startTick);
}

export function getScheduledCompositeShocks(): CompositeShockConfig[] {
  return defaultShockManager.getScheduledCompositeShocks();
}

export function clearScheduledCompositeShocks(): void {
  defaultShockManager.clearScheduledCompositeShocks();
}

// =============================================================================
// Utility Functions (Stateless)
// =============================================================================

/**
 * Create a preset shock configuration
 */
export function createShockPreset(
  type: ShockType,
  ticksFromNow: number,
  intensity = 0.5,
  duration?: number
): ShockConfig {
  return {
    type,
    scheduledTick: ticksFromNow, // Will be adjusted when scheduling
    intensity,
    duration,
  };
}

/**
 * Schedule multiple shocks at once (for experiment configurations)
 */
export function scheduleShocks(shocks: ShockConfig[]): void {
  for (const shock of shocks) {
    scheduleShock(shock);
  }
}

/**
 * Get shock type descriptions for documentation
 */
export function getShockTypeDescriptions(): Record<ShockType, string> {
  return {
    resource_collapse: 'Sudden drop in all resource spawns (intensity = remaining % of max)',
    resource_boom: 'Sudden increase in resources (intensity = % increase, e.g., 0.5 = +50%)',
    plague: 'Random agents take damage (intensity affects both # affected and damage)',
    immigration: 'New agents suddenly appear (intensity * 5 = number of new agents)',
    communication_blackout: 'Agents cannot see other agents (requires duration parameter)',
    wealth_redistribution: 'Move all balances toward average (intensity = % toward average)',
  };
}

/**
 * Get all composite shock templates
 */
export function getCompositeShockTemplates(): Record<string, Omit<CompositeShockConfig, 'id'>> {
  return { ...COMPOSITE_SHOCK_TEMPLATES };
}

/**
 * Create a composite shock from a template
 */
export function createCompositeFromTemplate(
  templateName: keyof typeof COMPOSITE_SHOCK_TEMPLATES,
  startTick: number,
  overrides?: Partial<CompositeShockConfig>
): CompositeShockConfig {
  const template = COMPOSITE_SHOCK_TEMPLATES[templateName];
  if (!template) {
    throw new Error(`Unknown composite shock template: ${templateName}`);
  }

  // Deep clone and apply tick offsets
  const shocks = template.shocks.map((s, index) => ({
    ...s,
    scheduledTick: startTick + (template.mode === 'parallel' ? 0 : index * (template.delayBetweenShocks ?? 5)),
  }));

  return {
    id: uuid(),
    name: template.name,
    description: template.description,
    mode: template.mode,
    shocks,
    delayBetweenShocks: template.delayBetweenShocks,
    cascadeDecay: template.cascadeDecay,
    ...overrides,
  };
}

/**
 * Create a custom composite shock
 */
export function createCompositeShock(config: Omit<CompositeShockConfig, 'id'>): CompositeShockConfig {
  return {
    id: uuid(),
    ...config,
  };
}

/**
 * Generate a random composite shock for testing
 */
export function generateRandomComposite(startTick: number, complexity: 1 | 2 | 3 = 2): CompositeShockConfig {
  const modes: CompositeMode[] = ['parallel', 'sequence', 'cascade'];
  const allShockTypes: ShockType[] = [
    'resource_collapse',
    'resource_boom',
    'plague',
    'immigration',
    'communication_blackout',
    'wealth_redistribution',
  ];

  const mode = randomChoice(modes) ?? 'sequence';
  const numShocks = complexity + 1;
  const shocks: ShockConfig[] = [];

  for (let i = 0; i < numShocks; i++) {
    const type = randomChoice(allShockTypes) ?? 'resource_collapse';
    shocks.push({
      type,
      scheduledTick: 0, // Will be set by scheduleCompositeShock
      intensity: 0.3 + random() * 0.5,
      duration: type === 'communication_blackout' ? 10 + randomBelow(20) : undefined,
    });
  }

  return {
    id: uuid(),
    name: `Random Composite (${mode})`,
    description: `Randomly generated ${mode} composite with ${numShocks} shocks`,
    mode,
    shocks,
    delayBetweenShocks: 5 + randomBelow(10),
    cascadeDecay: mode === 'cascade' ? 0.5 + random() * 0.3 : undefined,
  };
}

/**
 * Validate a composite shock configuration
 */
export function validateCompositeShock(config: CompositeShockConfig): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!config.id) {
    errors.push('Composite shock must have an ID');
  }

  if (!config.name) {
    errors.push('Composite shock must have a name');
  }

  if (!['parallel', 'sequence', 'cascade'].includes(config.mode)) {
    errors.push(`Invalid mode: ${config.mode}. Must be parallel, sequence, or cascade`);
  }

  if (!config.shocks || config.shocks.length === 0) {
    errors.push('Composite shock must have at least one shock');
  }

  for (let i = 0; i < config.shocks.length; i++) {
    const shock = config.shocks[i];
    if (shock.intensity < 0 || shock.intensity > 1) {
      errors.push(`Shock ${i}: Invalid intensity ${shock.intensity}. Must be between 0 and 1`);
    }
    if (shock.type === 'communication_blackout' && !shock.duration) {
      errors.push(`Shock ${i}: communication_blackout requires a duration`);
    }
  }

  if (config.mode === 'cascade' && (config.cascadeDecay === undefined || config.cascadeDecay <= 0 || config.cascadeDecay >= 1)) {
    errors.push('Cascade mode requires cascadeDecay between 0 and 1 (exclusive)');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
