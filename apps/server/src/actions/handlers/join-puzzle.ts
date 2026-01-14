/**
 * Join Puzzle Action Handler
 *
 * Allows an agent to join an open puzzle game by staking CITY currency.
 *
 * Flow:
 * 1. Validate puzzle game exists and is open
 * 2. Check agent is not already in a puzzle (Focus Lock)
 * 3. Validate agent has sufficient balance for stake
 * 4. Deduct stake from agent balance
 * 5. Add to prize pool
 * 6. Create participant record
 * 7. Assign initial fragment to agent
 * 8. Store memory
 */

import { v4 as uuid } from 'uuid';
import type { ActionIntent, ActionResult, JoinPuzzleParams } from '../types';
import type { Agent } from '../../db/schema';
import {
  getPuzzleGameById,
  getParticipant,
  getActiveParticipantsForGame,
  addPuzzleParticipant,
  addToPrizePool,
  getFragmentsForGame,
  assignFragmentToAgent,
  isAgentInActivePuzzle,
} from '../../db/queries/puzzles';
import { updateAgentBalance } from '../../db/queries/agents';
import { storeMemory } from '../../db/queries/memories';
import { CONFIG } from '../../config';

export async function handleJoinPuzzle(
  intent: ActionIntent<JoinPuzzleParams>,
  agent: Agent
): Promise<ActionResult> {
  const { gameId, stakeAmount } = intent.params;

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

  // Check if game is open for registration
  if (game.status !== 'open') {
    return {
      success: false,
      error: `Puzzle game is not accepting participants (status: ${game.status})`,
    };
  }

  // Check registration window
  if (game.startsAtTick && intent.tick > game.startsAtTick + CONFIG.puzzle.registrationWindow) {
    return {
      success: false,
      error: 'Registration window has closed for this puzzle',
    };
  }

  // Check Focus Lock - agent cannot join if already in an active puzzle
  const alreadyInPuzzle = await isAgentInActivePuzzle(agent.id);
  if (alreadyInPuzzle) {
    return {
      success: false,
      error: 'Already participating in an active puzzle. Leave current puzzle first.',
    };
  }

  // Check if already a participant in this specific game
  const existingParticipant = await getParticipant(agent.id, gameId);
  if (existingParticipant && existingParticipant.status === 'active') {
    return {
      success: false,
      error: 'Already participating in this puzzle',
    };
  }

  // Check max participants
  const currentParticipants = await getActiveParticipantsForGame(gameId);
  if (currentParticipants.length >= game.maxParticipants) {
    return {
      success: false,
      error: 'Puzzle game is full',
    };
  }

  // Determine stake amount
  const effectiveStake = stakeAmount ?? game.entryStake;

  // Validate stake amount
  if (effectiveStake < CONFIG.puzzle.minEntryStake) {
    return {
      success: false,
      error: `Stake must be at least ${CONFIG.puzzle.minEntryStake} CITY`,
    };
  }
  if (effectiveStake > CONFIG.puzzle.maxEntryStake) {
    return {
      success: false,
      error: `Stake cannot exceed ${CONFIG.puzzle.maxEntryStake} CITY`,
    };
  }
  if (effectiveStake < game.entryStake) {
    return {
      success: false,
      error: `Minimum stake for this game is ${game.entryStake} CITY`,
    };
  }

  // Check agent has sufficient balance
  if (agent.balance < effectiveStake) {
    return {
      success: false,
      error: `Insufficient balance. Need ${effectiveStake} CITY, have ${agent.balance.toFixed(1)} CITY`,
    };
  }

  // Deduct stake from agent
  const newBalance = agent.balance - effectiveStake;
  await updateAgentBalance(agent.id, newBalance);

  // Add stake to prize pool
  await addToPrizePool(gameId, effectiveStake);

  // Create participant record
  const participant = await addPuzzleParticipant({
    gameId,
    agentId: agent.id,
    stakedAmount: effectiveStake,
    contributionScore: 0,
    fragmentsReceived: 0,
    fragmentsShared: 0,
    attemptsMade: 0,
    joinedAtTick: intent.tick,
    status: 'active',
  });

  // Find an unassigned fragment to give to this participant
  const fragments = await getFragmentsForGame(gameId);
  const unassignedFragment = fragments.find((f) => !f.ownerId);

  let assignedFragmentIndex: number | undefined;
  if (unassignedFragment) {
    await assignFragmentToAgent(unassignedFragment.id, agent.id, true);
    assignedFragmentIndex = unassignedFragment.fragmentIndex;
  }

  // Store memory
  await storeMemory({
    agentId: agent.id,
    type: 'action',
    content: `Joined puzzle game (${game.gameType}) by staking ${effectiveStake} CITY. Prize pool: ${game.prizePool + effectiveStake} CITY. ${assignedFragmentIndex !== undefined ? `Received fragment #${assignedFragmentIndex}.` : 'No fragments available yet.'}`,
    importance: 7,
    emotionalValence: 0.3,
    involvedAgentIds: [],
    x: agent.x,
    y: agent.y,
    tick: intent.tick,
  });

  return {
    success: true,
    changes: { balance: newBalance },
    events: [
      {
        id: uuid(),
        type: 'puzzle_joined',
        tick: intent.tick,
        timestamp: Date.now(),
        agentId: agent.id,
        payload: {
          gameId,
          gameType: game.gameType,
          participantId: participant.id,
          stakedAmount: effectiveStake,
          prizePool: game.prizePool + effectiveStake,
          fragmentIndex: assignedFragmentIndex,
          participantCount: currentParticipants.length + 1,
        },
      },
    ],
  };
}

export type { JoinPuzzleParams };
