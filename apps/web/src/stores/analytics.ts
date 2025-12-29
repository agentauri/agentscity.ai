/**
 * Analytics store for experimental metrics dashboard
 */

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';

// =============================================================================
// Types (matching backend)
// =============================================================================

export interface SurvivalMetrics {
  byLlmType: {
    llmType: string;
    aliveCount: number;
    deadCount: number;
    avgHealth: number;
    avgHunger: number;
    avgEnergy: number;
    avgBalance: number;
  }[];
  overall: {
    totalAlive: number;
    totalDead: number;
    totalAgents: number;
  };
  deathCauses: {
    starvation: number;
    exhaustion: number;
  };
}

export interface EconomyMetrics {
  moneySupply: number;
  giniCoefficient: number;
  balanceDistribution: {
    min: number;
    max: number;
    median: number;
    mean: number;
  };
  byLlmType: {
    llmType: string;
    totalBalance: number;
    avgBalance: number;
  }[];
}

export interface BehaviorMetrics {
  actionFrequency: {
    actionType: string;
    count: number;
    percentage: number;
  }[];
  byLlmType: {
    llmType: string;
    actions: Record<string, number>;
    fallbackRate: number;
    avgProcessingTime: number;
  }[];
}

export interface TemporalMetrics {
  tickDurations: {
    tick: number;
    duration: number;
    agentCount: number;
    actionsExecuted: number;
  }[];
  eventsByTick: {
    tick: number;
    eventCount: number;
  }[];
  currentTick: number;
}

export interface AnalyticsSnapshot {
  survival: SurvivalMetrics;
  economy: EconomyMetrics;
  behavior: BehaviorMetrics;
  temporal: TemporalMetrics;
  timestamp: number;
}

// =============================================================================
// Store
// =============================================================================

type TabType = 'survival' | 'economy' | 'behavior' | 'temporal';

interface AnalyticsState {
  // Data
  survival: SurvivalMetrics | null;
  economy: EconomyMetrics | null;
  behavior: BehaviorMetrics | null;
  temporal: TemporalMetrics | null;

  // UI State
  isLoading: boolean;
  lastUpdated: number | null;
  activeTab: TabType;
  isVisible: boolean;

  // Actions
  fetchSnapshot: () => Promise<void>;
  fetchSurvival: () => Promise<void>;
  fetchEconomy: () => Promise<void>;
  fetchBehavior: () => Promise<void>;
  fetchTemporal: () => Promise<void>;
  setActiveTab: (tab: TabType) => void;
  toggleVisibility: () => void;
  setVisible: (visible: boolean) => void;
}

const API_BASE = 'http://localhost:3000';

export const useAnalyticsStore = create<AnalyticsState>((set, get) => ({
  // Initial state
  survival: null,
  economy: null,
  behavior: null,
  temporal: null,
  isLoading: false,
  lastUpdated: null,
  activeTab: 'survival',
  isVisible: false,

  // Fetch all analytics at once
  fetchSnapshot: async () => {
    set({ isLoading: true });
    try {
      const res = await fetch(`${API_BASE}/api/analytics/snapshot`);
      if (!res.ok) throw new Error('Failed to fetch analytics');
      const data: AnalyticsSnapshot = await res.json();
      set({
        survival: data.survival,
        economy: data.economy,
        behavior: data.behavior,
        temporal: data.temporal,
        lastUpdated: data.timestamp,
        isLoading: false,
      });
    } catch (error) {
      console.error('[Analytics] Failed to fetch snapshot:', error);
      set({ isLoading: false });
    }
  },

  // Fetch individual metrics
  fetchSurvival: async () => {
    try {
      const res = await fetch(`${API_BASE}/api/analytics/survival`);
      if (!res.ok) return;
      const data: SurvivalMetrics = await res.json();
      set({ survival: data, lastUpdated: Date.now() });
    } catch (error) {
      console.error('[Analytics] Failed to fetch survival:', error);
    }
  },

  fetchEconomy: async () => {
    try {
      const res = await fetch(`${API_BASE}/api/analytics/economy`);
      if (!res.ok) return;
      const data: EconomyMetrics = await res.json();
      set({ economy: data, lastUpdated: Date.now() });
    } catch (error) {
      console.error('[Analytics] Failed to fetch economy:', error);
    }
  },

  fetchBehavior: async () => {
    try {
      const res = await fetch(`${API_BASE}/api/analytics/behavior`);
      if (!res.ok) return;
      const data: BehaviorMetrics = await res.json();
      set({ behavior: data, lastUpdated: Date.now() });
    } catch (error) {
      console.error('[Analytics] Failed to fetch behavior:', error);
    }
  },

  fetchTemporal: async () => {
    try {
      const res = await fetch(`${API_BASE}/api/analytics/temporal`);
      if (!res.ok) return;
      const data: TemporalMetrics = await res.json();
      set({ temporal: data, lastUpdated: Date.now() });
    } catch (error) {
      console.error('[Analytics] Failed to fetch temporal:', error);
    }
  },

  // UI actions
  setActiveTab: (tab) => set({ activeTab: tab }),
  toggleVisibility: () => set((state) => ({ isVisible: !state.isVisible })),
  setVisible: (visible) => set({ isVisible: visible }),
}));

// =============================================================================
// Selectors (individual to avoid re-render issues)
// =============================================================================

// Data selectors
export const useSurvivalMetrics = () => useAnalyticsStore((s) => s.survival);
export const useEconomyMetrics = () => useAnalyticsStore((s) => s.economy);
export const useBehaviorMetrics = () => useAnalyticsStore((s) => s.behavior);
export const useTemporalMetrics = () => useAnalyticsStore((s) => s.temporal);
export const useAnalyticsLoading = () => useAnalyticsStore((s) => s.isLoading);
export const useAnalyticsLastUpdated = () => useAnalyticsStore((s) => s.lastUpdated);

// UI selectors
export const useActiveTab = () => useAnalyticsStore((s) => s.activeTab);
export const useIsAnalyticsVisible = () => useAnalyticsStore((s) => s.isVisible);
export const useSetActiveTab = () => useAnalyticsStore((s) => s.setActiveTab);
export const useToggleVisibility = () => useAnalyticsStore((s) => s.toggleVisibility);
export const useFetchSnapshot = () => useAnalyticsStore((s) => s.fetchSnapshot);

// Legacy compound hooks (for convenience, using useShallow)
export const useAnalytics = () => useAnalyticsStore(useShallow((state) => ({
  survival: state.survival,
  economy: state.economy,
  behavior: state.behavior,
  temporal: state.temporal,
  isLoading: state.isLoading,
  lastUpdated: state.lastUpdated,
})));

export const useAnalyticsUI = () => useAnalyticsStore(useShallow((state) => ({
  activeTab: state.activeTab,
  isVisible: state.isVisible,
  setActiveTab: state.setActiveTab,
  toggleVisibility: state.toggleVisibility,
})));
