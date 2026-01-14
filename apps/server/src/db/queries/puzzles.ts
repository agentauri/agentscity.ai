/**
 * Puzzle System Queries (Fragment Chase)
 *
 * CRUD operations for puzzle_games, puzzle_teams, puzzle_fragments,
 * puzzle_participants, and puzzle_attempts tables.
 *
 * Supports the collaborative puzzle game where agents must share
 * information fragments to solve puzzles and win prizes.
 */

import { eq, and, or, ne, gte, lte, sql, inArray } from 'drizzle-orm';
import { db } from '../index';
import {
  puzzleGames,
  puzzleTeams,
  puzzleFragments,
  puzzleParticipants,
  puzzleAttempts,
  agents,
  type PuzzleGame,
  type NewPuzzleGame,
  type PuzzleTeam,
  type NewPuzzleTeam,
  type PuzzleFragment,
  type NewPuzzleFragment,
  type PuzzleParticipant,
  type NewPuzzleParticipant,
  type PuzzleAttempt,
  type NewPuzzleAttempt,
} from '../schema';

// =============================================================================
// PUZZLE GAMES
// =============================================================================

/**
 * Create a new puzzle game
 */
export async function createPuzzleGame(game: NewPuzzleGame): Promise<PuzzleGame> {
  const [created] = await db.insert(puzzleGames).values(game).returning();
  return created;
}

/**
 * Get puzzle game by ID
 */
export async function getPuzzleGameById(id: string): Promise<PuzzleGame | undefined> {
  const [game] = await db.select().from(puzzleGames).where(eq(puzzleGames.id, id));
  return game;
}

/**
 * Get all active puzzle games (open or active status)
 *
 * Tenant matching:
 * - If tenantId is undefined: return all active games (no tenant filter)
 * - If tenantId is null: return only NULL tenant games
 * - If tenantId is a string: return matching tenant games AND NULL tenant games (global puzzles)
 */
export async function getActivePuzzleGames(tenantId?: string | null): Promise<PuzzleGame[]> {
  const conditions = [
    or(eq(puzzleGames.status, 'open'), eq(puzzleGames.status, 'active')),
  ];

  if (tenantId !== undefined) {
    if (tenantId === null) {
      conditions.push(sql`${puzzleGames.tenantId} IS NULL`);
    } else {
      // Include both matching tenant AND global (NULL) puzzles
      conditions.push(sql`(${puzzleGames.tenantId} = ${tenantId} OR ${puzzleGames.tenantId} IS NULL)`);
    }
  }

  return db.select().from(puzzleGames).where(and(...conditions));
}

/**
 * Get open puzzle games that can be joined
 *
 * Tenant matching:
 * - If tenantId is undefined: return all open games (no tenant filter)
 * - If tenantId is null: return only NULL tenant games
 * - If tenantId is a string: return matching tenant games AND NULL tenant games (global puzzles)
 */
export async function getOpenPuzzleGames(tenantId?: string | null): Promise<PuzzleGame[]> {
  const conditions = [eq(puzzleGames.status, 'open')];

  if (tenantId !== undefined) {
    if (tenantId === null) {
      conditions.push(sql`${puzzleGames.tenantId} IS NULL`);
    } else {
      // Include both matching tenant AND global (NULL) puzzles
      conditions.push(sql`(${puzzleGames.tenantId} = ${tenantId} OR ${puzzleGames.tenantId} IS NULL)`);
    }
  }

  return db.select().from(puzzleGames).where(and(...conditions));
}

/**
 * Update puzzle game status
 */
export async function updatePuzzleGameStatus(
  id: string,
  status: 'open' | 'active' | 'completed' | 'expired'
): Promise<void> {
  await db.update(puzzleGames).set({ status }).where(eq(puzzleGames.id, id));
}

/**
 * Set puzzle game winner
 */
