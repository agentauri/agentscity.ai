/**
 * Needs Decay System
 *
 * Each tick, agent needs decay:
 * - Hunger: -1 per tick
 * - Energy: -0.5 per tick (more if hungry)
 * - Health: stable (unless critically hungry/exhausted)
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
import type { Agent } from '../db/schema';
import type { WorldEvent } from '../cache/pubsub';

// Configuration
const CONFIG = {
  // Decay rates per tick
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
} as const;

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
  | 'low_hunger_warning'
  | 'critical_hunger_warning'
  | 'low_energy_warning'
  | 'critical_energy_warning'
  | 'forced_rest'
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

  // Apply hunger decay
  newHunger = Math.max(0, newHunger - CONFIG.hungerDecay);
  effects.push('hunger_decreased');

  // Apply base energy decay
  let energyDrain = CONFIG.energyDecay;

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

  // Critical hunger: health damage
  if (newHunger < CONFIG.criticalHungerThreshold) {
    newHealth = Math.max(0, newHealth - CONFIG.criticalHungerHealthDamage);
    effects.push('critical_hunger_warning');
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
      },
    });
  }

  // Apply energy decay
  newEnergy = Math.max(0, newEnergy - energyDrain);
  effects.push('energy_decreased');

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
