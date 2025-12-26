/**
 * Isometric Sprite Renderer for Agents City
 * Complete rewrite using IsoCity tileset (MIT License) by victorqribeiro
 *
 * Tileset: 12 columns x 6 rows, each sprite 130x230 pixels
 * Logical tile size: 128x64 pixels (isometric diamond)
 */

import type { Agent, Location, AgentBubble } from '../../stores/world';
import type { TileDef as EditorTileDef } from '../../utils/tiles';
import { GRID_SIZE as EDITOR_GRID_SIZE } from '../../utils/tiles';
import { AgentAnimationManager } from './agentAnimation';
import { getLLMColor, ANIM_ROWS } from './agentSprites';

// =============================================================================
// Constants
// =============================================================================

// Sprite sheet dimensions
const SPRITE_WIDTH = 130;
const SPRITE_HEIGHT = 230;
const TILE_WIDTH = 128;
const TILE_HEIGHT = 64;
const SPRITE_COLS = 12;
const SPRITE_ROWS = 6;

// Grid configuration - 20x20 to comfortably fit 6+ agents
const GRID_SIZE = 20;

// Downtown center (grid coordinates)
const DOWNTOWN_CENTER_X = 10;
const DOWNTOWN_CENTER_Y = 10;

// =============================================================================
// Tile Definitions (row, col) from tileset.png
// =============================================================================

// Row 0: Ground and basic roads
const TILE_GRASS = { col: 0, row: 0 };
const TILE_GRASS_ALT = { col: 1, row: 0 };
const TILE_DIRT = { col: 2, row: 0 };
const TILE_ROAD_H = { col: 3, row: 0 };      // Horizontal road
const TILE_ROAD_V = { col: 4, row: 0 };      // Vertical road
const TILE_SIDEWALK = { col: 5, row: 0 };
const TILE_TREE_1 = { col: 6, row: 0 };
const TILE_TREE_2 = { col: 7, row: 0 };
const TILE_PARK_1 = { col: 8, row: 0 };
const TILE_PARK_2 = { col: 9, row: 0 };
const TILE_WATER_1 = { col: 10, row: 0 };
const TILE_WATER_2 = { col: 11, row: 0 };

// Row 1: Road curves and T-junctions
const TILE_ROAD_CURVE_NE = { col: 0, row: 1 };
const TILE_ROAD_CURVE_SE = { col: 1, row: 1 };
const TILE_ROAD_CURVE_SW = { col: 2, row: 1 };
const TILE_ROAD_CURVE_NW = { col: 3, row: 1 };
const TILE_ROAD_T_N = { col: 4, row: 1 };    // T pointing north
const TILE_LAMPPOST = { col: 5, row: 1 };
const TILE_BENCH = { col: 6, row: 1 };
const TILE_FOUNTAIN = { col: 7, row: 1 };
const TILE_STATUE = { col: 8, row: 1 };

// Row 2: Road intersections and special tiles
const TILE_ROAD_T_E = { col: 0, row: 2 };    // T pointing east
const TILE_ROAD_T_S = { col: 1, row: 2 };    // T pointing south
const TILE_ROAD_T_W = { col: 2, row: 2 };    // T pointing west
const TILE_ROAD_CROSS = { col: 3, row: 2 };  // 4-way crossing
const TILE_ROAD_END = { col: 4, row: 2 };    // Dead end

// Row 3: Industrial buildings (columns 8-10)
const TILE_INDUSTRIAL_1 = { col: 8, row: 3 };
const TILE_INDUSTRIAL_2 = { col: 9, row: 3 };
const TILE_INDUSTRIAL_3 = { col: 10, row: 3 };

// Row 4: Residential (0-3) and Civic (8-10) buildings
const TILE_RESIDENTIAL_1 = { col: 0, row: 4 };
const TILE_RESIDENTIAL_2 = { col: 1, row: 4 };
const TILE_RESIDENTIAL_3 = { col: 2, row: 4 };
const TILE_RESIDENTIAL_4 = { col: 3, row: 4 };
const TILE_CIVIC_1 = { col: 8, row: 4 };
const TILE_CIVIC_2 = { col: 9, row: 4 };
const TILE_CIVIC_3 = { col: 10, row: 4 };
const TILE_RESIDENTIAL_5 = { col: 11, row: 4 };

// Row 5: Commercial buildings
const TILE_COMMERCIAL_1 = { col: 0, row: 5 };
const TILE_COMMERCIAL_2 = { col: 1, row: 5 };
const TILE_COMMERCIAL_3 = { col: 2, row: 5 };
const TILE_COMMERCIAL_4 = { col: 3, row: 5 };
const TILE_COMMERCIAL_5 = { col: 11, row: 5 };

// Building type to tile mappings
const BUILDING_TILES = {
  residential: [TILE_RESIDENTIAL_1, TILE_RESIDENTIAL_2, TILE_RESIDENTIAL_3, TILE_RESIDENTIAL_4, TILE_RESIDENTIAL_5],
  commercial: [TILE_COMMERCIAL_1, TILE_COMMERCIAL_2, TILE_COMMERCIAL_3, TILE_COMMERCIAL_4, TILE_COMMERCIAL_5],
  industrial: [TILE_INDUSTRIAL_1, TILE_INDUSTRIAL_2, TILE_INDUSTRIAL_3],
  civic: [TILE_CIVIC_1, TILE_CIVIC_2, TILE_CIVIC_3],
};

// Agent state colors
const STATE_COLORS: Record<string, string> = {
  idle: '#94a3b8',
  walking: '#81b29a',
  working: '#f2cc8f',
  sleeping: '#6a8caf',
  dead: '#e07a5f',
};

// =============================================================================
// Types
// =============================================================================

export interface RenderState {
  tick: number;
  agents: Agent[];
  locations: Location[];
  selectedAgentId: string | null;
  bubbles: AgentBubble[];
}

