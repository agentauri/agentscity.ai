/**
 * Work Action Handler
 *
 * Work at a location to earn CITY currency.
 * Cost: Energy
 * Reward: CITY salary
 */

import { v4 as uuid } from 'uuid';
import type { ActionIntent, ActionResult, WorkParams } from '../types';
import type { Agent } from '../../db/schema';

// Work configuration
const CONFIG = {
  basePayPerTick: 10, // CITY per tick of work
  energyCostPerTick: 2,
  minDuration: 1,
  maxDuration: 5,
} as const;

// Location multipliers (type -> pay multiplier)
const LOCATION_MULTIPLIERS: Record<string, number> = {
  commercial: 1.5,
  industrial: 1.2,
  civic: 1.0,
  residential: 0.8,
};

export async function handleWork(
  intent: ActionIntent<WorkParams>,
  agent: Agent
): Promise<ActionResult> {
  const { locationId, duration = 1 } = intent.params;

  // Validate duration
  if (duration < CONFIG.minDuration || duration > CONFIG.maxDuration) {
    return {
      success: false,
      error: `Invalid work duration: must be between ${CONFIG.minDuration} and ${CONFIG.maxDuration} ticks`,
    };
  }

  // Check if agent is already working or sleeping
  if (agent.state === 'working') {
    return {
      success: false,
      error: 'Agent is already working',
    };
  }
  if (agent.state === 'sleeping') {
    return {
      success: false,
      error: 'Agent is sleeping and cannot work',
    };
  }

  // Calculate energy cost
  const energyCost = CONFIG.energyCostPerTick * duration;

  // Check if agent has enough energy
  if (agent.energy < energyCost) {
    return {
      success: false,
      error: `Not enough energy: need ${energyCost}, have ${agent.energy}`,
    };
  }

  // TODO: Get location from database and apply multiplier
  // For MVP, use default multiplier
  const multiplier = 1.0;

  // Calculate salary
  const basePay = CONFIG.basePayPerTick * duration;
  const salary = basePay * multiplier;

  // Success - return changes and events
  const newBalance = agent.balance + salary;
  const newEnergy = agent.energy - energyCost;

  return {
    success: true,
    changes: {
      state: 'working',
      balance: newBalance,
      energy: newEnergy,
    },
    events: [
      {
        id: uuid(),
        type: 'agent_worked',
        tick: intent.tick,
        timestamp: Date.now(),
        agentId: agent.id,
        payload: {
          locationId,
          duration,
          basePay,
          multiplier,
          salary,
          energyCost,
          newBalance,
          newEnergy,
        },
      },
      // Also emit balance_changed event
      {
        id: uuid(),
        type: 'balance_changed',
        tick: intent.tick,
        timestamp: Date.now(),
        agentId: agent.id,
        payload: {
          previousBalance: agent.balance,
          newBalance,
          change: salary,
          reason: `Worked for ${duration} tick(s)`,
        },
      },
    ],
  };
}
