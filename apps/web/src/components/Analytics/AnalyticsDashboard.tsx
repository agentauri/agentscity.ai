/**
 * AnalyticsDashboard - Main container with tabs
 */

import { useEffect } from 'react';
import {
  useIsAnalyticsVisible,
  useToggleVisibility,
  useActiveTab,
  useSetActiveTab,
  useFetchSnapshot,
  useAnalyticsLoading,
} from '../../stores/analytics';
import { SurvivalPanel } from './panels/SurvivalPanel';
import { EconomyPanel } from './panels/EconomyPanel';
import { BehaviorPanel } from './panels/BehaviorPanel';
import { TemporalPanel } from './panels/TemporalPanel';

const TABS = [
  { key: 'survival', label: 'S', title: 'Survival' },
  { key: 'economy', label: 'E', title: 'Economy' },
  { key: 'behavior', label: 'B', title: 'Behavior' },
  { key: 'temporal', label: 'T', title: 'Temporal' },
] as const;

export function AnalyticsDashboard() {
  const isVisible = useIsAnalyticsVisible();
  const toggleVisibility = useToggleVisibility();
  const activeTab = useActiveTab();
  const setActiveTab = useSetActiveTab();
  const fetchSnapshot = useFetchSnapshot();
  const isLoading = useAnalyticsLoading();

  // Fetch data on mount and every 30 seconds
  useEffect(() => {
    if (isVisible) {
      fetchSnapshot();
      const interval = setInterval(fetchSnapshot, 30000);
      return () => clearInterval(interval);
    }
  }, [isVisible, fetchSnapshot]);

  // Closed state - just show toggle button
  if (!isVisible) {
    return (
      <button
        onClick={toggleVisibility}
        className="fixed bottom-4 left-4 z-50 bg-city-surface border border-city-border rounded-lg px-3 py-2 text-sm text-city-text hover:bg-city-surface-hover transition-colors"
      >
        📊 Analytics
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 left-4 z-50 w-[400px] max-h-[450px] bg-city-surface border border-city-border rounded-lg shadow-lg overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-city-border bg-city-surface-alt">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-city-text">📊 Analytics</span>
          {isLoading && (
            <span className="text-xs text-city-text-muted animate-pulse">Loading...</span>
          )}
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              title={tab.title}
              className={`w-6 h-6 rounded text-xs font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-city-accent text-white'
                  : 'bg-city-surface text-city-text-muted hover:bg-city-surface-hover'
              }`}
            >
              {tab.label}
            </button>
          ))}

          {/* Close button */}
          <button
            onClick={toggleVisibility}
            className="w-6 h-6 ml-2 rounded text-xs text-city-text-muted hover:bg-city-surface-hover transition-colors"
          >
            ×
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === 'survival' && <SurvivalPanel />}
        {activeTab === 'economy' && <EconomyPanel />}
        {activeTab === 'behavior' && <BehaviorPanel />}
        {activeTab === 'temporal' && <TemporalPanel />}
      </div>
    </div>
  );
}
