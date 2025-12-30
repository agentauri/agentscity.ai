/**
 * Replay Store (Phase 3: Time Travel)
 *
 * State management for the time travel replay feature.
 */

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

// =============================================================================
// Types
// =============================================================================

export interface ReplayAgent {
  id: string;
  llmType: string;
  x: number;
  y: number;
  hunger: number;
  energy: number;
  health: number;
  balance: number;
  state: string;
  tick: number;
}

export interface ReplayEvent {
  id: number;
  eventType: string;
  tick: number;
  agentId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface ResourceSpawn {
  id: string;
  x: number;
  y: number;
  resourceType: string;
  currentAmount: number;
  maxAmount: number;
}

export interface Shelter {
  id: string;
  x: number;
  y: number;
  canSleep: boolean;
}

export interface WorldSnapshot {
  tick: number;
  agents: ReplayAgent[];
  resourceSpawns: ResourceSpawn[];
  shelters: Shelter[];
  events: ReplayEvent[];
}

export interface TickRange {
  minTick: number;
  maxTick: number;
  currentTick: number;
  totalEvents: number;
}

export interface AgentTimelineEntry {
  tick: number;
  eventType: string;
  action?: string;
  success?: boolean;
  description: string;
}

// =============================================================================
// Store
// =============================================================================

interface ReplayState {
  // Mode
  isReplayMode: boolean;
  isPlaying: boolean;
  playbackSpeed: number; // 1, 2, 4, 8

  // Data
  tickRange: TickRange | null;
  currentTick: number;
  snapshot: WorldSnapshot | null;
  selectedAgentId: string | null;
  agentTimeline: AgentTimelineEntry[];

  // Loading state
  isLoading: boolean;
  error: string | null;

  // Actions
  enterReplayMode: () => void;
  exitReplayMode: () => void;
  setTickRange: (range: TickRange) => void;
  setCurrentTick: (tick: number) => void;
  setSnapshot: (snapshot: WorldSnapshot) => void;
  setPlaying: (playing: boolean) => void;
  setPlaybackSpeed: (speed: number) => void;
  selectAgent: (id: string | null) => void;
  setAgentTimeline: (timeline: AgentTimelineEntry[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const initialState = {
  isReplayMode: false,
  isPlaying: false,
  playbackSpeed: 1,
  tickRange: null,
  currentTick: 0,
  snapshot: null,
  selectedAgentId: null,
  agentTimeline: [],
  isLoading: false,
  error: null,
};

export const useReplayStore = create<ReplayState>((set) => ({
  ...initialState,

  enterReplayMode: () => set({ isReplayMode: true }),
  exitReplayMode: () => set({ ...initialState }),

  setTickRange: (range) => set({ tickRange: range, currentTick: range.maxTick }),
  setCurrentTick: (tick) => set({ currentTick: tick }),
  setSnapshot: (snapshot) => set({ snapshot }),
  setPlaying: (playing) => set({ isPlaying: playing }),
  setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),
  selectAgent: (id) => set({ selectedAgentId: id }),
  setAgentTimeline: (timeline) => set({ agentTimeline: timeline }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  reset: () => set(initialState),
}));

// =============================================================================
// Selectors
// =============================================================================

export const useIsReplayMode = () => useReplayStore((s) => s.isReplayMode);
export const useIsPlaying = () => useReplayStore((s) => s.isPlaying);
export const usePlaybackSpeed = () => useReplayStore((s) => s.playbackSpeed);
export const useTickRange = () => useReplayStore((s) => s.tickRange);
export const useCurrentTick = () => useReplayStore((s) => s.currentTick);
export const useSnapshot = () => useReplayStore((s) => s.snapshot);
export const useReplayAgents = () => useReplayStore(useShallow((s) => s.snapshot?.agents ?? []));
export const useReplayEvents = () => useReplayStore(useShallow((s) => s.snapshot?.events ?? []));
export const useSelectedReplayAgent = () => {
  const selectedId = useReplayStore((s) => s.selectedAgentId);
  const agents = useReplayStore(useShallow((s) => s.snapshot?.agents ?? []));
  return selectedId ? agents.find((a) => a.id === selectedId) : null;
};
export const useAgentTimeline = () => useReplayStore(useShallow((s) => s.agentTimeline));
export const useReplayLoading = () => useReplayStore((s) => s.isLoading);
export const useReplayError = () => useReplayStore((s) => s.error);

// =============================================================================
// API Functions
// =============================================================================

const API_BASE = 'http://localhost:3000';

export async function fetchTickRange(): Promise<TickRange> {
  const res = await fetch(`${API_BASE}/api/replay/ticks`);
  const data = await res.json();
  return data.range;
}

export async function fetchWorldSnapshot(tick: number): Promise<WorldSnapshot> {
  const res = await fetch(`${API_BASE}/api/replay/tick/${tick}`);
  const data = await res.json();
  return data.snapshot;
}

export async function fetchAgentTimeline(agentId: string, limit = 100): Promise<AgentTimelineEntry[]> {
  const res = await fetch(`${API_BASE}/api/replay/agent/${agentId}/timeline?limit=${limit}`);
  const data = await res.json();
  return data.timeline;
}
