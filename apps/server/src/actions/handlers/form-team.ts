/**
 * Form Team Action Handler
 *
 * Allows an agent to create a new team in a puzzle game.
 * The creating agent becomes the team leader.
 *
 * Flow:
 * 1. Validate agent is in the puzzle
 * 2. Check agent is not already in a team
 * 3. Check energy cost
 * 4. Create team with agent as leader
 * 5. Update participant's team reference
 * 6. Store memory
 */

import { v4 as uuid } from 'uuid';
import type { ActionIntent, ActionResult, FormTeamParams } from '../types';
import type { Agent } from '../../db/schema';
import {
  getPuzzleGameById,
  getParticipant,
  getAgentTeamInGame,
  createPuzzleTeam,
  joinParticipantToTeam,
  updateTeamTotalStake,
} from '../../db/queries/puzzles';
import { storeMemory } from '../../db/queries/memories';
import { CONFIG } from '../../config';

export async function handleFormTeam(
  intent: ActionIntent<FormTeamParams>,
  agent: Agent
): Promise<ActionResult> {
  const { gameId, teamName } = intent.params;

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

  // Check game is active
  if (game.status !== 'open' && game.status !== 'active') {
    return {
      success: false,
      error: 'Puzzle game is no longer active',
    };
  }

  // Check agent is a participant
  const participant = await getParticipant(agent.id, gameId);
  if (!participant || participant.status !== 'active') {
    return {
      success: false,
      error: 'Not an active participant in this puzzle',
    };
  }

  // Check agent is not already in a team
  const existingTeam = await getAgentTeamInGame(agent.id, gameId);
  if (existingTeam) {
    return {
      success: false,
      error: 'Already in a team. Leave current team first.',
    };
  }

  // Check energy cost
  const energyCost = CONFIG.puzzle.energyCosts.formTeam;
  if (agent.energy < energyCost) {
    return {
      success: false,
      error: `Not enough energy. Need ${energyCost}, have ${agent.energy.toFixed(1)}`,
    };
  }

  // Create the team
  const effectiveTeamName = teamName || `Team-${agent.id.slice(0, 8)}`;
  const team = await createPuzzleTeam({
    gameId,
    leaderId: agent.id,
    name: effectiveTeamName,
    totalStake: participant.stakedAmount,
    status: 'forming',
    createdAtTick: intent.tick,
  });

  // Update participant to reference the team
  await joinParticipantToTeam(participant.id, team.id);

  // Calculate new energy
  const newEnergy = agent.energy - energyCost;

  // Store memory
  await storeMemory({
    agentId: agent.id,
    type: 'action',
    content: `Created team "${effectiveTeamName}" in ${game.gameType} puzzle. Now leading the team. Looking for members to share fragments and solve together.`,
    importance: 6,
    emotionalValence: 0.5,
    involvedAgentIds: [],
    x: agent.x,
    y: agent.y,
    tick: intent.tick,
  });

  return {
    success: true,
    changes: { energy: newEnergy },
    events: [
      {
        id: uuid(),
        type: 'team_formed',
        tick: intent.tick,
        timestamp: Date.now(),
        agentId: agent.id,
        payload: {
          gameId,
          gameType: game.gameType,
          teamId: team.id,
          teamName: effectiveTeamName,
          leaderId: agent.id,
          initialStake: participant.stakedAmount,
        },
      },
    ],
  };
}

export type { FormTeamParams };
