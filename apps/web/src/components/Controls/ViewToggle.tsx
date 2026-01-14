/**
 * ViewToggle - Toggle button to switch between 2D and Isometric views
 */

import { useEditorStore, useViewMode } from '../../stores/editor';

export function ViewToggle() {
  const viewMode = useViewMode();
  const { toggleViewMode } = useEditorStore();

  return (
    <div className="flex items-center h-8 bg-city-surface border border-city-border rounded-lg p-0.5">
      <button
        type="button"
        onClick={() => viewMode !== '2d' && toggleViewMode()}
        className={`h-full px-3 text-xs font-medium rounded-md transition-all duration-200 flex items-center gap-1.5 ${
          viewMode === '2d'
            ? 'bg-city-accent text-white shadow-sm'
            : 'text-city-text-muted hover:text-city-text hover:bg-city-surface-hover'
        }`}
        title="2D Grid View"
      >
        {/* 2D Grid Icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
        </svg>
        2D
      </button>

      <button
        type="button"
        onClick={() => viewMode !== 'isometric' && toggleViewMode()}
        className={`h-full px-3 text-xs font-medium rounded-md transition-all duration-200 flex items-center gap-1.5 ${
          viewMode === 'isometric'
            ? 'bg-city-accent text-white shadow-sm'
            : 'text-city-text-muted hover:text-city-text hover:bg-city-surface-hover'
        }`}
        title="Isometric View"
      >
        {/* Isometric Cube Icon */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
        ISO
      </button>
    </div>
  );
}
