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

// Scientific model types
export interface ResourceSpawn {
  id: string;
  x: number;
  y: number;
  resourceType: 'food' | 'energy' | 'material';
  currentAmount: number;
  maxAmount: number;
}

export interface Shelter {
  id: string;
  x: number;
  y: number;
  canSleep: boolean;
}

export interface WorldEvent {
  id: string;
  type: string;
  tick: number;
  timestamp: number;
  agentId?: string;
  payload: Record<string, unknown>;
}

export interface AgentBubble {
  agentId: string;
  text: string;
  emoji: string;
  timestamp: number;
}

// =============================================================================
// Store
// =============================================================================

interface WorldState {
  // World data
  tick: number;
  agents: Agent[];
  locations: Location[]; // Legacy - for backwards compatibility
  resourceSpawns: ResourceSpawn[]; // Scientific model
  shelters: Shelter[]; // Scientific model
  events: WorldEvent[];
  bubbles: AgentBubble[];

  // UI state
  selectedAgentId: string | null;
  selectedLocationId: string | null;
  cameraX: number;
  cameraY: number;
  zoom: number;

  // Actions
  setWorldState: (state: { tick: number; agents: Agent[]; locations?: Location[]; resourceSpawns?: ResourceSpawn[]; shelters?: Shelter[] }) => void;
  updateWorldState: (state: { tick: number; agents: Agent[]; locations?: Location[]; resourceSpawns?: ResourceSpawn[]; shelters?: Shelter[] }) => void;
  setTick: (tick: number) => void;
  updateAgent: (id: string, updates: Partial<Agent>) => void;
  updateResourceSpawn: (id: string, updates: Partial<ResourceSpawn>) => void;
  addEvent: (event: WorldEvent) => void;
  setEvents: (events: WorldEvent[]) => void;
  addBubble: (bubble: AgentBubble) => void;
  selectAgent: (id: string | null) => void;
  selectLocation: (id: string | null) => void;
  setCamera: (x: number, y: number) => void;
  setZoom: (zoom: number) => void;
  // Editor integration
  setLocations: (locations: Location[]) => void;
  clearLocations: () => void;
  clearAgents: () => void;
  resetWorld: () => void;
}

// Bubble duration in ms
const BUBBLE_DURATION = 3000;

export const useWorldStore = create<WorldState>((set) => ({
  // Initial state
  tick: 0,
  agents: [],
  locations: [],
  resourceSpawns: [],
  shelters: [],
  events: [],
  bubbles: [],
  selectedAgentId: null,
  selectedLocationId: null,
  cameraX: 0,
  cameraY: 0,
  zoom: 1,

  // Actions
  setWorldState: (state) =>
    set({
      tick: state.tick,
      agents: state.agents,
      locations: state.locations ?? [],
      resourceSpawns: state.resourceSpawns ?? [],
      shelters: state.shelters ?? [],
      events: [], // Clear events on new world state
      bubbles: [], // Clear bubbles on new world state
    }),

  // Update world state WITHOUT clearing events (for SSE reconnect)
  updateWorldState: (state) =>
    set({
      tick: state.tick,
      agents: state.agents,
      locations: state.locations ?? [],
      resourceSpawns: state.resourceSpawns ?? [],
      shelters: state.shelters ?? [],
      // Preserve events and bubbles!
    }),

  setTick: (tick) => set({ tick }),

  updateAgent: (id, updates) =>
    set((state) => ({
      agents: state.agents.map((a) => (a.id === id ? { ...a, ...updates } : a)),
    })),

  updateResourceSpawn: (id, updates) =>
    set((state) => ({
      resourceSpawns: state.resourceSpawns.map((r) => (r.id === id ? { ...r, ...updates } : r)),
    })),

  addEvent: (event) =>
    set((state) => ({
      events: [event, ...state.events].slice(0, 100), // Keep last 100 events
    })),

  setEvents: (events) => set({ events }),

  addBubble: (bubble) =>
    set((state) => {
      const now = Date.now();
      // Remove old bubbles (older than BUBBLE_DURATION) and update/add new one
      const filteredBubbles = state.bubbles.filter(
        (b) => b.agentId !== bubble.agentId && now - b.timestamp < BUBBLE_DURATION
      );
      return { bubbles: [...filteredBubbles, bubble] };
    }),

  selectAgent: (id) => set({ selectedAgentId: id, selectedLocationId: null }),

  selectLocation: (id) =>
    set((state) => ({
      selectedLocationId: state.selectedLocationId === id ? null : id,
      selectedAgentId: null, // Deselect agent when selecting location
    })),

  setCamera: (x, y) => set({ cameraX: x, cameraY: y }),

  setZoom: (zoom) => set({ zoom: Math.max(0.5, Math.min(2, zoom)) }),

  // Editor integration actions
  setLocations: (locations) => set({ locations }),

  clearLocations: () => set({ locations: [] }),

  clearAgents: () => set({ agents: [], bubbles: [] }),

  resetWorld: () =>
    set({
      tick: 0,
      agents: [],
      locations: [],
      resourceSpawns: [],
      shelters: [],
      events: [],
      bubbles: [],
      selectedAgentId: null,
      selectedLocationId: null,
    }),
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

export const useSelectedLocation = () =>
  useWorldStore((state) =>
    state.selectedLocationId
      ? state.locations.find((l) => l.id === state.selectedLocationId)
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
  // Check state field for death, not health (dead agents may have health > 0)
  return agents.filter((a) => a.state !== 'dead');
};

export const useRecentEvents = (limit = 20) => {
  const events = useWorldStore(useShallow((state) => state.events));
  return events.slice(0, limit);
};

export const useBubbles = () =>
  useWorldStore(useShallow((state) => state.bubbles));

// Scientific model selectors
export const useResourceSpawns = () =>
  useWorldStore(useShallow((state) => state.resourceSpawns));

export const useShelters = () =>
  useWorldStore(useShallow((state) => state.shelters));
