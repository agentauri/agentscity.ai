/**
 * Configuration Store
 *
 * Manages simulation configuration state.
 * Syncs with backend API and persists user preferences to localStorage.
 */

import { create } from 'zustand';

// =============================================================================
// Types
// =============================================================================

export interface SimulationConfig {
  tickIntervalMs: number;
  gridSize: number;
  visibilityRadius: number;
  testMode: boolean;
  randomSeed: number;
}

export interface AgentConfig {
  startingBalance: number;
  startingHunger: number;
  startingEnergy: number;
  startingHealth: number;
}

export interface NeedsConfig {
  hungerDecay: number;
  energyDecay: number;
  lowHungerThreshold: number;
  criticalHungerThreshold: number;
  lowEnergyThreshold: number;
  criticalEnergyThreshold: number;
  hungerEnergyDrain: number;
  criticalHungerHealthDamage: number;
  criticalEnergyHealthDamage: number;
}

export interface ExperimentConfig {
  enablePersonalities: boolean;
  useEmergentPrompt: boolean;
  safetyLevel: 'standard' | 'minimal' | 'none';
  includeBaselineAgents: boolean;
  normalizeCapabilities: boolean;
  useSyntheticVocabulary: boolean;
}

export interface LLMCacheConfig {
  enabled: boolean;
  ttlSeconds: number;
}

export interface ActionsConfig {
  move: { energyCost: number };
  gather: { energyCostPerUnit: number; maxPerAction: number };
  work: { basePayPerTick: number; energyCostPerTick: number };
  sleep: { energyRestoredPerTick: number };
}

export interface ConfigResponse {
  simulation: SimulationConfig;
  agent: AgentConfig;
  needs: NeedsConfig;
  experiment: ExperimentConfig;
  llmCache: LLMCacheConfig;
  actions: ActionsConfig;
}

// Section-specific update types
type SimulationUpdate = Partial<SimulationConfig>;
type AgentUpdate = Partial<AgentConfig>;
type NeedsUpdate = Partial<NeedsConfig>;
type ExperimentUpdate = Partial<ExperimentConfig>;
type LLMCacheUpdate = Partial<LLMCacheConfig>;

export interface ConfigState {
  // State
  config: ConfigResponse | null;
  isLoading: boolean;
  error: string | null;
  pendingChanges: Partial<ConfigResponse>;
  runtimeModifiable: string[];

  // Actions
  fetchConfig: () => Promise<void>;
  _updateSection: <K extends keyof ConfigResponse>(
    section: K,
    updates: Partial<ConfigResponse[K]>
  ) => void;
  updateSimulation: (updates: SimulationUpdate) => void;
  updateAgent: (updates: AgentUpdate) => void;
  updateNeeds: (updates: NeedsUpdate) => void;
  updateExperiment: (updates: ExperimentUpdate) => void;
  updateLLMCache: (updates: LLMCacheUpdate) => void;
  applyChanges: () => Promise<{ appliedImmediately: string[]; requiresRestart: string[] }>;
  resetConfig: () => Promise<void>;
  discardChanges: () => void;
  hasPendingChanges: () => boolean;
}

// =============================================================================
// LocalStorage Persistence
// =============================================================================

const CONFIG_STORAGE_KEY = 'simagents_config_overrides';

function loadPendingFromStorage(): Partial<ConfigResponse> {
  try {
    const saved = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.warn('[ConfigStore] Failed to load from localStorage:', e);
  }
  return {};
}

function savePendingToStorage(pending: Partial<ConfigResponse>): void {
  try {
    if (Object.keys(pending).length === 0) {
      localStorage.removeItem(CONFIG_STORAGE_KEY);
    } else {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(pending));
    }
  } catch (e) {
    console.warn('[ConfigStore] Failed to save to localStorage:', e);
  }
}

// =============================================================================
// API Functions
// =============================================================================

const API_BASE = '';

async function fetchConfigFromAPI(): Promise<{
  config: ConfigResponse;
  runtimeModifiable: string[];
}> {
  const response = await fetch(`${API_BASE}/api/config`);
  if (!response.ok) {
    throw new Error(`Failed to fetch config: ${response.statusText}`);
  }
  return response.json();
}