interface TileDef {
  col: number;
  row: number;
}

type CellType =
  | 'grass'
  | 'road_h'
  | 'road_v'
  | 'road_cross'
  | 'road_t_n'
  | 'road_t_e'
  | 'road_t_s'
  | 'road_t_w'
  | 'road_curve_ne'
  | 'road_curve_se'
  | 'road_curve_sw'
  | 'road_curve_nw'
  | 'tree'
  | 'building';

interface GridCell {
  type: CellType;
  tile: TileDef;
  buildingId?: string;
}

// =============================================================================
// Isometric Renderer Class
// =============================================================================

export class IsometricRenderer {
  private baseCtx: CanvasRenderingContext2D;
  private agentsCtx: CanvasRenderingContext2D;
  private effectsCtx: CanvasRenderingContext2D;

  private state: RenderState = {
    tick: 0,
    agents: [],
    locations: [],
    selectedAgentId: null,
    bubbles: []
  };

  private animationId: number = 0;
  private cameraX = 0;
  private cameraY = 0;
  private zoom = 0.6;
  private onAgentClick: ((agentId: string) => void) | null = null;

  // Sprite sheet
  private spriteSheet: HTMLImageElement | null = null;
  private spriteLoaded = false;

  // City layout
  private grid: GridCell[][] = [];
  private locationGridMap: Map<string, { gridX: number; gridY: number }> = new Map();

  // Editor mode
  private editorMode = false;
  private editorGrid: EditorTileDef[][] | null = null;
  private hoverGridX = -1;
  private hoverGridY = -1;

  // Agent animation
  private animationManager: AgentAnimationManager;

  // =============================================================================
  // Constructor & Setup
  // =============================================================================

  constructor(
    baseCanvas: HTMLCanvasElement,
    agentsCanvas: HTMLCanvasElement,
    effectsCanvas: HTMLCanvasElement
  ) {
    this.baseCtx = baseCanvas.getContext('2d')!;
    this.agentsCtx = agentsCanvas.getContext('2d')!;
    this.effectsCtx = effectsCanvas.getContext('2d')!;

    // Initialize animation manager
    this.animationManager = new AgentAnimationManager();

    // Center camera on grid
    this.centerCamera();

    // Initialize empty grid
    this.initializeGrid();

    // Load sprite sheet
    this.loadSpriteSheet();

    // Handle clicks
    agentsCanvas.addEventListener('click', this.handleClick);
  }

  private centerCamera(): void {
    const canvas = this.baseCtx.canvas;
    // Center on downtown
    const centerScreenX = DOWNTOWN_CENTER_X * TILE_WIDTH * this.zoom / 2;
    const centerScreenY = DOWNTOWN_CENTER_Y * TILE_HEIGHT * this.zoom / 2;
    this.cameraX = canvas.width / 2 - centerScreenX;
    this.cameraY = canvas.height / 4;
  }

  private loadSpriteSheet(): void {
    this.spriteSheet = new Image();
    this.spriteSheet.onload = () => {
      this.spriteLoaded = true;
      console.log('[Renderer] Sprite sheet loaded successfully');
      // In editor mode, draw from editor grid; otherwise draw generated city
      if (this.editorMode && this.editorGrid) {
        this.drawBaseFromEditorGrid();
      } else if (!this.editorMode) {
        this.buildCityLayout();
        this.drawBase();
      }
      // If editorMode is true but editorGrid is not set yet, wait for setEditorGrid() call
    };
    this.spriteSheet.onerror = () => {
      console.error('[Renderer] Failed to load sprite sheet');
    };
    this.spriteSheet.src = '/textures/tileset.png';
  }

  // =============================================================================
  // Grid & City Layout
  // =============================================================================

  private initializeGrid(): void {
    this.grid = [];
    for (let y = 0; y < GRID_SIZE; y++) {
      this.grid[y] = [];
      for (let x = 0; x < GRID_SIZE; x++) {
        this.grid[y][x] = {
          type: 'grass',
          tile: Math.random() < 0.3 ? TILE_GRASS_ALT : TILE_GRASS,
        };
      }
    }
  }

  private buildCityLayout(): void {
    // Reset grid
    this.initializeGrid();
    this.locationGridMap.clear();

    // Map world coordinates to grid coordinates
    // World coords go from ~30-70, we map to 0-19 grid
    const mapToGrid = (worldX: number, worldY: number): { gridX: number; gridY: number } => {
      // Map world range [20, 90] to grid range [0, 19]
      const gridX = Math.floor((worldX - 20) / 4);
      const gridY = Math.floor((worldY - 20) / 4);
      return {
        gridX: Math.max(0, Math.min(GRID_SIZE - 1, gridX)),
        gridY: Math.max(0, Math.min(GRID_SIZE - 1, gridY)),
      };
    };

    // Place buildings from locations
    for (const loc of this.state.locations) {
      const { gridX, gridY } = mapToGrid(loc.x, loc.y);
      this.locationGridMap.set(loc.id, { gridX, gridY });

      // Select building tile based on type
      const tiles = BUILDING_TILES[loc.type] || BUILDING_TILES.civic;
      const tileIndex = Math.abs(loc.id.charCodeAt(0)) % tiles.length;

      this.grid[gridY][gridX] = {
        type: 'building',
        tile: tiles[tileIndex],
        buildingId: loc.id,
      };
    }

    // Create road network
    this.generateRoads();

    // Add trees around perimeter and empty spaces
    this.addTrees();
  }

