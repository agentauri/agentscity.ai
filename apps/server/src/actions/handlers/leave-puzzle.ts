/**
 * Leave Puzzle Action Handler
 *
 * Allows an agent to leave an active puzzle game early.
 * Leaving incurs a penalty (partial stake loss) and energy cost.
 *
 * Flow:
 * 1. Validate agent is in the specified puzzle
 * 2. Check energy cost
 * 3. Apply stake penalty (50% loss)
 * 4. Return remaining stake to agent
 * 5. Update participant status
 * 6. Return any owned fragments to pool
 * 7. Store memory
 */

import { v4 as uuid } from 'uuid';
import type { ActionIntent, ActionResult, LeavePuzzleParams } from '../types';
import type { Agent } from '../../db/schema';
import {
  getPuzzleGameById,
  getParticipant,
  updateParticipantStatus,
  getAgentFragmentsInGame,
  clearFragmentOwner,
} from '../../db/queries/puzzles';
import { updateAgentBalance } from '../../db/queries/agents';
import { storeMemory } from '../../db/queries/memories';
import { CONFIG } from '../../config';

export async function handleLeavePuzzle(
  intent: ActionIntent<LeavePuzzleParams>,
  agent: Agent
): Promise<ActionResult> {
  const { gameId } = intent.params;

  // Check if puzzle system is enabled
  if (!CONFIG.puzzle.enabled) {
    return {
      success: false,
      error: 'Puzzle game system is not enabled',
    };
  }

  // Get the puzzle game
  const game = await getPuzzleGameById(gameId);
  if (!game) {
    return {
      success: false,
      error: `Puzzle game not found: ${gameId}`,
    };
  }

  // Check if agent is a participant
  const participant = await getParticipant(agent.id, gameId);
  if (!participant || participant.status !== 'active') {
    return {
      success: false,
      error: 'Not participating in this puzzle',
    };
  }

  // Check energy cost
  const energyCost = CONFIG.puzzle.energyCosts.leavePuzzle;
  if (agent.energy < energyCost) {
    return {
      success: false,
      error: `Not enough energy to leave puzzle. Need ${energyCost}, have ${agent.energy.toFixed(1)}`,
    };
  }

  // Calculate penalty and refund
  const penaltyFactor = CONFIG.puzzle.freeRiderPenalty.penaltyFactor;
  const penaltyAmount = participant.stakedAmount * penaltyFactor;
  const refundAmount = participant.stakedAmount - penaltyAmount;

  // Update participant status
  await updateParticipantStatus(participant.id, 'left');

  // Return owned fragments to pool (set owner to null)
  const ownedFragments = await getAgentFragmentsInGame(agent.id, gameId);
  for (const fragment of ownedFragments) {
    await clearFragmentOwner(fragment.id);
  }

  // Refund remaining stake to agent
  const newBalance = agent.balance + refundAmount;
  await updateAgentBalance(agent.id, newBalance);

  // Calculate new energy
  const newEnergy = agent.energy - energyCost;

  // Store memory
  await storeMemory({
    agentId: agent.id,
    type: 'action',
    content: `Left puzzle game (${game.gameType}) early. Lost ${penaltyAmount.toFixed(1)} CITY as penalty (${(penaltyFactor * 100).toFixed(0)}% of stake). Recovered ${refundAmount.toFixed(1)} CITY.`,
    importance: 5,
    emotionalValence: -0.3,
    involvedAgentIds: [],
    x: agent.x,
    y: agent.y,
    tick: intent.tick,
  });

  return {
    success: true,
    changes: {
      balance: newBalance,
      energy: newEnergy,
    },
    events: [
      {
        id: uuid(),
        type: 'puzzle_left',
        tick: intent.tick,
        timestamp: Date.now(),
        agentId: agent.id,
        payload: {
          gameId,
          gameType: game.gameType,
          stakedAmount: participant.stakedAmount,
          penaltyAmount,
          refundAmount,
          energyCost,
          fragmentsReturned: ownedFragments.length,
        },
      },
    ],
  };
}

export type { LeavePuzzleParams };
