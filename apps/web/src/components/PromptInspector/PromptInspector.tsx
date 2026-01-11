/**
 * PromptInspector - Main container for real-time prompt inspection
 *
 * Phase 2: Live Inspector
 * - Shows status of prompt logging
 * - Agent selector
 * - Timeline of decisions
 * - Detailed prompt viewer
 */

import { useEffect } from 'react';
import {
  usePromptInspectorStore,
  useInspectorStatus,
  useInspectorStatusLoading,
  useInspectorStatusError,
} from '../../stores/promptInspectorStore';
import { AgentSelector } from './AgentSelector';
import { PromptTimeline } from './PromptTimeline';
import { PromptViewer } from './PromptViewer';

export function PromptInspector() {
  const status = useInspectorStatus();
  const statusLoading = useInspectorStatusLoading();
  const statusError = useInspectorStatusError();
  const { fetchStatus } = usePromptInspectorStore();

  // Fetch status on mount
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Loading state
  if (statusLoading) {
    return (
      <div className="h-full flex items-center justify-center text-city-text-muted">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span>Loading inspector status...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (statusError) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6 max-w-md">
          <h3 className="text-red-400 font-medium mb-2">Error Loading Inspector</h3>
          <p className="text-city-text-muted text-sm">{statusError}</p>
          <button
            onClick={() => fetchStatus()}
            className="mt-4 px-4 py-2 bg-city-surface hover:bg-city-surface-hover text-city-text text-sm rounded border border-city-border"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Not enabled state
  if (status && !status.enabled) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="bg-city-surface border border-city-border rounded-lg p-8 max-w-lg text-center">
          <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-city-text mb-2">
            Prompt Logging Disabled
          </h3>
          <p className="text-city-text-muted text-sm mb-4">
            To use the Live Inspector, enable prompt logging in your server configuration.
          </p>
          <div className="bg-city-bg rounded p-3 text-left">
            <code className="text-xs text-city-text font-mono">
              PROMPT_LOGGING_ENABLED=true
            </code>
          </div>
          <p className="text-city-text-muted text-xs mt-4">
            Note: Logging impacts performance. Use only for debugging.
          </p>
        </div>
      </div>
    );
  }

  // No data state
  if (status && status.enabled && !status.hasData) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="bg-city-surface border border-city-border rounded-lg p-8 max-w-lg text-center">
          <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-city-text mb-2">
            No Prompt Logs Yet
          </h3>
          <p className="text-city-text-muted text-sm mb-4">
            Prompt logging is enabled, but no data has been recorded yet.
            Run a simulation tick to generate prompt logs.
          </p>
          <div className="flex items-center justify-center gap-2 text-green-400 text-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>Logging Enabled</span>
          </div>
        </div>
      </div>
    );
  }

  // Main inspector UI
  return (
    <div className="h-full flex flex-col">
      {/* Status bar */}
      <div className="flex-none px-4 py-2 bg-city-surface-hover/50 border-b border-city-border/50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-green-400 text-xs">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span>Live Inspector Active</span>
          </div>
          {status && (
            <span className="text-city-text-muted text-xs">
              Max {status.config.maxLogsPerAgent} logs/agent, {status.config.retentionTicks} tick retention
            </span>
          )}
        </div>
        <button
          onClick={() => fetchStatus()}
          className="text-city-text-muted hover:text-city-text text-xs flex items-center gap-1"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar - Agent selector and timeline */}
        <div className="w-80 flex-none border-r border-city-border flex flex-col bg-city-surface/50">
          {/* Agent selector */}
          <div className="flex-none p-3 border-b border-city-border/50">
            <AgentSelector />
          </div>

          {/* Timeline */}
          <div className="flex-1 overflow-hidden">
            <PromptTimeline />
          </div>
        </div>

        {/* Main content - Prompt viewer */}
        <div className="flex-1 overflow-hidden">
          <PromptViewer />
        </div>
      </div>
    </div>
  );
}
