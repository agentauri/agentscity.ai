import { useState } from 'react';
import { useEditorStore, useAppMode, useIsPaused } from '../../stores/editor';

interface ModeControlsProps {
  onStartSimulation: () => Promise<void>;
  onReset: () => void;
  onPause?: () => Promise<void>;
  onResume?: () => Promise<void>;
}

export function ModeControls({ onStartSimulation, onReset, onPause, onResume }: ModeControlsProps) {
  const mode = useAppMode();
  const isPaused = useIsPaused();
  const { setMode, setPaused } = useEditorStore();
  const [isLoading, setIsLoading] = useState(false);

  // Handle pause/resume with BE sync
  const handlePauseToggle = async () => {
    setIsLoading(true);
    try {
      if (isPaused) {
        await onResume?.();
        setPaused(false);
      } else {
        await onPause?.();
        setPaused(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Ready mode (waiting to start) - scientific model doesn't need editor
  if (mode === 'editor') {
    return (
      <div className="flex items-center gap-2">
        {/* Mode badge */}
        <span className="px-2 py-0.5 bg-city-accent/20 text-city-accent text-xs font-medium rounded">
          Ready
        </span>

        {/* Start button - scientific mode starts immediately */}
        <button
          type="button"
          disabled={isLoading}
          onClick={async () => {
            setIsLoading(true);
            try {
              await onStartSimulation();
            } finally {
              setIsLoading(false);
            }
          }}
          className="px-4 py-1.5 bg-city-accent hover:bg-city-accent-light text-white text-xs font-semibold rounded flex items-center gap-1.5 disabled:opacity-50"
        >
          {isLoading ? (
            <span className="animate-spin">⏳</span>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          )}
          {isLoading ? 'Starting...' : 'Start Simulation'}
        </button>
      </div>
    );
  }

  // Simulation mode controls
  return (
    <div className="flex items-center gap-2">
      {/* Mode badge */}
      <span className={`px-2 py-0.5 text-xs font-medium rounded ${
        isPaused
          ? 'bg-yellow-500/20 text-yellow-400'
          : 'bg-green-500/20 text-green-400'
      }`}>
        {isPaused ? 'Paused' : 'Running'}
      </span>

      {/* Pause/Resume button */}
      <button
        type="button"
        onClick={handlePauseToggle}
        disabled={isLoading}
        className="px-3 py-1.5 bg-city-surface-hover hover:bg-city-border/50 text-city-text text-xs font-medium rounded border border-city-border/50 flex items-center gap-1 disabled:opacity-50"
      >
        {isPaused ? (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Resume
          </>
        ) : (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
            Pause
          </>
        )}
      </button>

      {/* Analytics button */}
      <button
        type="button"
        onClick={() => setMode('analytics')}
        className="px-3 py-1.5 bg-city-accent/20 hover:bg-city-accent/30 text-city-accent text-xs font-medium rounded border border-city-accent/30 flex items-center gap-1"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3v18h18" />
          <path d="m19 9-5 5-4-4-3 3" />
        </svg>
        Analytics
      </button>

      {/* Reset button */}
      <button
        type="button"
        onClick={() => {
          if (confirm('Reset simulation? This will clear all agents and resources.')) {
            onReset();
          }
        }}
        className="px-3 py-1.5 bg-city-surface-hover hover:bg-red-500/20 text-city-text-muted hover:text-red-400 text-xs font-medium rounded border border-city-border/50 flex items-center gap-1"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="1 4 1 10 7 10" />
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
        </svg>
        Reset
      </button>
    </div>
  );
}
