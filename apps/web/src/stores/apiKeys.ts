/**
 * API Keys Store
 *
 * Manages LLM API keys state.
 * - Keys stored in localStorage (browser-side)
 * - Syncs with backend on page load
 * - Backend never returns full keys (only masked)
 */

import { create } from 'zustand';

// =============================================================================
// Types
// =============================================================================

export type LLMType = 'claude' | 'codex' | 'gemini' | 'deepseek' | 'qwen' | 'glm' | 'grok';

export interface LLMProviderInfo {
  type: LLMType;
  displayName: string;
  envVar: string;
  docsUrl: string;
  costInfo: string;
}

export interface ProviderKeyStatus {
  type: LLMType;
  source: 'env' | 'user' | 'none';
  disabled: boolean;
  maskedKey?: string;
}

export interface ApiKeysState {
  // State
  providers: LLMProviderInfo[];
  status: Record<LLMType, ProviderKeyStatus>;
  pendingKeys: Record<LLMType, string>;
  isLoading: boolean;
  error: string | null;
  isSynced: boolean;

  // Actions
  fetchStatus: () => Promise<void>;
  setPendingKey: (type: LLMType, key: string) => void;
  applyKeys: () => Promise<void>;
  clearKey: (type: LLMType) => Promise<void>;
  toggleDisabled: (type: LLMType) => Promise<void>;
  discardPendingKeys: () => void;
  hasPendingChanges: () => boolean;
  hasAnyActiveKey: () => boolean;
}

// =============================================================================
// LocalStorage Persistence
// =============================================================================

const KEYS_STORAGE_KEY = 'simagents_api_keys';
const DISABLED_STORAGE_KEY = 'simagents_disabled_keys';

