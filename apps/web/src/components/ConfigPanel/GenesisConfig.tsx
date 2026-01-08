/**
 * GenesisConfig Component
 *
 * Configuration UI for the Genesis multi-LLM agent deployment system.
 * Allows users to:
 * - Enable/disable Genesis mode (vs standard 7-agent mode)
 * - Set agents per mother LLM (5-100)
 * - Select which LLM "mothers" to use
 * - Configure advanced options (diversity threshold, archetypes)
 */

import { useState } from 'react';
import { useConfigStore, type LLMType } from '../../stores/config';

// All available LLM mothers
const ALL_MOTHERS: { id: LLMType; label: string; color: string }[] = [
  { id: 'claude', label: 'Claude', color: 'bg-orange-500' },
  { id: 'gemini', label: 'Gemini', color: 'bg-blue-500' },
  { id: 'codex', label: 'Codex', color: 'bg-green-500' },
  { id: 'deepseek', label: 'DeepSeek', color: 'bg-purple-500' },
  { id: 'qwen', label: 'Qwen', color: 'bg-cyan-500' },
  { id: 'glm', label: 'GLM', color: 'bg-red-500' },
  { id: 'grok', label: 'Grok', color: 'bg-yellow-500' },
];

// Available archetypes for selection
const AVAILABLE_ARCHETYPES = [
  'high_risk',
  'low_risk',
  'high_cooperation',
  'low_cooperation',
  'high_social',
  'low_social',
];

