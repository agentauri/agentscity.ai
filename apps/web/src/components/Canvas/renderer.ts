/**
 * Isometric renderer for Agents City
 * Inspired by IsoCity (MIT License)
 */

import type { Agent, Location } from '../../stores/world';

// Isometric tile dimensions
const TILE_WIDTH = 64;
const TILE_HEIGHT = 32;

// Colors
const LOCATION_COLORS: Record<string, string> = {
  residential: '#4ade80',
  commercial: '#60a5fa',
  industrial: '#fbbf24',
  civic: '#a78bfa',
};

const STATE_COLORS: Record<string, string> = {
  idle: '#94a3b8',
  walking: '#10b981',
  working: '#f59e0b',
  sleeping: '#8b5cf6',
  dead: '#ef4444',
};

export interface RenderState {
  tick: number;
  agents: Agent[];
  locations: Location[];
  selectedAgentId: string | null;
}

export class IsometricRenderer {
  private baseCtx: CanvasRenderingContext2D;
  private agentsCtx: CanvasRenderingContext2D;
  private effectsCtx: CanvasRenderingContext2D;
  private state: RenderState = { tick: 0, agents: [], locations: [], selectedAgentId: null };
  private animationId: number = 0;
  private cameraX = 0;
  private cameraY = 0;
  private zoom = 1;
  private onAgentClick: ((agentId: string) => void) | null = null;

  constructor(
    baseCanvas: HTMLCanvasElement,
    agentsCanvas: HTMLCanvasElement,
    effectsCanvas: HTMLCanvasElement
  ) {
    this.baseCtx = baseCanvas.getContext('2d')!;
    this.agentsCtx = agentsCanvas.getContext('2d')!;
    this.effectsCtx = effectsCanvas.getContext('2d')!;

    // Center camera
    this.cameraX = baseCanvas.width / 2;
    this.cameraY = baseCanvas.height / 4;

    // Handle clicks on agents layer
    agentsCanvas.addEventListener('click', this.handleClick);
  }

  private handleClick = (e: MouseEvent) => {
    if (!this.onAgentClick) return;

    const rect = this.agentsCtx.canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // Find clicked agent
    for (const agent of this.state.agents) {
      const [sx, sy] = this.toScreen(agent.x, agent.y);
      const distance = Math.sqrt((clickX - sx) ** 2 + (clickY - sy) ** 2);

      if (distance < 15) {
        this.onAgentClick(agent.id);
        return;
      }
    }
  };

  setOnAgentClick(handler: (agentId: string) => void) {
    this.onAgentClick = handler;
  }

  /** Convert grid coords to screen coords (isometric projection) */
  private toScreen(x: number, y: number): [number, number] {
    const tileW = TILE_WIDTH * this.zoom;
    const tileH = TILE_HEIGHT * this.zoom;
    const screenX = (x - y) * (tileW / 2) + this.cameraX;
    const screenY = (x + y) * (tileH / 2) + this.cameraY;
    return [screenX, screenY];
  }

  /** Draw isometric tile */
  private drawTile(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    color: string,
    highlight = false
  ) {
    const [sx, sy] = this.toScreen(x, y);
    const tileW = TILE_WIDTH * this.zoom;
    const tileH = TILE_HEIGHT * this.zoom;

    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + tileW / 2, sy + tileH / 2);
    ctx.lineTo(sx, sy + tileH);
    ctx.lineTo(sx - tileW / 2, sy + tileH / 2);
    ctx.closePath();

    ctx.fillStyle = color;
    ctx.fill();