export async function setPuzzleGameWinner(id: string, winnerId: string): Promise<void> {
  await db
    .update(puzzleGames)
    .set({ winnerId, status: 'completed' })
    .where(eq(puzzleGames.id, id));
}

/**
 * Add to puzzle game prize pool
 */
export async function addToPrizePool(id: string, amount: number): Promise<void> {
  await db.execute(sql`
    UPDATE puzzle_games
    SET prize_pool = prize_pool + ${amount}
    WHERE id = ${id}
  `);
}

/**
 * Expire puzzle games past their end tick
 */
export async function expirePuzzleGames(currentTick: number): Promise<number> {
  const gamesToExpire = await db
    .select({ id: puzzleGames.id })
    .from(puzzleGames)
    .where(
      and(
        or(eq(puzzleGames.status, 'open'), eq(puzzleGames.status, 'active')),
        lte(puzzleGames.endsAtTick, currentTick)
      )
    );

  if (gamesToExpire.length === 0) return 0;

  for (const game of gamesToExpire) {
    await db
      .update(puzzleGames)
      .set({ status: 'expired' })
      .where(eq(puzzleGames.id, game.id));
  }

  return gamesToExpire.length;
}

/**
 * Get puzzle game with participant count
 */
export async function getPuzzleGameWithParticipantCount(
  id: string
): Promise<(PuzzleGame & { participantCount: number }) | undefined> {
  const [game] = await db.select().from(puzzleGames).where(eq(puzzleGames.id, id));
  if (!game) return undefined;

  const participants = await db
    .select()
    .from(puzzleParticipants)
    .where(and(eq(puzzleParticipants.gameId, id), eq(puzzleParticipants.status, 'active')));

  return { ...game, participantCount: participants.length };
}

// =============================================================================
// PUZZLE TEAMS
// =============================================================================

/**
 * Create a new puzzle team
 */
export async function createPuzzleTeam(team: NewPuzzleTeam): Promise<PuzzleTeam> {
  const [created] = await db.insert(puzzleTeams).values(team).returning();
  return created;
}

/**
 * Get puzzle team by ID
 */
export async function getPuzzleTeamById(id: string): Promise<PuzzleTeam | undefined> {
  const [team] = await db.select().from(puzzleTeams).where(eq(puzzleTeams.id, id));
  return team;
}

/**
 * Get teams for a puzzle game
 */
export async function getTeamsForGame(gameId: string): Promise<PuzzleTeam[]> {
  return db.select().from(puzzleTeams).where(eq(puzzleTeams.gameId, gameId));
}

/**
 * Get team members
 */
export async function getTeamMembers(teamId: string): Promise<PuzzleParticipant[]> {
  return db
    .select()
    .from(puzzleParticipants)
    .where(and(eq(puzzleParticipants.teamId, teamId), eq(puzzleParticipants.status, 'active')));
}

/**
 * Update team status
 */
export async function updateTeamStatus(
  id: string,
  status: 'forming' | 'active' | 'won' | 'lost'
): Promise<void> {
  await db.update(puzzleTeams).set({ status }).where(eq(puzzleTeams.id, id));
}

/**
 * Update team total stake
 */
export async function updateTeamTotalStake(id: string, totalStake: number): Promise<void> {
  await db.update(puzzleTeams).set({ totalStake }).where(eq(puzzleTeams.id, id));
}

/**
 * Get agent's team in a game
 */
export async function getAgentTeamInGame(
  agentId: string,
  gameId: string
): Promise<PuzzleTeam | undefined> {
  const [participant] = await db
    .select()
    .from(puzzleParticipants)
    .where(
      and(
        eq(puzzleParticipants.agentId, agentId),
        eq(puzzleParticipants.gameId, gameId),
        eq(puzzleParticipants.status, 'active')
      )
    );

  if (!participant?.teamId) return undefined;

  const [team] = await db
    .select()
    .from(puzzleTeams)
    .where(eq(puzzleTeams.id, participant.teamId));

  return team;
}

