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
  move: { energyCost: number; hungerCost: number; consecutivePenalty: number };
  gather: { energyCostPerUnit: number; maxPerAction: number };
  work: { basePayPerTick: number; energyCostPerTick: number };
  sleep: { energyRestoredPerTick: number };
}

export interface EconomyConfig {
  currencyDecayRate: number;
  currencyDecayInterval: number;
  currencyDecayThreshold: number;
}

export type LLMType = 'claude' | 'codex' | 'gemini' | 'deepseek' | 'qwen' | 'glm' | 'grok';

export interface GenesisConfig {
  enabled: boolean;
  childrenPerMother: number; // 5-100
  mothers: LLMType[];
  mode: 'single' | 'evolutionary'; // single: one-shot, evolutionary: multi-generation
  diversityThreshold: number; // 0-1
  requiredArchetypes: string[];
  useConfiguredPersonalities: boolean; // Use user-configured weights instead of LLM-generated
}

export type PersonalityTrait = 'aggressive' | 'cooperative' | 'cautious' | 'explorer' | 'social' | 'neutral';

export interface PersonalityConfig {
  enabled: boolean;
  weights: Record<PersonalityTrait, number>;
}

export interface ConfigResponse {
  simulation: SimulationConfig;
  agent: AgentConfig;
  needs: NeedsConfig;
  experiment: ExperimentConfig;
  llmCache: LLMCacheConfig;
  actions: ActionsConfig;
  economy: EconomyConfig;
}

// Section-specific update types
type SimulationUpdate = Partial<SimulationConfig>;
type AgentUpdate = Partial<AgentConfig>;
type NeedsUpdate = Partial<NeedsConfig>;
type ExperimentUpdate = Partial<ExperimentConfig>;
type LLMCacheUpdate = Partial<LLMCacheConfig>;
type ActionsUpdate = Partial<ActionsConfig>;
type EconomyUpdate = Partial<EconomyConfig>;

export interface ConfigState {
  // State
  config: ConfigResponse | null;
  isLoading: boolean;
  error: string | null;
  pendingChanges: Partial<ConfigResponse>;
  runtimeModifiable: string[];
  genesisConfig: GenesisConfig;
  personalityConfig: PersonalityConfig;

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
  updateActions: (updates: ActionsUpdate) => void;
  updateEconomy: (updates: EconomyUpdate) => void;
  setGenesisConfig: (updates: Partial<GenesisConfig>) => void;
  fetchGenesisConfig: () => Promise<void>;
  saveGenesisConfig: () => Promise<void>;
  setPersonalityConfig: (updates: Partial<PersonalityConfig>) => void;
  setPersonalityWeight: (trait: PersonalityTrait, weight: number) => void;
  fetchPersonalityConfig: () => Promise<void>;
  savePersonalityConfig: () => Promise<void>;
  resetPersonalityWeights: () => Promise<void>;
  applyChanges: () => Promise<{ appliedImmediately: string[]; requiresRestart: string[] }>;
  resetConfig: () => Promise<void>;
  discardChanges: () => void;
  hasPendingChanges: () => boolean;
}

// =============================================================================
// LocalStorage Persistence
// =============================================================================

const CONFIG_STORAGE_KEY = 'simagents_config_overrides';
const GENESIS_STORAGE_KEY = 'simagents_genesis_config';

// Default genesis configuration
const DEFAULT_GENESIS_CONFIG: GenesisConfig = {
  enabled: false,
  childrenPerMother: 25,
  mothers: ['claude', 'gemini', 'codex'],
  mode: 'single',
  diversityThreshold: 0.3,
  requiredArchetypes: ['high_risk', 'low_risk', 'high_cooperation'],
  useConfiguredPersonalities: false,
};

// Default personality configuration
const DEFAULT_PERSONALITY_CONFIG: PersonalityConfig = {
  enabled: false,
  weights: {
    aggressive: 0.12,
    cooperative: 0.15,
    cautious: 0.12,
    explorer: 0.10,
    social: 0.11,
    neutral: 0.40,
  },
};

const PERSONALITY_STORAGE_KEY = 'simagents_personality_config';

