/**
 * Share Fragment Action Handler
 *
 * Allows an agent to share a puzzle fragment with another agent.
 * This is the core cooperation mechanic in Fragment Chase.
 *
 * Flow:
 * 1. Validate agent owns the fragment
 * 2. Validate target agent is in same puzzle
 * 3. Check energy cost
 * 4. Mark fragment as shared with target
 * 5. Update contribution scores
 * 6. Update trust between agents
 * 7. Store memories for both parties
 */

import { v4 as uuid } from 'uuid';
import type { ActionIntent, ActionResult, ShareFragmentParams } from '../types';
import type { Agent } from '../../db/schema';
import {
  getFragmentById,
  getParticipant,
  markFragmentShared,
  incrementFragmentsShared,
  addContributionScore,
  getPuzzleGameById,
} from '../../db/queries/puzzles';
import { getAgentById } from '../../db/queries/agents';
import { storeMemory, updateRelationshipTrust } from '../../db/queries/memories';
import { CONFIG } from '../../config';

export async function handleShareFragment(
  intent: ActionIntent<ShareFragmentParams>,
  agent: Agent
): Promise<ActionResult> {
  const { fragmentId, targetAgentId } = intent.params;

  // Check if puzzle system is enabled
  if (!CONFIG.puzzle.enabled) {
    return {
      success: false,
      error: 'Puzzle game system is not enabled',
    };
  }

  // Get the fragment
  const fragment = await getFragmentById(fragmentId);
  if (!fragment) {
    return {
      success: false,
      error: `Fragment not found: ${fragmentId}`,
    };
  }

  // Check agent owns the fragment
  if (fragment.ownerId !== agent.id) {
    return {
      success: false,
      error: 'You do not own this fragment',
    };
  }

  // Get the game
  const game = await getPuzzleGameById(fragment.gameId);
  if (!game) {
    return {
      success: false,
      error: 'Puzzle game not found',
    };
  }

  // Check game is active
  if (game.status !== 'open' && game.status !== 'active') {
    return {
      success: false,
      error: 'Puzzle game is no longer active',
    };
  }

  // Can't share with self
  if (targetAgentId === agent.id) {
    return {
      success: false,
      error: 'Cannot share fragment with yourself',
    };
  }

  // Check target agent exists and is alive
  const targetAgent = await getAgentById(targetAgentId);
  if (!targetAgent || targetAgent.state === 'dead') {
    return {
      success: false,
      error: 'Target agent not found or is dead',
    };
  }

  // Check both agents are in the same puzzle
  const agentParticipant = await getParticipant(agent.id, fragment.gameId);
  const targetParticipant = await getParticipant(targetAgentId, fragment.gameId);

  if (!agentParticipant || agentParticipant.status !== 'active') {
    return {
      success: false,
      error: 'You are not an active participant in this puzzle',
    };
  }

  if (!targetParticipant || targetParticipant.status !== 'active') {
    return {
      success: false,
      error: 'Target agent is not an active participant in this puzzle',
    };
  }

  // Check if already shared with this agent
  const sharedWith = (fragment.sharedWith as string[]) || [];
  if (sharedWith.includes(targetAgentId)) {
    return {
      success: false,
      error: 'Fragment already shared with this agent',
    };
  }

  // Check energy cost
  const energyCost = CONFIG.puzzle.energyCosts.shareFragment;
  if (agent.energy < energyCost) {
    return {
      success: false,
      error: `Not enough energy. Need ${energyCost}, have ${agent.energy.toFixed(1)}`,
    };
  }

  // Mark fragment as shared
  await markFragmentShared(fragmentId, targetAgentId);

  // Update contribution score for sharer
  await incrementFragmentsShared(agentParticipant.id);
  await addContributionScore(agentParticipant.id, CONFIG.puzzle.scoring.fragmentShared);

  // Update trust between agents (sharing builds trust)
  const trustGain = CONFIG.actions.shareInfo.trustGainPositive * 2; // Double trust gain for puzzle sharing
  await updateRelationshipTrust(agent.id, targetAgentId, trustGain, intent.tick);
  await updateRelationshipTrust(targetAgentId, agent.id, trustGain, intent.tick);

  // Calculate new energy
  const newEnergy = agent.energy - energyCost;

  // Store memories for both parties
  await storeMemory({
    agentId: agent.id,
    type: 'interaction',
    content: `Shared puzzle fragment #${fragment.fragmentIndex} with ${targetAgentId.slice(0, 8)} (${game.gameType} puzzle). Building cooperation for prize.`,
    importance: 6,
    emotionalValence: 0.4,
    involvedAgentIds: [targetAgentId],
    x: agent.x,
    y: agent.y,
    tick: intent.tick,
  });

  await storeMemory({
    agentId: targetAgentId,
    type: 'interaction',
    content: `Received puzzle fragment #${fragment.fragmentIndex} from ${agent.id.slice(0, 8)} (${game.gameType} puzzle). ${fragment.hint || 'No hint available.'}`,
    importance: 6,
    emotionalValence: 0.5,
    involvedAgentIds: [agent.id],
    x: targetAgent.x,
    y: targetAgent.y,
    tick: intent.tick,
  });

  return {
    success: true,
    changes: { energy: newEnergy },
    events: [
      {
        id: uuid(),
        type: 'fragment_shared',
        tick: intent.tick,
        timestamp: Date.now(),
        agentId: agent.id,
        payload: {
          gameId: fragment.gameId,
          gameType: game.gameType,
          fragmentId,
          fragmentIndex: fragment.fragmentIndex,
          fromAgentId: agent.id,
          toAgentId: targetAgentId,
          hint: fragment.hint,
          trustGain,
          contributionScoreGain: CONFIG.puzzle.scoring.fragmentShared,
        },
      },
    ],
  };
}

export type { ShareFragmentParams };
