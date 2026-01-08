/**
 * PersonalityConfig Component
 *
 * Configuration UI for the personality diversification system.
 * Allows users to:
 * - Enable/disable personality assignment
 * - Adjust weights for each personality trait
 * - View expected distribution
 * - Reset to defaults
 */

import { useConfigStore, type PersonalityTrait } from '../../stores/config';

// Personality trait metadata
const PERSONALITY_INFO: Record<PersonalityTrait, { label: string; color: string; description: string }> = {
  aggressive: {
    label: 'Aggressive',
    color: 'bg-red-500',
    description: 'Self-interested, willing to use force',
  },
  cooperative: {
    label: 'Cooperative',
    color: 'bg-green-500',
    description: 'Community-oriented, prefers mutual benefit',
  },
  cautious: {
    label: 'Cautious',
    color: 'bg-yellow-500',
    description: 'Risk-averse, defensive, maintains reserves',
  },
  explorer: {
    label: 'Explorer',
    color: 'bg-blue-500',
    description: 'Curious, mobile, seeks new information',
  },
  social: {
    label: 'Social',
    color: 'bg-purple-500',
    description: 'Relationship-focused, communicative',
  },
  neutral: {
    label: 'Neutral',
    color: 'bg-gray-500',
    description: 'No bias (control group)',
  },
};

const TRAIT_ORDER: PersonalityTrait[] = ['neutral', 'cooperative', 'aggressive', 'cautious', 'social', 'explorer'];

export function PersonalityConfig() {
  const {
    personalityConfig,
    setPersonalityConfig,
    setPersonalityWeight,
    savePersonalityConfig,
    resetPersonalityWeights,
    genesisConfig,
    isLoading,
  } = useConfigStore();

  const { enabled, weights } = personalityConfig;

  // Calculate actual agent count based on deployment mode
  const agentCount = genesisConfig.enabled
    ? genesisConfig.childrenPerMother * genesisConfig.mothers.length
    : 7; // Standard mode: 7 agents

  // Calculate expected count for a given number of agents
  const getExpectedCount = (trait: PersonalityTrait, totalAgents: number) => {
    return Math.round(weights[trait] * totalAgents);
  };

  return (
    <div className="py-3 px-4 space-y-4">
      {/* Enable/Disable Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-medium text-gray-200">Enable Personalities</span>
          <p className="text-xs text-gray-500">Assign traits to agents affecting their behavior</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => setPersonalityConfig({ enabled: !enabled })}
          disabled={isLoading}
          className={`
            w-11 h-6 rounded-full relative transition-colors duration-200
            ${enabled ? 'bg-blue-500' : 'bg-gray-600'}
            ${isLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
        >
          <span
            className={`
              absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full transition-transform duration-200 shadow-sm
              ${enabled ? 'translate-x-5' : 'translate-x-0'}
            `}
          />
        </button>
      </div>

      {/* Weights Configuration (only when enabled) */}
      {enabled && (
        <>
          {/* Distribution Preview Bar */}
          <div className="space-y-2 pt-2 border-t border-gray-700">
            <span className="text-xs text-gray-400">Distribution Preview</span>
            <div className="flex h-4 rounded overflow-hidden">
              {TRAIT_ORDER.map((trait) => (
                <div
                  key={trait}
                  className={`${PERSONALITY_INFO[trait].color} transition-all duration-300`}
                  style={{ width: `${weights[trait] * 100}%` }}
                  title={`${PERSONALITY_INFO[trait].label}: ${(weights[trait] * 100).toFixed(0)}%`}
                />
              ))}
            </div>
          </div>

          {/* Weight Sliders */}
          <div className="space-y-3 pt-2">
            <span className="text-sm text-gray-200">Adjust Weights</span>
            <p className="text-xs text-gray-500">Weights auto-normalize to sum to 100%</p>

            {TRAIT_ORDER.map((trait) => (
              <div key={trait} className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-3 h-3 rounded-full ${PERSONALITY_INFO[trait].color}`} />
                    <span className="text-sm text-gray-200">{PERSONALITY_INFO[trait].label}</span>
                  </div>
                  <span className="text-sm font-mono text-gray-400">
                    {(weights[trait] * 100).toFixed(0)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={weights[trait] * 100}
                  onChange={(e) => {
                    // Set raw value, normalization happens in setPersonalityWeight
                    const rawValue = parseInt(e.target.value) / 100;
                    setPersonalityWeight(trait, rawValue);
                  }}
                  disabled={isLoading}
                  className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
                <p className="text-xs text-gray-500">{PERSONALITY_INFO[trait].description}</p>
              </div>
            ))}
          </div>

          {/* Expected Distribution Table */}
          <div className="space-y-2 pt-2 border-t border-gray-700">
            <span className="text-xs text-gray-400">
              Expected Distribution ({agentCount} agent{agentCount !== 1 ? 's' : ''})
            </span>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {TRAIT_ORDER.map((trait) => (
                <div key={trait} className="flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${PERSONALITY_INFO[trait].color}`} />
                  <span className="text-gray-300">
                    {PERSONALITY_INFO[trait].label}: {getExpectedCount(trait, agentCount)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2 border-t border-gray-700">
            <button
              onClick={savePersonalityConfig}
              disabled={isLoading}
              className="flex-1 px-3 py-1.5 text-xs rounded bg-blue-700 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Saving...' : 'Save Weights'}
            </button>
            <button
              onClick={resetPersonalityWeights}
              disabled={isLoading}
              className="px-3 py-1.5 text-xs rounded bg-gray-700 text-gray-200 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Reset
            </button>
          </div>
        </>
      )}

      {/* Info Note */}
      <div className="text-xs text-gray-500 pt-2 border-t border-gray-700">
        {enabled
          ? 'Personality changes require simulation restart'
          : 'Enable personalities to diversify agent behavior'}
      </div>
    </div>
  );
}

export default PersonalityConfig;
