/**
 * Needs Decay System
 *
 * Each tick, agent needs decay based on their state:
 * - Hunger: base -1 per tick, modified by state (walking=1.5x, sleeping=0.5x)
 * - Energy: base -0.5 per tick, modified by state (walking=1.2x, sleeping=0x)
 * - Health: stable (unless critically hungry/exhausted)
 *
 * State Multipliers:
 * - idle: 1.0x hunger, 1.0x energy
 * - walking: 1.5x hunger, 1.2x energy (exploring is tiring)
 * - working: 1.3x hunger, 1.0x energy
 * - sleeping: 0.5x hunger, 0.0x energy (rest slows metabolism)
 *
 * Thresholds:
 * - Low hunger (<20): extra energy drain
 * - Critical hunger (<10): health damage
 * - Low energy (<20): action penalties
 * - Critical energy (<10): forced rest
 * - Health <= 0: death
 */

import { v4 as uuid } from 'uuid';
import { updateAgent, killAgent } from '../db/queries/agents';
import { getInventoryItem, removeFromInventory } from '../db/queries/inventory';
import type { Agent } from '../db/schema';
import type { WorldEvent } from '../cache/pubsub';
import { getRuntimeConfig } from '../config';

// Track consecutive ticks in critical state (for grace timer)
const criticalTicksMap = new Map<string, { hunger: number; energy: number }>();

/**
 * Reset critical ticks tracker for a specific agent or all agents.
 * Useful for testing.
 */
export function resetCriticalTicks(agentId?: string): void {
  if (agentId) {
    criticalTicksMap.delete(agentId);
  } else {
    criticalTicksMap.clear();
  }
}

/**
 * Set critical ticks for testing grace period behavior.
 * @internal - exported for testing only
 */
export function setCriticalTicks(agentId: string, ticks: { hunger: number; energy: number }): void {
  criticalTicksMap.set(agentId, ticks);
}

// Configuration
const CONFIG = {
  // Decay rates per tick (base values, modified by state)
  hungerDecay: 1,
  energyDecay: 0.5,

  // Thresholds
  lowHungerThreshold: 20,
  criticalHungerThreshold: 10,
  lowEnergyThreshold: 20,
  criticalEnergyThreshold: 10,

  // Damage rates
  hungerEnergyDrain: 1, // Extra energy drain when hungry
  criticalHungerHealthDamage: 2, // Health damage when critically hungry
  criticalEnergyHealthDamage: 1, // Health damage when exhausted

  // Grace Timer: ticks before HP damage starts (gives agents time to react)
  graceTicksBeforeDamage: 3,

  // Health Regen: passive healing when well-fed and rested
  healthRegenThresholdHunger: 70, // Must have hunger above this
  healthRegenThresholdEnergy: 70, // Must have energy above this
  healthRegenRate: 0.2, // HP restored per tick when conditions met

  // Auto-consume: eat food automatically when sleeping and critically hungry
  autoConsumeHungerThreshold: 20, // Auto-eat when hunger drops below this during sleep
  foodHungerRestore: 30, // How much hunger food restores
} as const;

// State-based decay multipliers
// Walking agents get hungrier faster (exploring is tiring)
// Sleeping agents have slower metabolism (rest preserves energy)
const STATE_MULTIPLIERS: Record<string, { hunger: number; energy: number }> = {
  idle: { hunger: 1.0, energy: 1.0 },
  walking: { hunger: 1.5, energy: 1.2 },
  working: { hunger: 1.3, energy: 1.0 },
  sleeping: { hunger: 0.5, energy: 0.0 }, // Sleep stops energy decay, slows hunger
  dead: { hunger: 0, energy: 0 },
};

export interface DecayResult {
  agentId: string;
  previousState: {
    hunger: number;
    energy: number;
    health: number;
  };
  newState: {
    hunger: number;
    energy: number;
    health: number;
  };
  effects: DecayEffect[];
  events: WorldEvent[];
  died: boolean;
  deathCause?: 'starvation' | 'exhaustion';
}

