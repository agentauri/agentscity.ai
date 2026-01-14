/**
 * Puzzle System Action Handler Tests
 *
 * Tests for Fragment Chase puzzle game:
 * - join_puzzle: Join a puzzle game with stake
 * - leave_puzzle: Leave a puzzle game (with penalty)
 * - share_fragment: Share fragment with another player
 * - form_team: Create a team in puzzle
 * - join_team: Join existing team
 * - submit_solution: Submit puzzle solution
 */

import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { v4 as uuid } from 'uuid';
import { createHash } from 'crypto';
import { db } from '../../db';
import {
  agents,
  ledger,
  puzzleGames,
  puzzleFragments,
  puzzleParticipants,
  puzzleTeams,
  puzzleAttempts,
} from '../../db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { handleJoinPuzzle } from '../../actions/handlers/join-puzzle';
import { handleLeavePuzzle } from '../../actions/handlers/leave-puzzle';
import { handleShareFragment } from '../../actions/handlers/share-fragment';
import { handleFormTeam } from '../../actions/handlers/form-team';
import { handleJoinTeam } from '../../actions/handlers/join-team';
import { handleSubmitSolution } from '../../actions/handlers/submit-solution';
import type { Agent } from '../../db/schema';
// ActionIntent type not needed since createIntent returns any for flexibility
import { CONFIG } from '../../config';

// Note: These tests use real database operations. When running the full test suite,
// they may fail due to mock bleeding from other test files that mock db/queries/*.
// Run in isolation for reliable results: bun test src/__tests__/actions/puzzle.test.ts

// Track created test data for cleanup
const createdAgentIds: string[] = [];
const createdGameIds: string[] = [];

// Test helpers
const createTestAgent = async (overrides: Partial<Agent> = {}): Promise<Agent> => {
  const agentId = uuid();
  const agent: Agent = {
    id: agentId,
    llmType: 'claude', // Required field
    x: 50,
    y: 50,
    hunger: 80,
    energy: 80,
    health: 100,
    balance: 100, // Enough for puzzle entry stake
    state: 'idle',
    color: '#888888',
    personality: null,
    tenantId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    diedAt: null,
    ...overrides,
  };

  await db.insert(agents).values(agent);
  createdAgentIds.push(agentId);
  return agent;
};

