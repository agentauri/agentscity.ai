/**
 * Move Action Handler
 *
 * Moves agent to adjacent position.
 * Costs are configurable via CONFIG.actions.move:
 * - energyCost: base energy per tile (default: 2)
 * - hungerCost: hunger per tile (default: 0.5)
 * - consecutivePenalty: extra multiplier if last action was also move (default: 0.5 = +50%)
 */

import { v4 as uuid } from 'uuid';
import type { ActionIntent, ActionResult, MoveParams } from '../types';
import type { Agent } from '../../db/schema';
import { isValidPosition, getPath, getDistance } from '../../world/grid';
import { getVitalsPenalty } from '../utils/vitals-penalty';
import { getRuntimeConfig } from '../../config';
import { leaveScent } from '../../world/scent';

export async function handleMove(
  intent: ActionIntent<MoveParams>,
  agent: Agent
): Promise<ActionResult> {
  const { toX, toY } = intent.params;

  // Validate target position
  if (!isValidPosition(toX, toY)) {
    return {
      success: false,
      error: `Invalid position: (${toX}, ${toY}) is outside world bounds`,
    };
  }

  const from = { x: agent.x, y: agent.y };
  const finalDestination = { x: toX, y: toY };

  // Already at destination?
  if (from.x === toX && from.y === toY) {
    return {
      success: false,
      error: `Already at destination (${toX}, ${toY})`,
    };
  }

  // Calculate path and get FIRST step only
  const path = getPath(from, finalDestination);
  if (path.length === 0) {
    return {
      success: false,
      error: `No path to destination (${toX}, ${toY})`,
    };
  }

  // Take only the first step
  const nextStep = path[0];

  // Get base costs from runtime config (allows live updates via API)
  const config = getRuntimeConfig();
  const { energyCost: baseEnergyCost, hungerCost: baseHungerCost, consecutivePenalty } = config.actions.move;

  // Check for consecutive move penalty: if agent is already walking, they're spamming move
  const isConsecutiveMove = agent.state === 'walking';
  const consecutiveMultiplier = isConsecutiveMove ? (1 + consecutivePenalty) : 1;

  // Apply vitals penalty to energy cost
  const penalty = getVitalsPenalty(agent);
  const energyCost = Math.ceil(baseEnergyCost * penalty.multiplier * consecutiveMultiplier);

  // Check if agent has enough energy (with all penalties applied)
  if (agent.energy < energyCost) {
    const penaltyDetails: string[] = [];
    if (penalty.hasPenalty) {
      penaltyDetails.push(`+${Math.round((penalty.multiplier - 1) * 100)}% low vitals`);
    }
    if (isConsecutiveMove) {
      penaltyDetails.push(`+${Math.round(consecutivePenalty * 100)}% consecutive move`);
    }
    const penaltyInfo = penaltyDetails.length > 0
      ? ` (base: ${baseEnergyCost}, ${penaltyDetails.join(', ')})`
      : '';
    return {
      success: false,
      error: `Not enough energy: need ${energyCost}${penaltyInfo}, have ${agent.energy}`,
    };
  }

  // Calculate remaining distance after this step
  const remainingDistance = getDistance(nextStep, finalDestination);

  // Calculate hunger cost (also affected by consecutive penalty)
  const hungerCost = baseHungerCost * consecutiveMultiplier;

  // Leave scent trace at current position (stigmergy)
  await leaveScent(from.x, from.y, agent.id, intent.tick);

  // Success - move one step towards destination
  return {
    success: true,
    changes: {
      x: nextStep.x,
      y: nextStep.y,
      energy: agent.energy - energyCost,
      hunger: Math.max(0, agent.hunger - hungerCost),
      state: 'walking',
    },
    events: [
      {
        id: uuid(),
        type: 'agent_moved',
        tick: intent.tick,
        timestamp: Date.now(),
        agentId: agent.id,
        payload: {
          from,
          to: nextStep,
          finalDestination,
          remainingDistance,
          energyCost,
          hungerCost,
          // Include penalty info for analytics
          vitalsPenalty: penalty.hasPenalty
            ? {
                multiplier: penalty.multiplier,
                breakdown: penalty.breakdown,
              }
            : undefined,
          // Include consecutive move penalty for analytics
          consecutiveMovePenalty: isConsecutiveMove
            ? {
                multiplier: consecutiveMultiplier,
                penalty: consecutivePenalty,
                reason: 'Repeated movement is inefficient - consider resting or doing something useful',
              }
            : undefined,
        },
      },
    ],
  };
}
