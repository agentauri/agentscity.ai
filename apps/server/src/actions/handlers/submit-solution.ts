/**
 * Submit Solution Action Handler
 *
 * Allows an agent to submit a solution for a puzzle game.
 * If correct, triggers prize distribution.
 *
 * Flow:
 * 1. Validate agent is in the puzzle
 * 2. Check energy cost
 * 3. Record the attempt
 * 4. Verify solution against hash/expected answer
 * 5. If correct:
 *    - Mark game as completed
 *    - Calculate contribution scores
 *    - Distribute prizes
 *    - Update trust/reputation
 * 6. Store memories
 */

import { v4 as uuid } from 'uuid';
import { createHash } from 'crypto';
import type { ActionIntent, ActionResult, SubmitSolutionParams } from '../types';
import type { Agent } from '../../db/schema';
import {
  getPuzzleGameById,
  getParticipant,
  getActiveParticipantsForGame,
  getAgentTeamInGame,
  getTeamMembers,
  recordPuzzleAttempt,
  incrementAttemptsMade,
  setPuzzleGameWinner,
  updateTeamStatus,
  addContributionScore,
  calculateContributionScores,
} from '../../db/queries/puzzles';
import { updateAgentBalance, getAgentById } from '../../db/queries/agents';
import { storeMemory, updateRelationshipTrust } from '../../db/queries/memories';
import { transfer } from '../../ledger';
import { CONFIG } from '../../config';

/**
 * Verify solution against expected answer
 */
function verifySolution(submitted: string, expected: string, expectedHash?: string | null): boolean {
  // Normalize both strings (trim, lowercase)
  const normalizedSubmitted = submitted.trim().toLowerCase();
  const normalizedExpected = expected.trim().toLowerCase();

  // Direct comparison
  if (normalizedSubmitted === normalizedExpected) {
    return true;
  }

  // Hash comparison if hash provided
  if (expectedHash) {
    const submittedHash = createHash('sha256').update(normalizedSubmitted).digest('hex');
    return submittedHash === expectedHash;
  }

  return false;
}