const createTestPuzzleGame = async (overrides: Partial<typeof puzzleGames.$inferInsert> = {}) => {
  const solution = 'test-solution';
  const gameId = uuid();
  const game = {
    id: gameId,
    tenantId: null,
    gameType: 'password',
    status: 'open' as const,
    solution,
    solutionHash: createHash('sha256').update(solution.toLowerCase()).digest('hex'),
    prizePool: 50,
    entryStake: 5,
    maxParticipants: 10,
    minParticipants: 2,
    fragmentCount: 3,
    createdAtTick: 100,
    startsAtTick: 100,
    endsAtTick: 200,
    ...overrides,
  };

  await db.insert(puzzleGames).values(game);

  // Create fragments for the game
  const fragments = [
    { id: uuid(), gameId, fragmentIndex: 0, content: 'Fragment 0', hint: 'Hint 0', ownerId: null, originalOwnerId: null, sharedWith: [] },
    { id: uuid(), gameId, fragmentIndex: 1, content: 'Fragment 1', hint: 'Hint 1', ownerId: null, originalOwnerId: null, sharedWith: [] },
    { id: uuid(), gameId, fragmentIndex: 2, content: 'Fragment 2', hint: 'Hint 2', ownerId: null, originalOwnerId: null, sharedWith: [] },
  ];

  await db.insert(puzzleFragments).values(fragments);

  createdGameIds.push(gameId);
  return { game, fragments };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createIntent = (agentId: string, type: string, params: Record<string, unknown>, tick: number = 100): any => ({
  agentId,
  type,
  params,
  tick,
  timestamp: Date.now(),
});

// Cleanup helper - only delete data created by this test file
const cleanupTestData = async () => {
  if (createdGameIds.length > 0) {
    await db.delete(puzzleAttempts).where(inArray(puzzleAttempts.gameId, createdGameIds));
    await db.delete(puzzleParticipants).where(inArray(puzzleParticipants.gameId, createdGameIds));
    await db.delete(puzzleTeams).where(inArray(puzzleTeams.gameId, createdGameIds));
    await db.delete(puzzleFragments).where(inArray(puzzleFragments.gameId, createdGameIds));
    await db.delete(puzzleGames).where(inArray(puzzleGames.id, createdGameIds));
  }
  if (createdAgentIds.length > 0) {
    await db.delete(ledger).where(inArray(ledger.fromAgentId, createdAgentIds));
    await db.delete(ledger).where(inArray(ledger.toAgentId, createdAgentIds));
    await db.delete(agents).where(inArray(agents.id, createdAgentIds));
  }
  // Clear the tracking arrays
  createdAgentIds.length = 0;
  createdGameIds.length = 0;
};

describe('Puzzle System - Join Puzzle', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  test('should join open puzzle game with valid stake', async () => {
    const agent = await createTestAgent({ balance: 100 });
    const { game } = await createTestPuzzleGame();

    const intent = createIntent(agent.id, 'join_puzzle', {
      gameId: game.id,
      stakeAmount: 10,
    });

    const result = await handleJoinPuzzle(intent, agent);

    expect(result.success).toBe(true);
    expect(result.events).toBeDefined();
    expect(result.events?.length).toBeGreaterThan(0);
    expect(result.events?.[0].type).toBe('puzzle_joined');

    // Verify participant was created
    const [participant] = await db
      .select()
      .from(puzzleParticipants)
      .where(and(eq(puzzleParticipants.agentId, agent.id), eq(puzzleParticipants.gameId, game.id)));

    expect(participant).toBeDefined();
    expect(participant.stakedAmount).toBe(10);
    expect(participant.status).toBe('active');
  });

  test('should fail to join with insufficient balance', async () => {
    const agent = await createTestAgent({ balance: 2 }); // Less than entry stake
    const { game } = await createTestPuzzleGame({ entryStake: 5 });

    const intent = createIntent(agent.id, 'join_puzzle', {
      gameId: game.id,
    });

    const result = await handleJoinPuzzle(intent, agent);

    expect(result.success).toBe(false);
    expect(result.error).toContain('balance');
  });

  test('should fail to join completed game', async () => {
    const agent = await createTestAgent({ balance: 100 });
    const { game } = await createTestPuzzleGame({ status: 'completed' });

    const intent = createIntent(agent.id, 'join_puzzle', {
      gameId: game.id,
    });

    const result = await handleJoinPuzzle(intent, agent);

    expect(result.success).toBe(false);
    expect(result.error).toContain('not accepting');
  });

  test('should fail to join if already in an active puzzle', async () => {
    const agent = await createTestAgent({ balance: 100 });
    const { game: game1 } = await createTestPuzzleGame();
    const { game: game2 } = await createTestPuzzleGame();

    // Join first puzzle
    const intent1 = createIntent(agent.id, 'join_puzzle', { gameId: game1.id });
    await handleJoinPuzzle(intent1, agent);

    // Try to join second puzzle (should fail due to Focus Lock)
    const intent2 = createIntent(agent.id, 'join_puzzle', { gameId: game2.id });
    const result = await handleJoinPuzzle(intent2, agent);

    expect(result.success).toBe(false);
    expect(result.error).toContain('participating');
  });
});

describe('Puzzle System - Leave Puzzle', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  test('should leave puzzle with stake penalty', async () => {
    const agent = await createTestAgent({ balance: 100 });
    const { game } = await createTestPuzzleGame();

    // Join the puzzle first
    const joinIntent = createIntent(agent.id, 'join_puzzle', { gameId: game.id, stakeAmount: 10 });
    await handleJoinPuzzle(joinIntent, agent);

    // Leave the puzzle
    const leaveIntent = createIntent(agent.id, 'leave_puzzle', { gameId: game.id });
    const result = await handleLeavePuzzle(leaveIntent, { ...agent, balance: 90 });

    expect(result.success).toBe(true);
    expect(result.events?.[0].type).toBe('puzzle_left');

    // Verify participant status changed
    const [participant] = await db
      .select()
      .from(puzzleParticipants)
      .where(and(eq(puzzleParticipants.agentId, agent.id), eq(puzzleParticipants.gameId, game.id)));

    expect(participant.status).toBe('left');
  });

  test('should fail to leave puzzle not participating in', async () => {
    const agent = await createTestAgent({ balance: 100 });
    const { game } = await createTestPuzzleGame();

    const intent = createIntent(agent.id, 'leave_puzzle', { gameId: game.id });
    const result = await handleLeavePuzzle(intent, agent);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Not participating');
  });
});