  private generateRoads(): void {
    // Main horizontal road through the center
    const mainRoadY = Math.floor(GRID_SIZE / 2);
    for (let x = 0; x < GRID_SIZE; x++) {
      if (this.grid[mainRoadY][x].type === 'grass') {
        this.grid[mainRoadY][x] = { type: 'road_h', tile: TILE_ROAD_H };
      }
    }

    // Main vertical road through the center
    const mainRoadX = Math.floor(GRID_SIZE / 2);
    for (let y = 0; y < GRID_SIZE; y++) {
      if (this.grid[y][mainRoadX].type === 'grass') {
        this.grid[y][mainRoadX] = { type: 'road_v', tile: TILE_ROAD_V };
      } else if (this.grid[y][mainRoadX].type === 'road_h') {
        this.grid[y][mainRoadX] = { type: 'road_cross', tile: TILE_ROAD_CROSS };
      }
    }

    // Connect buildings to roads
    for (const [locId, pos] of this.locationGridMap) {
      this.connectToRoad(pos.gridX, pos.gridY);
    }

    // Fix road intersections
    this.fixRoadIntersections();
  }

  private connectToRoad(buildingX: number, buildingY: number): void {
    const mainRoadX = Math.floor(GRID_SIZE / 2);
    const mainRoadY = Math.floor(GRID_SIZE / 2);

    // Draw horizontal road segment to main vertical road
    const startX = Math.min(buildingX, mainRoadX);
    const endX = Math.max(buildingX, mainRoadX);
    for (let x = startX; x <= endX; x++) {
      if (this.grid[buildingY][x].type === 'grass') {
        this.grid[buildingY][x] = { type: 'road_h', tile: TILE_ROAD_H };
      } else if (this.grid[buildingY][x].type === 'road_v') {
        this.grid[buildingY][x] = { type: 'road_cross', tile: TILE_ROAD_CROSS };
      }
    }

    // Draw vertical road segment to main horizontal road
    const startY = Math.min(buildingY, mainRoadY);
    const endY = Math.max(buildingY, mainRoadY);
    for (let y = startY; y <= endY; y++) {
      if (this.grid[y][buildingX].type === 'grass') {
        this.grid[y][buildingX] = { type: 'road_v', tile: TILE_ROAD_V };
      } else if (this.grid[y][buildingX].type === 'road_h') {
        this.grid[y][buildingX] = { type: 'road_cross', tile: TILE_ROAD_CROSS };
      }
    }
  }

