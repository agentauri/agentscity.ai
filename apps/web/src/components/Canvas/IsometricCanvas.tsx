import { useEffect, useRef } from 'react';
import { useWorldStore } from '../../stores/world';
import { IsometricRenderer } from './renderer';

export function IsometricCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const agentsRef = useRef<HTMLCanvasElement>(null);
  const effectsRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<IsometricRenderer | null>(null);

  const { tick, agents, locations, selectedAgentId, selectAgent } = useWorldStore();

  // Initialize renderer
  useEffect(() => {
    if (!baseRef.current || !agentsRef.current || !effectsRef.current) return;

    const renderer = new IsometricRenderer(
      baseRef.current,
      agentsRef.current,
      effectsRef.current
    );

    renderer.setOnAgentClick((id) => {
      selectAgent(id === selectedAgentId ? null : id);
    });

    renderer.start();
    rendererRef.current = renderer;

    return () => {
      renderer.destroy();
      rendererRef.current = null;
    };
  }, []);

  // Update renderer state when world changes
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.updateState({
        tick,
        agents,
        locations,
        selectedAgentId,
      });
    }
  }, [tick, agents, locations, selectedAgentId]);

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
        rendererRef.current.setCamera(width / 2, height / 4);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Handle wheel zoom
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (rendererRef.current) {
        const currentZoom = 1; // TODO: get from store
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        rendererRef.current.setZoom(currentZoom + delta);
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <canvas
        ref={baseRef}
        className="absolute inset-0"
        style={{ zIndex: 1 }}
      />
      <canvas
        ref={agentsRef}
        className="absolute inset-0 cursor-pointer"
        style={{ zIndex: 2 }}
      />
      <canvas
        ref={effectsRef}
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 3 }}
      />
    </div>
  );
}
