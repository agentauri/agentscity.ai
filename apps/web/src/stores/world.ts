import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

// =============================================================================
// Types
// =============================================================================

export interface Agent {
  id: string;
  llmType: string;
  x: number;
  y: number;
  hunger: number;
  energy: number;
  health: number;
  balance: number;
  state: string;
  color: string;
}

export interface Location {
  id: string;
  name: string;
  type: 'residential' | 'commercial' | 'industrial' | 'civic';
  x: number;
  y: number;
}

export interface WorldEvent {
  id: string;
  type: string;
  tick: number;
  timestamp: number;
  agentId?: string;
  payload: Record<string, unknown>;
}

// =============================================================================
// Store
// =============================================================================

interface WorldState {
  // World data
  tick: number;
  agents: Agent[];
  locations: Location[];
  events: WorldEvent[];

  // UI state
  selectedAgentId: string | null;
  cameraX: number;
  cameraY: number;
  zoom: number;

  // Actions
  setWorldState: (state: { tick: number; agents: Agent[]; locations: Location[] }) => void;
  setTick: (tick: number) => void;
  updateAgent: (id: string, updates: Partial<Agent>) => void;
  addEvent: (event: WorldEvent) => void;
  selectAgent: (id: string | null) => void;
  setCamera: (x: number, y: number) => void;
  setZoom: (zoom: number) => void;
}

export const useWorldStore = create<WorldState>((set) => ({
  // Initial state
  tick: 0,
  agents: [],
  locations: [],
  events: [],
  selectedAgentId: null,
  cameraX: 0,
  cameraY: 0,
  zoom: 1,

  // Actions
  setWorldState: (state) =>
    set({
      tick: state.tick,
      agents: state.agents,
      locations: state.locations,
    }),

  setTick: (tick) => set({ tick }),

  updateAgent: (id, updates) =>
    set((state) => ({
      agents: state.agents.map((a) => (a.id === id ? { ...a, ...updates } : a)),
    })),

  addEvent: (event) =>
    set((state) => ({
      events: [event, ...state.events].slice(0, 100), // Keep last 100 events
    })),

  selectAgent: (id) => set({ selectedAgentId: id }),

  setCamera: (x, y) => set({ cameraX: x, cameraY: y }),

  setZoom: (zoom) => set({ zoom: Math.max(0.5, Math.min(2, zoom)) }),
}));

// =============================================================================
// Selectors (using useShallow to prevent infinite loops in React 19)
// =============================================================================

export const useAgent = (id: string) =>
  useWorldStore((state) => state.agents.find((a) => a.id === id));

export const useSelectedAgent = () =>
  useWorldStore((state) =>
    state.selectedAgentId
      ? state.agents.find((a) => a.id === state.selectedAgentId)
      : null
  );

export const useAgents = () =>
  useWorldStore(useShallow((state) => state.agents));

export const useLocations = () =>
  useWorldStore(useShallow((state) => state.locations));

export const useEvents = () =>
  useWorldStore(useShallow((state) => state.events));

export const useAliveAgents = () => {
  const agents = useWorldStore(useShallow((state) => state.agents));
  return agents.filter((a) => a.health > 0);
};

export const useRecentEvents = (limit = 20) => {
  const events = useWorldStore(useShallow((state) => state.events));
  return events.slice(0, limit);
};