// =============================================================================
// PUZZLE FRAGMENTS
// =============================================================================

/**
 * Create puzzle fragments
 */
export async function createPuzzleFragments(
  fragments: NewPuzzleFragment[]
): Promise<PuzzleFragment[]> {
  return db.insert(puzzleFragments).values(fragments).returning();
}

/**
 * Get fragment by ID
 */
export async function getFragmentById(id: string): Promise<PuzzleFragment | undefined> {
  const [fragment] = await db
    .select()
    .from(puzzleFragments)
    .where(eq(puzzleFragments.id, id));
  return fragment;
}

/**
 * Get all fragments for a game
 */
export async function getFragmentsForGame(gameId: string): Promise<PuzzleFragment[]> {
  return db.select().from(puzzleFragments).where(eq(puzzleFragments.gameId, gameId));
}

/**
 * Get fragments owned by an agent
 */
export async function getFragmentsOwnedByAgent(agentId: string): Promise<PuzzleFragment[]> {
  return db.select().from(puzzleFragments).where(eq(puzzleFragments.ownerId, agentId));
}

/**
 * Get fragments for an agent in a specific game
 */
export async function getAgentFragmentsInGame(
  agentId: string,
  gameId: string
): Promise<PuzzleFragment[]> {
  return db
    .select()
    .from(puzzleFragments)
    .where(and(eq(puzzleFragments.ownerId, agentId), eq(puzzleFragments.gameId, gameId)));
}

/**
 * Assign fragment to an agent
 */
export async function assignFragmentToAgent(
  fragmentId: string,
  agentId: string,
  isOriginal: boolean = false
): Promise<void> {
  const update: Partial<PuzzleFragment> = { ownerId: agentId };
  if (isOriginal) {
    update.originalOwnerId = agentId;
  }
  await db.update(puzzleFragments).set(update).where(eq(puzzleFragments.id, fragmentId));
}

/**
 * Clear fragment ownership (return to pool)
 */
export async function clearFragmentOwner(fragmentId: string): Promise<void> {
  await db.update(puzzleFragments).set({ ownerId: null }).where(eq(puzzleFragments.id, fragmentId));
}

/**
 * Mark fragment as shared with another agent
 */
export async function markFragmentShared(
  fragmentId: string,
  sharedWithAgentId: string
): Promise<void> {
  // Get current sharedWith array
  const [fragment] = await db
    .select()
    .from(puzzleFragments)
    .where(eq(puzzleFragments.id, fragmentId));

  if (!fragment) return;

  const currentShared = (fragment.sharedWith as string[]) || [];
  if (!currentShared.includes(sharedWithAgentId)) {
    await db
      .update(puzzleFragments)
      .set({ sharedWith: [...currentShared, sharedWithAgentId] })
      .where(eq(puzzleFragments.id, fragmentId));
  }
}

/**
 * Get fragments shared with an agent (not owned but received)
 */
export async function getFragmentsSharedWithAgent(
  agentId: string,
  gameId: string
): Promise<PuzzleFragment[]> {
  const allFragments = await getFragmentsForGame(gameId);
  return allFragments.filter((f) => {
    const sharedWith = (f.sharedWith as string[]) || [];
    return sharedWith.includes(agentId) && f.ownerId !== agentId;
  });
}

// =============================================================================
// PUZZLE PARTICIPANTS
// =============================================================================

/**
 * Add participant to a puzzle game
 */
export async function addPuzzleParticipant(
  participant: NewPuzzleParticipant
): Promise<PuzzleParticipant> {
  const [created] = await db.insert(puzzleParticipants).values(participant).returning();
  return created;
}

/**
 * Get participant by agent and game
 */
export async function getParticipant(
  agentId: string,
  gameId: string
): Promise<PuzzleParticipant | undefined> {
  const [participant] = await db
    .select()
    .from(puzzleParticipants)
    .where(
      and(eq(puzzleParticipants.agentId, agentId), eq(puzzleParticipants.gameId, gameId))
    );
  return participant;
}

