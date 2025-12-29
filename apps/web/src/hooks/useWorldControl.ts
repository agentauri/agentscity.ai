/**
 * Hook for controlling the simulation via backend API
 * Scientific model: uses resourceSpawns and shelters instead of typed locations
 */

const API_BASE = 'http://localhost:3000';

export interface AgentState {
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

export interface ResourceSpawnState {
  id: string;
  x: number;
  y: number;
  resourceType: 'food' | 'energy' | 'material';
  currentAmount: number;
  maxAmount: number;
}

export interface ShelterState {
  id: string;
  x: number;
  y: number;
  canSleep: boolean;
}

export interface WorldState {
  tick: number;
  isPaused: boolean;
  isRunning: boolean;
  agentCount: number;
  resourceSpawnCount: number;
  shelterCount: number;
  agents: AgentState[];
  resourceSpawns: ResourceSpawnState[];
  shelters: ShelterState[];
}

export interface StartResult {
  success: boolean;
  error?: string;
  tick?: number;
  agents?: AgentState[];
  resourceSpawns?: ResourceSpawnState[];
  shelters?: ShelterState[];
}

export function useWorldControl() {
  /**
   * Fetch current world state from backend
   */
  const fetchState = async (): Promise<WorldState | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/world/state`);
      if (!res.ok) return null;
      return res.json();
    } catch (error) {
      console.error('[useWorldControl] Failed to fetch state:', error);
      return null;
    }
  };

  /**
   * Start simulation (scientific model - no frontend locations needed)
   * Returns full world state with spawned agents, resource spawns, and shelters
   */
  const start = async (): Promise<StartResult> => {
    try {
      const res = await fetch(`${API_BASE}/api/world/start`, {
        method: 'POST',
      });
      if (!res.ok) {
        return { success: false, error: 'Failed to start simulation' };
      }
      return res.json();
    } catch (error) {
      console.error('[useWorldControl] Failed to start:', error);
      return { success: false, error: String(error) };
    }
  };

  /**
   * Pause simulation
   */
  const pause = async (): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/api/world/pause`, { method: 'POST' });
      return res.ok;
    } catch (error) {
      console.error('[useWorldControl] Failed to pause:', error);
      return false;
    }
  };

  /**
   * Resume simulation
   */
  const resume = async (): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/api/world/resume`, { method: 'POST' });
      return res.ok;
    } catch (error) {
      console.error('[useWorldControl] Failed to resume:', error);
      return false;
    }
  };

  /**
   * Reset simulation (full database wipe)
   */
  const reset = async (): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE}/api/world/reset`, { method: 'POST' });
      return res.ok;
    } catch (error) {
      console.error('[useWorldControl] Failed to reset:', error);
      return false;
    }
  };

  /**
   * Fetch recent events (for loading history on page refresh)
   */
  const fetchRecentEvents = async (limit = 50): Promise<Array<{
    id: string;
    type: string;
    tick: number;
    timestamp: number;
    agentId?: string;
    payload: Record<string, unknown>;
  }>> => {
    try {
      const res = await fetch(`${API_BASE}/api/events/recent?limit=${limit}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.events || [];
    } catch (error) {
      console.error('[useWorldControl] Failed to fetch recent events:', error);
      return [];
    }
  };

  return { fetchState, start, pause, resume, reset, fetchRecentEvents };
}
