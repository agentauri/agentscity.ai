/**
 * Puzzle Engine
 *
 * Manages the lifecycle of puzzle games:
 * - Automatic creation of new puzzles
 * - Transition from 'open' to 'active' when min participants reached
 * - Expiration handling
 * - Fragment distribution
 * - Prize pool management
 */

import { v4 as uuid } from 'uuid';
import { createHash } from 'crypto';
import {
  getActivePuzzleGames,
  getOpenPuzzleGames,
  createPuzzleGame,
  createPuzzleFragments,
  getActiveParticipantsForGame,
  updatePuzzleGameStatus,
  expirePuzzleGames,
  getPuzzleGameWithParticipantCount,
  assignFragmentToAgent,
  getFragmentsForGame,
} from '../db/queries/puzzles';
import { getAliveAgents } from '../db/queries/agents';
import { CONFIG } from '../config';
import type { PuzzleGame, NewPuzzleGame, NewPuzzleFragment } from '../db/schema';

// =============================================================================
// Puzzle Types and Generators
// =============================================================================

type PuzzleType = 'coordinates' | 'password' | 'map' | 'logic';

interface GeneratedPuzzle {
  type: PuzzleType;
  solution: string;
  solutionHash: string;
  fragments: Array<{
    content: string;
    hint: string;
  }>;
  entryStake: number;
  prizePool: number;
}

/**
 * Generate a coordinates puzzle (find x,y from hints)
 */
function generateCoordinatesPuzzle(): GeneratedPuzzle {
  const targetX = Math.floor(Math.random() * CONFIG.simulation.gridSize);
  const targetY = Math.floor(Math.random() * CONFIG.simulation.gridSize);
  const solution = `${targetX},${targetY}`;

  const fragments = [
    {
      content: `The X coordinate is ${targetX}`,
      hint: 'Reveals X coordinate',
    },
    {
      content: `The Y coordinate is ${targetY}`,
      hint: 'Reveals Y coordinate',
    },
    {
      content: `Sum of coordinates is ${targetX + targetY}`,
      hint: 'Verification clue',
    },
  ];

  return {
    type: 'coordinates',
    solution,
    solutionHash: createHash('sha256').update(solution.toLowerCase()).digest('hex'),
    fragments,
    entryStake: CONFIG.puzzle.defaultEntryStake,
    prizePool: 10, // Base prize from system
  };
}

/**
 * Generate a password puzzle (reconstruct string from parts)
 */
function generatePasswordPuzzle(): GeneratedPuzzle {
  const words = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'theta', 'omega'];
  const wordCount = 3 + Math.floor(Math.random() * 2); // 3-4 words
  const selectedWords = [];
  const usedIndices = new Set<number>();

  while (selectedWords.length < wordCount) {
    const idx = Math.floor(Math.random() * words.length);
    if (!usedIndices.has(idx)) {
      usedIndices.add(idx);
      selectedWords.push(words[idx]);
    }
  }

  const solution = selectedWords.join('-');

  const fragments = selectedWords.map((word, i) => ({
    content: `Word ${i + 1} is "${word}"`,
    hint: `Contains word position ${i + 1}`,
  }));

  // Add order hint
  fragments.push({
    content: `The password has ${wordCount} words separated by dashes`,
    hint: 'Format information',
  });

  return {
    type: 'password',
    solution,
    solutionHash: createHash('sha256').update(solution.toLowerCase()).digest('hex'),
    fragments,
    entryStake: CONFIG.puzzle.defaultEntryStake * 1.5,
    prizePool: 20,
  };
}

/**
 * Generate a logic puzzle (combine constraints)
 */
function generateLogicPuzzle(): GeneratedPuzzle {
  // Simple number logic puzzle: find a number that satisfies all constraints
  const targetNumber = 10 + Math.floor(Math.random() * 90); // 10-99
  const solution = targetNumber.toString();

  const fragments = [
    {
      content: `The number is ${targetNumber % 2 === 0 ? 'even' : 'odd'}`,
      hint: 'Parity information',
    },
    {
      content: `The number is between ${Math.floor(targetNumber / 10) * 10} and ${Math.floor(targetNumber / 10) * 10 + 9}`,
      hint: 'Range constraint',
    },
    {
      content: `The sum of digits is ${Math.floor(targetNumber / 10) + (targetNumber % 10)}`,
      hint: 'Digit sum',
    },
    {
      content: `The number is ${targetNumber > 50 ? 'greater' : 'less'} than 50`,
      hint: 'Comparison clue',
    },
    {
      content: `The last digit is ${targetNumber % 10}`,
      hint: 'Last digit revealed',
    },
  ];

  return {
    type: 'logic',
    solution,
    solutionHash: createHash('sha256').update(solution.toLowerCase()).digest('hex'),
    fragments,
    entryStake: CONFIG.puzzle.defaultEntryStake * 2,
    prizePool: 30,
  };
}

/**
 * Generate a random puzzle based on type
 */