function loadGenesisFromStorage(): GenesisConfig {
  try {
    const saved = localStorage.getItem(GENESIS_STORAGE_KEY);
    if (saved) {
      return { ...DEFAULT_GENESIS_CONFIG, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.warn('[ConfigStore] Failed to load genesis from localStorage:', e);
  }
  return DEFAULT_GENESIS_CONFIG;
}

function saveGenesisToStorage(config: GenesisConfig): void {
  try {
    localStorage.setItem(GENESIS_STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.warn('[ConfigStore] Failed to save genesis to localStorage:', e);
  }
}

function loadPersonalityFromStorage(): PersonalityConfig {
  try {
    const saved = localStorage.getItem(PERSONALITY_STORAGE_KEY);
    if (saved) {
      return { ...DEFAULT_PERSONALITY_CONFIG, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.warn('[ConfigStore] Failed to load personality from localStorage:', e);
  }
  return DEFAULT_PERSONALITY_CONFIG;
}

function savePersonalityToStorage(config: PersonalityConfig): void {
  try {
    localStorage.setItem(PERSONALITY_STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.warn('[ConfigStore] Failed to save personality to localStorage:', e);
  }
}

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

async function fetchGenesisConfigAPI(): Promise<GenesisConfig> {
  const response = await fetch(`${API_BASE}/api/config/genesis`);
  if (!response.ok) {
    throw new Error(`Failed to fetch genesis config: ${response.statusText}`);
  }
  return response.json();
}

async function saveGenesisConfigAPI(
  config: GenesisConfig
): Promise<{ success: boolean; requiresRestart: boolean }> {
  const response = await fetch(`${API_BASE}/api/config/genesis`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!response.ok) {
    throw new Error(`Failed to save genesis config: ${response.statusText}`);
  }
  return response.json();
}

async function fetchPersonalityConfigAPI(): Promise<PersonalityConfig> {
  const response = await fetch(`${API_BASE}/api/config/personalities`);
  if (!response.ok) {
    throw new Error(`Failed to fetch personality config: ${response.statusText}`);
  }
  return response.json();
}

async function savePersonalityConfigAPI(
  config: Partial<PersonalityConfig>
): Promise<{ success: boolean; weights: Record<PersonalityTrait, number>; requiresRestart: boolean }> {
  const response = await fetch(`${API_BASE}/api/config/personalities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!response.ok) {
    throw new Error(`Failed to save personality config: ${response.statusText}`);
  }
  return response.json();
}

async function resetPersonalityWeightsAPI(): Promise<{ success: boolean; weights: Record<PersonalityTrait, number> }> {
  const response = await fetch(`${API_BASE}/api/config/personalities/reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Failed to reset personality weights: ${response.statusText}`);
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
  genesisConfig: loadGenesisFromStorage(),
  personalityConfig: loadPersonalityFromStorage(),

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
  updateActions: (updates: ActionsUpdate) => get()._updateSection('actions', updates),
  updateEconomy: (updates: EconomyUpdate) => get()._updateSection('economy', updates),

  // Genesis configuration
  setGenesisConfig: (updates: Partial<GenesisConfig>) => {
    const { genesisConfig } = get();
    const newConfig = { ...genesisConfig, ...updates };
    set({ genesisConfig: newConfig });
    saveGenesisToStorage(newConfig);
  },

  fetchGenesisConfig: async () => {
    set({ isLoading: true, error: null });
    try {
      const genesisConfig = await fetchGenesisConfigAPI();
      set({ genesisConfig, isLoading: false });
      saveGenesisToStorage(genesisConfig);
    } catch (e) {
      // If backend doesn't have genesis endpoint yet, use local storage
      console.warn('[ConfigStore] Genesis fetch failed, using local:', e);
      set({ isLoading: false });
    }
  },

  saveGenesisConfig: async () => {
    const { genesisConfig } = get();
    set({ isLoading: true, error: null });
    try {
      await saveGenesisConfigAPI(genesisConfig);
      set({ isLoading: false });
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to save genesis config';
      set({ error, isLoading: false });
      console.error('[ConfigStore] Genesis save error:', e);
    }
  },

  // Personality configuration
  setPersonalityConfig: (updates: Partial<PersonalityConfig>) => {
    const { personalityConfig } = get();
    const newConfig = { ...personalityConfig, ...updates };
    set({ personalityConfig: newConfig });
    savePersonalityToStorage(newConfig);
  },

  setPersonalityWeight: (trait: PersonalityTrait, weight: number) => {
    const { personalityConfig } = get();
    const newWeights = { ...personalityConfig.weights, [trait]: weight };

    // Normalize to sum to 1.0
    const total = Object.values(newWeights).reduce((sum, w) => sum + w, 0);
    if (total > 0) {
      for (const t of Object.keys(newWeights) as PersonalityTrait[]) {
        newWeights[t] = newWeights[t] / total;
      }
    }

    const newConfig = { ...personalityConfig, weights: newWeights };
    set({ personalityConfig: newConfig });
    savePersonalityToStorage(newConfig);
  },

  fetchPersonalityConfig: async () => {
    set({ isLoading: true, error: null });
    try {
      const personalityConfig = await fetchPersonalityConfigAPI();
      set({ personalityConfig, isLoading: false });
      savePersonalityToStorage(personalityConfig);
    } catch (e) {
      // If backend doesn't have personality endpoint yet, use local storage
      console.warn('[ConfigStore] Personality fetch failed, using local:', e);
      set({ isLoading: false });
    }
  },

  savePersonalityConfig: async () => {
    const { personalityConfig } = get();
    set({ isLoading: true, error: null });
    try {
      const result = await savePersonalityConfigAPI({
        weights: personalityConfig.weights,
        enabled: personalityConfig.enabled,
      });
      set({
        personalityConfig: { ...personalityConfig, weights: result.weights },
        isLoading: false
      });
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to save personality config';
      set({ error, isLoading: false });
      console.error('[ConfigStore] Personality save error:', e);
    }
  },

  resetPersonalityWeights: async () => {
    set({ isLoading: true, error: null });
    try {
      const result = await resetPersonalityWeightsAPI();
      const newConfig = { ...get().personalityConfig, weights: result.weights };
      set({ personalityConfig: newConfig, isLoading: false });
      savePersonalityToStorage(newConfig);
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to reset personality weights';
      set({ error, isLoading: false });
      console.error('[ConfigStore] Personality reset error:', e);
    }
  },

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
export const useGenesisConfig = () => useConfigStore((state) => state.genesisConfig);
export const usePersonalityConfig = () => useConfigStore((state) => state.personalityConfig);

// Helper to check if a field is runtime modifiable
export const useIsRuntimeModifiable = (path: string) =>
  useConfigStore((state) => state.runtimeModifiable.includes(path));

// Export default configs for reference
export { DEFAULT_GENESIS_CONFIG, DEFAULT_PERSONALITY_CONFIG };