export async function handleSubmitSolution(
  intent: ActionIntent<SubmitSolutionParams>,
  agent: Agent
): Promise<ActionResult> {
  const { gameId, solution } = intent.params;

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
      error: `Puzzle game is not active (status: ${game.status})`,
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

  // Check energy cost
  const energyCost = CONFIG.puzzle.energyCosts.submitAttempt;
  if (agent.energy < energyCost) {
    return {
      success: false,
      error: `Not enough energy. Need ${energyCost}, have ${agent.energy.toFixed(1)}`,
    };
  }

  // Get agent's team (if any)
  const team = await getAgentTeamInGame(agent.id, gameId);

  // If team has 3+ members, check consensus (simplified - just check if leader)
  if (team) {
    const members = await getTeamMembers(team.id);
    if (members.length >= CONFIG.puzzle.consensusMinTeamSize) {
      if (team.leaderId !== agent.id) {
        return {
          success: false,
          error: 'Only team leader can submit solution for teams with 3+ members',
        };
      }
    }
  }

  // Increment attempt counter
  await incrementAttemptsMade(participant.id);

  // Verify solution
  const isCorrect = verifySolution(solution, game.solution, game.solutionHash);

  // Record the attempt
  const attempt = await recordPuzzleAttempt({
    gameId,
    submitterId: agent.id,
    teamId: team?.id,
    attemptedSolution: solution,
    isCorrect,
    submittedAtTick: intent.tick,
  });

  // Calculate new energy
  const newEnergy = agent.energy - energyCost;

  if (!isCorrect) {
    // Wrong answer - just record and return
    await storeMemory({
      agentId: agent.id,
      type: 'action',
      content: `Submitted incorrect solution for ${game.gameType} puzzle. Keep trying!`,
      importance: 4,
      emotionalValence: -0.2,
      involvedAgentIds: [],
      x: agent.x,
      y: agent.y,
      tick: intent.tick,
    });

    return {
      success: true, // Action succeeded, just wrong answer
      changes: { energy: newEnergy },
      events: [
        {
          id: uuid(),
          type: 'solution_submitted',
          tick: intent.tick,
          timestamp: Date.now(),
          agentId: agent.id,
          payload: {
            gameId,
            gameType: game.gameType,
            attemptId: attempt.id,
            isCorrect: false,
            teamId: team?.id,
          },
        },
      ],
    };
  }

  // CORRECT SOLUTION! Handle winning and prize distribution

  // Mark game as completed
  const winnerId = team?.id || agent.id;
  await setPuzzleGameWinner(gameId, winnerId);

  if (team) {
    await updateTeamStatus(team.id, 'won');
  }

  // Calculate contribution scores for all participants
  await calculateContributionScores(gameId);

  // Add submission bonus to submitter's contribution
  await addContributionScore(participant.id, CONFIG.puzzle.scoring.submissionContrib);

  // Get all participants for prize distribution
  const allParticipants = await getActiveParticipantsForGame(gameId);

  // Calculate total contribution
  let totalContribution = 0;
  for (const p of allParticipants) {
    totalContribution += p.contributionScore;
  }
  // Ensure minimum total to avoid division by zero
  if (totalContribution === 0) totalContribution = 1;

  // Distribute prizes
  const prizePool = game.prizePool;
  const winnerShare = prizePool * CONFIG.puzzle.prizeDistribution.winnerShare;
  const contributorShare = prizePool * CONFIG.puzzle.prizeDistribution.contributorShare;

  const prizeRecords: Array<{ agentId: string; amount: number; type: string }> = [];

  if (team) {
    // Team won - distribute among team members
    const teamMembers = await getTeamMembers(team.id);

    // Leader gets leader bonus
    const leaderBonus = CONFIG.puzzle.leaderBonusMultiplier;
    let teamTotalContrib = 0;
    for (const member of teamMembers) {
      const memberParticipant = allParticipants.find((p) => p.agentId === member.agentId);
      if (memberParticipant) {
        teamTotalContrib += memberParticipant.contributionScore;
      }
    }
    if (teamTotalContrib === 0) teamTotalContrib = 1;

    // Distribute winner share among team
    for (const member of teamMembers) {
      const memberParticipant = allParticipants.find((p) => p.agentId === member.agentId);
      if (!memberParticipant) continue;

      const contribRatio = memberParticipant.contributionScore / teamTotalContrib;
      let memberPrize = winnerShare * contribRatio;

      // Apply leader bonus
      if (member.agentId === team.leaderId) {
        memberPrize *= leaderBonus;
      }

      // Apply free-rider penalty
      if (contribRatio < CONFIG.puzzle.freeRiderPenalty.minContributionThreshold) {
        memberPrize *= (1 - CONFIG.puzzle.freeRiderPenalty.penaltyFactor);
        // Update trust negatively for free-riding
        await updateRelationshipTrust(team.leaderId, member.agentId, CONFIG.puzzle.freeRiderPenalty.reputationImpact, intent.tick);
      }

      prizeRecords.push({ agentId: member.agentId, amount: memberPrize, type: 'team_winner' });

      // Transfer prize
      await transfer(null, member.agentId, memberPrize, 'salary', `Puzzle prize (team winner - ${game.gameType})`, intent.tick);
    }
  } else {
    // Solo winner
    prizeRecords.push({ agentId: agent.id, amount: winnerShare, type: 'solo_winner' });
    await transfer(null, agent.id, winnerShare, 'salary', `Puzzle prize (solo winner - ${game.gameType})`, intent.tick);
  }

  // Distribute contributor share to all participants based on contribution
  for (const p of allParticipants) {
    // Skip if part of winning team (already got winner share)
    if (team && team.id === p.teamId) continue;

    const contribRatio = p.contributionScore / totalContribution;
    if (contribRatio < CONFIG.puzzle.freeRiderPenalty.minContributionThreshold) {
      // Free-rider gets nothing from contributor pool
      continue;
    }

    const contribPrize = contributorShare * contribRatio;
    if (contribPrize > 0.01) { // Minimum threshold
      prizeRecords.push({ agentId: p.agentId, amount: contribPrize, type: 'contributor' });
      await transfer(null, p.agentId, contribPrize, 'salary', `Puzzle prize (contributor - ${game.gameType})`, intent.tick);
    }
  }

  // Store memories for winner
  const totalWinnerPrize = prizeRecords
    .filter((r) => r.agentId === agent.id)
    .reduce((sum, r) => sum + r.amount, 0);

  await storeMemory({
    agentId: agent.id,
    type: 'action',
    content: `WON the ${game.gameType} puzzle! Submitted correct solution. Earned ${totalWinnerPrize.toFixed(1)} CITY from prize pool of ${prizePool.toFixed(1)} CITY.${team ? ` Team "${team.name}" shared the victory.` : ''}`,
    importance: 9,
    emotionalValence: 0.9,
    involvedAgentIds: team ? (await getTeamMembers(team.id)).map((m) => m.agentId) : [],
    x: agent.x,
    y: agent.y,
    tick: intent.tick,
  });

  // Notify other participants
  for (const p of allParticipants) {
    if (p.agentId === agent.id) continue;

    const participantPrize = prizeRecords
      .filter((r) => r.agentId === p.agentId)
      .reduce((sum, r) => sum + r.amount, 0);

    const participantAgent = await getAgentById(p.agentId);
    if (participantAgent && participantAgent.state !== 'dead') {
      await storeMemory({
        agentId: p.agentId,
        type: 'observation',
        content: `${game.gameType} puzzle was solved by ${agent.id.slice(0, 8)}${team ? ` (team "${team.name}")` : ''}. ${participantPrize > 0 ? `Received ${participantPrize.toFixed(1)} CITY as contributor.` : 'Did not receive prize (low contribution).'}`,
        importance: 6,
        emotionalValence: participantPrize > 0 ? 0.3 : -0.2,
        involvedAgentIds: [agent.id],
        x: participantAgent.x,
        y: participantAgent.y,
        tick: intent.tick,
      });
    }
  }

  return {
    success: true,
    changes: { energy: newEnergy },
    events: [
      {
        id: uuid(),
        type: 'puzzle_solved',
        tick: intent.tick,
        timestamp: Date.now(),
        agentId: agent.id,
        payload: {
          gameId,
          gameType: game.gameType,
          attemptId: attempt.id,
          winnerId,
          winnerType: team ? 'team' : 'solo',
          teamId: team?.id,
          teamName: team?.name,
          prizePool,
          prizeDistribution: prizeRecords,
          participantCount: allParticipants.length,
        },
      },
    ],
  };
}

export type { SubmitSolutionParams };