function generatePuzzle(type?: PuzzleType): GeneratedPuzzle {
  const puzzleType = type || (
    Math.random() < 0.4 ? 'coordinates' :
    Math.random() < 0.7 ? 'password' : 'logic'
  );

  switch (puzzleType) {
    case 'coordinates':
      return generateCoordinatesPuzzle();
    case 'password':
      return generatePasswordPuzzle();
    case 'logic':
      return generateLogicPuzzle();
    default:
      return generateCoordinatesPuzzle();
  }
}

// =============================================================================
// Engine Functions
// =============================================================================

/**
 * Create a new puzzle game
 */
export async function createNewPuzzleGame(
  tenantId: string | null,
  tick: number,
  type?: PuzzleType
): Promise<PuzzleGame> {
  const puzzle = generatePuzzle(type);

  // Create the game
  const game = await createPuzzleGame({
    tenantId,
    gameType: puzzle.type,
    status: 'open',
    solution: puzzle.solution,
    solutionHash: puzzle.solutionHash,
    prizePool: puzzle.prizePool,
    entryStake: puzzle.entryStake,
    maxParticipants: 10,
    minParticipants: 2,
    fragmentCount: puzzle.fragments.length,
    createdAtTick: tick,
    startsAtTick: tick,
    endsAtTick: tick + CONFIG.puzzle.roundDurationTicks,
  });

  // Create fragments
  const fragmentDocs: NewPuzzleFragment[] = puzzle.fragments.map((f, i) => ({
    gameId: game.id,
    fragmentIndex: i,
    content: f.content,
    hint: f.hint,
    ownerId: null,
    originalOwnerId: null,
    sharedWith: [],
  }));

  await createPuzzleFragments(fragmentDocs);

  return game;
}

/**
 * Distribute fragments to participants
 * Called when game transitions from open to active
 */
export async function distributeFragments(gameId: string): Promise<void> {
  const fragments = await getFragmentsForGame(gameId);
  const participants = await getActiveParticipantsForGame(gameId);

  if (participants.length === 0) return;

  // Unassigned fragments
  const unassignedFragments = fragments.filter((f) => !f.ownerId);

  // Round-robin distribute fragments
  for (let i = 0; i < unassignedFragments.length; i++) {
    const participant = participants[i % participants.length];
    await assignFragmentToAgent(unassignedFragments[i].id, participant.agentId, true);
  }
}

/**
 * Check if game should transition to active
 */
export async function checkGameActivation(gameId: string, tick: number): Promise<boolean> {
  const game = await getPuzzleGameWithParticipantCount(gameId);
  if (!game || game.status !== 'open') return false;

  // Check if we've passed registration window with minimum participants
  const registrationEnded = tick >= (game.startsAtTick || 0) + CONFIG.puzzle.registrationWindow;
  const hasMinParticipants = game.participantCount >= game.minParticipants;

  if (registrationEnded && hasMinParticipants) {
    await updatePuzzleGameStatus(gameId, 'active');
    await distributeFragments(gameId);
    return true;
  }

  // Check if game is full (max participants)
  if (game.participantCount >= game.maxParticipants) {
    await updatePuzzleGameStatus(gameId, 'active');
    await distributeFragments(gameId);
    return true;
  }

  return false;
}

/**
 * Process puzzle engine tick
 * Called each simulation tick to:
 * - Expire old games
 * - Check game activations
 * - Create new games if needed
 */
export async function processPuzzleEngineTick(
  tick: number,
  tenantId: string | null = null
): Promise<{
  expiredCount: number;
  activatedGames: string[];
  newGames: string[];
}> {
  if (!CONFIG.puzzle.enabled) {
    return { expiredCount: 0, activatedGames: [], newGames: [] };
  }

  // Expire old games
  const expiredCount = await expirePuzzleGames(tick);

  // Check active games for activation
  const openGames = await getOpenPuzzleGames(tenantId);
  const activatedGames: string[] = [];

  for (const game of openGames) {
    const activated = await checkGameActivation(game.id, tick);
    if (activated) {
      activatedGames.push(game.id);
    }
  }

  // Create new games if needed (at most one per tick)
  const activeGames = await getActivePuzzleGames(tenantId);
  const newGames: string[] = [];

  // Auto-create puzzles if less than 2 active and enough alive agents
  if (activeGames.length < 2) {
    const aliveAgents = await getAliveAgents();
    if (aliveAgents.length >= 3) {
      // Create a new puzzle with 10% chance per tick (avg 1 per 10 ticks)
      if (Math.random() < 0.1) {
        const newGame = await createNewPuzzleGame(tenantId, tick);
        newGames.push(newGame.id);
      }
    }
  }

  return { expiredCount, activatedGames, newGames };
}

/**
 * Get allowed actions for an agent in a puzzle
 * Returns list of allowed actions if agent is in puzzle (Focus Lock)
 * Returns null if agent is not in any puzzle
 */
export function getAllowedPuzzleActions(): readonly string[] {
  return CONFIG.puzzle.focusLock.allowedActions;
}

/**
 * Get needs decay reduction for agents in puzzles
 */
export function getPuzzleNeedsDecayReduction(): number {
  return CONFIG.puzzle.focusLock.needsDecayReduction;
}
