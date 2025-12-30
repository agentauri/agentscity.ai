import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { type TileDef, type TileCatalogEntry, GRASS_TILE, GRID_SIZE, createEmptyGrid } from '../utils/tiles';

// =============================================================================
// LocalStorage Persistence
// =============================================================================

const STORAGE_KEY = 'agentscity_grid';
const VIEW_MODE_STORAGE_KEY = 'agentscity_view_mode';

function loadGridFromStorage(): TileDef[][] | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Validate it's a 2D array with correct dimensions
      if (Array.isArray(parsed) && parsed.length === GRID_SIZE &&
          parsed.every((row: unknown) => Array.isArray(row) && (row as unknown[]).length === GRID_SIZE)) {
        return parsed as TileDef[][];
      }
    }
  } catch (e) {
    console.warn('[Editor] Failed to load grid from localStorage:', e);
  }
  return null;
}

function saveGridToStorage(grid: TileDef[][]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(grid));
  } catch (e) {
    console.warn('[Editor] Failed to save grid to localStorage:', e);
  }
}

function clearGridFromStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('[Editor] Failed to clear grid from localStorage:', e);
  }
}

function loadViewModeFromStorage(): ViewMode {
  try {
    const saved = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    if (saved === '2d' || saved === 'isometric') {
      return saved;
    }
  } catch (e) {
    console.warn('[Editor] Failed to load view mode from localStorage:', e);
  }
  return '2d'; // Default to 2D view
}

function saveViewModeToStorage(viewMode: ViewMode): void {
  try {
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
  } catch (e) {
    console.warn('[Editor] Failed to save view mode to localStorage:', e);
  }
}

// =============================================================================
// Types
// =============================================================================

export type AppMode = 'editor' | 'simulation' | 'analytics' | 'replay';
export type ViewMode = '2d' | 'isometric';

export interface EditorState {
  // App mode
  mode: AppMode;

  // View mode (2D or isometric)
  viewMode: ViewMode;

  // Editor grid (20x20 array of TileDef)
  grid: TileDef[][];

  // Currently selected tile for placement
  selectedTile: TileCatalogEntry | null;

  // Simulation state
  isPaused: boolean;

  // Last saved grid (for reset functionality)
  lastSavedGrid: TileDef[][] | null;

  // Actions
  setMode: (mode: AppMode) => void;
  setViewMode: (viewMode: ViewMode) => void;
  toggleViewMode: () => void;
  setSelectedTile: (tile: TileCatalogEntry | null) => void;
  placeTile: (gridX: number, gridY: number) => void;
  eraseTile: (gridX: number, gridY: number) => void;
  setGrid: (grid: TileDef[][]) => void;
  clearGrid: () => void;
  setPaused: (paused: boolean) => void;
  saveCurrentGrid: () => void;
  restoreLastSavedGrid: () => void;
}

// =============================================================================
// Store
// =============================================================================

// Load initial grid from localStorage or create empty
const storedGrid = loadGridFromStorage();
const initialGrid = storedGrid || createEmptyGrid();
// If we loaded a grid from storage, use it as lastSavedGrid too
const initialLastSavedGrid = storedGrid ? storedGrid.map(row => row.map(cell => ({ ...cell }))) : null;
// Load initial view mode from localStorage
const initialViewMode = loadViewModeFromStorage();

