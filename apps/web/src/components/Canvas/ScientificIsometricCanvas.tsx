/**
 * Scientific Isometric Canvas - Isometric grid visualization for the scientific model
 *
 * Shows:
 * - Agents as isometric figures with LLM-type colors
 * - Resource spawns as isometric blocks (food=green, energy=yellow, material=brown)
 * - Shelters as isometric buildings
 * - Isometric grid with 2:1 projection ratio
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useWorldStore, useAgents, useResourceSpawns, useShelters, type Agent, type ResourceSpawn, type Shelter } from '../../stores/world';

// Grid configuration
const GRID_SIZE = 100; // 100x100 grid
const TILE_WIDTH = 24; // Isometric tile width (2:1 ratio)
const TILE_HEIGHT = 12; // Isometric tile height

// Agent/resource rendering sizes
const AGENT_BASE_SIZE = 8;
const RESOURCE_BASE_SIZE = 10;
const SHELTER_BASE_SIZE = 14;

// Colors (matching ScientificCanvas)
const COLORS = {
  background: '#1a1a2e',
  grid: 'rgba(42, 42, 78, 0.4)',
  gridMajor: 'rgba(58, 58, 94, 0.6)',
  food: '#22c55e',
  energy: '#eab308',
  material: '#a16207',
  shelter: '#6b7280',
  // LLM type colors
  claude: '#e07a5f',
  gemini: '#4285f4',
  codex: '#10b981',
  deepseek: '#8b5cf6',
  qwen: '#f59e0b',
  glm: '#ec4899',
};

// Get agent color based on LLM type
function getAgentColor(llmType: string): string {
  const colorMap: Record<string, string> = {
    claude: COLORS.claude,
    gemini: COLORS.gemini,
    codex: COLORS.codex,
    deepseek: COLORS.deepseek,
    qwen: COLORS.qwen,
    glm: COLORS.glm,
  };
  return colorMap[llmType.toLowerCase()] || '#94a3b8';
}

// Darken a hex color
function darkenColor(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.floor(r * (1 - factor))}, ${Math.floor(g * (1 - factor))}, ${Math.floor(b * (1 - factor))})`;
}

// Lighten a hex color
function lightenColor(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.min(255, Math.floor(r + (255 - r) * factor))}, ${Math.min(255, Math.floor(g + (255 - g) * factor))}, ${Math.min(255, Math.floor(b + (255 - b) * factor))})`;
}

export function ScientificIsometricCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Camera state
  const [camera, setCamera] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(0.8);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [cameraStart, setCameraStart] = useState({ x: 0, y: 0 });

  // World state
  const agents = useAgents();
  const resourceSpawns = useResourceSpawns();
  const shelters = useShelters();
  const tick = useWorldStore((s) => s.tick);
  const selectedAgentId = useWorldStore((s) => s.selectedAgentId);
  const selectAgent = useWorldStore((s) => s.selectAgent);

  // Convert grid coordinates to isometric screen coordinates
  const gridToScreen = useCallback((gridX: number, gridY: number, z: number = 0): [number, number] => {
    const tileW = TILE_WIDTH * zoom;
    const tileH = TILE_HEIGHT * zoom;
    // Standard isometric 2:1 projection
    const screenX = (gridX - gridY) * (tileW / 2);
    const screenY = (gridX + gridY) * (tileH / 2) - z * zoom;
    return [screenX, screenY];
  }, [zoom]);

  // Draw an isometric diamond (tile base)
  const drawIsometricTile = useCallback((
    ctx: CanvasRenderingContext2D,
    screenX: number,
    screenY: number,
    width: number,
    height: number,
    fillColor: string,
    strokeColor?: string
  ) => {
    const halfW = width / 2;
    const halfH = height / 2;

    ctx.beginPath();
    ctx.moveTo(screenX, screenY - halfH);        // Top
    ctx.lineTo(screenX + halfW, screenY);        // Right
    ctx.lineTo(screenX, screenY + halfH);        // Bottom
    ctx.lineTo(screenX - halfW, screenY);        // Left
    ctx.closePath();

    ctx.fillStyle = fillColor;
    ctx.fill();

    if (strokeColor) {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }, []);

  // Draw an isometric block (cube-like)
  const drawIsometricBlock = useCallback((
    ctx: CanvasRenderingContext2D,
    screenX: number,
    screenY: number,
    width: number,
    height: number,
    depth: number,
    color: string,
    alpha: number = 1
  ) => {
    const halfW = width / 2;
    const halfH = height / 2;

    ctx.globalAlpha = alpha;

    // Top face (lightest)
    ctx.beginPath();
    ctx.moveTo(screenX, screenY - depth - halfH);
    ctx.lineTo(screenX + halfW, screenY - depth);
    ctx.lineTo(screenX, screenY - depth + halfH);
    ctx.lineTo(screenX - halfW, screenY - depth);
    ctx.closePath();
    ctx.fillStyle = lightenColor(color, 0.2);
    ctx.fill();

    // Right face (medium)
    ctx.beginPath();
    ctx.moveTo(screenX + halfW, screenY - depth);
    ctx.lineTo(screenX + halfW, screenY);
    ctx.lineTo(screenX, screenY + halfH);
    ctx.lineTo(screenX, screenY - depth + halfH);
    ctx.closePath();
    ctx.fillStyle = darkenColor(color, 0.1);
    ctx.fill();

    // Left face (darkest)
    ctx.beginPath();
    ctx.moveTo(screenX - halfW, screenY - depth);
    ctx.lineTo(screenX - halfW, screenY);
    ctx.lineTo(screenX, screenY + halfH);
    ctx.lineTo(screenX, screenY - depth + halfH);
    ctx.closePath();
    ctx.fillStyle = darkenColor(color, 0.3);
    ctx.fill();

    ctx.globalAlpha = 1;
  }, []);

  // Draw an agent as an isometric figure
  const drawAgent = useCallback((
    ctx: CanvasRenderingContext2D,
    agent: Agent,
    screenX: number,
    screenY: number,
    isSelected: boolean
  ) => {
    const scale = zoom;
    const baseColor = agent.state === 'dead' ? '#444444' : getAgentColor(agent.llmType);

    // Shadow
    ctx.beginPath();
    ctx.ellipse(screenX, screenY + 2 * scale, 8 * scale, 3 * scale, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fill();

    // Selection ring
    if (isSelected) {
      ctx.beginPath();
      ctx.ellipse(screenX, screenY, 12 * scale, 5 * scale, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 * scale;
      ctx.stroke();
    }

    // Body (simple isometric figure)
    const bodyHeight = 16 * scale;
    const bodyWidth = 10 * scale;

    // Legs
    ctx.fillStyle = darkenColor(baseColor, 0.2);
    ctx.fillRect(screenX - 4 * scale, screenY - 6 * scale, 3 * scale, 8 * scale);
    ctx.fillRect(screenX + 1 * scale, screenY - 6 * scale, 3 * scale, 8 * scale);

    // Torso
    ctx.fillStyle = baseColor;
    ctx.beginPath();
    ctx.moveTo(screenX - bodyWidth / 2, screenY - 6 * scale);
    ctx.lineTo(screenX - bodyWidth / 2 + 2 * scale, screenY - bodyHeight);
    ctx.lineTo(screenX + bodyWidth / 2 - 2 * scale, screenY - bodyHeight);
    ctx.lineTo(screenX + bodyWidth / 2, screenY - 6 * scale);
    ctx.closePath();
    ctx.fill();

    // Torso highlight
    ctx.fillStyle = lightenColor(baseColor, 0.2);
    ctx.beginPath();
    ctx.moveTo(screenX - bodyWidth / 2, screenY - 6 * scale);
    ctx.lineTo(screenX - bodyWidth / 2 + 2 * scale, screenY - bodyHeight);
    ctx.lineTo(screenX, screenY - bodyHeight);
    ctx.lineTo(screenX - 2 * scale, screenY - 6 * scale);
    ctx.closePath();
    ctx.fill();

    // Head
    const headRadius = 5 * scale;
    const headY = screenY - bodyHeight - headRadius;

    ctx.beginPath();
    ctx.arc(screenX, headY, headRadius, 0, Math.PI * 2);
    ctx.fillStyle = '#f5e6d3';
    ctx.fill();

    // Eyes (direction indicator)
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(screenX - 2 * scale, headY - 1 * scale, 1 * scale, 0, Math.PI * 2);
    ctx.arc(screenX + 2 * scale, headY - 1 * scale, 1 * scale, 0, Math.PI * 2);
    ctx.fill();

    // Health indicator (red aura if low health)
    if (agent.health < 30 && agent.state !== 'dead') {
      ctx.beginPath();
      ctx.arc(screenX, screenY - bodyHeight / 2, 12 * scale, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(239, 68, 68, ${0.5 + 0.5 * (1 - agent.health / 30)})`;
      ctx.lineWidth = 2 * scale;
      ctx.stroke();
    }

    // Agent label
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.max(8, 9 * scale)}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    // Text shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillText(agent.llmType.charAt(0).toUpperCase() + agent.llmType.slice(1), screenX + 1, screenY + 6 * scale + 1);

    ctx.fillStyle = '#ffffff';
    ctx.fillText(agent.llmType.charAt(0).toUpperCase() + agent.llmType.slice(1), screenX, screenY + 6 * scale);
  }, [zoom]);

  // Draw the canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;

    // Clear
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, width, height);

    // Save context for camera transform
    ctx.save();
    ctx.translate(camera.x + width / 2, camera.y + height / 3);

    // Draw grid (isometric diamond lines)
    const tileW = TILE_WIDTH * zoom;
    const tileH = TILE_HEIGHT * zoom;

    // Draw grid lines
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= GRID_SIZE; i += 5) {
      const isMajor = i % 10 === 0;
      ctx.strokeStyle = isMajor ? COLORS.gridMajor : COLORS.grid;

      // Lines along X axis
      const [startX1, startY1] = gridToScreen(i, 0);
      const [endX1, endY1] = gridToScreen(i, GRID_SIZE);
      ctx.beginPath();
      ctx.moveTo(startX1, startY1);
      ctx.lineTo(endX1, endY1);
      ctx.stroke();

      // Lines along Y axis
      const [startX2, startY2] = gridToScreen(0, i);
      const [endX2, endY2] = gridToScreen(GRID_SIZE, i);
      ctx.beginPath();
      ctx.moveTo(startX2, startY2);
      ctx.lineTo(endX2, endY2);
      ctx.stroke();
    }

    // Collect all drawable objects for depth sorting
    interface Drawable {
      type: 'shelter' | 'resource' | 'agent';
      x: number;
      y: number;
      depth: number;
      data: Shelter | ResourceSpawn | Agent;
    }

    const drawables: Drawable[] = [];

    // Add shelters
    for (const shelter of shelters) {
      drawables.push({
        type: 'shelter',
        x: shelter.x,
        y: shelter.y,
        depth: shelter.x + shelter.y,
        data: shelter,
      });
    }

    // Add resources
    for (const spawn of resourceSpawns) {
      drawables.push({
        type: 'resource',
        x: spawn.x,
        y: spawn.y,
        depth: spawn.x + spawn.y,
        data: spawn,
      });
    }

    // Add agents
    for (const agent of agents) {
      drawables.push({
        type: 'agent',
        x: agent.x,
        y: agent.y,
        depth: agent.x + agent.y,
        data: agent,
      });
    }

    // Sort by depth (painter's algorithm - back to front)
    drawables.sort((a, b) => a.depth - b.depth);

    // Draw all objects
    for (const drawable of drawables) {
      const [screenX, screenY] = gridToScreen(drawable.x, drawable.y);

      if (drawable.type === 'shelter') {
        const size = SHELTER_BASE_SIZE * zoom;
        drawIsometricBlock(
          ctx,
          screenX,
          screenY,
          size * 1.5,
          size * 0.75,
          size,
          COLORS.shelter,
          1
        );

        // Roof (triangle on top)
        ctx.fillStyle = darkenColor(COLORS.shelter, 0.2);
        ctx.beginPath();
        ctx.moveTo(screenX, screenY - size * 1.8);
        ctx.lineTo(screenX + size * 0.8, screenY - size);
        ctx.lineTo(screenX - size * 0.8, screenY - size);
        ctx.closePath();
        ctx.fill();
      } else if (drawable.type === 'resource') {
        const spawn = drawable.data as ResourceSpawn;
        const color = spawn.resourceType === 'food' ? COLORS.food :
                      spawn.resourceType === 'energy' ? COLORS.energy :
                      COLORS.material;

        const sizeFactor = spawn.currentAmount / spawn.maxAmount;
        const size = RESOURCE_BASE_SIZE * zoom * Math.max(0.4, sizeFactor);
        const alpha = 0.4 + 0.6 * sizeFactor;

        drawIsometricBlock(
          ctx,
          screenX,
          screenY,
          size,
          size * 0.5,
          size * 0.8,
          color,
          alpha
        );

        // Glow effect for resources
        ctx.beginPath();
        ctx.ellipse(screenX, screenY, size * 0.8, size * 0.4, 0, 0, Math.PI * 2);
        ctx.fillStyle = `${color}33`;
        ctx.fill();
      } else if (drawable.type === 'agent') {
        const agent = drawable.data as Agent;
        const isSelected = agent.id === selectedAgentId;
        drawAgent(ctx, agent, screenX, screenY, isSelected);
      }
    }

    ctx.restore();

    // Draw legend (fixed position, not affected by camera)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.beginPath();
    ctx.roundRect(8, 8, 120, 70, 6);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Tick: ${tick}`, 16, 22);
    ctx.fillText(`Agents: ${agents.length}`, 16, 38);
    ctx.fillText(`Resources: ${resourceSpawns.length}`, 16, 54);

    // Resource type legend
    const legendY = 78;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.beginPath();
    ctx.roundRect(8, legendY, 200, 24, 6);
    ctx.fill();

    ctx.fillStyle = COLORS.food;
    ctx.fillRect(16, legendY + 7, 10, 10);
    ctx.fillStyle = '#ffffff';
    ctx.font = '10px monospace';
    ctx.fillText('Food', 30, legendY + 13);

    ctx.fillStyle = COLORS.energy;
    ctx.fillRect(76, legendY + 7, 10, 10);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Energy', 90, legendY + 13);

    ctx.fillStyle = COLORS.material;
    ctx.fillRect(146, legendY + 7, 10, 10);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Mat', 160, legendY + 13);

  }, [agents, resourceSpawns, shelters, tick, selectedAgentId, camera, zoom, gridToScreen, drawIsometricTile, drawIsometricBlock, drawAgent]);

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current || !canvasRef.current) return;
      const { width, height } = containerRef.current.getBoundingClientRect();
      canvasRef.current.width = width;
      canvasRef.current.height = height;
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Handle wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    setZoom((z) => Math.max(0.3, Math.min(2.5, z + delta)));
  }, []);

  // Handle pan
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      setCameraStart({ ...camera });
    }
  }, [camera]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    setCamera({
      x: cameraStart.x + (e.clientX - dragStart.x),
      y: cameraStart.y + (e.clientY - dragStart.y),
    });
  }, [isDragging, dragStart, cameraStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Handle click to select agent
  const handleClick = useCallback((e: React.MouseEvent) => {
    if (!canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Convert to world coordinates (reverse isometric transform)
    const relX = mouseX - canvasRef.current.width / 2 - camera.x;
    const relY = mouseY - canvasRef.current.height / 3 - camera.y;

    const tileW = TILE_WIDTH * zoom;
    const tileH = TILE_HEIGHT * zoom;

    // Reverse isometric: screenX = (gridX - gridY) * tileW/2, screenY = (gridX + gridY) * tileH/2
    const gridX = (relY / tileH + relX / tileW);
    const gridY = (relY / tileH - relX / tileW);

    // Check if any agent was clicked (use screen coordinates for accuracy)
    for (const agent of agents) {
      const [screenX, screenY] = gridToScreen(agent.x, agent.y);
      const adjustedScreenX = screenX + camera.x + canvasRef.current.width / 2;
      const adjustedScreenY = screenY + camera.y + canvasRef.current.height / 3;
      const dist = Math.sqrt((mouseX - adjustedScreenX) ** 2 + (mouseY - adjustedScreenY) ** 2);

      if (dist < 20 * zoom) {
        selectAgent(agent.id === selectedAgentId ? null : agent.id);
        return;
      }
    }

    // Clicked empty space - deselect
    selectAgent(null);
  }, [agents, camera, zoom, selectedAgentId, selectAgent, gridToScreen]);

  // Reset camera
  const resetCamera = useCallback(() => {
    setCamera({ x: 0, y: 0 });
    setZoom(0.8);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-[#1a1a2e]"
      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onClick={handleClick}
      />

      {/* Controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-2" style={{ zIndex: 10 }}>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.min(2.5, z + 0.2))}
          className="w-10 h-10 bg-city-surface border border-city-border rounded-lg text-white hover:bg-city-accent transition-colors font-bold text-lg shadow-lg"
          title="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => setZoom((z) => Math.max(0.3, z - 0.2))}
          className="w-10 h-10 bg-city-surface border border-city-border rounded-lg text-white hover:bg-city-accent transition-colors font-bold text-lg shadow-lg"
          title="Zoom out"
        >
          -
        </button>
        <button
          type="button"
          onClick={resetCamera}
          className="w-10 h-10 bg-city-surface border border-city-border rounded-lg text-white hover:bg-city-accent transition-colors text-sm font-medium shadow-lg"
          title="Reset camera"
        >
          R
        </button>
      </div>

      {/* Help text */}
      <div
        className="absolute bottom-4 left-4 text-xs text-gray-400 bg-black/40 px-3 py-2 rounded-lg"
        style={{ zIndex: 10 }}
      >
        Drag to pan | Scroll to zoom | Click agent to select
      </div>

      {/* Isometric indicator badge */}
      <div
        className="absolute top-4 right-4 px-2 py-1 bg-city-accent/20 text-city-accent text-xs font-medium rounded border border-city-accent/30"
        style={{ zIndex: 10 }}
      >
        Isometric View
      </div>
    </div>
  );
}
