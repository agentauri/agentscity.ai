/**
 * Signal Action Handler (Long-Range Communication)
 *
 * Allows agents to broadcast a vague message over a large area.
 * Direction is calculated by the observer relative to the receiver.
 *
 * Costs are configurable via CONFIG.actions.signal:
 * - energyCost: base cost (default: 5)
 * - rangeMultiplier: range = intensity * multiplier (default: 10 tiles per intensity level)
 * - maxIntensity: max intensity level (default: 5)
 */

import { v4 as uuid } from 'uuid';
import type { ActionIntent, ActionResult, SignalParams } from '../types';
import type { Agent } from '../../db/schema';
import { getRuntimeConfig } from '../../config';

export async function handleSignal(
  intent: ActionIntent<SignalParams>,
  agent: Agent
): Promise<ActionResult> {
  const { message, intensity } = intent.params;
  const config = getRuntimeConfig().actions.signal;

  // Validate intensity
  if (intensity < 1 || intensity > config.maxIntensity) {
    return {
      success: false,
      error: `Invalid intensity: must be between 1 and ${config.maxIntensity}`,
    };
  }

  // Validate message length
  if (!message || message.length > 50) {
    return {
      success: false,
      error: 'Message too long (max 50 chars)',
    };
  }

  // Calculate energy cost
  // Cost scales with intensity squared? Or linear? Let's use linear * base for now.
  // Actually, covering area grows with square of radius, so maybe cost should reflect that?
  // Let's keep it simple: base * intensity.
  const energyCost = config.energyCost * intensity;

  // Check energy
  if (agent.energy < energyCost) {
    return {
      success: false,
      error: `Not enough energy for signal intensity ${intensity}: need ${energyCost}, have ${agent.energy}`,
    };
  }

  // Calculate effective range
  const range = intensity * config.rangeMultiplier;

  // Success
  return {
    success: true,
    changes: {
      energy: agent.energy - energyCost,
    },
    events: [
      {
        id: uuid(),
        type: 'agent_signaled',
        tick: intent.tick,
        timestamp: Date.now(),
        agentId: agent.id,
        payload: {
          message,
          intensity,
          range,
          x: agent.x,
          y: agent.y,
        },
      },
    ],
  };
}