export function GenesisConfig() {
  const { genesisConfig, setGenesisConfig, isLoading } = useConfigStore();
  const [showAdvanced, setShowAdvanced] = useState(false);

  const { enabled, childrenPerMother, mothers, diversityThreshold, requiredArchetypes, useConfiguredPersonalities } =
    genesisConfig;

  // Calculate total agents
  const totalAgents = enabled ? childrenPerMother * mothers.length : 7;

  // Handle mother selection toggle
  const toggleMother = (motherId: LLMType) => {
    const newMothers = mothers.includes(motherId)
      ? mothers.filter((m) => m !== motherId)
      : [...mothers, motherId];

    // Ensure at least one mother is selected when enabled
    if (enabled && newMothers.length === 0) return;

    setGenesisConfig({ mothers: newMothers });
  };

  // Handle archetype selection toggle
  const toggleArchetype = (archetype: string) => {
    const newArchetypes = requiredArchetypes.includes(archetype)
      ? requiredArchetypes.filter((a) => a !== archetype)
      : [...requiredArchetypes, archetype];
    setGenesisConfig({ requiredArchetypes: newArchetypes });
  };

  return (
    <div className="py-3 px-4 space-y-4">
      {/* Mode Selection */}
      <div className="space-y-2">
        <span className="text-sm font-medium text-gray-200">Deployment Mode</span>

        {/* Standard Mode Radio */}
        <label className="flex items-center gap-3 p-2 rounded hover:bg-gray-800 cursor-pointer">
          <input
            type="radio"
            name="deploymentMode"
            checked={!enabled}
            onChange={() => setGenesisConfig({ enabled: false })}
            disabled={isLoading}
            className="w-4 h-4 text-blue-500 bg-gray-700 border-gray-600 focus:ring-blue-500"
          />
          <div>
            <span className="text-sm text-gray-200">Standard</span>
            <p className="text-xs text-gray-500">7 agents (1 per LLM)</p>
          </div>
        </label>

        {/* Genesis Mode Radio */}
        <label className="flex items-center gap-3 p-2 rounded hover:bg-gray-800 cursor-pointer">
          <input
            type="radio"
            name="deploymentMode"
            checked={enabled}
            onChange={() => setGenesisConfig({ enabled: true })}
            disabled={isLoading}
            className="w-4 h-4 text-blue-500 bg-gray-700 border-gray-600 focus:ring-blue-500"
          />
          <div>
            <span className="text-sm text-gray-200">Genesis</span>
            <p className="text-xs text-gray-500">N agents per selected LLM mother</p>
          </div>
        </label>
      </div>

      {/* Genesis Settings (only when enabled) */}
      {enabled && (
        <>
          {/* Agents per Mother Slider */}
          <div className="space-y-2 pt-2 border-t border-gray-700">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-200">Agents per Mother</span>
              <span className="text-sm font-mono text-blue-400">{childrenPerMother}</span>
            </div>
            <input
              type="range"
              min={5}
              max={100}
              step={5}
              value={childrenPerMother}
              onChange={(e) => setGenesisConfig({ childrenPerMother: parseInt(e.target.value) })}
              disabled={isLoading}
              className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
            <div className="flex justify-between text-xs text-gray-500">
              <span>5</span>
              <span>100</span>
            </div>
          </div>

          {/* Mother LLM Selection */}
          <div className="space-y-2 pt-2 border-t border-gray-700">
            <span className="text-sm text-gray-200">Select Mother LLMs</span>
            <div className="grid grid-cols-2 gap-2">
              {ALL_MOTHERS.map((mother) => (
                <label
                  key={mother.id}
                  className={`
                    flex items-center gap-2 p-2 rounded cursor-pointer transition-colors
                    ${mothers.includes(mother.id) ? 'bg-gray-700' : 'bg-gray-800/50 hover:bg-gray-800'}
                  `}
                >
                  <input
                    type="checkbox"
                    checked={mothers.includes(mother.id)}
                    onChange={() => toggleMother(mother.id)}
                    disabled={isLoading}
                    className="w-4 h-4 text-blue-500 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                  />
                  <span className={`w-2 h-2 rounded-full ${mother.color}`} />
                  <span className="text-sm text-gray-200">{mother.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Total Agents Display */}
          <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded border border-gray-700">
            <span className="text-sm text-gray-300">Total Agents</span>
            <span className="text-lg font-bold text-blue-400">
              {totalAgents}
              <span className="text-xs text-gray-500 ml-1">
                ({childrenPerMother} × {mothers.length})
              </span>
            </span>
          </div>

          {/* Cost Warning */}
          {totalAgents > 100 && (
            <div className="p-2 rounded bg-yellow-900/30 border border-yellow-700/50 text-xs text-yellow-300">
              ⚠️ High agent count may increase LLM API costs significantly
            </div>
          )}

          {/* Advanced Settings Toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200"
          >
            <span className={`transition-transform ${showAdvanced ? 'rotate-90' : ''}`}>▶</span>
            Advanced Settings
          </button>

          {/* Advanced Settings */}
          {showAdvanced && (
            <div className="space-y-3 pl-4 border-l border-gray-700">
              {/* Use Configured Personalities Toggle */}
              <div className="space-y-2">
                <label className="flex items-center justify-between cursor-pointer">
                  <div>
                    <span className="text-xs text-gray-300">Use Configured Weights</span>
                    <p className="text-xs text-gray-500">Override LLM-generated with your weights</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={useConfiguredPersonalities}
                    onClick={() => setGenesisConfig({ useConfiguredPersonalities: !useConfiguredPersonalities })}
                    disabled={isLoading}
                    className={`
                      w-9 h-5 rounded-full relative transition-colors duration-200
                      ${useConfiguredPersonalities ? 'bg-blue-500' : 'bg-gray-600'}
                      ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                    `}
                  >
                    <span
                      className={`
                        absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform duration-200 shadow-sm
                        ${useConfiguredPersonalities ? 'translate-x-4' : 'translate-x-0'}
                      `}
                    />
                  </button>
                </label>
                {useConfiguredPersonalities && (
                  <p className="text-xs text-blue-400">
                    💡 Personalities from "Personality Weights" section will be used
                  </p>
                )}
              </div>

              {/* Diversity Threshold */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-300">Diversity Threshold</span>
                  <span className="text-xs font-mono text-gray-400">
                    {diversityThreshold.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={diversityThreshold}
                  onChange={(e) =>
                    setGenesisConfig({ diversityThreshold: parseFloat(e.target.value) })
                  }
                  disabled={isLoading}
                  className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <p className="text-xs text-gray-500">
                  Higher values ensure more diverse personalities
                </p>
              </div>

              {/* Required Archetypes */}
              <div className="space-y-2">
                <span className="text-xs text-gray-300">Required Archetypes</span>
                <div className="flex flex-wrap gap-1">
                  {AVAILABLE_ARCHETYPES.map((archetype) => (
                    <button
                      key={archetype}
                      type="button"
                      onClick={() => toggleArchetype(archetype)}
                      disabled={isLoading}
                      className={`
                        px-2 py-0.5 text-xs rounded transition-colors
                        ${
                          requiredArchetypes.includes(archetype)
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                        }
                      `}
                    >
                      {archetype.replace('_', ' ')}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500">
                  Genesis will ensure these personality types are represented
                </p>
              </div>
            </div>
          )}
        </>
      )}

      {/* Restart Warning */}
      <div className="text-xs text-gray-500 pt-2 border-t border-gray-700">
        ⚠️ Changes require simulation restart to take effect
      </div>
    </div>
  );
}

export default GenesisConfig;