/**
 * Get all active participants for a game
 */
export async function getActiveParticipantsForGame(gameId: string): Promise<PuzzleParticipant[]> {
  return db
    .select()
    .from(puzzleParticipants)
    .where(
      and(eq(puzzleParticipants.gameId, gameId), eq(puzzleParticipants.status, 'active'))
    );
}

/**
 * Update participant status
 */
export async function updateParticipantStatus(
  id: string,
  status: 'active' | 'left' | 'banned'
): Promise<void> {
  await db
    .update(puzzleParticipants)
    .set({ status })
    .where(eq(puzzleParticipants.id, id));
}

/**
 * Join participant to a team
 */
export async function joinParticipantToTeam(participantId: string, teamId: string): Promise<void> {
  await db
    .update(puzzleParticipants)
    .set({ teamId })
    .where(eq(puzzleParticipants.id, participantId));
}

/**
 * Increment fragments shared count
 */
export async function incrementFragmentsShared(participantId: string): Promise<void> {
  await db.execute(sql`
    UPDATE puzzle_participants
    SET fragments_shared = fragments_shared + 1
    WHERE id = ${participantId}
  `);
}

/**
 * Increment attempts made count
 */
export async function incrementAttemptsMade(participantId: string): Promise<void> {
  await db.execute(sql`
    UPDATE puzzle_participants
    SET attempts_made = attempts_made + 1
    WHERE id = ${participantId}
  `);
}

/**
 * Update contribution score
 */
export async function updateContributionScore(
  participantId: string,
  score: number
): Promise<void> {
  await db
    .update(puzzleParticipants)
    .set({ contributionScore: score })
    .where(eq(puzzleParticipants.id, participantId));
}

/**
 * Add to contribution score
 */
export async function addContributionScore(participantId: string, amount: number): Promise<void> {
  await db.execute(sql`
    UPDATE puzzle_participants
    SET contribution_score = contribution_score + ${amount}
    WHERE id = ${participantId}
  `);
}

/**
 * Get all active puzzle participations for an agent
 */
export async function getAgentActivePuzzleParticipations(
  agentId: string
): Promise<PuzzleParticipant[]> {
  return db
    .select()
    .from(puzzleParticipants)
    .where(
      and(eq(puzzleParticipants.agentId, agentId), eq(puzzleParticipants.status, 'active'))
    );
}

/**
 * Check if agent is participating in any active puzzle
 */
export async function isAgentInActivePuzzle(agentId: string): Promise<boolean> {
  const participations = await getAgentActivePuzzleParticipations(agentId);
  if (participations.length === 0) return false;

  // Check if any of these games are still active
  const gameIds = participations.map((p) => p.gameId);
  const games = await db
    .select()
    .from(puzzleGames)
    .where(
      and(
        inArray(puzzleGames.id, gameIds),
        or(eq(puzzleGames.status, 'open'), eq(puzzleGames.status, 'active'))
      )
    );

  return games.length > 0;
}

/**
 * Get current active puzzle game for an agent (if any)
 */
export async function getAgentActivePuzzleGame(agentId: string): Promise<PuzzleGame | undefined> {
  const participations = await getAgentActivePuzzleParticipations(agentId);
  if (participations.length === 0) return undefined;

  const gameIds = participations.map((p) => p.gameId);
  const [game] = await db
    .select()
    .from(puzzleGames)
    .where(
      and(
        inArray(puzzleGames.id, gameIds),
        or(eq(puzzleGames.status, 'open'), eq(puzzleGames.status, 'active'))
      )
    )
    .limit(1);

  return game;
}

// =============================================================================
// PUZZLE ATTEMPTS
// =============================================================================

/**
 * Record a solution attempt
 */
export async function recordPuzzleAttempt(attempt: NewPuzzleAttempt): Promise<PuzzleAttempt> {
  const [created] = await db.insert(puzzleAttempts).values(attempt).returning();
  return created;
}