describe('Puzzle System - Share Fragment', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  test('should share fragment with another player in same game', async () => {
    const agent1 = await createTestAgent({ balance: 100 });
    const agent2 = await createTestAgent({ balance: 100, x: 51 }); // Nearby
    const { game, fragments } = await createTestPuzzleGame();

    // Both agents join the puzzle
    await handleJoinPuzzle(createIntent(agent1.id, 'join_puzzle', { gameId: game.id }), agent1);
    await handleJoinPuzzle(createIntent(agent2.id, 'join_puzzle', { gameId: game.id }), agent2);

    // Assign fragment to agent1
    await db
      .update(puzzleFragments)
      .set({ ownerId: agent1.id, originalOwnerId: agent1.id })
      .where(eq(puzzleFragments.id, fragments[0].id));

    // Share fragment with agent2
    const shareIntent = createIntent(agent1.id, 'share_fragment', {
      fragmentId: fragments[0].id,
      targetAgentId: agent2.id,
    });
    const result = await handleShareFragment(shareIntent, agent1);

    expect(result.success).toBe(true);
    expect(result.events?.[0].type).toBe('fragment_shared');

    // Verify fragment was marked as shared
    const [updatedFragment] = await db
      .select()
      .from(puzzleFragments)
      .where(eq(puzzleFragments.id, fragments[0].id));

    expect((updatedFragment.sharedWith as string[]).includes(agent2.id)).toBe(true);
  });

  test('should fail to share fragment not owned', async () => {
    const agent1 = await createTestAgent({ balance: 100 });
    const agent2 = await createTestAgent({ balance: 100, x: 51 });
    const { game, fragments } = await createTestPuzzleGame();

    // Both agents join the puzzle (agent1 gets fragment[0], agent2 gets fragment[1])
    await handleJoinPuzzle(createIntent(agent1.id, 'join_puzzle', { gameId: game.id }), agent1);
    await handleJoinPuzzle(createIntent(agent2.id, 'join_puzzle', { gameId: game.id }), agent2);

    // Agent1 tries to share fragment[1] which was assigned to agent2
    const shareIntent = createIntent(agent1.id, 'share_fragment', {
      fragmentId: fragments[1].id, // This belongs to agent2, not agent1
      targetAgentId: agent2.id,
    });
    const result = await handleShareFragment(shareIntent, agent1);

    expect(result.success).toBe(false);
    expect(result.error).toContain('own');
  });
});

describe('Puzzle System - Form Team', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  test('should create team and become leader', async () => {
    const agent = await createTestAgent({ balance: 100 });
    const { game } = await createTestPuzzleGame();

    // Join puzzle first
    await handleJoinPuzzle(createIntent(agent.id, 'join_puzzle', { gameId: game.id }), agent);

    // Form team
    const formIntent = createIntent(agent.id, 'form_team', {
      gameId: game.id,
      teamName: 'TestTeam',
    });
    const result = await handleFormTeam(formIntent, agent);

    expect(result.success).toBe(true);
    expect(result.events?.[0].type).toBe('team_formed');
    expect(result.events?.[0].payload?.teamName).toBe('TestTeam');
    expect(result.events?.[0].payload?.leaderId).toBe(agent.id);

    // Verify team was created
    const [team] = await db.select().from(puzzleTeams).where(eq(puzzleTeams.gameId, game.id));
    expect(team).toBeDefined();
    expect(team.leaderId).toBe(agent.id);
    expect(team.name).toBe('TestTeam');
  });

  test('should fail to form team if not in puzzle', async () => {
    const agent = await createTestAgent({ balance: 100 });
    const { game } = await createTestPuzzleGame();

    const formIntent = createIntent(agent.id, 'form_team', {
      gameId: game.id,
      teamName: 'TestTeam',
    });
    const result = await handleFormTeam(formIntent, agent);

    expect(result.success).toBe(false);
    expect(result.error).toContain('participant');
  });
});

