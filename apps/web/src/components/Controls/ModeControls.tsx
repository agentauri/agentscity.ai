import { useState } from 'react';
import { useEditorStore, useAppMode, useIsPaused } from '../../stores/editor';
import { useSettingsStore, useSoundEnabled } from '../../stores/settings';

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
  const soundEnabled = useSoundEnabled();
  const { toggleSound } = useSettingsStore();

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
      <div className="flex items-center gap-1 sm:gap-2">
        {/* Mode badge - hidden on mobile */}
        <span className="hidden sm:inline-flex px-2 py-0.5 bg-city-accent/20 text-city-accent text-xs font-medium rounded">
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
          className="px-2.5 py-1.5 sm:px-4 bg-city-accent hover:bg-city-accent-light text-white text-[11px] sm:text-xs font-semibold rounded flex items-center gap-1 sm:gap-1.5 disabled:opacity-50"
        >
          {isLoading ? (
            <span className="animate-spin text-xs">...</span>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none" className="sm:w-3 sm:h-3">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          )}
          <span className="hidden xs:inline">{isLoading ? 'Starting...' : 'Start'}</span>
          <span className="xs:hidden">{isLoading ? '...' : 'Go'}</span>
        </button>
      </div>
    );
  }

  // Simulation mode controls
  return (
    <div className="flex items-center gap-1 sm:gap-2">
      {/* Mode badge - hidden on mobile */}
      <span className={`hidden sm:inline-flex px-2 py-0.5 text-xs font-medium rounded ${
        isPaused
          ? 'bg-yellow-500/20 text-yellow-400'
          : 'bg-green-500/20 text-green-400'
      }`}>
        {isPaused ? 'Paused' : 'Running'}
      </span>

      {/* Mobile status indicator */}
      <span className={`sm:hidden w-2 h-2 rounded-full ${
        isPaused ? 'bg-yellow-400' : 'bg-green-400 animate-pulse'
      }`} />

      {/* Pause/Resume button */}
      <button
        type="button"
        onClick={handlePauseToggle}
        disabled={isLoading}
        className="px-2 py-1.5 sm:px-3 bg-city-surface-hover hover:bg-city-border/50 text-city-text text-[11px] sm:text-xs font-medium rounded border border-city-border/50 flex items-center gap-1 disabled:opacity-50"
      >
        {isPaused ? (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none" className="sm:w-3 sm:h-3">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            <span className="hidden xs:inline">Resume</span>
          </>
        ) : (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none" className="sm:w-3 sm:h-3">
              <rect x="6" y="4" width="4" height="16" />
              <rect x="14" y="4" width="4" height="16" />
            </svg>
            <span className="hidden xs:inline">Pause</span>
          </>
        )}
      </button>

      {/* Sound toggle button */}
      <button
        type="button"
        onClick={toggleSound}
        className={`px-2 py-1.5 sm:px-3 text-[11px] sm:text-xs font-medium rounded border flex items-center gap-1 ${
          soundEnabled
            ? 'bg-city-accent/20 text-city-accent border-city-accent/30 hover:bg-city-accent/30'
            : 'bg-city-surface-hover text-city-text-muted border-city-border/50 hover:bg-city-border/50'
        }`}
        title={soundEnabled ? 'Sound enabled' : 'Sound disabled'}
      >
        {soundEnabled ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="sm:w-3 sm:h-3">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="sm:w-3 sm:h-3">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </svg>
        )}
      </button>

      {/* Analytics button - icon only on mobile */}
      <button
        type="button"
        onClick={() => setMode('analytics')}
        className="px-2 py-1.5 sm:px-3 bg-city-accent/20 hover:bg-city-accent/30 text-city-accent text-[11px] sm:text-xs font-medium rounded border border-city-accent/30 flex items-center gap-1"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="sm:w-3 sm:h-3">
          <path d="M3 3v18h18" />
          <path d="m19 9-5 5-4-4-3 3" />
        </svg>
        <span className="hidden sm:inline">Analytics</span>
      </button>

      {/* Reset button - icon only on mobile */}
      <button
        type="button"
        onClick={() => {
          if (confirm('Reset simulation? This will clear all agents and resources.')) {
            onReset();
          }
        }}
        className="px-2 py-1.5 sm:px-3 bg-city-surface-hover hover:bg-red-500/20 text-city-text-muted hover:text-red-400 text-[11px] sm:text-xs font-medium rounded border border-city-border/50 flex items-center gap-1"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="sm:w-3 sm:h-3">
          <polyline points="1 4 1 10 7 10" />
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
        </svg>
        <span className="hidden sm:inline">Reset</span>
      </button>
    </div>
  );
}
