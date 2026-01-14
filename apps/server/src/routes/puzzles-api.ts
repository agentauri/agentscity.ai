/**
 * Puzzle Games API Routes
 *
 * Provides endpoints for viewing puzzle games, their participants,
 * fragments, teams, and results.
 */

import type { FastifyInstance } from 'fastify';
import {
  getActivePuzzleGames,
  getPuzzleGameById,
  getActiveParticipantsForGame,
  getFragmentsForGame,
  getTeamsForGame,
  getTeamMembers,
  getAttemptsForGame,
  getWinningAttempt,
} from '../db/queries/puzzles';
import { getAgentById } from '../db/queries/agents';
import { db } from '../db';
import { puzzleGames } from '../db/schema';
import { eq, or, desc } from 'drizzle-orm';

export async function registerPuzzlesRoutes(server: FastifyInstance): Promise<void> {
  // =============================================================================
  // GET /api/puzzles - List all puzzle games
  // =============================================================================
  server.get<{
    Querystring: { status?: string; limit?: string; offset?: string };
  }>('/api/puzzles', {
    schema: {
      description: 'List all puzzle games with optional status filter',
      tags: ['Puzzles'],
      querystring: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['all', 'active', 'completed', 'expired'],
            description: 'Filter by status (default: all)',
          },
          limit: { type: 'string', description: 'Max results (default: 50)' },
          offset: { type: 'string', description: 'Offset for pagination (default: 0)' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            puzzles: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  gameType: { type: 'string' },
                  status: { type: 'string' },
                  prizePool: { type: 'number' },
                  entryStake: { type: 'number' },
                  startsAtTick: { type: 'number' },
                  endsAtTick: { type: 'number' },
                  participantCount: { type: 'number' },
                  fragmentCount: { type: 'number' },
                  winnerId: { type: 'string', nullable: true },
                },
              },
            },
            total: { type: 'number' },
          },
        },
      },
    },
  }, async (request) => {
    const status = request.query.status || 'all';
    const limit = Math.min(parseInt(request.query.limit || '50', 10), 100);
    const offset = parseInt(request.query.offset || '0', 10);

    let games;
    if (status === 'active') {
      games = await getActivePuzzleGames();
    } else if (status === 'all') {
      games = await db.select().from(puzzleGames).orderBy(desc(puzzleGames.startsAtTick)).limit(limit).offset(offset);
    } else {
      games = await db
        .select()
        .from(puzzleGames)
        .where(eq(puzzleGames.status, status as 'open' | 'active' | 'completed' | 'expired'))
        .orderBy(desc(puzzleGames.startsAtTick))
        .limit(limit)
        .offset(offset);
    }

    // Get participant counts for each game
    const puzzlesWithCounts = await Promise.all(
      games.map(async (game) => {
        const participants = await getActiveParticipantsForGame(game.id);
        return {
          id: game.id,
          gameType: game.gameType,
          status: game.status,
          prizePool: game.prizePool,
          entryStake: game.entryStake,
          startsAtTick: game.startsAtTick,
          endsAtTick: game.endsAtTick,
          participantCount: participants.length,
          fragmentCount: game.fragmentCount,
          winnerId: game.winnerId,
        };
      })
    );

    // Get total count for pagination
    const allGames = await db.select().from(puzzleGames);
    const total = allGames.length;

    return { puzzles: puzzlesWithCounts, total };
  });

  // =============================================================================
  // GET /api/puzzles/:id - Get puzzle details
  // =============================================================================
  server.get<{ Params: { id: string } }>('/api/puzzles/:id', {
    schema: {
      description: 'Get detailed information about a specific puzzle game',
      tags: ['Puzzles'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Puzzle game ID' },
        },
        required: ['id'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            puzzle: { type: 'object' },
            participants: { type: 'array' },
            teams: { type: 'array' },
            fragments: { type: 'array' },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;

    const puzzle = await getPuzzleGameById(id);
    if (!puzzle) {
      return reply.code(404).send({ error: 'Puzzle not found' });
    }

    const [participants, teams, fragments] = await Promise.all([
      getActiveParticipantsForGame(id),
      getTeamsForGame(id),
      getFragmentsForGame(id),
    ]);

    // Enrich participants with agent names
    const enrichedParticipants = await Promise.all(
      participants.map(async (p) => {
        const agent = await getAgentById(p.agentId);
        return {
          ...p,
          agentName: agent?.llmType || 'Unknown',
          agentColor: agent?.color || '#888',
        };
      })
    );

    // Enrich teams with member info
    const enrichedTeams = await Promise.all(
      teams.map(async (team) => {
        const members = await getTeamMembers(team.id);
        const enrichedMembers = await Promise.all(
          members.map(async (m) => {
            const agent = await getAgentById(m.agentId);
            return {
              agentId: m.agentId,
              agentName: agent?.llmType || 'Unknown',
              agentColor: agent?.color || '#888888',
              contributionScore: m.contributionScore,
              fragmentsShared: m.fragmentsShared ?? 0,
            };
          })
        );
        // Get leader info
        const leader = team.leaderId ? await getAgentById(team.leaderId) : null;
        return {
          id: team.id,
          name: team.name || `Team ${team.id.slice(0, 8)}`,
          status: team.status,
          totalStake: team.totalStake ?? 0,
          leader: leader ? { id: leader.id, name: leader.llmType } : null,
          members: enrichedMembers,
          memberCount: enrichedMembers.length,
        };
      })
    );

    // Enrich fragments with owner info
    const enrichedFragments = await Promise.all(
      fragments.map(async (f) => {
        const owner = f.ownerId ? await getAgentById(f.ownerId) : null;
        const originalOwner = f.originalOwnerId ? await getAgentById(f.originalOwnerId) : null;
        return {
          id: f.id,
          fragmentIndex: f.fragmentIndex,
          content: f.content,
          owner: owner ? { id: owner.id, name: owner.llmType, color: owner.color } : null,
          originalOwner: originalOwner ? { id: originalOwner.id, name: originalOwner.llmType } : null,
          sharedWith: f.sharedWith || [],
          sharedCount: ((f.sharedWith as string[]) || []).length,
        };
      })
    );

    return {
      puzzle: {
        id: puzzle.id,
        gameType: puzzle.gameType,
        status: puzzle.status,
        prizePool: puzzle.prizePool,
        entryStake: puzzle.entryStake,
        startsAtTick: puzzle.startsAtTick,
        endsAtTick: puzzle.endsAtTick,
        fragmentCount: puzzle.fragmentCount,
        winnerId: puzzle.winnerId,
        solution: puzzle.status === 'completed' ? puzzle.solution : null, // Only reveal if completed
      },
      participants: enrichedParticipants,
      teams: enrichedTeams,
      fragments: enrichedFragments,
    };
  });

  // =============================================================================
  // GET /api/puzzles/:id/results - Get puzzle results
  // =============================================================================
  server.get<{ Params: { id: string } }>('/api/puzzles/:id/results', {
    schema: {
      description: 'Get results of a completed puzzle game',
      tags: ['Puzzles'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Puzzle game ID' },
        },
        required: ['id'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            puzzle: { type: 'object' },
            winner: { type: 'object', nullable: true },
            attempts: { type: 'array' },
            prizeDistribution: { type: 'array' },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;

    const puzzle = await getPuzzleGameById(id);
    if (!puzzle) {
      return reply.code(404).send({ error: 'Puzzle not found' });
    }

    const [attempts, participants] = await Promise.all([
      getAttemptsForGame(id),
      getActiveParticipantsForGame(id),
    ]);

    // Enrich attempts with agent names
    const enrichedAttempts = await Promise.all(
      attempts.map(async (a) => {
        const agent = await getAgentById(a.submitterId);
        return {
          id: a.id,
          submitterId: a.submitterId,
          submitterName: agent?.llmType || 'Unknown',
          attemptedSolution: a.attemptedSolution,
          isCorrect: a.isCorrect,
          submittedAtTick: a.submittedAtTick,
        };
      })
    );

    // Get winner info if exists
    let winner = null;
    if (puzzle.winnerId) {
      const winnerAgent = await getAgentById(puzzle.winnerId);
      const winningAttempt = await getWinningAttempt(id);
      winner = {
        agentId: puzzle.winnerId,
        agentName: winnerAgent?.llmType || 'Unknown',
        solution: puzzle.solution,
        submittedAtTick: winningAttempt?.submittedAtTick,
      };
    }

    // Calculate prize distribution based on contribution scores
    const totalContribution = participants.reduce((sum, p) => sum + (p.contributionScore || 0), 0);
    const prizeDistribution = await Promise.all(
      participants.map(async (p) => {
        const agent = await getAgentById(p.agentId);
        const share = totalContribution > 0
          ? (p.contributionScore || 0) / totalContribution
          : 1 / participants.length;
        const prize = puzzle.status === 'completed' && puzzle.winnerId
          ? puzzle.prizePool * share
          : 0;

        return {
          agentId: p.agentId,
          agentName: agent?.llmType || 'Unknown',
          contributionScore: p.contributionScore || 0,
          fragmentsShared: p.fragmentsShared,
          attemptsMade: p.attemptsMade,
          prizeAmount: Math.round(prize * 100) / 100,
          isWinner: p.agentId === puzzle.winnerId,
        };
      })
    );

    return {
      puzzle: {
        id: puzzle.id,
        gameType: puzzle.gameType,
        status: puzzle.status,
        prizePool: puzzle.prizePool,
        solution: puzzle.status === 'completed' ? puzzle.solution : null,
      },
      winner,
      attempts: enrichedAttempts,
      prizeDistribution: prizeDistribution.sort((a, b) => b.prizeAmount - a.prizeAmount),
    };
  });

  // =============================================================================
  // GET /api/puzzles/:id/fragments - Get fragments for a puzzle
  // =============================================================================
  server.get<{ Params: { id: string } }>('/api/puzzles/:id/fragments', {
    schema: {
      description: 'Get all fragments for a puzzle game',
      tags: ['Puzzles'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Puzzle game ID' },
        },
        required: ['id'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            fragments: { type: 'array' },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;

    const puzzle = await getPuzzleGameById(id);
    if (!puzzle) {
      return reply.code(404).send({ error: 'Puzzle not found' });
    }

    const fragments = await getFragmentsForGame(id);

    const enrichedFragments = await Promise.all(
      fragments.map(async (f) => {
        const owner = f.ownerId ? await getAgentById(f.ownerId) : null;
        const originalOwner = f.originalOwnerId ? await getAgentById(f.originalOwnerId) : null;

        // Get names of agents it was shared with
        const sharedWithIds = (f.sharedWith as string[]) || [];
        const sharedWithAgents = await Promise.all(
          sharedWithIds.map(async (agentId) => {
            const agent = await getAgentById(agentId);
            return {
              agentId,
              agentName: agent?.llmType || 'Unknown',
            };
          })
        );

        return {
          id: f.id,
          fragmentIndex: f.fragmentIndex,
          content: puzzle.status === 'completed' ? f.content : '[HIDDEN]', // Hide content for active puzzles
          owner: owner ? { id: owner.id, name: owner.llmType, color: owner.color } : null,
          originalOwner: originalOwner ? { id: originalOwner.id, name: originalOwner.llmType } : null,
          sharedWith: sharedWithAgents,
        };
      })
    );

    return { fragments: enrichedFragments };
  });

  // =============================================================================
  // GET /api/puzzles/:id/teams - Get teams for a puzzle
  // =============================================================================
  server.get<{ Params: { id: string } }>('/api/puzzles/:id/teams', {
    schema: {
      description: 'Get all teams for a puzzle game',
      tags: ['Puzzles'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Puzzle game ID' },
        },
        required: ['id'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            teams: { type: 'array' },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;

    const puzzle = await getPuzzleGameById(id);
    if (!puzzle) {
      return reply.code(404).send({ error: 'Puzzle not found' });
    }

    const teams = await getTeamsForGame(id);

    const enrichedTeams = await Promise.all(
      teams.map(async (team) => {
        const members = await getTeamMembers(team.id);
        const leader = team.leaderId ? await getAgentById(team.leaderId) : null;

        const enrichedMembers = await Promise.all(
          members.map(async (m) => {
            const agent = await getAgentById(m.agentId);
            return {
              agentId: m.agentId,
              agentName: agent?.llmType || 'Unknown',
              agentColor: agent?.color || '#888',
              contributionScore: m.contributionScore,
              fragmentsShared: m.fragmentsShared,
            };
          })
        );

        return {
          id: team.id,
          name: team.name,
          status: team.status,
          totalStake: team.totalStake,
          leader: leader ? { id: leader.id, name: leader.llmType } : null,
          members: enrichedMembers,
          memberCount: members.length,
        };
      })
    );

    return { teams: enrichedTeams };
  });

  // =============================================================================
  // GET /api/puzzles/stats - Get overall puzzle statistics
  // =============================================================================
  server.get('/api/puzzles/stats', {
    schema: {
      description: 'Get overall puzzle game statistics',
      tags: ['Puzzles'],
      response: {
        200: {
          type: 'object',
          properties: {
            totalGames: { type: 'number' },
            activeGames: { type: 'number' },
            completedGames: { type: 'number' },
            expiredGames: { type: 'number' },
            totalPrizeDistributed: { type: 'number' },
            averageParticipants: { type: 'number' },
          },
        },
      },
    },
  }, async () => {
    const allGames = await db.select().from(puzzleGames);

    const activeGames = allGames.filter(g => g.status === 'open' || g.status === 'active');
    const completedGames = allGames.filter(g => g.status === 'completed');
    const expiredGames = allGames.filter(g => g.status === 'expired');

    // Calculate total prize distributed (from completed games)
    const totalPrizeDistributed = completedGames.reduce((sum, g) => sum + (g.prizePool || 0), 0);

    // Calculate average participants
    let totalParticipants = 0;
    for (const game of allGames) {
      const participants = await getActiveParticipantsForGame(game.id);
      totalParticipants += participants.length;
    }
    const averageParticipants = allGames.length > 0
      ? Math.round((totalParticipants / allGames.length) * 100) / 100
      : 0;

    return {
      totalGames: allGames.length,
      activeGames: activeGames.length,
      completedGames: completedGames.length,
      expiredGames: expiredGames.length,
      totalPrizeDistributed: Math.round(totalPrizeDistributed * 100) / 100,
      averageParticipants,
    };
  });

  console.log('[Routes] Puzzle API routes registered');
}
