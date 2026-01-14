/**
 * Join Team Action Handler
 *
 * Allows an agent to join an existing team in a puzzle game.
 *
 * Flow:
 * 1. Validate team exists and is in forming/active status
 * 2. Validate agent is in the same puzzle game
 * 3. Check agent is not already in a team
 * 4. Check team is not full
 * 5. Join participant to team
 * 6. Update team's total stake
 * 7. Store memories for joiner and leader
 * 8. Update trust with team members
 */

import { v4 as uuid } from 'uuid';
import type { ActionIntent, ActionResult, JoinTeamParams } from '../types';
import type { Agent } from '../../db/schema';
import {
  getPuzzleTeamById,
  getParticipant,
  getAgentTeamInGame,
  getTeamMembers,
  joinParticipantToTeam,
  updateTeamTotalStake,
  getPuzzleGameById,
} from '../../db/queries/puzzles';
import { getAgentById } from '../../db/queries/agents';
import { storeMemory, updateRelationshipTrust } from '../../db/queries/memories';
import { CONFIG } from '../../config';

export async function handleJoinTeam(
  intent: ActionIntent<JoinTeamParams>,
  agent: Agent
): Promise<ActionResult> {
  const { teamId } = intent.params;

  // Check if puzzle system is enabled
  if (!CONFIG.puzzle.enabled) {
    return {
      success: false,
      error: 'Puzzle game system is not enabled',
    };
  }

  // Get the team
  const team = await getPuzzleTeamById(teamId);
  if (!team) {
    return {
      success: false,
      error: `Team not found: ${teamId}`,
    };
  }

  // Check team status
  if (team.status !== 'forming' && team.status !== 'active') {
    return {
      success: false,
      error: `Team is not accepting members (status: ${team.status})`,
    };
  }

  // Get the game
  const game = await getPuzzleGameById(team.gameId);
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

  // Check agent is a participant in the same game
  const participant = await getParticipant(agent.id, team.gameId);
  if (!participant || participant.status !== 'active') {
    return {
      success: false,
      error: 'Not an active participant in this puzzle game',
    };
  }

  // Check agent is not already in a team
  const existingTeam = await getAgentTeamInGame(agent.id, team.gameId);
  if (existingTeam) {
    return {
      success: false,
      error: 'Already in a team. Leave current team first.',
    };
  }

  // Check team is not full
  const members = await getTeamMembers(teamId);
  if (members.length >= CONFIG.puzzle.maxTeamSize) {
    return {
      success: false,
      error: `Team is full (max ${CONFIG.puzzle.maxTeamSize} members)`,
    };
  }

  // Join participant to team
  await joinParticipantToTeam(participant.id, teamId);

  // Update team's total stake
  const newTotalStake = team.totalStake + participant.stakedAmount;
  await updateTeamTotalStake(teamId, newTotalStake);

  // Get team leader for memories
  const leader = await getAgentById(team.leaderId);

  // Update trust with all team members
  for (const member of members) {
    await updateRelationshipTrust(agent.id, member.agentId, 5, intent.tick);
    await updateRelationshipTrust(member.agentId, agent.id, 5, intent.tick);
  }

  // Store memories
  await storeMemory({
    agentId: agent.id,
    type: 'action',
    content: `Joined team "${team.name}" led by ${team.leaderId.slice(0, 8)} in ${game.gameType} puzzle. Team now has ${members.length + 1} members.`,
    importance: 6,
    emotionalValence: 0.4,
    involvedAgentIds: [team.leaderId, ...members.map((m) => m.agentId)],
    x: agent.x,
    y: agent.y,
    tick: intent.tick,
  });

  // Notify leader
  if (leader && leader.state !== 'dead') {
    await storeMemory({
      agentId: leader.id,
      type: 'interaction',
      content: `${agent.id.slice(0, 8)} joined my team "${team.name}". Team now has ${members.length + 1} members. Combined stake: ${newTotalStake.toFixed(1)} CITY.`,
      importance: 5,
      emotionalValence: 0.4,
      involvedAgentIds: [agent.id],
      x: leader.x,
      y: leader.y,
      tick: intent.tick,
    });
  }

  return {
    success: true,
    events: [
      {
        id: uuid(),
        type: 'team_joined',
        tick: intent.tick,
        timestamp: Date.now(),
        agentId: agent.id,
        payload: {
          gameId: team.gameId,
          gameType: game.gameType,
          teamId,
          teamName: team.name,
          leaderId: team.leaderId,
          newMemberId: agent.id,
          memberCount: members.length + 1,
          totalStake: newTotalStake,
        },
      },
    ],
  };
}

export type { JoinTeamParams };
