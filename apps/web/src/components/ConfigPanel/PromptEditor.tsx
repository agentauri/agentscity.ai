/**
 * PromptEditor Component
 *
 * Editor for the agent system prompt with:
 * - Status badge (Custom / Default)
 * - Monospace text area for editing
 * - Apply / Reset / Discard buttons
 * - Placeholder documentation
 */

import { useEffect, useState } from 'react';
import { usePromptStore } from '../../stores/promptStore';

export function PromptEditor() {
  const {
    customPrompt,
    defaultPrompt,
    pendingPrompt,
    placeholders,
    isLoading,
    error,
    warning,
    isSynced,
    jsonErrors,
    fetchPrompt,
    setPendingPrompt,
    applyPrompt,
    resetToDefault,
    discardChanges,
    hasPendingChanges,
    isUsingCustom,
    hasJsonErrors,
  } = usePromptStore();

  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Fetch prompt on mount
  useEffect(() => {
    if (!isSynced) {
      fetchPrompt();
    }
  }, [isSynced, fetchPrompt]);

  // Determine badge
  const getBadge = () => {
    if (hasJsonErrors()) {
      return { text: 'JSON Error', color: 'bg-red-800 text-red-200' };
    }
    if (hasPendingChanges()) {
      return { text: 'Unsaved', color: 'bg-yellow-800 text-yellow-200' };
    }
    if (isUsingCustom()) {
      return { text: 'Custom', color: 'bg-blue-800 text-blue-200' };
    }
    return { text: 'Default', color: 'bg-gray-700 text-gray-400' };
  };

  const badge = getBadge();

  const handleReset = async () => {
    if (showResetConfirm) {
      await resetToDefault();
      setShowResetConfirm(false);
    } else {
      setShowResetConfirm(true);
    }
  };

  const handleCancelReset = () => {
    setShowResetConfirm(false);
  };

  // Calculate line count for textarea
  const lineCount = pendingPrompt.split('\n').length;
  const minRows = Math.min(Math.max(lineCount, 10), 30);

  return (
    <div className="py-3 px-4">
      {/* Header row: Title + Badge */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-200">System Prompt</span>
        <span className={`text-xs px-2 py-0.5 rounded ${badge.color}`}>
          {badge.text}
        </span>
      </div>

      {/* Error display */}
      {error && (
        <div className="mb-3 p-2 rounded bg-red-900/30 border border-red-700/50 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Warning display */}
      {warning && (
        <div className="mb-3 p-2 rounded bg-yellow-900/30 border border-yellow-700/50 text-xs text-yellow-300">
          {warning}
        </div>
      )}

      {/* Text area */}
      <div className="mb-3">
        <textarea
          value={pendingPrompt}
          onChange={(e) => setPendingPrompt(e.target.value)}
          disabled={isLoading}
          rows={minRows}
          className={`w-full bg-gray-900 border rounded px-3 py-2 text-xs text-gray-200 font-mono leading-relaxed placeholder-gray-500 focus:outline-none focus:ring-1 disabled:opacity-50 disabled:cursor-not-allowed resize-y ${
            hasJsonErrors()
              ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
              : hasPendingChanges()
              ? 'border-yellow-500 focus:ring-yellow-500 focus:border-yellow-500'
              : 'border-gray-600 focus:ring-blue-500 focus:border-blue-500'
          }`}
          placeholder="Enter your custom system prompt..."
        />
      </div>

      {/* JSON validation errors */}
      {jsonErrors.length > 0 && (
        <div className="mb-3 p-2 rounded bg-red-900/30 border border-red-700/50">
          <div className="text-xs font-medium text-red-300 mb-2">
            JSON Validation Errors ({jsonErrors.length})
          </div>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {jsonErrors.map((err, idx) => (
              <div key={idx} className="text-xs text-red-200/80">
                <div className="font-medium">
                  Block {err.blockIndex + 1} (line {err.lineNumber}): {err.error}
                </div>
                <div className="text-red-300/60 font-mono text-[10px] mt-0.5 truncate">
                  {err.preview}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Placeholders info */}
      {placeholders.length > 0 && (
        <div className="mb-3 p-2 rounded bg-gray-800/50 border border-gray-700/50">
          <div className="text-xs text-gray-400 mb-1">Available Placeholders:</div>
          {placeholders.map((p) => (
            <div key={p.key} className="text-xs text-gray-300">
              <code className="text-blue-400 bg-gray-900 px-1 rounded">{p.key}</code>
              <span className="text-gray-500 ml-2">- {p.description}</span>
            </div>
          ))}
        </div>
      )}

      {/* Character count */}
      <div className="text-xs text-gray-500 mb-3">
        {pendingPrompt.length.toLocaleString()} characters
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        {/* Apply button */}
        <button
          onClick={applyPrompt}
          disabled={isLoading || !hasPendingChanges() || hasJsonErrors()}
          title={hasJsonErrors() ? 'Fix JSON errors before applying' : undefined}
          className="px-3 py-1.5 text-xs rounded bg-blue-700 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {isLoading ? 'Saving...' : 'Apply Changes'}
        </button>

        {/* Reset button */}
        {isUsingCustom() && !showResetConfirm && (
          <button
            onClick={handleReset}
            disabled={isLoading}
            className="px-3 py-1.5 text-xs rounded bg-gray-700 text-gray-200 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-gray-500"
          >
            Reset to Default
          </button>
        )}

        {/* Reset confirmation */}
        {showResetConfirm && (
          <>
            <button
              onClick={handleReset}
              disabled={isLoading}
              className="px-3 py-1.5 text-xs rounded bg-red-700 text-white hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-red-500"
            >
              Confirm Reset
            </button>
            <button
              onClick={handleCancelReset}
              disabled={isLoading}
              className="px-3 py-1.5 text-xs rounded bg-gray-700 text-gray-200 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-gray-500"
            >
              Cancel
            </button>
          </>
        )}

        {/* Discard button */}
        {hasPendingChanges() && (
          <button
            onClick={discardChanges}
            disabled={isLoading}
            className="px-3 py-1.5 text-xs rounded bg-gray-700 text-gray-200 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-1 focus:ring-gray-500"
          >
            Discard
          </button>
        )}
      </div>

      {/* Info note */}
      <div className="mt-3 text-xs text-gray-500">
        Prompt stored in browser localStorage. Changes affect new agent decisions.
      </div>
    </div>
  );
}

export default PromptEditor;