describe('Puzzle System - Join Team', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  test('should join existing team', async () => {
    const leader = await createTestAgent({ balance: 100 });
    const member = await createTestAgent({ balance: 100, x: 51 });
    const { game } = await createTestPuzzleGame();

    // Both join puzzle
    await handleJoinPuzzle(createIntent(leader.id, 'join_puzzle', { gameId: game.id }), leader);
    await handleJoinPuzzle(createIntent(member.id, 'join_puzzle', { gameId: game.id }), member);

    // Leader forms team
    const formIntent = createIntent(leader.id, 'form_team', { gameId: game.id, teamName: 'TestTeam' });
    const formResult = await handleFormTeam(formIntent, leader);
    const teamId = formResult.events?.[0].payload?.teamId as string;

    // Member joins team
    const joinIntent = createIntent(member.id, 'join_team', { teamId });
    const result = await handleJoinTeam(joinIntent, member);

    expect(result.success).toBe(true);
    expect(result.events?.[0].type).toBe('team_joined');

    // Verify participant is now on team
    const [participant] = await db
      .select()
      .from(puzzleParticipants)
      .where(and(eq(puzzleParticipants.agentId, member.id), eq(puzzleParticipants.gameId, game.id)));

    expect(participant.teamId).toBe(teamId);
  });

  test('should fail to join team if already in a team', async () => {
    const leader1 = await createTestAgent({ balance: 100 });
    const leader2 = await createTestAgent({ balance: 100, x: 51 });
    const member = await createTestAgent({ balance: 100, x: 52 });
    const { game } = await createTestPuzzleGame();

    // All join puzzle
    await handleJoinPuzzle(createIntent(leader1.id, 'join_puzzle', { gameId: game.id }), leader1);
    await handleJoinPuzzle(createIntent(leader2.id, 'join_puzzle', { gameId: game.id }), leader2);
    await handleJoinPuzzle(createIntent(member.id, 'join_puzzle', { gameId: game.id }), member);

    // Form two teams
    const form1 = await handleFormTeam(createIntent(leader1.id, 'form_team', { gameId: game.id }), leader1);
    const form2 = await handleFormTeam(createIntent(leader2.id, 'form_team', { gameId: game.id }), leader2);
    const teamId1 = form1.events?.[0].payload?.teamId;
    const teamId2 = form2.events?.[0].payload?.teamId;

    // Member joins team 1
    await handleJoinTeam(createIntent(member.id, 'join_team', { teamId: teamId1 }), member);

    // Try to join team 2 (should fail)
    const result = await handleJoinTeam(createIntent(member.id, 'join_team', { teamId: teamId2 }), member);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Already in a team');
  });
});

describe('Puzzle System - Submit Solution', () => {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  test('should successfully submit correct solution', async () => {
    const agent = await createTestAgent({ balance: 100 });
    const solution = 'correct-answer';
    const { game } = await createTestPuzzleGame({
      solution,
      solutionHash: createHash('sha256').update(solution.toLowerCase()).digest('hex'),
      status: 'open', // Must be 'open' to join
    });

    // Join puzzle
    const joinResult = await handleJoinPuzzle(createIntent(agent.id, 'join_puzzle', { gameId: game.id }), agent);
    expect(joinResult.success).toBe(true);

    // Update game to active status for submission
    await db.update(puzzleGames).set({ status: 'active' }).where(eq(puzzleGames.id, game.id));

    // Submit correct solution
    const submitIntent = createIntent(agent.id, 'submit_solution', {
      gameId: game.id,
      solution: 'correct-answer',
    });
    const result = await handleSubmitSolution(submitIntent, agent);

    expect(result.success).toBe(true);
    expect(result.events?.some((e) => e.type === 'puzzle_solved')).toBe(true);

    // Verify game is completed
    const [updatedGame] = await db.select().from(puzzleGames).where(eq(puzzleGames.id, game.id));
    expect(updatedGame.status).toBe('completed');
    expect(updatedGame.winnerId).toBe(agent.id);
  });

  test('should fail incorrect solution but record attempt', async () => {
    const agent = await createTestAgent({ balance: 100 });
    const { game } = await createTestPuzzleGame({
      solution: 'correct-answer',
      status: 'open', // Must be 'open' to join
    });

    // Join puzzle
    const joinResult = await handleJoinPuzzle(createIntent(agent.id, 'join_puzzle', { gameId: game.id }), agent);
    expect(joinResult.success).toBe(true);

    // Update game to active status for submission
    await db.update(puzzleGames).set({ status: 'active' }).where(eq(puzzleGames.id, game.id));

    // Submit incorrect solution
    const submitIntent = createIntent(agent.id, 'submit_solution', {
      gameId: game.id,
      solution: 'wrong-answer',
    });
    const result = await handleSubmitSolution(submitIntent, agent);

    expect(result.success).toBe(true); // Action succeeds, just wrong answer
    expect(result.events?.some((e) => e.type === 'solution_submitted')).toBe(true);
    expect(result.events?.some((e) => e.type === 'puzzle_solved')).toBe(false);

    // Verify attempt was recorded
    const attempts = await db.select().from(puzzleAttempts).where(eq(puzzleAttempts.gameId, game.id));
    expect(attempts.length).toBe(1);
    expect(attempts[0].isCorrect).toBe(false);

    // Game should still be active
    const [updatedGame] = await db.select().from(puzzleGames).where(eq(puzzleGames.id, game.id));
    expect(updatedGame.status).toBe('active');
  });

  test('should fail to submit if not participating', async () => {
    const agent = await createTestAgent({ balance: 100 });
    const { game } = await createTestPuzzleGame({ status: 'active' });

    const submitIntent = createIntent(agent.id, 'submit_solution', {
      gameId: game.id,
      solution: 'any-answer',
    });
    const result = await handleSubmitSolution(submitIntent, agent);

    expect(result.success).toBe(false);
    expect(result.error).toContain('participant');
  });
});
