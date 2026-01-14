/**
 * PuzzlesPage - Full-screen puzzle games viewer
 *
 * Features:
 * - List all puzzle games (active, completed, expired)
 * - View puzzle details, participants, teams, fragments
 * - View results and prize distribution
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { useEditorStore } from '../stores/editor';
import {
  usePuzzlesStore,
  usePuzzles,
  useSelectedPuzzleDetails,
  useSelectedPuzzleResults,
  usePuzzleStats,
  usePuzzlesLoading,
  usePuzzlesError,
  usePuzzleFilter,
} from '../stores/puzzles';
import { usePuzzlesAPI } from '../hooks/usePuzzles';

type TabId = 'active' | 'history' | 'stats';

export function PuzzlesPage() {
  const setMode = useEditorStore((s) => s.setMode);
  const [activeTab, setActiveTab] = useState<TabId>('active');

  const allPuzzles = usePuzzles();
  const filter = usePuzzleFilter();
  const selectedDetails = useSelectedPuzzleDetails();
  const selectedResults = useSelectedPuzzleResults();
  const stats = usePuzzleStats();
  const isLoading = usePuzzlesLoading();
  const error = usePuzzlesError();

  // Filter puzzles with useMemo to avoid creating new arrays on every render
  const puzzles = useMemo(() => {
    if (filter === 'all') return allPuzzles;
    if (filter === 'active') return allPuzzles.filter((p) => p.status === 'open' || p.status === 'active');
    return allPuzzles.filter((p) => p.status === filter);
  }, [allPuzzles, filter]);

  const setFilter = usePuzzlesStore((s) => s.setFilter);
  const { fetchPuzzles, fetchStats, selectPuzzle, fetchPuzzleResults, clearSelection } = usePuzzlesAPI();

  // Track if initial load has happened
  const hasLoadedRef = useRef(false);

  // Load data on mount (only once)
  useEffect(() => {
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      fetchPuzzles('all');
      fetchStats();
    }
  }, []);

  // Handle tab change
  useEffect(() => {
    if (!hasLoadedRef.current) return; // Skip during initial mount

    if (activeTab === 'active') {
      setFilter('active');
      fetchPuzzles('active');
    } else if (activeTab === 'history') {
      setFilter('all');
      fetchPuzzles('all');
    }
    clearSelection();
  }, [activeTab]);

  const handleBackToCity = () => {
    setMode('simulation');
  };

  const handleSelectPuzzle = async (puzzleId: string) => {
    await selectPuzzle(puzzleId);
    await fetchPuzzleResults(puzzleId);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-green-500/20 text-green-400';
      case 'active':
        return 'bg-blue-500/20 text-blue-400';
      case 'completed':
        return 'bg-purple-500/20 text-purple-400';
      case 'expired':
        return 'bg-gray-500/20 text-gray-400';
      default:
        return 'bg-gray-500/20 text-gray-400';
    }
  };

  const getGameTypeIcon = (gameType: string) => {
    switch (gameType) {
      case 'coordinates':
        return '📍';
      case 'password':
        return '🔐';
      case 'logic':
        return '🧠';
      default:
        return '🧩';
    }
  };

  return (
    <div className="h-screen flex flex-col bg-city-bg">
      {/* Header */}
      <header className="flex-none h-14 bg-city-surface border-b border-city-border px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-amber-600 rounded-md flex items-center justify-center text-lg">
            🧩
          </div>
          <div>
            <h1 className="text-base font-semibold text-city-text">Puzzle Games</h1>
            <p className="text-[10px] text-city-text-muted">
              Fragment Chase - Cooperative puzzles
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Tab buttons */}
          <div className="flex bg-city-bg rounded-lg p-0.5 border border-city-border">
            <button
              onClick={() => setActiveTab('active')}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                activeTab === 'active'
                  ? 'bg-city-surface text-city-text'
                  : 'text-city-text-muted hover:text-city-text'
              }`}
            >
              Active
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                activeTab === 'history'
                  ? 'bg-city-surface text-city-text'
                  : 'text-city-text-muted hover:text-city-text'
              }`}
            >
              History
            </button>
            <button
              onClick={() => setActiveTab('stats')}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                activeTab === 'stats'
                  ? 'bg-city-surface text-city-text'
                  : 'text-city-text-muted hover:text-city-text'
              }`}
            >
              Stats
            </button>
          </div>

          <button
            type="button"
            onClick={handleBackToCity}
            className="px-4 py-1.5 bg-city-surface-hover hover:bg-city-border/50 text-city-text text-xs font-medium rounded border border-city-border/50 flex items-center gap-2"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m12 19-7-7 7-7" />
              <path d="M19 12H5" />
            </svg>
            Back to City
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-hidden flex">
        {/* Left panel - Puzzle list */}
        <div className="w-1/3 border-r border-city-border overflow-y-auto">
          {isLoading && puzzles.length === 0 ? (
            <div className="p-4 text-center text-city-text-muted">Loading...</div>
          ) : error ? (
            <div className="p-4 text-center text-red-400">{error}</div>
          ) : activeTab === 'stats' ? (
            <div className="p-4">
              <h3 className="text-sm font-semibold text-city-text mb-4">Overall Statistics</h3>
              {stats ? (
                <div className="space-y-3">
                  <div className="bg-city-surface rounded-lg p-3">
                    <div className="text-2xl font-bold text-city-text">{stats.totalGames}</div>
                    <div className="text-xs text-city-text-muted">Total Games</div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-city-surface rounded-lg p-2 text-center">
                      <div className="text-lg font-bold text-green-400">{stats.activeGames}</div>
                      <div className="text-[10px] text-city-text-muted">Active</div>
                    </div>
                    <div className="bg-city-surface rounded-lg p-2 text-center">
                      <div className="text-lg font-bold text-purple-400">{stats.completedGames}</div>
                      <div className="text-[10px] text-city-text-muted">Completed</div>
                    </div>
                    <div className="bg-city-surface rounded-lg p-2 text-center">
                      <div className="text-lg font-bold text-gray-400">{stats.expiredGames}</div>
                      <div className="text-[10px] text-city-text-muted">Expired</div>
                    </div>
                  </div>
                  <div className="bg-city-surface rounded-lg p-3">
                    <div className="text-xl font-bold text-amber-400">{(stats.totalPrizeDistributed ?? 0).toFixed(0)} CITY</div>
                    <div className="text-xs text-city-text-muted">Total Prize Distributed</div>
                  </div>
                  <div className="bg-city-surface rounded-lg p-3">
                    <div className="text-xl font-bold text-city-text">{(stats.averageParticipants ?? 0).toFixed(1)}</div>
                    <div className="text-xs text-city-text-muted">Avg Participants per Game</div>
                  </div>
                </div>
              ) : (
                <div className="text-city-text-muted text-sm">No stats available</div>
              )}
            </div>
          ) : puzzles.length === 0 ? (
            <div className="p-4 text-center text-city-text-muted">
              {activeTab === 'active' ? 'No active puzzles' : 'No puzzles found'}
            </div>
          ) : (
            <div className="divide-y divide-city-border">
              {puzzles.map((puzzle) => (
                <button
                  key={puzzle.id}
                  onClick={() => handleSelectPuzzle(puzzle.id)}
                  className={`w-full p-3 text-left hover:bg-city-surface transition-colors ${
                    selectedDetails?.puzzle.id === puzzle.id ? 'bg-city-surface' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{getGameTypeIcon(puzzle.gameType)}</span>
                      <div>
                        <div className="text-sm font-medium text-city-text capitalize">
                          {puzzle.gameType} Puzzle
                        </div>
                        <div className="text-xs text-city-text-muted">
                          {puzzle.participantCount} participants
                        </div>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 text-[10px] font-medium rounded ${getStatusColor(puzzle.status)}`}>
                      {puzzle.status}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs text-city-text-muted">
                    <span>Prize: {(puzzle.prizePool ?? 0).toFixed(0)} CITY</span>
                    <span>Entry: {(puzzle.entryStake ?? 0).toFixed(0)} CITY</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right panel - Puzzle details */}
        <div className="flex-1 overflow-y-auto p-4">
          {selectedDetails ? (
            <div className="space-y-4">
              {/* Puzzle header */}
              <div className="bg-city-surface rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{getGameTypeIcon(selectedDetails.puzzle.gameType)}</span>
                    <div>
                      <h2 className="text-lg font-semibold text-city-text capitalize">
                        {selectedDetails.puzzle.gameType} Puzzle
                      </h2>
                      <div className="text-xs text-city-text-muted">
                        Tick {selectedDetails.puzzle.startsAtTick} - {selectedDetails.puzzle.endsAtTick}
                      </div>
                    </div>
                  </div>
                  <span className={`px-3 py-1 text-sm font-medium rounded ${getStatusColor(selectedDetails.puzzle.status)}`}>
                    {selectedDetails.puzzle.status}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-xl font-bold text-amber-400">{(selectedDetails.puzzle.prizePool ?? 0).toFixed(0)} CITY</div>
                    <div className="text-xs text-city-text-muted">Prize Pool</div>
                  </div>
                  <div>
                    <div className="text-xl font-bold text-city-text">{(selectedDetails.puzzle.entryStake ?? 0).toFixed(0)} CITY</div>
                    <div className="text-xs text-city-text-muted">Entry Stake</div>
                  </div>
                  <div>
                    <div className="text-xl font-bold text-city-text">{selectedDetails.puzzle.fragmentCount}</div>
                    <div className="text-xs text-city-text-muted">Fragments</div>
                  </div>
                </div>
                {selectedDetails.puzzle.solution && (
                  <div className="mt-3 p-2 bg-green-500/10 rounded border border-green-500/30">
                    <div className="text-xs text-green-400 font-medium">Solution</div>
                    <div className="text-sm text-city-text font-mono">{selectedDetails.puzzle.solution}</div>
                  </div>
                )}
              </div>

              {/* Participants */}
              <div className="bg-city-surface rounded-lg p-4">
                <h3 className="text-sm font-semibold text-city-text mb-3">
                  Participants ({selectedDetails.participants.length})
                </h3>
                {selectedDetails.participants.length === 0 ? (
                  <div className="text-city-text-muted text-sm">No participants yet</div>
                ) : (
                  <div className="space-y-2">
                    {selectedDetails.participants.map((p) => (
                      <div key={p.id} className="flex items-center justify-between p-2 bg-city-bg rounded">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: p.agentColor }}
                          />
                          <span className="text-sm text-city-text">{p.agentName}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-city-text-muted">
                          <span>Score: {p.contributionScore?.toFixed(2) || 0}</span>
                          <span>Shared: {p.fragmentsShared}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Fragments */}
              <div className="bg-city-surface rounded-lg p-4">
                <h3 className="text-sm font-semibold text-city-text mb-3">
                  Fragments ({selectedDetails.fragments.length})
                </h3>
                {selectedDetails.fragments.length === 0 ? (
                  <div className="text-city-text-muted text-sm">No fragments</div>
                ) : (
                  <div className="space-y-2">
                    {selectedDetails.fragments.map((f) => (
                      <div key={f.id} className="p-2 bg-city-bg rounded">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-city-text-muted">#{f.fragmentIndex + 1}</span>
                            <code className="text-sm text-city-text bg-city-surface px-2 py-0.5 rounded">
                              {f.content}
                            </code>
                          </div>
                          {f.owner && (
                            <div className="flex items-center gap-1">
                              <div
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: f.owner.color }}
                              />
                              <span className="text-xs text-city-text-muted">{f.owner.name}</span>
                            </div>
                          )}
                        </div>
                        {f.sharedCount > 0 && (
                          <div className="mt-1 text-xs text-city-text-muted">
                            Shared with {f.sharedCount} agent{f.sharedCount > 1 ? 's' : ''}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Teams */}
              {selectedDetails.teams.length > 0 && (
                <div className="bg-city-surface rounded-lg p-4">
                  <h3 className="text-sm font-semibold text-city-text mb-3">
                    Teams ({selectedDetails.teams.length})
                  </h3>
                  <div className="space-y-2">
                    {selectedDetails.teams.map((team) => (
                      <div key={team.id} className="p-2 bg-city-bg rounded">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-city-text">{team.name}</span>
                          <span className={`px-2 py-0.5 text-[10px] rounded ${getStatusColor(team.status)}`}>
                            {team.status}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {team.members.map((m) => (
                            <span
                              key={m.agentId}
                              className="px-2 py-0.5 text-xs bg-city-surface rounded text-city-text-muted"
                            >
                              {m.agentName}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Results (for completed puzzles) */}
              {selectedResults && selectedResults.winner && (
                <div className="bg-city-surface rounded-lg p-4 border border-amber-500/30">
                  <h3 className="text-sm font-semibold text-amber-400 mb-3 flex items-center gap-2">
                    <span>🏆</span> Winner
                  </h3>
                  <div className="p-3 bg-amber-500/10 rounded">
                    <div className="text-lg font-bold text-city-text">{selectedResults.winner.agentName}</div>
                    <div className="text-xs text-city-text-muted">
                      Submitted at tick {selectedResults.winner.submittedAtTick}
                    </div>
                  </div>

                  {selectedResults.prizeDistribution.length > 0 && (
                    <div className="mt-4">
                      <h4 className="text-xs font-medium text-city-text-muted mb-2">Prize Distribution</h4>
                      <div className="space-y-1">
                        {selectedResults.prizeDistribution.map((p) => (
                          <div key={p.agentId} className="flex items-center justify-between p-2 bg-city-bg rounded">
                            <div className="flex items-center gap-2">
                              {p.isWinner && <span>🏆</span>}
                              <span className="text-sm text-city-text">{p.agentName}</span>
                            </div>
                            <span className="text-sm font-medium text-amber-400">
                              +{(p.prizeAmount ?? 0).toFixed(0)} CITY
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-city-text-muted">
              {activeTab === 'stats' ? (
                <div className="text-center">
                  <div className="text-4xl mb-2">📊</div>
                  <div>View overall puzzle statistics</div>
                </div>
              ) : (
                <div className="text-center">
                  <div className="text-4xl mb-2">🧩</div>
                  <div>Select a puzzle to view details</div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="flex-none h-10 bg-city-surface border-t border-city-border px-4 flex items-center justify-between text-xs text-city-text-muted">
        <span>Fragment Chase - Cooperative puzzle system</span>
        <span>
          {stats ? `${stats.activeGames} active, ${stats.completedGames} completed` : 'Loading...'}
        </span>
      </footer>
    </div>
  );
}