  private fixRoadIntersections(): void {
    // Fix T-junctions and crossings based on neighbors
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const cell = this.grid[y][x];
        if (cell.type !== 'road_h' && cell.type !== 'road_v' && cell.type !== 'road_cross') continue;

        const hasNorth = y > 0 && this.isRoad(x, y - 1);
        const hasSouth = y < GRID_SIZE - 1 && this.isRoad(x, y + 1);
        const hasWest = x > 0 && this.isRoad(x - 1, y);
        const hasEast = x < GRID_SIZE - 1 && this.isRoad(x + 1, y);

        const connections = [hasNorth, hasSouth, hasWest, hasEast].filter(Boolean).length;

        if (connections === 4) {
          this.grid[y][x] = { type: 'road_cross', tile: TILE_ROAD_CROSS };
        } else if (connections === 3) {
          // T-junction
          if (!hasNorth) {
            this.grid[y][x] = { type: 'road_t_s', tile: TILE_ROAD_T_S };
          } else if (!hasSouth) {
            this.grid[y][x] = { type: 'road_t_n', tile: TILE_ROAD_T_N };
          } else if (!hasWest) {
            this.grid[y][x] = { type: 'road_t_e', tile: TILE_ROAD_T_E };
          } else if (!hasEast) {
            this.grid[y][x] = { type: 'road_t_w', tile: TILE_ROAD_T_W };
          }
        } else if (connections === 2) {
          // Curves or straight
          if (hasNorth && hasSouth) {
            this.grid[y][x] = { type: 'road_v', tile: TILE_ROAD_V };
          } else if (hasWest && hasEast) {
            this.grid[y][x] = { type: 'road_h', tile: TILE_ROAD_H };
          } else if (hasSouth && hasEast) {
            this.grid[y][x] = { type: 'road_curve_ne', tile: TILE_ROAD_CURVE_NE };
          } else if (hasSouth && hasWest) {
            this.grid[y][x] = { type: 'road_curve_nw', tile: TILE_ROAD_CURVE_NW };
          } else if (hasNorth && hasEast) {
            this.grid[y][x] = { type: 'road_curve_se', tile: TILE_ROAD_CURVE_SE };
          } else if (hasNorth && hasWest) {
            this.grid[y][x] = { type: 'road_curve_sw', tile: TILE_ROAD_CURVE_SW };
          }
        }
      }
    }
  }

  private isRoad(x: number, y: number): boolean {
    if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) return false;
    const type = this.grid[y][x].type;
    return type.startsWith('road');
  }

  private addTrees(): void {
    // Add trees around perimeter
    for (let i = 0; i < GRID_SIZE; i++) {
      // Top and bottom edges
      if (this.grid[0][i].type === 'grass') {
        this.grid[0][i] = { type: 'tree', tile: Math.random() < 0.5 ? TILE_TREE_1 : TILE_TREE_2 };
      }
      if (this.grid[GRID_SIZE - 1][i].type === 'grass') {
        this.grid[GRID_SIZE - 1][i] = { type: 'tree', tile: Math.random() < 0.5 ? TILE_TREE_1 : TILE_TREE_2 };
      }
      // Left and right edges
      if (this.grid[i][0].type === 'grass') {
        this.grid[i][0] = { type: 'tree', tile: Math.random() < 0.5 ? TILE_TREE_1 : TILE_TREE_2 };
      }
      if (this.grid[i][GRID_SIZE - 1].type === 'grass') {
        this.grid[i][GRID_SIZE - 1] = { type: 'tree', tile: Math.random() < 0.5 ? TILE_TREE_1 : TILE_TREE_2 };
      }
    }

    // Add random trees in grass areas (sparse)
    for (let y = 1; y < GRID_SIZE - 1; y++) {
      for (let x = 1; x < GRID_SIZE - 1; x++) {
        if (this.grid[y][x].type === 'grass' && Math.random() < 0.08) {
          // Make sure not too close to buildings
          if (!this.isNearBuilding(x, y, 1)) {
            this.grid[y][x] = { type: 'tree', tile: Math.random() < 0.5 ? TILE_TREE_1 : TILE_TREE_2 };
          }
        }
      }
    }
  }

  private isNearBuilding(x: number, y: number, distance: number): boolean {
    for (let dy = -distance; dy <= distance; dy++) {
      for (let dx = -distance; dx <= distance; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) {
          if (this.grid[ny][nx].type === 'building') {
            return true;
          }
        }
      }
    }
    return false;
  }

  // =============================================================================
  // Coordinate Conversion
  // =============================================================================

  /** Convert grid coords to screen coords (isometric projection) */
  private gridToScreen(gridX: number, gridY: number): [number, number] {
    const tileW = TILE_WIDTH * this.zoom;
    const tileH = TILE_HEIGHT * this.zoom;
    // Standard isometric transform: (y - x) for X, (x + y) for Y
    const screenX = (gridY - gridX) * (tileW / 2) + this.cameraX;
    const screenY = (gridX + gridY) * (tileH / 2) + this.cameraY;
    return [screenX, screenY];
  }

  /** Convert world coordinates to grid coordinates (fractional for smooth movement) */
  private worldToGrid(worldX: number, worldY: number): [number, number] {
    // World range [0, 100] -> grid range [0, 19]
    // Use fractional coordinates for smooth animation interpolation
    const gridX = (worldX / 100) * GRID_SIZE;
    const gridY = (worldY / 100) * GRID_SIZE;
    return [
      Math.max(0, Math.min(GRID_SIZE - 1, gridX)),
      Math.max(0, Math.min(GRID_SIZE - 1, gridY)),
    ];
  }

  /** Convert world coordinates directly to screen */
  private worldToScreen(worldX: number, worldY: number): [number, number] {
    // Map world coordinates to a position within the grid
    // World range ~[10, 90] should map smoothly across the grid
    const normalizedX = (worldX - 10) / 80 * GRID_SIZE;
    const normalizedY = (worldY - 10) / 80 * GRID_SIZE;

    const tileW = TILE_WIDTH * this.zoom;
    const tileH = TILE_HEIGHT * this.zoom;

    const screenX = (normalizedY - normalizedX) * (tileW / 2) + this.cameraX;
    const screenY = (normalizedX + normalizedY) * (tileH / 2) + this.cameraY;

    return [screenX, screenY];
  }

  // =============================================================================
  // Drawing Functions
  // =============================================================================

  /** Draw a sprite tile from the sprite sheet */
  private drawSprite(
    ctx: CanvasRenderingContext2D,
    gridX: number,
    gridY: number,
    tile: TileDef
  ): void {
    if (!this.spriteSheet || !this.spriteLoaded) return;

    const [screenX, screenY] = this.gridToScreen(gridX, gridY);
    const destW = SPRITE_WIDTH * this.zoom;
    const destH = SPRITE_HEIGHT * this.zoom;
    const tileH = TILE_HEIGHT * this.zoom;

    // Source position in sprite sheet
    const srcX = tile.col * SPRITE_WIDTH;
    const srcY = tile.row * SPRITE_HEIGHT;

    // IsoCity uses: drawImage(texture, sx, sy, 130, 230, -65, -130, 130, 230)
    // The sprite anchor is at (-65, -130) relative to the isometric grid point
    // -65 = half sprite width, -130 = specific offset for this tileset
    const drawX = screenX - destW / 2;
    const drawY = screenY - 130 * this.zoom;

    ctx.drawImage(
      this.spriteSheet,
      srcX, srcY, SPRITE_WIDTH, SPRITE_HEIGHT,
      drawX, drawY, destW, destH
    );
  }

  /** Draw the base layer (terrain, roads, buildings) */
  private drawBase(): void {
    const ctx = this.baseCtx;
    const { width, height } = ctx.canvas;

    // Dark background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);

    if (!this.spriteLoaded) return;

    // Draw tiles back to front (painter's algorithm)
    // For isometric, we iterate by sum of x+y to get correct depth ordering
    for (let sum = 0; sum < GRID_SIZE * 2 - 1; sum++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const y = sum - x;
        if (y < 0 || y >= GRID_SIZE) continue;

        const cell = this.grid[y][x];
        this.drawSprite(ctx, x, y, cell.tile);
      }
    }
  }

  /** Draw agents layer */
  private drawAgents(): void {
    const ctx = this.agentsCtx;
    const { width, height } = ctx.canvas;

    ctx.clearRect(0, 0, width, height);

    if (this.state.agents.length === 0) return;

    // Sort agents by visual depth (using animation manager positions)
    const sortedAgents = [...this.state.agents]
      .filter(a => a.health > 0)
      .sort((a, b) => {
        const stateA = this.animationManager.getState(a.id);
        const stateB = this.animationManager.getState(b.id);
        if (!stateA || !stateB) return 0;
        // Sort by visual depth (x + y for isometric ordering)
        return (stateA.visualX + stateA.visualY) - (stateB.visualX + stateB.visualY);
      });

    // Group agents by cell to handle overlapping
    const agentsByCell = new Map<string, Agent[]>();
    for (const agent of sortedAgents) {
      const state = this.animationManager.getState(agent.id);
      if (!state) continue;
      const cellKey = `${Math.floor(state.visualX)},${Math.floor(state.visualY)}`;
      if (!agentsByCell.has(cellKey)) agentsByCell.set(cellKey, []);
      agentsByCell.get(cellKey)!.push(agent);
    }

    // Draw agents with fan offset for overlapping cells
    for (const [, agents] of agentsByCell) {
      const offsets = this.getFanOffsets(agents.length);
      agents.forEach((agent, i) => {
        this.drawAgent(ctx, agent, offsets[i]);
      });
    }
  }

  /** Get fan pattern offsets for overlapping agents */
  private getFanOffsets(count: number): { dx: number; dy: number }[] {
    if (count === 1) return [{ dx: 0, dy: 0 }];
    if (count === 2) return [{ dx: -10, dy: 0 }, { dx: 10, dy: 0 }];
    // Circular pattern for 3+ agents
    return Array.from({ length: count }, (_, i) => ({
      dx: Math.cos((i * Math.PI * 2) / count - Math.PI / 2) * 14,
      dy: Math.sin((i * Math.PI * 2) / count - Math.PI / 2) * 7,
    }));
  }

  /** Check if agent is behind a tall building */
  private isAgentBehindBuilding(gridX: number, gridY: number): boolean {
    if (!this.editorGrid) return false;

    const cellX = Math.floor(gridX);
    const cellY = Math.floor(gridY);

    // In isometric view, buildings BEHIND the agent (lower x+y, drawn earlier)
    // extend upward on screen and can visually cover the agent.
    // Check cells behind/beside agent (negative offsets)
    const offsets = [
      { dx: -1, dy: 0 }, { dx: 0, dy: -1 }, { dx: -1, dy: -1 },
      { dx: -2, dy: 0 }, { dx: 0, dy: -2 }, { dx: -1, dy: -2 },
      { dx: -2, dy: -1 }, { dx: -2, dy: -2 },
      { dx: -1, dy: 1 }, { dx: 1, dy: -1 }, // Diagonal cells
    ];

    for (const { dx, dy } of offsets) {
      const checkX = cellX + dx;
      const checkY = cellY + dy;

      if (checkX >= 0 && checkX < GRID_SIZE && checkY >= 0 && checkY < GRID_SIZE) {
        const cell = this.editorGrid[checkY]?.[checkX];
        // Buildings are in rows 3-5 of the tileset (tall structures)
        if (cell && cell.row >= 3 && cell.row <= 5) {
          return true;
        }
      }
    }
    return false;
  }

  /** Draw a single agent as an isometric human figure */
  private drawAgent(
    ctx: CanvasRenderingContext2D,
    agent: Agent,
    offset: { dx: number; dy: number } = { dx: 0, dy: 0 }
  ): void {
    // Get animation state for position
    const animState = this.animationManager.getState(agent.id);
    if (!animState) return;

    // Convert grid position to screen coordinates and apply offset
    const [baseX, baseY] = this.gridToScreen(animState.visualX, animState.visualY);
    const sx = baseX + offset.dx * this.zoom;
    const sy = baseY + offset.dy * this.zoom;

    const isSelected = agent.id === this.state.selectedAgentId;
    const baseColor = getLLMColor(agent.llmType);
    const scale = this.zoom;

    // Check if agent is behind a building (render as silhouette)
    const isBehindBuilding = this.isAgentBehindBuilding(animState.visualX, animState.visualY);
    if (isBehindBuilding && !isSelected) {
      ctx.globalAlpha = 0.4;
    }

    // Dimensions for isometric human figure
    const bodyWidth = 16 * scale;
    const bodyHeight = 24 * scale;
    const headRadius = 8 * scale;
    const legWidth = 6 * scale;
    const legHeight = 16 * scale;

    // Offset to center figure on tile
    const figureY = sy - 10 * scale; // Raise figure slightly above ground

    // Calculate leg positions first (needed for shadow)
    const legY = figureY + bodyHeight * 0.3;
    const feetY = legY + legHeight;

    // Walking animation offset
    let legOffset = 0;
    if (animState.isMoving) {
      // Oscillate legs based on animation frame
      legOffset = (animState.animFrame - 1) * 3 * scale;
    }

    // Shadow (isometric ellipse on ground - positioned at feet level)
    ctx.beginPath();
    ctx.ellipse(sx, feetY + 2 * scale, bodyWidth * 0.7, bodyWidth * 0.25, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fill();

    // Selection ring
    if (isSelected) {
      ctx.beginPath();
      ctx.ellipse(sx, feetY, bodyWidth * 1.5, bodyWidth * 0.5, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(224, 122, 95, 0.3)';
      ctx.fill();
      ctx.strokeStyle = '#e07a5f';
      ctx.lineWidth = 2 * scale;
      ctx.stroke();
    }

    // Legs (back leg first for depth)

    // Back leg
    ctx.fillStyle = this.darkenColor(baseColor, 0.3);
    ctx.beginPath();
    ctx.roundRect(
      sx - legWidth * 0.8 + (animState.isMoving ? -legOffset : 0),
      legY,
      legWidth,
      legHeight,
      2 * scale
    );
    ctx.fill();

    // Front leg
    ctx.fillStyle = this.darkenColor(baseColor, 0.2);
    ctx.beginPath();
    ctx.roundRect(
      sx - legWidth * 0.2 + (animState.isMoving ? legOffset : 0),
      legY,
      legWidth,
      legHeight,
      2 * scale
    );
    ctx.fill();

    // Body (isometric torso - slightly trapezoidal)
    const bodyTop = figureY - bodyHeight * 0.5;
    ctx.fillStyle = baseColor;
    ctx.beginPath();
    ctx.moveTo(sx - bodyWidth * 0.5, bodyTop + bodyHeight);
    ctx.lineTo(sx - bodyWidth * 0.4, bodyTop);
    ctx.lineTo(sx + bodyWidth * 0.4, bodyTop);
    ctx.lineTo(sx + bodyWidth * 0.5, bodyTop + bodyHeight);
    ctx.closePath();
    ctx.fill();

    // Body highlight (left side for isometric lighting)
    ctx.fillStyle = this.lightenColor(baseColor, 0.2);
    ctx.beginPath();
    ctx.moveTo(sx - bodyWidth * 0.5, bodyTop + bodyHeight);
    ctx.lineTo(sx - bodyWidth * 0.4, bodyTop);
    ctx.lineTo(sx, bodyTop);
    ctx.lineTo(sx - bodyWidth * 0.1, bodyTop + bodyHeight);
    ctx.closePath();
    ctx.fill();

    // Arms
    const armY = bodyTop + bodyHeight * 0.1;
    const armWidth = 5 * scale;
    const armHeight = 14 * scale;

    // Left arm (swings opposite to legs when walking)
    ctx.fillStyle = baseColor;
    ctx.beginPath();
    ctx.roundRect(
      sx - bodyWidth * 0.6 + (animState.isMoving ? legOffset * 0.5 : 0),
      armY,
      armWidth,
      armHeight,
      2 * scale
    );
    ctx.fill();

    // Right arm
    ctx.beginPath();
    ctx.roundRect(
      sx + bodyWidth * 0.45 + (animState.isMoving ? -legOffset * 0.5 : 0),
      armY,
      armWidth,
      armHeight,
      2 * scale
    );
    ctx.fill();

    // Head
    const headY = bodyTop - headRadius * 0.8;

    // Head shadow/back
    ctx.beginPath();
    ctx.arc(sx, headY, headRadius, 0, Math.PI * 2);
    ctx.fillStyle = this.darkenColor(baseColor, 0.1);
    ctx.fill();

    // Head main
    ctx.beginPath();
    ctx.arc(sx - 1 * scale, headY - 1 * scale, headRadius * 0.95, 0, Math.PI * 2);
    ctx.fillStyle = '#f5e6d3'; // Skin tone
    ctx.fill();

    // Face direction indicator (simple dot for eyes based on facing)
    const eyeOffsetX = animState.facing === 'se' ? 2 * scale : -2 * scale;
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(sx + eyeOffsetX - 2 * scale, headY - 2 * scale, 1.5 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(sx + eyeOffsetX + 2 * scale, headY - 2 * scale, 1.5 * scale, 0, Math.PI * 2);
    ctx.fill();

    // State indicator removed - was causing visual issues
    // const stateColor = STATE_COLORS[agent.state] || STATE_COLORS.idle;
    // ctx.beginPath();
    // ctx.arc(sx + headRadius * 1.2, headY - headRadius * 0.8, 4 * scale, 0, Math.PI * 2);
    // ctx.fillStyle = stateColor;
    // ctx.fill();
    // ctx.strokeStyle = '#ffffff';
    // ctx.lineWidth = 1.5 * scale;
    // ctx.stroke();

    // Walking indicator (small motion lines)
    if (animState.isMoving) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 1 * scale;
      const motionX = animState.facing === 'se' ? -12 * scale : 12 * scale;
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        ctx.moveTo(sx + motionX, figureY + i * 6 * scale);
        ctx.lineTo(sx + motionX + (animState.facing === 'se' ? -6 : 6) * scale, figureY + i * 6 * scale);
        ctx.stroke();
      }
    }

    // Agent name label (text with shadow, no background box)
    const label = agent.llmType.charAt(0).toUpperCase() + agent.llmType.slice(1);
    ctx.font = `bold ${10 * scale}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    // Text shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillText(label, sx + 1, feetY + 6 * scale + 1);

    // Text
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, sx, feetY + 6 * scale);

    // Reset alpha if it was modified for behind-building effect
    if (isBehindBuilding && !isSelected) {
      ctx.globalAlpha = 1;
    }
  }

  /** Draw effects layer (health bars, speech bubbles, UI) */
  private drawEffects(): void {
    const ctx = this.effectsCtx;
    const { width, height } = ctx.canvas;
    const now = Date.now();
    const BUBBLE_DURATION = 3000;

    ctx.clearRect(0, 0, width, height);

    // Health bars for low health agents (only show when health is defined and low)
    for (const agent of this.state.agents) {
      if (!agent.health || agent.health <= 0 || agent.health > 30) continue;

      const animState = this.animationManager.getState(agent.id);
      if (!animState) continue;
      const [sx, sy] = this.gridToScreen(animState.visualX, animState.visualY);
      const barWidth = 40 * this.zoom;
      const barHeight = 5 * this.zoom;
      // Position below agent feet (feetY ≈ sy + 13*zoom), below the name label
      const barY = sy + 32 * this.zoom;

      // Background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.beginPath();
      ctx.roundRect(sx - barWidth / 2 - 2, barY - 2, barWidth + 4, barHeight + 4, 3);
      ctx.fill();

      // Health bar background
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(sx - barWidth / 2, barY, barWidth, barHeight);

      // Health bar fill
      const healthPercent = agent.health / 100;
      ctx.fillStyle = agent.health < 10 ? '#e07a5f' : '#f2cc8f';
      ctx.fillRect(sx - barWidth / 2, barY, barWidth * healthPercent, barHeight);
    }

    // Speech bubbles
    for (const bubble of this.state.bubbles) {
      const agent = this.state.agents.find((a) => a.id === bubble.agentId);
      if (!agent || agent.health <= 0) continue;

      const animState = this.animationManager.getState(agent.id);
      if (!animState) continue;

      const age = now - bubble.timestamp;
      if (age > BUBBLE_DURATION) continue;

      // Fade animation
      const fadeStart = BUBBLE_DURATION - 500;
      const opacity = age > fadeStart ? 1 - (age - fadeStart) / 500 : 1;

      // Float up animation
      const floatOffset = Math.min(age / 200, 10) * this.zoom;

      const [sx, sy] = this.gridToScreen(animState.visualX, animState.visualY);
      const bubbleY = sy - 60 * this.zoom - floatOffset;
      const text = bubble.emoji ? `${bubble.emoji} ${bubble.text}` : bubble.text;

      ctx.font = `bold ${12 * this.zoom}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      const textWidth = ctx.measureText(text).width;
      const padding = 10 * this.zoom;
      const bubbleWidth = Math.min(textWidth + padding * 2, 200 * this.zoom);
      const bubbleHeight = 26 * this.zoom;

      ctx.globalAlpha = opacity;

      // Bubble background
      ctx.fillStyle = 'rgba(30, 30, 50, 0.95)';
      ctx.beginPath();
      ctx.roundRect(
        sx - bubbleWidth / 2,
        bubbleY - bubbleHeight / 2,
        bubbleWidth,
        bubbleHeight,
        8 * this.zoom
      );
      ctx.fill();

      // Border
      ctx.strokeStyle = '#e07a5f';
      ctx.lineWidth = 2 * this.zoom;
      ctx.stroke();

      // Pointer triangle
      ctx.fillStyle = 'rgba(30, 30, 50, 0.95)';
      ctx.beginPath();
      ctx.moveTo(sx - 6 * this.zoom, bubbleY + bubbleHeight / 2);
      ctx.lineTo(sx, bubbleY + bubbleHeight / 2 + 10 * this.zoom);
      ctx.lineTo(sx + 6 * this.zoom, bubbleY + bubbleHeight / 2);
      ctx.closePath();
      ctx.fill();

      // Text
      ctx.fillStyle = '#f4f1de';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const displayText = text.length > 25 ? text.substring(0, 22) + '...' : text;
      ctx.fillText(displayText, sx, bubbleY);

      ctx.globalAlpha = 1;
    }

    // Tick counter
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.beginPath();
    ctx.roundRect(8, 8, 100, 28, 6);
    ctx.fill();

    ctx.fillStyle = '#f4f1de';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Tick: ${this.state.tick}`, 16, 22);

    // Agent count
    const aliveCount = this.state.agents.filter(a => a.health > 0).length;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.beginPath();
    ctx.roundRect(8, 42, 100, 28, 6);
    ctx.fill();

    ctx.fillStyle = '#81b29a';
    ctx.fillText(`Agents: ${aliveCount}`, 16, 56);
  }

  // =============================================================================
  // Color Utilities
  // =============================================================================

  private lightenColor(hex: string, factor: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgb(${Math.min(255, Math.floor(r + (255 - r) * factor))}, ${Math.min(255, Math.floor(g + (255 - g) * factor))}, ${Math.min(255, Math.floor(b + (255 - b) * factor))})`;
  }

  private darkenColor(hex: string, factor: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgb(${Math.floor(r * (1 - factor))}, ${Math.floor(g * (1 - factor))}, ${Math.floor(b * (1 - factor))})`;
  }

  // =============================================================================
  // Event Handling
  // =============================================================================

  private handleClick = (e: MouseEvent): void => {
    if (!this.onAgentClick) return;

    const rect = this.agentsCtx.canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Check each agent for click proximity using animation positions
    for (const agent of this.state.agents) {
      if (agent.health <= 0) continue;

      const animState = this.animationManager.getState(agent.id);
      if (!animState) continue;

      const [sx, sy] = this.gridToScreen(animState.visualX, animState.visualY);
      const distance = Math.sqrt((clickX - sx) ** 2 + (clickY - sy) ** 2);

      if (distance < 30 * this.zoom) {
        this.onAgentClick(agent.id);
        return;
      }
    }
  };

  setOnAgentClick(handler: (agentId: string) => void): void {
    this.onAgentClick = handler;
  }

  // =============================================================================
  // Public API
  // =============================================================================

  /** Update world state */
  updateState(state: Partial<RenderState>): void {
    const locationsChanged = state.locations &&
      JSON.stringify(state.locations) !== JSON.stringify(this.state.locations);

    this.state = { ...this.state, ...state };

    // Update agent animation targets
    if (state.agents) {
      const currentAgentIds = new Set<string>();
      for (const agent of state.agents) {
        currentAgentIds.add(agent.id);
        const [gridX, gridY] = this.worldToGrid(agent.x, agent.y);
        this.animationManager.setTarget(agent.id, gridX, gridY);
      }
      // Remove agents that are no longer present
      this.animationManager.syncAgents(currentAgentIds);
    }

    // Only rebuild city layout if locations changed AND we don't have an editor grid
    // (editor grid takes precedence - preserves user's layout)
    if (locationsChanged && this.spriteLoaded) {
      if (this.editorGrid) {
        // Use editor grid - just redraw without regenerating
        this.drawBaseFromEditorGrid();
      } else {
        // No editor grid - generate layout from locations
        this.buildCityLayout();
        this.drawBase();
      }
    }
  }

  /** Get current camera position */
  getCamera(): { x: number; y: number } {
    return { x: this.cameraX, y: this.cameraY };
  }

  /** Update camera position */
  setCamera(x: number, y: number): void {
    this.cameraX = x;
    this.cameraY = y;
    this.redrawBase();
  }

  /** Get current zoom level */
  getZoom(): number {
    return this.zoom;
  }

  /** Update zoom level */
  setZoom(zoom: number): void {
    this.zoom = Math.max(0.25, Math.min(2, zoom));
    this.redrawBase();
  }

  /** Animation loop */
  private loop = (): void => {
    // Update animation states
    this.animationManager.update(performance.now());

    this.drawAgents();
    this.drawEffects();
    this.animationId = requestAnimationFrame(this.loop);
  };

  /** Start rendering */
  start(): void {
    if (this.spriteLoaded) {
      this.redrawBase();
    }
    this.loop();
  }

  /** Stop rendering */
  stop(): void {
    cancelAnimationFrame(this.animationId);
  }

  /** Cleanup */
  destroy(): void {
    this.stop();
    this.agentsCtx.canvas.removeEventListener('click', this.handleClick);
  }

  // =============================================================================
  // Editor Mode API
  // =============================================================================

  /** Set editor mode on/off */
  setEditorMode(enabled: boolean): void {
    this.editorMode = enabled;
    // Always use editor grid if available (preserves user's layout)
    if (this.editorGrid && this.spriteLoaded) {
      this.drawBaseFromEditorGrid();
    } else if (!enabled && this.spriteLoaded) {
      // Fallback: rebuild city layout from locations (only if no editor grid)
      this.buildCityLayout();
      this.drawBase();
    }
  }

  /** Check if in editor mode */
  isEditorMode(): boolean {
    return this.editorMode;
  }

  /** Set editor grid and redraw */
  setEditorGrid(grid: EditorTileDef[][]): void {
    this.editorGrid = grid;
    if (this.editorMode && this.spriteLoaded) {
      this.drawBaseFromEditorGrid();
    }
  }

  /** Get current editor grid */
  getEditorGrid(): EditorTileDef[][] | null {
    return this.editorGrid;
  }

  /** Convert screen coordinates to grid coordinates */
  screenToGrid(screenX: number, screenY: number): { gridX: number; gridY: number } | null {
    const tileW = TILE_WIDTH * this.zoom;
    const tileH = TILE_HEIGHT * this.zoom;

    // Adjust for camera position
    const relX = screenX - this.cameraX;
    const relY = screenY - this.cameraY;

    // Reverse isometric transformation
    // Forward: screenX = (gridY - gridX) * tileW/2, screenY = (gridX + gridY) * tileH/2
    // Reverse: gridX = (relY/tileH - relX/tileW), gridY = (relY/tileH + relX/tileW)
    const gridX = Math.floor((relY / (tileH / 2) - relX / (tileW / 2)) / 2);
    const gridY = Math.floor((relY / (tileH / 2) + relX / (tileW / 2)) / 2);

    // Bounds check
    if (gridX < 0 || gridX >= GRID_SIZE || gridY < 0 || gridY >= GRID_SIZE) {
      return null;
    }

    return { gridX, gridY };
  }

  /** Update hover position for preview */
  setHoverPosition(gridX: number, gridY: number): void {
    if (this.hoverGridX !== gridX || this.hoverGridY !== gridY) {
      this.hoverGridX = gridX;
      this.hoverGridY = gridY;
      // Redraw to show hover effect
      if (this.editorMode && this.spriteLoaded) {
        this.drawBaseFromEditorGrid();
      }
    }
  }

  /** Clear hover position */
  clearHoverPosition(): void {
    this.hoverGridX = -1;
    this.hoverGridY = -1;
    if (this.editorMode && this.spriteLoaded) {
      this.drawBaseFromEditorGrid();
    }
  }

  /** Draw base layer from editor grid (no auto-generation) */
  private drawBaseFromEditorGrid(): void {
    const ctx = this.baseCtx;
    const { width, height } = ctx.canvas;

    // Dark background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);

    if (!this.spriteLoaded || !this.editorGrid) return;

    // Draw tiles back to front (painter's algorithm)
    // For isometric, we iterate by sum of x+y to get correct depth ordering
    for (let sum = 0; sum < GRID_SIZE * 2 - 1; sum++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const y = sum - x;
        if (y < 0 || y >= GRID_SIZE) continue;

        const tile = this.editorGrid[y]?.[x];
        if (tile) {
          this.drawSprite(ctx, x, y, { col: tile.col, row: tile.row });
        }
      }
    }

    // Draw editor-only elements
    if (this.editorMode) {
      // Draw hover highlight
      if (this.hoverGridX >= 0 && this.hoverGridY >= 0) {
        this.drawHoverHighlight(ctx, this.hoverGridX, this.hoverGridY);
      }

      // Draw grid lines for better visibility
      this.drawEditorGrid(ctx);
    }
  }

  /** Draw hover highlight on tile */
  private drawHoverHighlight(ctx: CanvasRenderingContext2D, gridX: number, gridY: number): void {
    const [screenX, screenY] = this.gridToScreen(gridX, gridY);
    const tileW = TILE_WIDTH * this.zoom;
    const tileH = TILE_HEIGHT * this.zoom;

    ctx.save();
    ctx.strokeStyle = '#e07a5f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(screenX, screenY);
    ctx.lineTo(screenX + tileW / 2, screenY + tileH / 2);
    ctx.lineTo(screenX, screenY + tileH);
    ctx.lineTo(screenX - tileW / 2, screenY + tileH / 2);
    ctx.closePath();
    ctx.stroke();

    // Semi-transparent fill
    ctx.fillStyle = 'rgba(224, 122, 95, 0.2)';
    ctx.fill();
    ctx.restore();
  }

  /** Draw subtle grid lines for editor */
  private drawEditorGrid(ctx: CanvasRenderingContext2D): void {
    if (!this.editorMode) return;

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;

    // Draw grid lines
    for (let i = 0; i <= GRID_SIZE; i++) {
      // Horizontal lines (along Y axis)
      const [startX, startY] = this.gridToScreen(0, i);
      const [endX, endY] = this.gridToScreen(GRID_SIZE, i);
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      // Vertical lines (along X axis)
      const [startX2, startY2] = this.gridToScreen(i, 0);
      const [endX2, endY2] = this.gridToScreen(i, GRID_SIZE);
      ctx.beginPath();
      ctx.moveTo(startX2, startY2);
      ctx.lineTo(endX2, endY2);
      ctx.stroke();
    }

    ctx.restore();
  }

  /** Get grid size */
  getGridSize(): number {
    return GRID_SIZE;
  }

  /** Force redraw base layer */
  redrawBase(): void {
    // Always prefer editor grid if available (preserves user's layout)
    if (this.editorGrid) {
      this.drawBaseFromEditorGrid();
    } else {
      this.drawBase();
    }
  }
}
