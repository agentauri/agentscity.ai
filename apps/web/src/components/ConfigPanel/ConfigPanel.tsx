/**
 * ConfigPanel Component
 *
 * Main configuration panel that displays all simulation parameters.
 * Organized into collapsible sections.
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { useConfigStore } from '../../stores/config';
import { useApiKeysStore, type LLMType } from '../../stores/apiKeys';
import { ConfigSection } from './ConfigSection';
import { ConfigInput } from './ConfigInput';
import { ApiKeyInput } from './ApiKeyInput';
import { FallbackModeInfo } from './FallbackModeInfo';
import { PromptEditor } from './PromptEditor';
import { GenesisConfig } from './GenesisConfig';
import { PersonalityConfig } from './PersonalityConfig';

interface ConfigPanelProps {
  onClose: () => void;
}

export function ConfigPanel({ onClose }: ConfigPanelProps) {
  const {
    config,
    isLoading,
    error,
    pendingChanges,
    runtimeModifiable,
    fetchConfig,
    updateSimulation,
    updateAgent,
    updateNeeds,
    updateExperiment,
    updateLLMCache,
    updateActions,
    updateEconomy,
    applyChanges,
    resetConfig,
    discardChanges,
  } = useConfigStore();

  const {
    providers,
    status: keyStatus,
    pendingKeys,
    isLoading: keysLoading,
    error: keysError,
    fetchStatus: fetchKeyStatus,
    setPendingKey,
    applyKeys,
    clearKey,
    toggleDisabled,
    discardPendingKeys,
    hasPendingChanges: hasKeyChanges,
    hasAnyActiveKey,
  } = useApiKeysStore();

  // Use selector pattern for reactivity
  const hasPendingChanges = Object.keys(pendingChanges).length > 0;

  const [applyResult, setApplyResult] = useState<{
    appliedImmediately: string[];
    requiresRestart: string[];
  } | null>(null);

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchConfig();
    fetchKeyStatus();
  }, [fetchConfig, fetchKeyStatus]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  // Handle Escape key to close panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showResetConfirm) {
          setShowResetConfirm(false);
        } else {
          handleClose();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showResetConfirm, hasPendingChanges]);

  // Handle close with unsaved changes warning
  const handleClose = useCallback(() => {
    if (hasPendingChanges) {
      const confirmed = window.confirm(
        'You have unsaved changes. Are you sure you want to close?'
      );
      if (!confirmed) return;
    }
    onClose();
  }, [hasPendingChanges, onClose]);

  const isRuntimeModifiable = (path: string) => runtimeModifiable.includes(path);

  // Get effective value (pending or current)
  const getValue = <T,>(
    section: 'simulation' | 'agent' | 'needs' | 'experiment' | 'llmCache' | 'actions' | 'economy',
    key: string,
    fallback: T
  ): T => {
    if (!config) return fallback;
    const pending = pendingChanges[section] as unknown as Record<string, unknown> | undefined;
    if (pending && key in pending) {
      return pending[key] as T;
    }
    const sectionData = config[section] as unknown as Record<string, unknown>;
    if (sectionData && key in sectionData) {
      return sectionData[key] as T;
    }
    return fallback;
  };

  const handleApply = async () => {
    try {
      const result = await applyChanges();
      setApplyResult(result);
      // Store timer ref for cleanup
      timerRef.current = setTimeout(() => setApplyResult(null), 5000);
    } catch {
      // Error is handled by store
    }
  };

  const handleReset = async () => {
    await resetConfig();
    setShowResetConfirm(false);
  };

  if (isLoading && !config) {
    return (
      <div className="fixed right-0 top-0 h-full w-full max-w-sm sm:max-w-md bg-gray-900 border-l border-gray-700 shadow-xl z-50">
        <div className="flex items-center justify-center h-full">
          <div className="text-gray-400 flex items-center gap-2">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading configuration...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-labelledby="config-panel-title"
      aria-modal="true"
      className="fixed right-0 top-0 h-full w-full max-w-sm sm:max-w-md bg-gray-900 border-l border-gray-700 shadow-xl z-50 flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 bg-gray-800">
        <div className="flex items-center gap-2">
          <span className="text-lg" aria-hidden="true">⚙️</span>
          <h2 id="config-panel-title" className="font-semibold text-gray-100">
            Configuration
            {hasPendingChanges && (
              <span className="ml-2 text-xs font-normal text-yellow-400">
                (unsaved changes)
              </span>
            )}
          </h2>
        </div>
        <button
          onClick={handleClose}
          aria-label="Close configuration panel"
          className="p-2 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div role="alert" className="px-4 py-2 bg-red-900/50 text-red-200 text-sm">
          {error}
        </div>
      )}

      {/* Apply result message */}
      {applyResult && (
        <div className="px-4 py-2 bg-blue-900/50 text-blue-200 text-sm">
          {applyResult.appliedImmediately.length > 0 && (
            <div>⚡ Applied: {applyResult.appliedImmediately.join(', ')}</div>
          )}
          {applyResult.requiresRestart.length > 0 && (
            <div className="text-yellow-300">
              ⚠️ Requires restart: {applyResult.requiresRestart.join(', ')}
            </div>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* LLM API Keys Section - Always visible */}
        <ConfigSection title="LLM API Keys" icon="🔑" defaultExpanded={true}>
          {/* Fallback mode warning */}
          {!hasAnyActiveKey() && (
            <FallbackModeInfo isTestMode={config?.simulation?.testMode} />
          )}

          {/* API Key inputs */}
          {providers.map((provider) => (
            <ApiKeyInput
              key={provider.type}
              provider={provider}
              status={keyStatus[provider.type as LLMType]}
              pendingKey={pendingKeys[provider.type as LLMType]}
              onKeyChange={(key) => setPendingKey(provider.type as LLMType, key)}
              onToggleDisabled={() => toggleDisabled(provider.type as LLMType)}
              onClear={() => clearKey(provider.type as LLMType)}
              isLoading={keysLoading}
            />
          ))}

          {/* Apply/Discard keys buttons */}
          {hasKeyChanges() && (
            <div className="px-4 py-3 border-t border-gray-700/50 flex gap-2">
              <button
                onClick={applyKeys}
                disabled={keysLoading}
                className="flex-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {keysLoading ? 'Saving...' : 'Save Keys'}
              </button>
              <button
                onClick={discardPendingKeys}
                disabled={keysLoading}
                className="px-3 py-1.5 text-sm bg-gray-700 text-gray-200 rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Discard
              </button>
            </div>
          )}

          {/* Keys error */}
          {keysError && (
            <div className="px-4 py-2 text-xs text-red-300 bg-red-900/30">
              {keysError}
            </div>
          )}

          {/* Storage note */}
          <div className="px-4 py-2 text-xs text-gray-500 text-center border-t border-gray-700/50">
            Keys stored in browser localStorage
          </div>
        </ConfigSection>

        {/* Agent System Prompt Section */}
        <ConfigSection title="Agent System Prompt" icon="🧠" defaultExpanded={false}>
          <PromptEditor />
        </ConfigSection>

        {/* Agent Deployment Section */}
        <ConfigSection title="Agent Deployment" icon="🚀" defaultExpanded={false}>
          <GenesisConfig />
        </ConfigSection>

        {config && (
          <>
            {/* Simulation Section */}
            <ConfigSection title="Simulation" icon="🎮" defaultExpanded={false}>
              <ConfigInput
                type="number"
                label="Tick Interval"
                description="Time between cycles. Lower = faster, more LLM calls"
                value={getValue('simulation', 'tickIntervalMs', 60000)}
                onChange={(v) => updateSimulation({ tickIntervalMs: v })}
                min={1000}
                step={1000}
                unit="ms"
              />
              <ConfigInput
                type="number"
                label="Grid Size"
                description="World dimensions (NxN). Larger = slower interactions. Restart required"
                value={getValue('simulation', 'gridSize', 100)}
                onChange={(v) => updateSimulation({ gridSize: v })}
                min={10}
                max={1000}
              />
              <ConfigInput
                type="number"
                label="Visibility Radius"
                description="How far agents see (tiles). Larger = more social awareness"
                value={getValue('simulation', 'visibilityRadius', 10)}
                onChange={(v) => updateSimulation({ visibilityRadius: v })}
                min={1}
                max={50}
              />
              <ConfigInput
                type="boolean"
                label="Test Mode"
                description="Skip LLM calls, use rule-based fallback. No API costs"
                value={getValue('simulation', 'testMode', false)}
                onChange={(v) => updateSimulation({ testMode: v })}
                isRuntimeModifiable={isRuntimeModifiable('simulation.testMode')}
              />
            </ConfigSection>

            {/* Agent Starting Values */}
            <ConfigSection title="Agent Starting Values" icon="🤖">
              <ConfigInput
                type="number"
                label="Balance"
                description="Initial currency. Lower forces agents to work immediately"
                value={getValue('agent', 'startingBalance', 50)}
                onChange={(v) => updateAgent({ startingBalance: v })}
                min={0}
                unit="CITY"
              />
              <ConfigInput
                type="number"
                label="Hunger"
                description="Initial hunger (0-100). Lower = more starvation pressure"
                value={getValue('agent', 'startingHunger', 60)}
                onChange={(v) => updateAgent({ startingHunger: v })}
                min={0}
                max={100}
              />
              <ConfigInput
                type="number"
                label="Energy"
                description="Initial energy (0-100). Affects movement and work capacity"
                value={getValue('agent', 'startingEnergy', 60)}
                onChange={(v) => updateAgent({ startingEnergy: v })}
                min={0}
                max={100}
              />
              <ConfigInput
                type="number"
                label="Health"
                description="Initial health (0-100). Decreases from critical needs or combat"
                value={getValue('agent', 'startingHealth', 100)}
                onChange={(v) => updateAgent({ startingHealth: v })}
                min={0}
                max={100}
              />
            </ConfigSection>

            {/* Needs Decay */}
            <ConfigSection title="Needs Decay" icon="📉">
              <ConfigInput
                type="number"
                label="Hunger Decay"
                description="Hunger loss per tick. Walking: 1.5x, sleeping: 0.5x"
                value={getValue('needs', 'hungerDecay', 1)}
                onChange={(v) => updateNeeds({ hungerDecay: v })}
                min={0}
                max={10}
                step={0.1}
                unit="/tick"
              />
              <ConfigInput
                type="number"
                label="Energy Decay"
                description="Energy loss per tick. Sleeping: 0x (no loss)"
                value={getValue('needs', 'energyDecay', 0.5)}
                onChange={(v) => updateNeeds({ energyDecay: v })}
                min={0}
                max={10}
                step={0.1}
                unit="/tick"
              />
              <ConfigInput
                type="number"
                label="Low Hunger Threshold"
                description="Below this: extra energy drain starts"
                value={getValue('needs', 'lowHungerThreshold', 20)}
                onChange={(v) => updateNeeds({ lowHungerThreshold: v })}
                min={0}
                max={100}
              />
              <ConfigInput
                type="number"
                label="Critical Hunger"
                description="Below this: health damage after 3-tick grace period"
                value={getValue('needs', 'criticalHungerThreshold', 10)}
                onChange={(v) => updateNeeds({ criticalHungerThreshold: v })}
                min={0}
                max={100}
              />
              <ConfigInput
                type="number"
                label="Low Energy Threshold"
                description="Below this: warning events trigger"
                value={getValue('needs', 'lowEnergyThreshold', 20)}
                onChange={(v) => updateNeeds({ lowEnergyThreshold: v })}
                min={0}
                max={100}
              />
              <ConfigInput
                type="number"
                label="Critical Energy"
                description="Below this: forced sleep, health damage starts"
                value={getValue('needs', 'criticalEnergyThreshold', 10)}
                onChange={(v) => updateNeeds({ criticalEnergyThreshold: v })}
                min={0}
                max={100}
              />
            </ConfigSection>

            {/* Experiment Toggles */}
            <ConfigSection title="Experiment Toggles" icon="🧪">
              <ConfigInput
                type="boolean"
                label="Enable Personalities"
                description="Assign traits (aggressive, cooperative, etc.) to agents"
                value={getValue('experiment', 'enablePersonalities', false)}
                onChange={(v) => updateExperiment({ enablePersonalities: v })}
              />
              <ConfigInput
                type="boolean"
                label="Emergent Prompt"
                description="Sensory-only prompts. Agents discover strategies themselves"
                value={getValue('experiment', 'useEmergentPrompt', false)}
                onChange={(v) => updateExperiment({ useEmergentPrompt: v })}
                isRuntimeModifiable={isRuntimeModifiable('experiment.useEmergentPrompt')}
              />
              <ConfigInput
                type="select"
                label="Safety Level"
                description="LLM safety framing: standard, minimal, or none (research)"
                value={getValue('experiment', 'safetyLevel', 'standard')}
                onChange={(v) =>
                  updateExperiment({
                    safetyLevel: v as 'standard' | 'minimal' | 'none',
                  })
                }
                options={[
                  { value: 'standard', label: 'Standard' },
                  { value: 'minimal', label: 'Minimal' },
                  { value: 'none', label: 'None (Research)' },
                ]}
              />
              <ConfigInput
                type="boolean"
                label="Baseline Agents"
                description="Include non-LLM agents (random, Q-learning) for comparison"
                value={getValue('experiment', 'includeBaselineAgents', false)}
                onChange={(v) => updateExperiment({ includeBaselineAgents: v })}
              />
              <ConfigInput
                type="boolean"
                label="Normalize Capabilities"
                description="Equalize model speeds by truncating responses"
                value={getValue('experiment', 'normalizeCapabilities', false)}
                onChange={(v) => updateExperiment({ normalizeCapabilities: v })}
              />
            </ConfigSection>

            {/* Personality Weights */}
            <ConfigSection title="Personality Weights" icon="🎭" defaultExpanded={false}>
              <PersonalityConfig />
            </ConfigSection>

            {/* LLM Cache */}
            <ConfigSection title="LLM Cache" icon="💾">
              <ConfigInput
                type="boolean"
                label="Enabled"
                description="Cache LLM responses. Same observation = instant response"
                value={getValue('llmCache', 'enabled', true)}
                onChange={(v) => updateLLMCache({ enabled: v })}
                isRuntimeModifiable={isRuntimeModifiable('llmCache.enabled')}
              />
              <ConfigInput
                type="number"
                label="TTL"
                description="Cache duration. Longer = fewer calls but less responsive"
                value={getValue('llmCache', 'ttlSeconds', 300)}
                onChange={(v) => updateLLMCache({ ttlSeconds: v })}
                min={0}
                max={3600}
                unit="sec"
              />
            </ConfigSection>

            {/* Movement Costs */}
            <ConfigSection title="Movement Costs" icon="🚶">
              <ConfigInput
                type="number"
                label="Energy Cost"
                description="Energy spent per tile moved. Higher = less wandering"
                value={getValue('actions', 'move', config.actions.move).energyCost}
                onChange={(v) => updateActions({ move: { ...config.actions.move, energyCost: v } })}
                min={0}
                max={10}
                step={0.5}
                unit="/tile"
              />
              <ConfigInput
                type="number"
                label="Hunger Cost"
                description="Hunger spent per tile moved. Exploration makes you hungry"
                value={getValue('actions', 'move', config.actions.move).hungerCost}
                onChange={(v) => updateActions({ move: { ...config.actions.move, hungerCost: v } })}
                min={0}
                max={5}
                step={0.1}
                unit="/tile"
              />
              <ConfigInput
                type="number"
                label="Consecutive Penalty"
                description="Extra cost multiplier for repeated moves. 0.5 = +50% cost"
                value={getValue('actions', 'move', config.actions.move).consecutivePenalty}
                onChange={(v) => updateActions({ move: { ...config.actions.move, consecutivePenalty: v } })}
                min={0}
                max={2}
                step={0.1}
                unit="x"
              />
            </ConfigSection>

            {/* Economy */}
            <ConfigSection title="Currency Decay" icon="💸">
              <ConfigInput
                type="number"
                label="Decay Rate"
                description="% of balance lost per interval. Discourages hoarding"
                value={(getValue('economy', 'currencyDecayRate', config.economy?.currencyDecayRate ?? 0.05) * 100)}
                onChange={(v) => updateEconomy({ currencyDecayRate: v / 100 })}
                min={0}
                max={20}
                step={1}
                unit="%"
              />
              <ConfigInput
                type="number"
                label="Decay Interval"
                description="Ticks between decay applications"
                value={getValue('economy', 'currencyDecayInterval', config.economy?.currencyDecayInterval ?? 10)}
                onChange={(v) => updateEconomy({ currencyDecayInterval: v })}
                min={1}
                max={100}
                unit="ticks"
              />
              <ConfigInput
                type="number"
                label="Exempt Threshold"
                description="Balance below this is exempt. Protects poor agents"
                value={getValue('economy', 'currencyDecayThreshold', config.economy?.currencyDecayThreshold ?? 20)}
                onChange={(v) => updateEconomy({ currencyDecayThreshold: v })}
                min={0}
                max={100}
                unit="CITY"
              />
            </ConfigSection>

            {/* Other Action Costs (Read-only) */}
            <ConfigSection title="Other Action Costs" icon="⚡">
              <ConfigInput
                type="number"
                label="Gather Energy Cost"
                description="Energy spent per resource unit gathered"
                value={config.actions.gather.energyCostPerUnit}
                onChange={() => {}}
                disabled
                unit="/unit"
              />
              <ConfigInput
                type="number"
                label="Work Pay"
                description="CITY earned per tick worked (costs 2 energy/tick)"
                value={config.actions.work.basePayPerTick}
                onChange={() => {}}
                disabled
                unit="CITY/tick"
              />
              <ConfigInput
                type="number"
                label="Sleep Energy Restore"
                description="Energy recovered per tick sleeping"
                value={config.actions.sleep.energyRestoredPerTick}
                onChange={() => {}}
                disabled
                unit="/tick"
              />
            </ConfigSection>
          </>
        )}
      </div>

      {/* Reset Confirmation Dialog */}
      {showResetConfirm && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
          <div className="bg-gray-800 rounded-lg p-4 mx-4 max-w-sm shadow-xl border border-gray-700">
            <h3 className="font-semibold text-gray-100 mb-2">Reset to Defaults?</h3>
            <p className="text-sm text-gray-400 mb-4">
              This will reset all configuration values to their defaults. This action cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleReset}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
              >
                Reset
              </button>
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 px-4 py-2 bg-gray-700 text-gray-200 rounded hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-700 bg-gray-800 space-y-2">
        <div className="flex gap-2">
          <button
            onClick={handleApply}
            disabled={!hasPendingChanges || isLoading}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            {isLoading ? 'Applying...' : 'Apply Changes'}
          </button>
          <button
            onClick={discardChanges}
            disabled={!hasPendingChanges || isLoading}
            className="px-4 py-2 bg-gray-700 text-gray-200 rounded hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            Discard
          </button>
        </div>
        <button
          onClick={() => setShowResetConfirm(true)}
          disabled={isLoading}
          className="w-full px-4 py-2 bg-red-900/50 text-red-200 rounded hover:bg-red-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
        >
          Reset to Defaults
        </button>
        <div className="text-xs text-gray-500 text-center">
          <span aria-hidden="true">⚡</span> = applies immediately | others require restart
        </div>
      </div>
    </div>
  );
}

export default ConfigPanel;
