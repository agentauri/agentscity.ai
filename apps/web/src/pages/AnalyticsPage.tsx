/**
 * AnalyticsPage - Full-screen analytics dashboard
 */

import { useEffect } from 'react';
import { useEditorStore } from '../stores/editor';
import { useFetchSnapshot } from '../stores/analytics';
import { SurvivalPanel } from '../components/Analytics/panels/SurvivalPanel';
import { EconomyPanel } from '../components/Analytics/panels/EconomyPanel';
import { BehaviorPanel } from '../components/Analytics/panels/BehaviorPanel';
import { TemporalPanel } from '../components/Analytics/panels/TemporalPanel';

export function AnalyticsPage() {
  const setMode = useEditorStore((s) => s.setMode);
  const fetchSnapshot = useFetchSnapshot();

  // Auto-refresh data every 30 seconds
  useEffect(() => {
    // Initial fetch
    fetchSnapshot();

    // Set up interval
    const interval = setInterval(() => {
      fetchSnapshot();
    }, 30000);

    return () => clearInterval(interval);
  }, [fetchSnapshot]);

  const handleBackToCity = () => {
    setMode('simulation');
  };

  return (
    <div className="h-screen flex flex-col bg-city-bg">
      {/* Header */}
      <header className="flex-none h-14 bg-city-surface border-b border-city-border px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-city-accent rounded-md flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-white"
            >
              <path d="M3 3v18h18" />
              <path d="m19 9-5 5-4-4-3 3" />
            </svg>
          </div>
          <h1 className="text-base font-semibold text-city-text">
            Analytics Dashboard
          </h1>
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
      </header>

      {/* Main content - 2x2 grid */}
      <main className="flex-1 overflow-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full min-h-[600px]">
          {/* Survival Panel */}
          <section className="bg-city-surface rounded-lg border border-city-border overflow-hidden flex flex-col">
            <div className="flex-none px-4 py-3 border-b border-city-border bg-city-surface-hover/30">
              <h2 className="text-sm font-semibold text-city-text flex items-center gap-2">
                <span className="text-status-success">❤️</span>
                Survival Metrics
              </h2>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <SurvivalPanel />
            </div>
          </section>

          {/* Economy Panel */}
          <section className="bg-city-surface rounded-lg border border-city-border overflow-hidden flex flex-col">
            <div className="flex-none px-4 py-3 border-b border-city-border bg-city-surface-hover/30">
              <h2 className="text-sm font-semibold text-city-text flex items-center gap-2">
                <span className="text-status-warning">💰</span>
                Economy Metrics
              </h2>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <EconomyPanel />
            </div>
          </section>

          {/* Behavior Panel */}
          <section className="bg-city-surface rounded-lg border border-city-border overflow-hidden flex flex-col">
            <div className="flex-none px-4 py-3 border-b border-city-border bg-city-surface-hover/30">
              <h2 className="text-sm font-semibold text-city-text flex items-center gap-2">
                <span className="text-city-accent">🎯</span>
                Behavior Metrics
              </h2>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <BehaviorPanel />
            </div>
          </section>

          {/* Temporal Panel */}
          <section className="bg-city-surface rounded-lg border border-city-border overflow-hidden flex flex-col">
            <div className="flex-none px-4 py-3 border-b border-city-border bg-city-surface-hover/30">
              <h2 className="text-sm font-semibold text-city-text flex items-center gap-2">
                <span className="text-status-info">⏱️</span>
                Temporal Metrics
              </h2>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <TemporalPanel />
            </div>
          </section>
        </div>
      </main>

      {/* Footer with refresh info */}
      <footer className="flex-none h-10 bg-city-surface border-t border-city-border px-4 flex items-center justify-between text-xs text-city-text-muted">
        <span>Auto-refresh every 30 seconds</span>
        <button
          type="button"
          onClick={() => fetchSnapshot()}
          className="hover:text-city-text flex items-center gap-1"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
          </svg>
          Refresh Now
        </button>
      </footer>
    </div>
  );
}
