/**
 * Prompt Inspector Store
 *
 * Phase 2: Live Inspector - State management for prompt inspection
 *
 * Features:
 * - Fetches prompt logs from backend
 * - Caches logs for quick access
 * - Provides timeline and detail views
 */

import { create } from 'zustand';

// =============================================================================
// Types
// =============================================================================

export interface PromptDecision {
  action: string;
  params?: Record<string, unknown>;
  reasoning?: string;
}

export interface PromptLog {
  id: number;
  agentId: string;
  tick: number;
  systemPrompt: string;
  observationPrompt: string;
  fullPrompt: string;
  decision: PromptDecision | null;
  rawResponse: string | null;
  llmType: string;
  personality: string | null;
  promptMode: 'prescriptive' | 'emergent';
  safetyLevel: 'standard' | 'minimal' | 'none';
  inputTokens: number | null;
  outputTokens: number | null;
  processingTimeMs: number | null;
  usedFallback: boolean;
  usedCache: boolean;
  createdAt: string;
}

export interface TimelineSummary {
  id: number;
  agentId: string;
  tick: number;
  llmType: string;
  action: string | null;
  processingTimeMs: number | null;
  usedFallback: boolean;
  usedCache: boolean;
  createdAt: string;
}

export interface InspectorConfig {
  maxLogsPerAgent: number;
  retentionTicks: number;
}

export interface InspectorStatus {
  enabled: boolean;
  hasData: boolean;
  config: InspectorConfig;
}

interface PromptInspectorState {
  // Status
  status: InspectorStatus | null;
  statusLoading: boolean;
  statusError: string | null;

  // Selected agent
  selectedAgentId: string | null;

  // Timeline data
  timeline: TimelineSummary[];
  timelineLoading: boolean;
  timelineError: string | null;

  // Current log detail
  currentLog: PromptLog | null;
  currentLogLoading: boolean;
  currentLogError: string | null;

  // Actions
  fetchStatus: () => Promise<void>;
  setSelectedAgent: (agentId: string | null) => void;
  fetchTimeline: (agentId: string) => Promise<void>;
  fetchLogDetail: (agentId: string, tick: number) => Promise<void>;
  fetchCurrentLog: (agentId: string) => Promise<void>;
  clearSelection: () => void;
}

// =============================================================================
// API Functions
// =============================================================================

const API_BASE = '';

async function fetchInspectorStatus(): Promise<InspectorStatus> {
  const response = await fetch(`${API_BASE}/api/prompt/inspector/status`);
  if (!response.ok) {
    throw new Error(`Failed to fetch inspector status: ${response.statusText}`);
  }
  return response.json();
}

interface TimelineResponse {
  success: boolean;
  data: TimelineSummary[];
  error?: string;
}

async function fetchTimelineAPI(agentId: string, limit = 50): Promise<TimelineSummary[]> {
  const response = await fetch(`${API_BASE}/api/prompt/inspector/${agentId}/timeline?limit=${limit}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch timeline: ${response.statusText}`);
  }
  const result: TimelineResponse = await response.json();
  if (!result.success) {
    throw new Error(result.error ?? 'Failed to fetch timeline');
  }
  return result.data;
}

interface LogResponse {
  success: boolean;
  data: PromptLog | null;
  error?: string;
}

async function fetchLogByTickAPI(agentId: string, tick: number): Promise<PromptLog | null> {
  const response = await fetch(`${API_BASE}/api/prompt/inspector/${agentId}/tick/${tick}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch log: ${response.statusText}`);
  }
  const result: LogResponse = await response.json();
  if (!result.success) {
    throw new Error(result.error ?? 'Failed to fetch log');
  }
  return result.data;
}

async function fetchCurrentLogAPI(agentId: string): Promise<PromptLog | null> {
  const response = await fetch(`${API_BASE}/api/prompt/inspector/${agentId}/current`);
  if (!response.ok) {
    throw new Error(`Failed to fetch current log: ${response.statusText}`);
  }
  const result: LogResponse = await response.json();
  if (!result.success) {
    throw new Error(result.error ?? 'Failed to fetch current log');
  }
  return result.data;
}

