/**
 * Move Action Handler
 *
 * Moves agent to adjacent position.
 * Cost: 1 energy per tile
 */

import { v4 as uuid } from 'uuid';
import type { ActionIntent, ActionResult, MoveParams } from '../types';
import type { Agent } from '../../db/schema';
import { isValidPosition, getPath, getDistance } from '../../world/grid';

// Energy cost per tile moved
const ENERGY_PER_TILE = 1;

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
  const energyCost = ENERGY_PER_TILE;

  // Check if agent has enough energy
  if (agent.energy < energyCost) {
    return {
      success: false,
      error: `Not enough energy: need ${energyCost}, have ${agent.energy}`,
    };
  }

  // Calculate remaining distance after this step
  const remainingDistance = getDistance(nextStep, finalDestination);

  // Success - move one step towards destination
  return {
    success: true,
    changes: {
      x: nextStep.x,
      y: nextStep.y,
      energy: agent.energy - energyCost,
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
        },
      },
    ],
  };
}
