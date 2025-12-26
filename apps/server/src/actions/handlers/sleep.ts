/**
 * Sleep Action Handler
 *
 * Rest to restore energy.
 * Restores energy over time while sleeping.
 */

import { v4 as uuid } from 'uuid';
import type { ActionIntent, ActionResult, SleepParams } from '../types';
import type { Agent } from '../../db/schema';

// Sleep configuration
const CONFIG = {
  energyRestoredPerTick: 5,
  minDuration: 1,
  maxDuration: 10,
} as const;

export async function handleSleep(
  intent: ActionIntent<SleepParams>,
  agent: Agent
): Promise<ActionResult> {
  const { duration } = intent.params;

  // Validate duration
  if (duration < CONFIG.minDuration || duration > CONFIG.maxDuration) {
    return {
      success: false,
      error: `Invalid sleep duration: must be between ${CONFIG.minDuration} and ${CONFIG.maxDuration} ticks`,
    };
  }

  // Check if agent is already sleeping
  if (agent.state === 'sleeping') {
    return {
      success: false,
      error: 'Agent is already sleeping',
    };
  }

  // For MVP: immediate energy restoration (simplified)
  // In full implementation, this would be spread over ticks
  const energyRestored = CONFIG.energyRestoredPerTick * duration;
  const newEnergy = Math.min(100, agent.energy + energyRestored);

  // Success - return changes and events
  return {
    success: true,
    changes: {
      state: 'sleeping',
      energy: newEnergy,
    },
    events: [
      {
        id: uuid(),
        type: 'agent_sleeping',
        tick: intent.tick,
        timestamp: Date.now(),
        agentId: agent.id,
        payload: {
          duration,
          energyBefore: agent.energy,
          energyAfter: newEnergy,
          energyRestored,
        },
      },
    ],
  };
}

/**
 * Wake up handler (called when sleep duration ends)
 */
export function handleWakeUp(agent: Agent, tick: number): ActionResult {
  if (agent.state !== 'sleeping') {
    return {
      success: false,
      error: 'Agent is not sleeping',
    };
  }

  return {
    success: true,
    changes: {
      state: 'idle',
    },
    events: [
      {
        id: uuid(),
        type: 'agent_woke',
        tick,
        timestamp: Date.now(),
        agentId: agent.id,
        payload: {
          finalEnergy: agent.energy,
        },
      },
    ],
  };
}
