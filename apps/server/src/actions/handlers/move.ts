/**
 * Move Action Handler
 *
 * Moves agent to adjacent position.
 * Cost: 1 energy per tile
 */

import { v4 as uuid } from 'uuid';
import type { ActionIntent, ActionResult, MoveParams } from '../types';
import type { Agent } from '../../db/schema';
import { isValidPosition, isValidMove, getMovementCost } from '../../world/grid';

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

  // Check if move is valid (adjacent only)
  const from = { x: agent.x, y: agent.y };
  const to = { x: toX, y: toY };

  if (!isValidMove(from, to)) {
    return {
      success: false,
      error: `Invalid move: can only move to adjacent positions`,
    };
  }

  // Calculate energy cost
  const energyCost = getMovementCost(from, to);

  // Check if agent has enough energy
  if (agent.energy < energyCost) {
    return {
      success: false,
      error: `Not enough energy: need ${energyCost}, have ${agent.energy}`,
    };
  }

  // Success - return changes and events
  return {
    success: true,
    changes: {
      x: toX,
      y: toY,
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
          to,
          energyCost,
        },
      },
    ],
  };
}