function loadKeysFromStorage(): Record<string, string> {
  try {
    const saved = localStorage.getItem(KEYS_STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.warn('[ApiKeysStore] Failed to load keys from localStorage:', e);
  }
  return {};
}

function saveKeysToStorage(keys: Record<string, string>): void {
  try {
    if (Object.keys(keys).length === 0) {
      localStorage.removeItem(KEYS_STORAGE_KEY);
    } else {
      localStorage.setItem(KEYS_STORAGE_KEY, JSON.stringify(keys));
    }
  } catch (e) {
    console.warn('[ApiKeysStore] Failed to save keys to localStorage:', e);
  }
}

function loadDisabledFromStorage(): LLMType[] {
  try {
    const saved = localStorage.getItem(DISABLED_STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.warn('[ApiKeysStore] Failed to load disabled from localStorage:', e);
  }
  return [];
}

function saveDisabledToStorage(disabled: LLMType[]): void {
  try {
    if (disabled.length === 0) {
      localStorage.removeItem(DISABLED_STORAGE_KEY);
    } else {
      localStorage.setItem(DISABLED_STORAGE_KEY, JSON.stringify(disabled));
    }
  } catch (e) {
    console.warn('[ApiKeysStore] Failed to save disabled to localStorage:', e);
  }
}

// =============================================================================
// API Functions
// =============================================================================

const API_BASE = '';

interface StatusResponse {
  providers: LLMProviderInfo[];
  status: Record<LLMType, ProviderKeyStatus>;
  hasAnyKey: boolean;
}

async function fetchStatusFromAPI(): Promise<StatusResponse> {
  const response = await fetch(`${API_BASE}/api/llm/keys/status`);
  if (!response.ok) {
    throw new Error(`Failed to fetch keys status: ${response.statusText}`);
  }
  return response.json();
}

async function syncKeysToBackend(keys: Record<string, string>, disabled: LLMType[]): Promise<void> {
  const response = await fetch(`${API_BASE}/api/llm/keys/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keys, disabled }),
  });
  if (!response.ok) {
    throw new Error(`Failed to sync keys: ${response.statusText}`);
  }
}

async function setKeyAPI(type: LLMType, key: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/llm/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keys: { [type]: key } }),
  });
  if (!response.ok) {
    throw new Error(`Failed to set key: ${response.statusText}`);
  }
}

async function clearKeyAPI(type: LLMType): Promise<void> {
  const response = await fetch(`${API_BASE}/api/llm/keys/clear`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type }),
  });
  if (!response.ok) {
    throw new Error(`Failed to clear key: ${response.statusText}`);
  }
}

async function setDisabledAPI(type: LLMType, disabled: boolean): Promise<void> {
  const endpoint = disabled ? '/api/llm/keys/disable' : '/api/llm/keys/enable';
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ types: [type] }),
  });
  if (!response.ok) {
    throw new Error(`Failed to ${disabled ? 'disable' : 'enable'} key: ${response.statusText}`);
  }
}

// =============================================================================
// Initial State
// =============================================================================

const ALL_TYPES: LLMType[] = ['claude', 'codex', 'gemini', 'deepseek', 'qwen', 'glm', 'grok'];

function createEmptyStatus(): Record<LLMType, ProviderKeyStatus> {
  const status: Partial<Record<LLMType, ProviderKeyStatus>> = {};
  for (const type of ALL_TYPES) {
    status[type] = { type, source: 'none', disabled: false };
  }
  return status as Record<LLMType, ProviderKeyStatus>;
}

// =============================================================================
// Store
// =============================================================================

export const useApiKeysStore = create<ApiKeysState>((set, get) => ({
  // Initial state
  providers: [],
  status: createEmptyStatus(),
  pendingKeys: {} as Record<LLMType, string>,
  isLoading: false,
  error: null,
  isSynced: false,

  // Fetch status from backend and sync localStorage keys
  fetchStatus: async () => {
    set({ isLoading: true, error: null });
    try {
      // First, sync localStorage data to backend
      const storedKeys = loadKeysFromStorage();
      const storedDisabled = loadDisabledFromStorage();

      if (Object.keys(storedKeys).length > 0 || storedDisabled.length > 0) {
        await syncKeysToBackend(storedKeys, storedDisabled);
      }

      // Then fetch current status
      const data = await fetchStatusFromAPI();
      set({
        providers: data.providers,
        status: data.status,
        isLoading: false,
        isSynced: true,
      });
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to fetch keys status';
      set({ error, isLoading: false });
      console.error('[ApiKeysStore] Fetch error:', e);
    }
  },

  // Set a pending key (not yet applied)
  setPendingKey: (type: LLMType, key: string) => {
    const { pendingKeys } = get();
    if (key === '') {
      // Remove from pending if empty
      const { [type]: _, ...rest } = pendingKeys;
      set({ pendingKeys: rest as Record<LLMType, string> });
    } else {
      set({ pendingKeys: { ...pendingKeys, [type]: key } });
    }
  },

  // Apply pending keys to backend and localStorage
  applyKeys: async () => {
    const { pendingKeys, status } = get();
    if (Object.keys(pendingKeys).length === 0) return;

    set({ isLoading: true, error: null });
    try {
      // Apply each key
      for (const [type, key] of Object.entries(pendingKeys)) {
        await setKeyAPI(type as LLMType, key);
      }

      // Update localStorage
      const storedKeys = loadKeysFromStorage();
      const newKeys = { ...storedKeys, ...pendingKeys };
      saveKeysToStorage(newKeys);

      // Update status
      const newStatus = { ...status };
      for (const type of Object.keys(pendingKeys) as LLMType[]) {
        newStatus[type] = {
          ...newStatus[type],
          source: 'user',
          maskedKey: `****${pendingKeys[type].slice(-4)}`,
        };
      }

      set({
        status: newStatus,
        pendingKeys: {} as Record<LLMType, string>,
        isLoading: false,
      });
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to apply keys';
      set({ error, isLoading: false });
      console.error('[ApiKeysStore] Apply error:', e);
    }
  },

  // Clear a user-provided key
  clearKey: async (type: LLMType) => {
    const { status } = get();
    const current = status[type];

    // Can only clear user-provided keys
    if (current.source !== 'user') return;

    set({ isLoading: true, error: null });
    try {
      await clearKeyAPI(type);

      // Update localStorage
      const storedKeys = loadKeysFromStorage();
      delete storedKeys[type];
      saveKeysToStorage(storedKeys);

      // Re-fetch status to get accurate state
      await get().fetchStatus();
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to clear key';
      set({ error, isLoading: false });
      console.error('[ApiKeysStore] Clear error:', e);
    }
  },

  // Toggle disabled state
  toggleDisabled: async (type: LLMType) => {
    const { status } = get();
    const current = status[type];
    const newDisabled = !current.disabled;

    set({ isLoading: true, error: null });
    try {
      await setDisabledAPI(type, newDisabled);

      // Update localStorage
      const storedDisabled = loadDisabledFromStorage();
      if (newDisabled) {
        if (!storedDisabled.includes(type)) {
          storedDisabled.push(type);
        }
      } else {
        const idx = storedDisabled.indexOf(type);
        if (idx !== -1) {
          storedDisabled.splice(idx, 1);
        }
      }
      saveDisabledToStorage(storedDisabled);

      // Update status
      const newStatus = { ...status };
      newStatus[type] = { ...newStatus[type], disabled: newDisabled };
      set({ status: newStatus, isLoading: false });
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Failed to toggle key';
      set({ error, isLoading: false });
      console.error('[ApiKeysStore] Toggle error:', e);
    }
  },

  // Discard pending changes
  discardPendingKeys: () => {
    set({ pendingKeys: {} as Record<LLMType, string> });
  },

  // Check if there are pending changes
  hasPendingChanges: () => {
    const { pendingKeys } = get();
    return Object.keys(pendingKeys).length > 0;
  },

  // Check if any key is active (not disabled and has a key)
  hasAnyActiveKey: () => {
    const { status } = get();
    return Object.values(status).some((s) => s.source !== 'none' && !s.disabled);
  },
}));

// =============================================================================
// Selectors
// =============================================================================

export const useProviders = () => useApiKeysStore((state) => state.providers);
export const useKeyStatus = (type: LLMType) =>
  useApiKeysStore((state) => state.status[type]);
export const useAllKeyStatus = () => useApiKeysStore((state) => state.status);
export const usePendingKeys = () => useApiKeysStore((state) => state.pendingKeys);
export const useApiKeysLoading = () => useApiKeysStore((state) => state.isLoading);
export const useApiKeysError = () => useApiKeysStore((state) => state.error);
export const useIsSynced = () => useApiKeysStore((state) => state.isSynced);
