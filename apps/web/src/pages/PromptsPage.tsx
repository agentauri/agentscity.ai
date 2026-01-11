/**
 * PromptsPage - Full-screen prompt gallery and inspector page
 *
 * Phase 1: Template Gallery
 * - View all prompt templates (mode, safety, personality)
 * - Compare templates side-by-side
 * - Copy templates to clipboard
 *
 * Phase 2: Live Inspector
 * - Real-time prompt inspection per agent
 * - Decision history with prompts
 */

import { useState } from 'react';
import { useEditorStore } from '../stores/editor';
import { PromptGallery } from '../components/PromptGallery';
import { PromptInspector } from '../components/PromptInspector';

type TabId = 'gallery' | 'inspector';

export function PromptsPage() {
  const setMode = useEditorStore((s) => s.setMode);
  const [activeTab, setActiveTab] = useState<TabId>('gallery');

  const handleBackToCity = () => {
    setMode('simulation');
  };

  return (
    <div className="h-screen flex flex-col bg-city-bg">
      {/* Header */}
      <header className="flex-none h-14 bg-city-surface border-b border-city-border px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 bg-purple-600 rounded-md flex items-center justify-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-white"
            >
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" x2="8" y1="13" y2="13" />
              <line x1="16" x2="8" y1="17" y2="17" />
              <line x1="10" x2="8" y1="9" y2="9" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-semibold text-city-text">
              {activeTab === 'gallery' ? 'Prompt Gallery' : 'Live Inspector'}
            </h1>
            <p className="text-[10px] text-city-text-muted">
              {activeTab === 'gallery'
                ? 'View and compare agent prompts'
                : 'Real-time prompt inspection per agent'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Tab buttons */}
          <div className="flex bg-city-bg rounded-lg p-0.5 border border-city-border">
            <button
              onClick={() => setActiveTab('gallery')}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                activeTab === 'gallery'
                  ? 'bg-city-surface text-city-text'
                  : 'text-city-text-muted hover:text-city-text'
              }`}
            >
              Gallery
            </button>
            <button
              onClick={() => setActiveTab('inspector')}
              className={`px-3 py-1.5 text-xs font-medium rounded transition-colors flex items-center gap-1.5 ${
                activeTab === 'inspector'
                  ? 'bg-city-surface text-city-text'
                  : 'text-city-text-muted hover:text-city-text'
              }`}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              Live Inspector
            </button>
          </div>

          <button
            type="button"
            onClick={handleBackToCity}
            className="px-4 py-1.5 bg-city-surface-hover hover:bg-city-border/50 text-city-text text-xs font-medium rounded border border-city-border/50 flex items-center gap-2"
          >
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
              <path d="m12 19-7-7 7-7" />
              <path d="M19 12H5" />
            </svg>
            Back to City
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">
        {activeTab === 'gallery' ? <PromptGallery /> : <PromptInspector />}
      </main>

      {/* Footer */}
      <footer className="flex-none h-10 bg-city-surface border-t border-city-border px-4 flex items-center justify-between text-xs text-city-text-muted">
        <span>
          {activeTab === 'gallery'
            ? 'Templates extracted from server-side prompt builders'
            : 'Set PROMPT_LOGGING_ENABLED=true to enable logging'}
        </span>
        <a
          href="https://github.com/simagents/simagents.io"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-city-text flex items-center gap-1"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
          </svg>
          View Source
        </a>
      </footer>
    </div>
  );
}
