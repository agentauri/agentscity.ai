import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import { useWorldStore, useAgents, useLocations, useBubbles } from '../../stores/world';
import { useEditorStore, useIsEditorMode, useEditorGrid, useSelectedTile } from '../../stores/editor';
import { IsometricRenderer } from './renderer';
import { useEditorInteraction } from '../../hooks/useEditorInteraction';

// Default zoom level for the city view
const DEFAULT_ZOOM = 0.6;

// Expose renderer ref to parent components
export interface IsometricCanvasHandle {
  getRenderer: () => IsometricRenderer | null;
}

export const IsometricCanvas = forwardRef<IsometricCanvasHandle>(function IsometricCanvas(_, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const agentsRef = useRef<HTMLCanvasElement>(null);
  const effectsRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<IsometricRenderer | null>(null);

  // Pan/drag state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [cameraStart, setCameraStart] = useState({ x: 0, y: 0 });
  const [currentZoom, setCurrentZoom] = useState(DEFAULT_ZOOM);
  const [isSpacePressed, setIsSpacePressed] = useState(false);

  // World store - use shallow selectors for proper React 19 re-renders
  const tick = useWorldStore((s) => s.tick);
  const selectedAgentId = useWorldStore((s) => s.selectedAgentId);
  const selectedLocationId = useWorldStore((s) => s.selectedLocationId);
  const selectAgent = useWorldStore((s) => s.selectAgent);
  const selectLocation = useWorldStore((s) => s.selectLocation);
  // Use proper shallow selectors for arrays
  const agents = useAgents();
  const locations = useLocations();
  const bubbles = useBubbles();

  // Editor store
  const isEditorMode = useIsEditorMode();
  const editorGrid = useEditorGrid();
  const selectedTile = useSelectedTile();

  // Expose renderer to parent
  useImperativeHandle(ref, () => ({
    getRenderer: () => rendererRef.current,
  }), []);

  // Initialize renderer
  useEffect(() => {
    if (!baseRef.current || !agentsRef.current || !effectsRef.current) return;

    const renderer = new IsometricRenderer(
      baseRef.current,
      agentsRef.current,
      effectsRef.current
    );

    renderer.setOnAgentClick((id) => {
      // Only handle agent clicks in simulation mode
      if (!isEditorMode) {
        selectAgent(id === selectedAgentId ? null : id);
      }
    });

    renderer.setOnLocationClick((id) => {
      // Only handle location clicks in simulation mode
      if (!isEditorMode) {
        selectLocation(id);
      }
    });

    renderer.start();
    rendererRef.current = renderer;

    // Set initial zoom
    renderer.setZoom(DEFAULT_ZOOM);

    return () => {
      renderer.destroy();
      rendererRef.current = null;
    };
  }, []);

  // Sync editor mode to renderer
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setEditorMode(isEditorMode);
    }
  }, [isEditorMode]);

  // Sync editor grid to renderer
  useEffect(() => {
    if (rendererRef.current && editorGrid) {
      rendererRef.current.setEditorGrid(editorGrid);
    }
  }, [editorGrid]);

  // Update renderer state when world changes (simulation mode)
  useEffect(() => {
    if (rendererRef.current && !isEditorMode) {
      rendererRef.current.updateState({
        tick,
        agents,
        locations,
        selectedAgentId,
        selectedLocationId,
        bubbles,
      });
    }
  }, [tick, agents, locations, selectedAgentId, selectedLocationId, bubbles, isEditorMode]);

  // Editor interaction hook
  useEditorInteraction({
    rendererRef,
    containerRef,
    isSpacePressed,
  });

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current) return;

      const { width, height } = containerRef.current.getBoundingClientRect();

      [baseRef, agentsRef, effectsRef].forEach((ref) => {
        if (ref.current) {
          ref.current.width = width;
          ref.current.height = height;
        }
      });

      if (rendererRef.current) {
        // Center the camera on the grid
        rendererRef.current.setCamera(width / 2, height / 4);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Handle wheel zoom - zooms towards mouse position
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (rendererRef.current) {
        const rect = container.getBoundingClientRect();

        // Mouse position relative to container
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Get current camera position
        const camera = rendererRef.current.getCamera();

        // Calculate zoom change
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        const newZoom = Math.max(0.25, Math.min(2, currentZoom + delta));

        // World point under the mouse before zoom
        const worldX = (mouseX - camera.x) / currentZoom;
        const worldY = (mouseY - camera.y) / currentZoom;

        // New camera position to keep the same world point under the mouse
        const newCameraX = mouseX - worldX * newZoom;
        const newCameraY = mouseY - worldY * newZoom;

        setCurrentZoom(newZoom);
        rendererRef.current.setZoom(newZoom);
        rendererRef.current.setCamera(newCameraX, newCameraY);
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [currentZoom]);

  // Handle space key for pan mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        setIsSpacePressed(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
        setIsDragging(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Handle pan/drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Middle-click always initiates pan
    if (e.button === 1) {
      e.preventDefault();
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      if (rendererRef.current) {
        const camera = rendererRef.current.getCamera();
        setCameraStart(camera);
      }
      return;
    }

    // Space + left-click initiates pan (in editor mode)
    if (isSpacePressed && e.button === 0) {
      e.preventDefault();
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
      if (rendererRef.current) {
        const camera = rendererRef.current.getCamera();
        setCameraStart(camera);
      }
      return;
    }

    // Left-click: in editor mode with a selected tile, don't start drag (let editor interaction handle it)
    if (isEditorMode && selectedTile && e.button === 0) return;

    // In simulation mode, left-click without space is for selecting agents/locations (not pan)
    // Pan is only enabled with space key held down
  }, [isEditorMode, selectedTile, isSpacePressed]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging || !rendererRef.current) return;

    const deltaX = e.clientX - dragStart.x;
    const deltaY = e.clientY - dragStart.y;

    rendererRef.current.setCamera(
      cameraStart.x + deltaX,
      cameraStart.y + deltaY
    );
  }, [isDragging, dragStart, cameraStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsDragging(false);
  }, []);


  // Double-click to reset camera
  const handleDoubleClick = useCallback(() => {
    if (!containerRef.current || !rendererRef.current) return;
    const { width, height } = containerRef.current.getBoundingClientRect();
    rendererRef.current.setCamera(width / 2, height / 4);
    setCurrentZoom(DEFAULT_ZOOM);
    rendererRef.current.setZoom(DEFAULT_ZOOM);
  }, []);

  // Determine cursor style
  const getCursorStyle = () => {
    if (isDragging) return 'grabbing';
    if (isSpacePressed) return 'grab';
    if (isEditorMode && selectedTile) return 'crosshair';
    return 'default'; // Default cursor for clicking agents/locations
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-[#1a1a2e]"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      onDoubleClick={handleDoubleClick}
      style={{ cursor: getCursorStyle() }}
    >
      <canvas
        ref={baseRef}
        className="absolute inset-0"
        style={{ zIndex: 1 }}
      />
      <canvas
        ref={agentsRef}
        className="absolute inset-0"
        style={{ zIndex: 2, pointerEvents: isDragging ? 'none' : 'auto' }}
      />
      <canvas
        ref={effectsRef}
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 3 }}
      />

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-2" style={{ zIndex: 10 }}>
        <button
          type="button"
          onClick={() => {
            const newZoom = Math.min(2, currentZoom + 0.15);
            setCurrentZoom(newZoom);
            rendererRef.current?.setZoom(newZoom);
          }}
          className="w-10 h-10 bg-city-surface border border-city-border rounded-lg text-white hover:bg-city-accent transition-colors font-bold text-lg shadow-lg"
          title="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => {
            const newZoom = Math.max(0.25, currentZoom - 0.15);
            setCurrentZoom(newZoom);
            rendererRef.current?.setZoom(newZoom);
          }}
          className="w-10 h-10 bg-city-surface border border-city-border rounded-lg text-white hover:bg-city-accent transition-colors font-bold text-lg shadow-lg"
          title="Zoom out"
        >
          -
        </button>
        <button
          type="button"
          onClick={handleDoubleClick}
          className="w-10 h-10 bg-city-surface border border-city-border rounded-lg text-white hover:bg-city-accent transition-colors text-sm font-medium shadow-lg"
          title="Reset camera (or double-click)"
        >
          R
        </button>
      </div>

      {/* Help text */}
      <div
        className="absolute bottom-4 left-4 text-xs text-gray-400 bg-black/40 px-3 py-2 rounded-lg"
        style={{ zIndex: 10 }}
      >
        {isEditorMode
          ? 'Click to place | Right-click to erase | Space+drag to pan | Scroll to zoom'
          : 'Click to select | Space+drag to pan | Scroll to zoom | Double-click to reset'}
      </div>
    </div>
  );
});