export const useEditorStore = create<EditorState>((set, get) => ({
  // Initial state
  mode: 'editor',
  viewMode: initialViewMode,
  grid: initialGrid,
  selectedTile: null,
  isPaused: false,
  lastSavedGrid: initialLastSavedGrid,

  // Actions
  setMode: (mode) => set({ mode }),

  setViewMode: (viewMode) => {
    set({ viewMode });
    saveViewModeToStorage(viewMode);
  },

  toggleViewMode: () => {
    const { viewMode } = get();
    const newViewMode = viewMode === '2d' ? 'isometric' : '2d';
    set({ viewMode: newViewMode });
    saveViewModeToStorage(newViewMode);
  },

  setSelectedTile: (tile) => set({ selectedTile: tile }),

  placeTile: (gridX, gridY) => {
    const { grid, selectedTile, mode } = get();

    // Only allow placement in editor mode
    if (mode !== 'editor' || !selectedTile) return;

    // Bounds check
    if (gridX < 0 || gridX >= GRID_SIZE || gridY < 0 || gridY >= GRID_SIZE) return;

    // Create new grid with placed tile
    const newGrid = grid.map((row, y) =>
      row.map((cell, x) =>
        x === gridX && y === gridY
          ? { col: selectedTile.col, row: selectedTile.row }
          : cell
      )
    );

    set({ grid: newGrid });

    // Auto-save to localStorage
    saveGridToStorage(newGrid);
  },

  eraseTile: (gridX, gridY) => {
    const { grid, mode } = get();

    // Only allow erasing in editor mode
    if (mode !== 'editor') return;

    // Bounds check
    if (gridX < 0 || gridX >= GRID_SIZE || gridY < 0 || gridY >= GRID_SIZE) return;

    // Create new grid with grass tile
    const newGrid = grid.map((row, y) =>
      row.map((cell, x) =>
        x === gridX && y === gridY
          ? { ...GRASS_TILE }
          : cell
      )
    );

    set({ grid: newGrid });

    // Auto-save to localStorage
    saveGridToStorage(newGrid);
  },

  setGrid: (grid) => {
    set({ grid });
    saveGridToStorage(grid);
  },

  clearGrid: () => {
    const emptyGrid = createEmptyGrid();
    set({ grid: emptyGrid });
    clearGridFromStorage();
  },

  setPaused: (paused) => set({ isPaused: paused }),

  saveCurrentGrid: () => {
    const { grid } = get();
    // Deep copy the grid
    const savedGrid = grid.map(row => row.map(cell => ({ ...cell })));
    set({ lastSavedGrid: savedGrid });
    // Also persist to localStorage
    saveGridToStorage(grid);
  },

  restoreLastSavedGrid: () => {
    const { lastSavedGrid } = get();
    if (lastSavedGrid) {
      // Deep copy to restore
      const restoredGrid = lastSavedGrid.map(row => row.map(cell => ({ ...cell })));
      set({ grid: restoredGrid });
      // Also update localStorage
      saveGridToStorage(restoredGrid);
    }
  },
}));

// =============================================================================
// Selectors
// =============================================================================

export const useAppMode = () =>
  useEditorStore((state) => state.mode);

export const useViewMode = () =>
  useEditorStore((state) => state.viewMode);

export const useEditorGrid = () =>
  useEditorStore(useShallow((state) => state.grid));

export const useSelectedTile = () =>
  useEditorStore((state) => state.selectedTile);

export const useIsPaused = () =>
  useEditorStore((state) => state.isPaused);

export const useIsEditorMode = () =>
  useEditorStore((state) => state.mode === 'editor');

export const useIsSimulationMode = () =>
  useEditorStore((state) => state.mode === 'simulation');

export const useIsAnalyticsMode = () =>
  useEditorStore((state) => state.mode === 'analytics');

export const useIsReplayMode = () =>
  useEditorStore((state) => state.mode === 'replay');

export const useHasLastSavedGrid = () =>
  useEditorStore((state) => state.lastSavedGrid !== null);

export const useIs2DView = () =>
  useEditorStore((state) => state.viewMode === '2d');

export const useIsIsometricView = () =>
  useEditorStore((state) => state.viewMode === 'isometric');

// Combined selector for tile at specific position
export const useTileAt = (gridX: number, gridY: number) =>
  useEditorStore((state) => {
    if (gridX < 0 || gridX >= GRID_SIZE || gridY < 0 || gridY >= GRID_SIZE) {
      return null;
    }
    return state.grid[gridY]?.[gridX] ?? null;
  });
