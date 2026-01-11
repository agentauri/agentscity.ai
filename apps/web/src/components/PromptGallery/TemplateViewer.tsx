/**
 * TemplateViewer - Code viewer for prompt templates
 *
 * Features:
 * - Monospace code block with line numbers
 * - Copy-to-clipboard button
 * - Character/line count
 * - Expandable/collapsible
 */

import { useState, useCallback } from 'react';

interface TemplateViewerProps {
  content: string;
  title?: string;
  maxHeight?: string;
  showLineNumbers?: boolean;
}

export function TemplateViewer({
  content,
  title,
  maxHeight = '500px',
  showLineNumbers = true,
}: TemplateViewerProps) {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const lines = content.split('\n');
  const lineCount = lines.length;
  const charCount = content.length;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [content]);

  return (
    <div className="bg-city-bg rounded-lg border border-city-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-city-surface-hover/50 border-b border-city-border">
        <div className="flex items-center gap-2">
          {title && (
            <span className="text-sm font-medium text-city-text">{title}</span>
          )}
          <span className="text-xs text-city-text-muted">
            {lineCount} lines, {charCount.toLocaleString()} chars
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded hover:bg-city-border/50 text-city-text-muted hover:text-city-text transition-colors"
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            <svg
              className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
          <button
            onClick={handleCopy}
            className={`p-1.5 rounded transition-colors ${
              copied
                ? 'bg-green-600/20 text-green-400'
                : 'hover:bg-city-border/50 text-city-text-muted hover:text-city-text'
            }`}
            title={copied ? 'Copied!' : 'Copy to clipboard'}
          >
            {copied ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div
        className="overflow-auto"
        style={{ maxHeight: isExpanded ? 'none' : maxHeight }}
      >
        <div className="flex">
          {/* Line numbers */}
          {showLineNumbers && (
            <div className="flex-none select-none bg-city-surface/30 border-r border-city-border/50 py-3 px-2 text-right">
              {lines.map((_, i) => (
                <div
                  key={i}
                  className="text-xs text-city-text-muted leading-5 font-mono"
                >
                  {i + 1}
                </div>
              ))}
            </div>
          )}

          {/* Code content */}
          <pre className="flex-1 p-3 text-sm font-mono text-city-text leading-5 whitespace-pre-wrap break-words">
            {content}
          </pre>
        </div>
      </div>

      {/* Expand indicator */}
      {!isExpanded && lineCount > 20 && (
        <div className="px-3 py-1.5 bg-gradient-to-t from-city-bg to-transparent text-center">
          <button
            onClick={() => setIsExpanded(true)}
            className="text-xs text-city-accent hover:underline"
          >
            Show all {lineCount} lines
          </button>
        </div>
      )}
    </div>
  );
}
