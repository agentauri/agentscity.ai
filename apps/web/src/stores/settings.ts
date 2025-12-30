import { create } from 'zustand';

// =============================================================================
// LocalStorage Persistence
// =============================================================================

const SOUND_ENABLED_KEY = 'agentscity_sound_enabled';
const SOUND_VOLUME_KEY = 'agentscity_sound_volume';

function loadSoundEnabledFromStorage(): boolean {
  try {
    const saved = localStorage.getItem(SOUND_ENABLED_KEY);
    if (saved !== null) {
      return saved === 'true';
    }
  } catch (e) {
    console.warn('[Settings] Failed to load sound enabled from localStorage:', e);
  }
  return false; // Default: sound disabled
}

function saveSoundEnabledToStorage(enabled: boolean): void {
  try {
    localStorage.setItem(SOUND_ENABLED_KEY, String(enabled));
  } catch (e) {
    console.warn('[Settings] Failed to save sound enabled to localStorage:', e);
  }
}

function loadSoundVolumeFromStorage(): number {
  try {
    const saved = localStorage.getItem(SOUND_VOLUME_KEY);
    if (saved !== null) {
      const volume = parseFloat(saved);
      if (!isNaN(volume) && volume >= 0 && volume <= 1) {
        return volume;
      }
    }
  } catch (e) {
    console.warn('[Settings] Failed to load sound volume from localStorage:', e);
  }
  return 0.5; // Default: 50% volume
}

function saveSoundVolumeToStorage(volume: number): void {
  try {
    localStorage.setItem(SOUND_VOLUME_KEY, String(volume));
  } catch (e) {
    console.warn('[Settings] Failed to save sound volume to localStorage:', e);
  }
}

// =============================================================================
// Types
// =============================================================================

export interface SettingsState {
  // Sound settings
  soundEnabled: boolean;
  soundVolume: number; // 0-1

  // Actions
  setSoundEnabled: (enabled: boolean) => void;
  toggleSound: () => void;
  setSoundVolume: (volume: number) => void;
}

// =============================================================================
// Store
// =============================================================================

export const useSettingsStore = create<SettingsState>((set, get) => ({
  // Initial state from localStorage
  soundEnabled: loadSoundEnabledFromStorage(),
  soundVolume: loadSoundVolumeFromStorage(),

  // Actions
  setSoundEnabled: (enabled) => {
    set({ soundEnabled: enabled });
    saveSoundEnabledToStorage(enabled);
  },

  toggleSound: () => {
    const { soundEnabled } = get();
    const newEnabled = !soundEnabled;
    set({ soundEnabled: newEnabled });
    saveSoundEnabledToStorage(newEnabled);
  },

  setSoundVolume: (volume) => {
    // Clamp to 0-1 range
    const clampedVolume = Math.max(0, Math.min(1, volume));
    set({ soundVolume: clampedVolume });
    saveSoundVolumeToStorage(clampedVolume);
  },
}));

// =============================================================================
// Selectors
// =============================================================================

export const useSoundEnabled = () =>
  useSettingsStore((state) => state.soundEnabled);

export const useSoundVolume = () =>
  useSettingsStore((state) => state.soundVolume);
