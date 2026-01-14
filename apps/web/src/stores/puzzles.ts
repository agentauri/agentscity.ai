/**
 * Puzzles Store - Zustand store for puzzle games state management
 */

import { create } from 'zustand';

// =============================================================================
// Types
// =============================================================================

export interface PuzzleGame {
  id: string;
  gameType: string;
  status: 'open' | 'active' | 'completed' | 'expired';
  prizePool: number;
  entryStake: number;
  startsAtTick: number;
  endsAtTick: number;
  participantCount: number;
  fragmentCount: number;
  winnerId: string | null;
}

export interface PuzzleParticipant {
  id: string;
  agentId: string;
  agentName: string;
  agentColor: string;
  teamId: string | null;
  stakeAmount: number;
  contributionScore: number;
  fragmentsShared: number;
  attemptsMade: number;
}

export interface PuzzleTeam {
  id: string;
  name: string;
  status: string;
  totalStake: number;
  leader: { id: string; name: string } | null;
  members: {
    agentId: string;
    agentName: string;
    agentColor: string;
    contributionScore: number;
    fragmentsShared: number;
  }[];
  memberCount: number;
}

export interface PuzzleFragment {
  id: string;
  fragmentIndex: number;
  content: string;
  owner: { id: string; name: string; color: string } | null;
  originalOwner: { id: string; name: string } | null;
  sharedWith: { agentId: string; agentName: string }[];
  sharedCount: number;
}

export interface PuzzleAttempt {
  id: string;
  submitterId: string;
  submitterName: string;
  attemptedSolution: string;
  isCorrect: boolean;
  submittedAtTick: number;
}

export interface PuzzleDetails {
  puzzle: PuzzleGame & { solution: string | null };
  participants: PuzzleParticipant[];
  teams: PuzzleTeam[];
  fragments: PuzzleFragment[];
}

export interface PuzzleResults {
  puzzle: { id: string; gameType: string; status: string; prizePool: number; solution: string | null };
  winner: {
    agentId: string;
    agentName: string;
    solution: string;
    submittedAtTick: number;
  } | null;
  attempts: PuzzleAttempt[];
  prizeDistribution: {
    agentId: string;
    agentName: string;
    contributionScore: number;
    fragmentsShared: number;
    attemptsMade: number;
    prizeAmount: number;
    isWinner: boolean;
  }[];
}

export interface PuzzleStats {
  totalGames: number;
  activeGames: number;
  completedGames: number;
  expiredGames: number;
  totalPrizeDistributed: number;
  averageParticipants: number;
}

export type PuzzleFilter = 'all' | 'active' | 'completed' | 'expired';

export interface PuzzlesState {
  // Data
  puzzles: PuzzleGame[];
  selectedPuzzleId: string | null;
  selectedPuzzleDetails: PuzzleDetails | null;
  selectedPuzzleResults: PuzzleResults | null;
  stats: PuzzleStats | null;

  // UI State
  filter: PuzzleFilter;
  isLoading: boolean;
  error: string | null;

  // Actions
  setPuzzles: (puzzles: PuzzleGame[]) => void;
  setSelectedPuzzle: (id: string | null, details: PuzzleDetails | null) => void;
  setSelectedPuzzleResults: (results: PuzzleResults | null) => void;
  setStats: (stats: PuzzleStats | null) => void;
  setFilter: (filter: PuzzleFilter) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

// =============================================================================
// Store
// =============================================================================

export const usePuzzlesStore = create<PuzzlesState>((set) => ({
  // Initial state
  puzzles: [],
  selectedPuzzleId: null,
  selectedPuzzleDetails: null,
  selectedPuzzleResults: null,
  stats: null,
  filter: 'all',
  isLoading: false,
  error: null,

  // Actions
  setPuzzles: (puzzles) => set({ puzzles }),

  setSelectedPuzzle: (id, details) => set({
    selectedPuzzleId: id,
    selectedPuzzleDetails: details,
    selectedPuzzleResults: null, // Clear results when selecting new puzzle
  }),

  setSelectedPuzzleResults: (results) => set({ selectedPuzzleResults: results }),

  setStats: (stats) => set({ stats }),

  setFilter: (filter) => set({ filter }),

  setLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error }),

  reset: () => set({
    puzzles: [],
    selectedPuzzleId: null,
    selectedPuzzleDetails: null,
    selectedPuzzleResults: null,
    stats: null,
    filter: 'all',
    isLoading: false,
    error: null,
  }),
}));

// =============================================================================
// Selectors
// =============================================================================

export const usePuzzles = () => usePuzzlesStore((s) => s.puzzles);
export const useSelectedPuzzleId = () => usePuzzlesStore((s) => s.selectedPuzzleId);
export const useSelectedPuzzleDetails = () => usePuzzlesStore((s) => s.selectedPuzzleDetails);
export const useSelectedPuzzleResults = () => usePuzzlesStore((s) => s.selectedPuzzleResults);
export const usePuzzleStats = () => usePuzzlesStore((s) => s.stats);
export const usePuzzleFilter = () => usePuzzlesStore((s) => s.filter);
export const usePuzzlesLoading = () => usePuzzlesStore((s) => s.isLoading);
export const usePuzzlesError = () => usePuzzlesStore((s) => s.error);

// Note: Derived selectors removed to prevent infinite re-render loops.
// Use useMemo in components to filter puzzles instead.