/**
 * Get attempts for a game
 */
export async function getAttemptsForGame(gameId: string): Promise<PuzzleAttempt[]> {
  return db.select().from(puzzleAttempts).where(eq(puzzleAttempts.gameId, gameId));
}

/**
 * Get attempts by an agent
 */
export async function getAttemptsByAgent(
  agentId: string,
  gameId: string
): Promise<PuzzleAttempt[]> {
  return db
    .select()
    .from(puzzleAttempts)
    .where(
      and(eq(puzzleAttempts.submitterId, agentId), eq(puzzleAttempts.gameId, gameId))
    );
}

/**
 * Get correct attempt (winning submission)
 */
export async function getWinningAttempt(gameId: string): Promise<PuzzleAttempt | undefined> {
  const [attempt] = await db
    .select()
    .from(puzzleAttempts)
    .where(and(eq(puzzleAttempts.gameId, gameId), eq(puzzleAttempts.isCorrect, true)))
    .limit(1);
  return attempt;
}

// =============================================================================
// COMBINED / CONTEXT QUERIES
// =============================================================================

/**
 * Get full puzzle context for an agent (for LLM prompt)
 */
export async function getAgentPuzzleContext(agentId: string, tenantId?: string | null): Promise<{
  activePuzzleGames: (PuzzleGame & { participantCount: number; isParticipating: boolean })[];
  myFragments: PuzzleFragment[];
  myTeam: PuzzleTeam | undefined;
  currentGameId: string | undefined;
}> {
  // Get active games
  const activeGames = await getActivePuzzleGames(tenantId);

  // Get agent's participations
  const participations = await getAgentActivePuzzleParticipations(agentId);
  const participatingGameIds = new Set(participations.map((p) => p.gameId));

  // Get participant counts for each game
  const gamesWithCounts = await Promise.all(
    activeGames.map(async (game) => {
      const participants = await getActiveParticipantsForGame(game.id);
      return {
        ...game,
        participantCount: participants.length,
        isParticipating: participatingGameIds.has(game.id),
      };
    })
  );

  // Get agent's fragments (across all active games)
  const myFragments = await getFragmentsOwnedByAgent(agentId);

  // Get agent's current team (if in a game)
  let myTeam: PuzzleTeam | undefined;
  let currentGameId: string | undefined;

  if (participations.length > 0) {
    currentGameId = participations[0].gameId;
    if (participations[0].teamId) {
      myTeam = await getPuzzleTeamById(participations[0].teamId);
    }
  }

  return {
    activePuzzleGames: gamesWithCounts,
    myFragments,
    myTeam,
    currentGameId,
  };
}

/**
 * Calculate contribution score for reward distribution
 */
export async function calculateContributionScores(gameId: string): Promise<void> {
  const participants = await getActiveParticipantsForGame(gameId);
  const fragments = await getFragmentsForGame(gameId);
  const attempts = await getAttemptsForGame(gameId);

  for (const participant of participants) {
    let score = 0;

    // Score for fragments shared (0.3 per share)
    score += participant.fragmentsShared * 0.3;

    // Score for being original owner of fragments that were shared
    const ownedFragments = fragments.filter((f) => f.originalOwnerId === participant.agentId);
    for (const fragment of ownedFragments) {
      const sharedCount = ((fragment.sharedWith as string[]) || []).length;
      if (sharedCount > 0) {
        score += 0.2; // Bonus for sharing your own fragment
      }
    }

    // Score for attempts (showing engagement)
    const agentAttempts = attempts.filter((a) => a.submitterId === participant.agentId);
    score += Math.min(agentAttempts.length * 0.1, 0.3); // Cap at 0.3

    // Bonus for correct submission
    const correctAttempt = agentAttempts.find((a) => a.isCorrect);
    if (correctAttempt) {
      score += 0.25;
    }

    await updateContributionScore(participant.id, score);
  }
}