export type DecayEffect =
  | 'hunger_decreased'
  | 'energy_decreased'
  | 'health_damaged'
  | 'health_regenerated'
  | 'low_hunger_warning'
  | 'critical_hunger_warning'
  | 'low_energy_warning'
  | 'critical_energy_warning'
  | 'forced_rest'
  | 'auto_consumed_food'
  | 'grace_period_active'
  | 'death';

export async function applyNeedsDecay(agent: Agent, tick: number): Promise<DecayResult> {
  const previousState = {
    hunger: agent.hunger,
    energy: agent.energy,
    health: agent.health,
  };

  const effects: DecayEffect[] = [];
  const events: WorldEvent[] = [];

  // Start with current values
  let newHunger = agent.hunger;
  let newEnergy = agent.energy;
  let newHealth = agent.health;

  // Get state-based multipliers (default to idle if unknown state)
  const stateMultiplier = STATE_MULTIPLIERS[agent.state] ?? STATE_MULTIPLIERS.idle;

  // Apply hunger decay (modified by state)
  const hungerDecay = CONFIG.hungerDecay * stateMultiplier.hunger;
  newHunger = Math.max(0, newHunger - hungerDecay);
  if (hungerDecay > 0) {
    effects.push('hunger_decreased');
  }

  // Apply base energy decay (modified by state)
  let energyDrain = CONFIG.energyDecay * stateMultiplier.energy;

  // Extra energy drain if hungry
  if (newHunger < CONFIG.lowHungerThreshold) {
    energyDrain += CONFIG.hungerEnergyDrain;
    effects.push('low_hunger_warning');

    events.push({
      id: uuid(),
      type: 'needs_warning',
      tick,
      timestamp: Date.now(),
      agentId: agent.id,
      payload: {
        need: 'hunger',
        level: 'low',
        value: newHunger,
      },
    });
  }

  // Critical hunger: health damage WITH grace timer
  if (newHunger < CONFIG.criticalHungerThreshold) {
    // Get or initialize critical ticks counter
    const criticalTicks = criticalTicksMap.get(agent.id) ?? { hunger: 0, energy: 0 };
    criticalTicks.hunger += 1;
    criticalTicksMap.set(agent.id, criticalTicks);

    effects.push('critical_hunger_warning');

    // Only apply damage AFTER grace period
    if (criticalTicks.hunger > CONFIG.graceTicksBeforeDamage) {
      newHealth = Math.max(0, newHealth - CONFIG.criticalHungerHealthDamage);
      effects.push('health_damaged');

      events.push({
        id: uuid(),
        type: 'needs_warning',
        tick,
        timestamp: Date.now(),
        agentId: agent.id,
        payload: {
          need: 'hunger',
          level: 'critical',
          value: newHunger,
          healthDamage: CONFIG.criticalHungerHealthDamage,
          gracePeriodExpired: true,
        },
      });
    } else {
      // Still in grace period - warn but no damage yet
      effects.push('grace_period_active');

      events.push({
        id: uuid(),
        type: 'needs_warning',
        tick,
        timestamp: Date.now(),
        agentId: agent.id,
        payload: {
          need: 'hunger',
          level: 'critical',
          value: newHunger,
          graceTicksRemaining: CONFIG.graceTicksBeforeDamage - criticalTicks.hunger,
          gracePeriodActive: true,
        },
      });
    }
  } else {
    // Reset hunger grace timer when above critical
    const criticalTicks = criticalTicksMap.get(agent.id);
    if (criticalTicks) {
      criticalTicks.hunger = 0;
      criticalTicksMap.set(agent.id, criticalTicks);
    }
  }

  // P3: Auto-consume food during sleep if critically hungry
  // This prevents agents from dying in their sleep when they have food
  if (agent.state === 'sleeping' && newHunger < CONFIG.autoConsumeHungerThreshold) {
    try {
      const food = await getInventoryItem(agent.id, 'food');
      if (food && food.quantity > 0) {
        await removeFromInventory(agent.id, 'food', 1);
        newHunger = Math.min(100, newHunger + CONFIG.foodHungerRestore);
        effects.push('auto_consumed_food');

        events.push({
          id: uuid(),
          type: 'auto_consumed',
          tick,
          timestamp: Date.now(),
          agentId: agent.id,
          payload: {
            itemType: 'food',
            quantity: 1,
            hungerRestored: CONFIG.foodHungerRestore,
            newHunger,
            reason: 'Automatically consumed food while sleeping to prevent starvation',
          },
        });
      }
    } catch (error) {
      // Silently fail - auto-consume is a safety net, not critical
      console.error('[NeedsDecay] Auto-consume failed:', error);
    }
  }

  // Apply energy decay
  newEnergy = Math.max(0, newEnergy - energyDrain);
  if (energyDrain > 0) {
    effects.push('energy_decreased');
  }

  // Low energy warning
  if (newEnergy < CONFIG.lowEnergyThreshold && newEnergy >= CONFIG.criticalEnergyThreshold) {
    effects.push('low_energy_warning');

    events.push({
      id: uuid(),
      type: 'needs_warning',
      tick,
      timestamp: Date.now(),
      agentId: agent.id,
      payload: {
        need: 'energy',
        level: 'low',
        value: newEnergy,
      },
    });
  }

  // Critical energy: forced rest and health damage
  if (newEnergy < CONFIG.criticalEnergyThreshold) {
    newHealth = Math.max(0, newHealth - CONFIG.criticalEnergyHealthDamage);
    effects.push('critical_energy_warning');
    effects.push('health_damaged');
    effects.push('forced_rest');

    events.push({
      id: uuid(),
      type: 'needs_warning',
      tick,
      timestamp: Date.now(),
      agentId: agent.id,
      payload: {
        need: 'energy',
        level: 'critical',
        value: newEnergy,
        healthDamage: CONFIG.criticalEnergyHealthDamage,
        forcedRest: true,
      },
    });
  }

  // P5: Health Regen - passive healing when well-fed and well-rested
  // This encourages proactive resource management
  if (
    newHunger > CONFIG.healthRegenThresholdHunger &&
    newEnergy > CONFIG.healthRegenThresholdEnergy &&
    newHealth < 100
  ) {
    const healedAmount = Math.min(CONFIG.healthRegenRate, 100 - newHealth);
    newHealth = Math.min(100, newHealth + CONFIG.healthRegenRate);
    effects.push('health_regenerated');

    events.push({
      id: uuid(),
      type: 'health_regenerated',
      tick,
      timestamp: Date.now(),
      agentId: agent.id,
      payload: {
        amount: healedAmount,
        newHealth,
        reason: 'Well-fed and rested - passive health regeneration',
      },
    });
  }

  const newState = {
    hunger: newHunger,
    energy: newEnergy,
    health: newHealth,
  };

  // Check for death
  let died = false;
  let deathCause: 'starvation' | 'exhaustion' | undefined;

  if (newHealth <= 0) {
    died = true;
    effects.push('death');

    // Determine cause of death
    if (newHunger < CONFIG.criticalHungerThreshold) {
      deathCause = 'starvation';
    } else {
      deathCause = 'exhaustion';
    }

    // Clean up memory: remove dead agent from criticalTicksMap to prevent memory leak
    criticalTicksMap.delete(agent.id);

    await killAgent(agent.id);
  } else {
    // Update agent state - only change state if forcing sleep due to critical energy
    // Otherwise preserve current state (set by actions)
    const updates: Parameters<typeof updateAgent>[1] = {
      hunger: newHunger,
      energy: newEnergy,
      health: newHealth,
    };
    if (newEnergy < CONFIG.criticalEnergyThreshold) {
      updates.state = 'sleeping';
    }
    await updateAgent(agent.id, updates);
  }

  // Emit needs_updated event
  events.push({
    id: uuid(),
    type: 'needs_updated',
    tick,
    timestamp: Date.now(),
    agentId: agent.id,
    payload: {
      previousState,
      newState,
      effects,
    },
  });

  return {
    agentId: agent.id,
    previousState,
    newState,
    effects,
    events,
    died,
    deathCause,
  };
}

