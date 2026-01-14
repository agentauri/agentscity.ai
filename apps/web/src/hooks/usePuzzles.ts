/**
 * usePuzzles Hook - Data fetching and management for puzzle games
 */

import { useCallback } from 'react';
import {
  usePuzzlesStore,
  type PuzzleGame,
  type PuzzleDetails,
  type PuzzleResults,
  type PuzzleStats,
  type PuzzleFilter,
} from '../stores/puzzles';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Get stable action references from the store (not reactive, actions don't change)
const getStoreActions = () => {
  const store = usePuzzlesStore.getState();
  return {
    setPuzzles: store.setPuzzles,
    setSelectedPuzzle: store.setSelectedPuzzle,
    setSelectedPuzzleResults: store.setSelectedPuzzleResults,
    setStats: store.setStats,
    setFilter: store.setFilter,
    setLoading: store.setLoading,
    setError: store.setError,
  };
};

export function usePuzzlesAPI() {

  /**
   * Fetch all puzzles with optional status filter
   */
  const fetchPuzzles = useCallback(async (filter: PuzzleFilter = 'all') => {
    const { setPuzzles, setFilter, setLoading, setError } = getStoreActions();
    setLoading(true);
    setError(null);

    try {
      const url = new URL(`${API_BASE}/api/puzzles`);
      if (filter !== 'all') {
        url.searchParams.set('status', filter);
      }

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`Failed to fetch puzzles: ${response.statusText}`);
      }

      const data = await response.json();
      setPuzzles(data.puzzles as PuzzleGame[]);
      setFilter(filter);
    } catch (error) {
      console.error('[usePuzzles] Error fetching puzzles:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch puzzles');
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Fetch details for a specific puzzle
   */
  const fetchPuzzleDetails = useCallback(async (puzzleId: string) => {
    const { setSelectedPuzzle, setLoading, setError } = getStoreActions();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/puzzles/${puzzleId}`);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Puzzle not found');
        }
        throw new Error(`Failed to fetch puzzle details: ${response.statusText}`);
      }

      const data = await response.json();
      setSelectedPuzzle(puzzleId, data as PuzzleDetails);
    } catch (error) {
      console.error('[usePuzzles] Error fetching puzzle details:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch puzzle details');
      setSelectedPuzzle(null, null);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Fetch results for a specific puzzle
   */
  const fetchPuzzleResults = useCallback(async (puzzleId: string) => {
    const { setSelectedPuzzleResults, setLoading, setError } = getStoreActions();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/puzzles/${puzzleId}/results`);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Puzzle not found');
        }
        throw new Error(`Failed to fetch puzzle results: ${response.statusText}`);
      }

      const data = await response.json();
      setSelectedPuzzleResults(data as PuzzleResults);
    } catch (error) {
      console.error('[usePuzzles] Error fetching puzzle results:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch puzzle results');
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Fetch overall puzzle statistics
   */
  const fetchStats = useCallback(async () => {
    const { setStats } = getStoreActions();
    try {
      const response = await fetch(`${API_BASE}/api/puzzles/stats`);
      if (!response.ok) {
        throw new Error(`Failed to fetch stats: ${response.statusText}`);
      }

      const data = await response.json();
      setStats(data as PuzzleStats);
    } catch (error) {
      console.error('[usePuzzles] Error fetching stats:', error);
      // Don't set error for stats - it's not critical
    }
  }, []);

  /**
   * Select a puzzle and fetch its details
   */
  const selectPuzzle = useCallback(async (puzzleId: string | null) => {
    const { setSelectedPuzzle } = getStoreActions();
    if (!puzzleId) {
      setSelectedPuzzle(null, null);
      return;
    }
    await fetchPuzzleDetails(puzzleId);
  }, [fetchPuzzleDetails]);

  /**
   * Refresh all data
   */
  const refresh = useCallback(async (filter: PuzzleFilter = 'all') => {
    await Promise.all([
      fetchPuzzles(filter),
      fetchStats(),
    ]);
  }, [fetchPuzzles, fetchStats]);

  /**
   * Clear selection
   */
  const clearSelection = useCallback(() => {
    const { setSelectedPuzzle } = getStoreActions();
    setSelectedPuzzle(null, null);
  }, []);

  return {
    fetchPuzzles,
    fetchPuzzleDetails,
    fetchPuzzleResults,
    fetchStats,
    selectPuzzle,
    refresh,
    clearSelection,
  };
}
