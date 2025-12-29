/**
 * Work Action Handler
 *
 * Work at shelters to earn CITY currency.
 * Requires being at a shelter location.
 *
 * Cost: Energy
 * Reward: CITY salary (flat rate)
 */

import { v4 as uuid } from 'uuid';
import type { ActionIntent, ActionResult, WorkParams } from '../types';
import type { Agent } from '../../db/schema';
import { getSheltersAtPosition } from '../../db/queries/world';

// Work configuration
const CONFIG = {
  basePayPerTick: 10, // CITY per tick of work
  energyCostPerTick: 2,
  minDuration: 1,
  maxDuration: 5,
} as const;

export async function handleWork(
  intent: ActionIntent<WorkParams>,
  agent: Agent
): Promise<ActionResult> {
  const { duration = 1 } = intent.params;

  // Validate duration
  if (duration < CONFIG.minDuration || duration > CONFIG.maxDuration) {
    return {
      success: false,
      error: `Invalid work duration: must be between ${CONFIG.minDuration} and ${CONFIG.maxDuration} ticks`,
    };
  }

  // Check if agent is sleeping (can't work while asleep)
  // Note: We no longer use 'working' state since work is an instant action
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

  // Check if agent is at a shelter (required for work)
  const sheltersHere = await getSheltersAtPosition(agent.x, agent.y);
  if (sheltersHere.length === 0) {
    return {
      success: false,
      error: `Must be at a shelter to work. Current position: (${agent.x}, ${agent.y})`,
    };
  }

  const salary = CONFIG.basePayPerTick * duration;

  // Success - return changes and events
  // Note: Work is an instant action - no state change needed
  // Previously set state to 'working' which caused agents to get stuck
  const newBalance = agent.balance + salary;
  const newEnergy = agent.energy - energyCost;

  return {
    success: true,
    changes: {
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
          position: { x: agent.x, y: agent.y },
          duration,
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