    if (highlight) {
      ctx.strokeStyle = '#e94560';
      ctx.lineWidth = 2;
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 1;
    }
    ctx.stroke();
  }

  /** Draw base terrain grid */
  private drawBase() {
    const ctx = this.baseCtx;
    const { width, height } = ctx.canvas;

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);

    // Calculate visible grid range based on camera
    const gridSize = 20;

    // Draw grid
    for (let x = -5; x < gridSize; x++) {
      for (let y = -5; y < gridSize; y++) {
        const color = (x + y) % 2 === 0 ? '#2d2d44' : '#252538';
        this.drawTile(ctx, x, y, color);
      }
    }

    // Draw locations
    for (const loc of this.state.locations) {
      const color = LOCATION_COLORS[loc.type] || '#666';
      this.drawTile(ctx, loc.x, loc.y, color);

      // Draw location name
      const [sx, sy] = this.toScreen(loc.x, loc.y);
      ctx.fillStyle = '#fff';
      ctx.font = `${10 * this.zoom}px system-ui`;
      ctx.textAlign = 'center';
      ctx.fillText(loc.name, sx, sy + TILE_HEIGHT * this.zoom + 12);
    }
  }

  /** Draw agents */
  private drawAgents() {
    const ctx = this.agentsCtx;
    const { width, height } = ctx.canvas;

    ctx.clearRect(0, 0, width, height);

    // Sort by y for proper layering
    const sortedAgents = [...this.state.agents].sort((a, b) => a.y - b.y);

    for (const agent of sortedAgents) {
      if (agent.health <= 0) continue; // Don't draw dead agents

      const [sx, sy] = this.toScreen(agent.x, agent.y);
      const isSelected = agent.id === this.state.selectedAgentId;
      const radius = (isSelected ? 10 : 8) * this.zoom;

      // Draw selection ring
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(sx, sy, radius + 4, 0, Math.PI * 2);
        ctx.strokeStyle = '#e94560';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Draw agent as circle
      ctx.beginPath();
      ctx.arc(sx, sy, radius, 0, Math.PI * 2);
      ctx.fillStyle = agent.color;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // State indicator
      const stateColor = STATE_COLORS[agent.state] || STATE_COLORS.idle;
      ctx.beginPath();
      ctx.arc(sx, sy - radius - 8, 4 * this.zoom, 0, Math.PI * 2);
      ctx.fillStyle = stateColor;
      ctx.fill();

      // Agent name
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${11 * this.zoom}px system-ui`;
      ctx.textAlign = 'center';
      ctx.fillText(agent.llmType, sx, sy + radius + 14);
    }
  }

  /** Draw effects layer (health bars, etc.) */
  private drawEffects() {
    const ctx = this.effectsCtx;
    const { width, height } = ctx.canvas;

    ctx.clearRect(0, 0, width, height);

    // Draw health bars for low health agents
    for (const agent of this.state.agents) {
      if (agent.health <= 0 || agent.health > 30) continue;

      const [sx, sy] = this.toScreen(agent.x, agent.y);
      const barWidth = 30 * this.zoom;
      const barHeight = 4 * this.zoom;

      // Background
      ctx.fillStyle = '#333';
      ctx.fillRect(sx - barWidth / 2, sy - 25 * this.zoom, barWidth, barHeight);

      // Health fill
      const healthPercent = agent.health / 100;
      ctx.fillStyle = agent.health < 10 ? '#ef4444' : '#f59e0b';
      ctx.fillRect(
        sx - barWidth / 2,
        sy - 25 * this.zoom,
        barWidth * healthPercent,
        barHeight
      );
    }

    // Draw tick counter
    ctx.fillStyle = '#fff';
    ctx.font = '14px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`Tick: ${this.state.tick}`, 10, 20);
  }

  /** Update world state */
  updateState(state: Partial<RenderState>) {
    this.state = { ...this.state, ...state };
    this.drawBase();
  }

  /** Update camera position */
  setCamera(x: number, y: number) {
    this.cameraX = x;
    this.cameraY = y;
    this.drawBase();
  }

  /** Update zoom level */
  setZoom(zoom: number) {
    this.zoom = Math.max(0.5, Math.min(2, zoom));
    this.drawBase();
  }

  /** Animation loop */
  private loop = () => {
    this.drawAgents();
    this.drawEffects();
    this.animationId = requestAnimationFrame(this.loop);
  };

  /** Start rendering */
  start() {
    this.drawBase();
    this.loop();
  }

  /** Stop rendering */
  stop() {
    cancelAnimationFrame(this.animationId);
  }

  /** Cleanup */
  destroy() {
    this.stop();
    this.agentsCtx.canvas.removeEventListener('click', this.handleClick);
  }
}