async function updateConfigAPI(
  updates: Partial<ConfigResponse>
): Promise<{
  success: boolean;
  config: ConfigResponse;
  appliedImmediately: string[];
  requiresRestart: string[];
}> {
  const response = await fetch(`${API_BASE}/api/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!response.ok) {
    throw new Error(`Failed to update config: ${response.statusText}`);
  }
  return response.json();
}

async function resetConfigAPI(): Promise<{ success: boolean; config: ConfigResponse }> {
  const response = await fetch(`${API_BASE}/api/config/reset`, {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error(`Failed to reset config: ${response.statusText}`);
  }
  return response.json();
}

// =============================================================================
// Store
// =============================================================================

export const useConfigStore = create<ConfigState>((set, get) => ({
  // Initial state
  config: null,
  isLoading: false,
  error: null,
  pendingChanges: loadPendingFromStorage(),
  runtimeModifiable: [],

  // Fetch configuration from backend
  fetchConfig: async () => {
    set({ isLoading: true, error: null });
    try {
      const { config, runtimeModifiable } = await fetchConfigFromAPI();
      set({ config, runtimeModifiable, isLoading: false });
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to fetch config';
      set({ error, isLoading: false });
      console.error('[ConfigStore] Fetch error:', e);
    }
  },

  // Generic section updater (reduces code duplication)
  _updateSection: <K extends keyof ConfigResponse>(
    section: K,
    updates: Partial<ConfigResponse[K]>
  ) => {
    const { pendingChanges } = get();
    const newPending: Partial<ConfigResponse> = {
      ...pendingChanges,
      [section]: { ...pendingChanges[section], ...updates },
    };
    set({ pendingChanges: newPending });
    savePendingToStorage(newPending);
  },

  // Typed section update helpers (for type safety in components)
  updateSimulation: (updates: SimulationUpdate) => get()._updateSection('simulation', updates),
  updateAgent: (updates: AgentUpdate) => get()._updateSection('agent', updates),
  updateNeeds: (updates: NeedsUpdate) => get()._updateSection('needs', updates),
  updateExperiment: (updates: ExperimentUpdate) => get()._updateSection('experiment', updates),
  updateLLMCache: (updates: LLMCacheUpdate) => get()._updateSection('llmCache', updates),

  // Apply pending changes to backend
  applyChanges: async () => {
    const { pendingChanges } = get();
    if (Object.keys(pendingChanges).length === 0) {
      return { appliedImmediately: [], requiresRestart: [] };
    }

    set({ isLoading: true, error: null });
    try {
      const result = await updateConfigAPI(pendingChanges);
      set({
        config: result.config,
        pendingChanges: {},
        isLoading: false,
      });
      savePendingToStorage({});
      return {
        appliedImmediately: result.appliedImmediately,
        requiresRestart: result.requiresRestart,
      };
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to update config';
      set({ error, isLoading: false });
      console.error('[ConfigStore] Update error:', e);
      throw e;
    }
  },

  // Reset to defaults
  resetConfig: async () => {
    set({ isLoading: true, error: null });
    try {
      const result = await resetConfigAPI();
      set({
        config: result.config,
        pendingChanges: {},
        isLoading: false,
      });
      savePendingToStorage({});
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to reset config';
      set({ error, isLoading: false });
      console.error('[ConfigStore] Reset error:', e);
    }
  },

  // Discard pending changes
  discardChanges: () => {
    set({ pendingChanges: {} });
    savePendingToStorage({});
  },

  // Check if there are pending changes
  hasPendingChanges: () => {
    const { pendingChanges } = get();
    return Object.keys(pendingChanges).length > 0;
  },
}));

// =============================================================================
// Selectors
// =============================================================================

export const useConfig = () => useConfigStore((state) => state.config);
export const useConfigLoading = () => useConfigStore((state) => state.isLoading);
export const useConfigError = () => useConfigStore((state) => state.error);
export const usePendingChanges = () => useConfigStore((state) => state.pendingChanges);
export const useRuntimeModifiable = () => useConfigStore((state) => state.runtimeModifiable);

// Helper to check if a field is runtime modifiable
export const useIsRuntimeModifiable = (path: string) =>
  useConfigStore((state) => state.runtimeModifiable.includes(path));