// =============================================================================
// Store
// =============================================================================

export const usePromptInspectorStore = create<PromptInspectorState>((set, get) => ({
  // Initial state
  status: null,
  statusLoading: false,
  statusError: null,
  selectedAgentId: null,
  timeline: [],
  timelineLoading: false,
  timelineError: null,
  currentLog: null,
  currentLogLoading: false,
  currentLogError: null,

  // Fetch inspector status
  fetchStatus: async () => {
    set({ statusLoading: true, statusError: null });
    try {
      const status = await fetchInspectorStatus();
      set({ status, statusLoading: false });
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to fetch status';
      set({ statusError: error, statusLoading: false });
      console.error('[PromptInspector] Status error:', e);
    }
  },

  // Set selected agent
  setSelectedAgent: (agentId: string | null) => {
    set({
      selectedAgentId: agentId,
      timeline: [],
      currentLog: null,
      timelineError: null,
      currentLogError: null,
    });

    // Auto-fetch timeline when agent is selected
    if (agentId) {
      get().fetchTimeline(agentId);
    }
  },

  // Fetch timeline for agent
  fetchTimeline: async (agentId: string) => {
    set({ timelineLoading: true, timelineError: null });
    try {
      const timeline = await fetchTimelineAPI(agentId);
      set({ timeline, timelineLoading: false });

      // Auto-fetch most recent log detail
      if (timeline.length > 0) {
        get().fetchLogDetail(agentId, timeline[0].tick);
      }
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to fetch timeline';
      set({ timelineError: error, timelineLoading: false });
      console.error('[PromptInspector] Timeline error:', e);
    }
  },

  // Fetch specific log detail
  fetchLogDetail: async (agentId: string, tick: number) => {
    set({ currentLogLoading: true, currentLogError: null });
    try {
      const log = await fetchLogByTickAPI(agentId, tick);
      set({ currentLog: log, currentLogLoading: false });
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to fetch log detail';
      set({ currentLogError: error, currentLogLoading: false });
      console.error('[PromptInspector] Log detail error:', e);
    }
  },

  // Fetch current (most recent) log
  fetchCurrentLog: async (agentId: string) => {
    set({ currentLogLoading: true, currentLogError: null });
    try {
      const log = await fetchCurrentLogAPI(agentId);
      set({ currentLog: log, currentLogLoading: false });
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to fetch current log';
      set({ currentLogError: error, currentLogLoading: false });
      console.error('[PromptInspector] Current log error:', e);
    }
  },

  // Clear selection
  clearSelection: () => {
    set({
      selectedAgentId: null,
      timeline: [],
      currentLog: null,
      timelineError: null,
      currentLogError: null,
    });
  },
}));

// =============================================================================
// Selectors
// =============================================================================

export const useInspectorStatus = () => usePromptInspectorStore((state) => state.status);
export const useInspectorStatusLoading = () => usePromptInspectorStore((state) => state.statusLoading);
export const useInspectorStatusError = () => usePromptInspectorStore((state) => state.statusError);

export const useSelectedAgentId = () => usePromptInspectorStore((state) => state.selectedAgentId);

export const useInspectorTimeline = () => usePromptInspectorStore((state) => state.timeline);
export const useInspectorTimelineLoading = () => usePromptInspectorStore((state) => state.timelineLoading);
export const useInspectorTimelineError = () => usePromptInspectorStore((state) => state.timelineError);

export const useCurrentPromptLog = () => usePromptInspectorStore((state) => state.currentLog);
export const useCurrentLogLoading = () => usePromptInspectorStore((state) => state.currentLogLoading);
export const useCurrentLogError = () => usePromptInspectorStore((state) => state.currentLogError);

export const useIsInspectorEnabled = () =>
  usePromptInspectorStore((state) => state.status?.enabled ?? false);
export const useHasInspectorData = () =>
  usePromptInspectorStore((state) => state.status?.hasData ?? false);
