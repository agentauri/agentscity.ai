/**
 * StartConfirmationModal Component
 *
 * Shows a summary of current configuration before starting the simulation.
 * Ensures users review settings before launching.
 */

import { useEffect } from 'react';
import { useConfigStore } from '../../stores/config';
import { useApiKeysStore, type LLMType } from '../../stores/apiKeys';

interface StartConfirmationModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  onOpenConfig?: () => void;
  isLoading: boolean;
}

/** Personality trait colors */
const PERSONALITY_COLORS: Record<string, string> = {
  aggressive: '#ef4444',
  cooperative: '#22c55e',
  cautious: '#eab308',
  explorer: '#3b82f6',
  social: '#a855f7',
  neutral: '#6b7280',
};

export function StartConfirmationModal({
  isOpen,
  onConfirm,
  onCancel,
  onOpenConfig,
  isLoading,
}: StartConfirmationModalProps) {
  const { genesisConfig, personalityConfig } = useConfigStore();
  const { providers, status, isSynced, fetchStatus } = useApiKeysStore();

  // Fetch API keys status when modal opens if not already synced
  useEffect(() => {
    if (isOpen && !isSynced) {
      fetchStatus();
    }
  }, [isOpen, isSynced, fetchStatus]);

  if (!isOpen) return null;

  // Calculate agent count
  const agentCount = genesisConfig.enabled
    ? genesisConfig.childrenPerMother * genesisConfig.mothers.length
    : 7;

  // All possible LLM types
  const ALL_LLM_TYPES: LLMType[] = ['claude', 'codex', 'gemini', 'deepseek', 'qwen', 'glm', 'grok'];
  const DISPLAY_NAMES: Record<LLMType, string> = {
    claude: 'Claude',
    codex: 'Codex',
    gemini: 'Gemini',
    deepseek: 'DeepSeek',
    qwen: 'Qwen',
    glm: 'GLM',
    grok: 'Grok',
  };

  // Get active API keys from store state (only if synced)
  const activeProviders: Array<{ type: LLMType; displayName: string }> = [];

  if (isSynced) {
    // Check status for each LLM type
    for (const llmType of ALL_LLM_TYPES) {
      const keyStatus = status[llmType];
      if (keyStatus && keyStatus.source !== 'none' && !keyStatus.disabled) {
        // Try to get display name from providers, fallback to DISPLAY_NAMES
        const provider = providers.find((p) => p.type === llmType);
        activeProviders.push({
          type: llmType,
          displayName: provider?.displayName || DISPLAY_NAMES[llmType],
        });
      }
    }
  }

  const hasKeys = activeProviders.length > 0;

  // Get personality weights for display
  const { weights, enabled: personalitiesEnabled } = personalityConfig;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ minHeight: '100vh', minWidth: '100vw' }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="relative bg-gray-900 rounded-lg border border-gray-700 shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-700 bg-gray-800/50">
          <h2 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-blue-400"
            >
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Start Simulation
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Review configuration before starting
          </p>
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-4">
          {/* Deployment Mode */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Deployment Mode</span>
              <span
                className={`px-2 py-0.5 text-xs font-medium rounded ${
                  genesisConfig.enabled
                    ? 'bg-purple-500/20 text-purple-300'
                    : 'bg-blue-500/20 text-blue-300'
                }`}
              >
                {genesisConfig.enabled ? 'Genesis' : 'Standard'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Total Agents</span>
              <span className="text-sm font-mono text-gray-200">
                {agentCount}
                {genesisConfig.enabled && (
                  <span className="text-gray-500 ml-1">
                    ({genesisConfig.childrenPerMother} × {genesisConfig.mothers.length})
                  </span>
                )}
              </span>
            </div>

            {genesisConfig.enabled && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Mother LLMs</span>
                <div className="flex gap-1">
                  {genesisConfig.mothers.map((m) => (
                    <span
                      key={m}
                      className="px-1.5 py-0.5 text-[10px] bg-gray-700 text-gray-300 rounded capitalize"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-gray-700/50" />

          {/* Personalities */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Personalities</span>
              <span
                className={`px-2 py-0.5 text-xs font-medium rounded ${
                  personalitiesEnabled
                    ? 'bg-green-500/20 text-green-300'
                    : 'bg-gray-600/30 text-gray-400'
                }`}
              >
                {personalitiesEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>

            {personalitiesEnabled && (
              <div className="space-y-1.5">
                <div className="flex h-2 rounded overflow-hidden bg-gray-800">
                  {Object.entries(weights).map(([trait, weight]) => (
                    <div
                      key={trait}
                      className="h-full"
                      style={{
                        width: `${weight * 100}%`,
                        backgroundColor: PERSONALITY_COLORS[trait] || '#6b7280',
                      }}
                      title={`${trait}: ${Math.round(weight * 100)}%`}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                  {Object.entries(weights).map(([trait, weight]) => (
                    <div key={trait} className="flex items-center gap-1">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: PERSONALITY_COLORS[trait] }}
                      />
                      <span className="text-[10px] text-gray-500 capitalize">
                        {trait}: {Math.round(weight * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="border-t border-gray-700/50" />

          {/* API Keys Status */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">API Keys</span>
              {!isSynced ? (
                <span className="px-2 py-0.5 text-xs font-medium rounded bg-gray-600/30 text-gray-400">
                  Loading...
                </span>
              ) : (
                <span
                  className={`px-2 py-0.5 text-xs font-medium rounded ${
                    hasKeys
                      ? 'bg-green-500/20 text-green-300'
                      : 'bg-yellow-500/20 text-yellow-300'
                  }`}
                >
                  {hasKeys ? `${activeProviders.length} Active` : 'Fallback Mode'}
                </span>
              )}
            </div>

            {isSynced && !hasKeys && (
              <div className="p-2 rounded bg-yellow-900/20 border border-yellow-700/30">
                <p className="text-xs text-yellow-300">
                  No API keys configured. Agents will use rule-based fallback decisions.
                </p>
              </div>
            )}

            {isSynced && hasKeys && (
              <div className="flex flex-wrap gap-1">
                {activeProviders.map((p) => (
                  <span
                    key={p.type}
                    className="px-1.5 py-0.5 text-[10px] bg-green-900/30 text-green-300 rounded capitalize"
                  >
                    {p.displayName}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-700 bg-gray-800/30 flex gap-3">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 rounded transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          {onOpenConfig && (
            <button
              onClick={onOpenConfig}
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 rounded transition-colors disabled:opacity-50 flex items-center gap-1.5"
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
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              Edit
            </button>
          )}
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 rounded transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <span className="animate-spin">...</span>
                Starting...
              </>
            ) : (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  stroke="none"
                >
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                Start
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default StartConfirmationModal;