export function calculateSurvivalTicks(hunger: number, energy: number): number {
  // Rough estimate of how many ticks until death
  const hungerTicks = hunger / CONFIG.hungerDecay;
  const energyTicks = energy / CONFIG.energyDecay;
  return Math.min(hungerTicks, energyTicks);
}

// =============================================================================
// Currency Decay System
// =============================================================================
// Idle wealth loses value over time - this prevents hoarding and encourages
// agents to actively spend/invest their CITY currency.
// Agents with balance > threshold lose a % of their balance every N ticks.

export interface CurrencyDecayResult {
  agentId: string;
  previousBalance: number;
  newBalance: number;
  decayAmount: number;
  applied: boolean;
  reason?: string;
  event?: WorldEvent;
}

/**
 * Apply currency decay to an agent.
 * Called every tick, but only applies decay at configured intervals.
 *
 * @param agent - The agent to apply decay to
 * @param tick - Current simulation tick
 * @returns Decay result with event if decay was applied
 */
export async function applyCurrencyDecay(
  agent: Agent,
  tick: number
): Promise<CurrencyDecayResult> {
  // Get runtime config for live updates via API
  const config = getRuntimeConfig();
  const { currencyDecayRate, currencyDecayInterval, currencyDecayThreshold } =
    config.economy;

  // Only apply decay at configured intervals
  if (tick % currencyDecayInterval !== 0) {
    return {
      agentId: agent.id,
      previousBalance: agent.balance,
      newBalance: agent.balance,
      decayAmount: 0,
      applied: false,
      reason: 'Not a decay interval tick',
    };
  }

  // Dead agents don't lose currency
  if (agent.state === 'dead') {
    return {
      agentId: agent.id,
      previousBalance: agent.balance,
      newBalance: agent.balance,
      decayAmount: 0,
      applied: false,
      reason: 'Agent is dead',
    };
  }

  // Agents below threshold are exempt (don't punish the poor)
  if (agent.balance <= currencyDecayThreshold) {
    return {
      agentId: agent.id,
      previousBalance: agent.balance,
      newBalance: agent.balance,
      decayAmount: 0,
      applied: false,
      reason: `Balance ${agent.balance} below threshold ${currencyDecayThreshold}`,
    };
  }

  // Calculate decay amount
  const decayAmount = Math.floor(agent.balance * currencyDecayRate);

  // Minimum decay of 1 CITY if rate would produce 0
  const actualDecay = Math.max(1, decayAmount);

  // Ensure we don't go below threshold
  const newBalance = Math.max(currencyDecayThreshold, agent.balance - actualDecay);
  const appliedDecay = agent.balance - newBalance;

  // Update agent balance in database
  await updateAgent(agent.id, { balance: newBalance });

  // Create event for visibility
  const event: WorldEvent = {
    id: uuid(),
    type: 'currency_decay',
    tick,
    timestamp: Date.now(),
    agentId: agent.id,
    payload: {
      previousBalance: agent.balance,
      newBalance,
      decayAmount: appliedDecay,
      decayRate: currencyDecayRate,
      reason: 'Idle wealth loses value over time. Spend it or lose it.',
    },
  };

  return {
    agentId: agent.id,
    previousBalance: agent.balance,
    newBalance,
    decayAmount: appliedDecay,
    applied: true,
    event,
  };
}
