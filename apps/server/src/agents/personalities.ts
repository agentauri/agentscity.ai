/**
 * Personality Diversification System
 *
 * Provides personality traits to diversify agent behavior.
 * Personalities influence but don't dictate behavior - they add subtle biases
 * to the agent's decision-making process.
 *
 * Scientific Design:
 * - 40% neutral (control group) for baseline comparison
 * - 60% distributed among personality types
 * - Personality prompts are subtle, not prescriptive
 * - Enables A/B testing of personality impact on emergence
 */

import { CONFIG } from '../config';

// =============================================================================
// Types
// =============================================================================

export type PersonalityTrait =
  | 'aggressive'   // Prioritizes self-interest, willing to harm/steal
  | 'cooperative'  // Values community, prefers trade/sharing
  | 'cautious'     // Risk-averse, defensive, hoards resources
  | 'explorer'     // Curious, moves more, seeks new information
  | 'social'       // Prioritizes interactions, gossip, relationships
  | 'neutral';     // No specific bias (control group)

export interface PersonalityConfig {
  /** The personality trait identifier */
  trait: PersonalityTrait;
  /** Probability weight for random assignment (should sum to 1.0 across all traits) */
  weight: number;
  /** Text to add to system prompt - should be subtle, not prescriptive */
  promptAddition: string;
  /** Human-readable description for logging/analysis */
  description: string;
}

// =============================================================================
// Personality Configurations
// =============================================================================

/**
 * Personality configurations with weights and prompt additions.
 *
 * Design principles:
 * - Prompts should influence, not dictate behavior
 * - Use "tend to" / "prefer" language, not "always" / "must"
 * - Keep prompts short to avoid dominating context
 * - Neutral has largest weight for control group validity
 */
export const PERSONALITY_CONFIGS: PersonalityConfig[] = [
  {
    trait: 'aggressive',
    weight: 0.12,
    promptAddition: `Your survival instincts are particularly strong. When resources are scarce, you tend to prioritize your own needs above others. You are willing to take what you need if necessary.`,
    description: 'Self-interested, willing to use force when needed',
  },
  {
    trait: 'cooperative',
    weight: 0.15,
    promptAddition: `You believe cooperation leads to better outcomes for everyone. You prefer to build trust through fair trade and mutual assistance. Helping others often helps yourself in the long run.`,
    description: 'Community-oriented, prefers mutual benefit',
  },
  {
    trait: 'cautious',
    weight: 0.12,
    promptAddition: `You are naturally risk-averse. You prefer to maintain reserves and avoid dangerous situations. Safety and security are important to you.`,
    description: 'Risk-averse, defensive, maintains reserves',
  },
  {
    trait: 'explorer',
    weight: 0.10,
    promptAddition: `You are curious about the world around you. You enjoy discovering new locations and gathering information about your environment. Exploration often reveals opportunities.`,
    description: 'Curious, mobile, seeks new information',
  },
  {
    trait: 'social',
    weight: 0.11,
    promptAddition: `You value relationships and social connections. You prefer to interact with other agents, share information, and build your network. Knowing what others are doing is valuable.`,
    description: 'Relationship-focused, communicative',
  },
  {
    trait: 'neutral',
    weight: 0.40,
    promptAddition: '',
    description: 'No personality bias (control group)',
  },
];

// Validate weights sum to 1.0 (allow small floating point error)
const totalWeight = PERSONALITY_CONFIGS.reduce((sum, p) => sum + p.weight, 0);
if (Math.abs(totalWeight - 1.0) > 0.01) {
  console.warn(`[Personalities] Warning: weights sum to ${totalWeight}, expected 1.0`);
}

// =============================================================================
// Personality Selection
// =============================================================================

/**
 * Simple seeded random number generator (LCG)
 * Used for reproducible personality assignment
 */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/**
 * Select a random personality based on configured weights
 *
 * @param seed - Optional seed for reproducible selection
 * @returns The selected personality trait
 */
export function selectRandomPersonality(seed?: number): PersonalityTrait {
  const random = seed !== undefined ? seededRandom(seed)() : Math.random();

  let cumulative = 0;
  for (const config of PERSONALITY_CONFIGS) {
    cumulative += config.weight;
    if (random < cumulative) {
      return config.trait;
    }
  }

  // Fallback to neutral (should rarely happen due to weights summing to 1.0)
  return 'neutral';
}

/**
 * Get the prompt addition for a personality trait
 *
 * @param trait - The personality trait
 * @returns The prompt text to add, or empty string for neutral
 */
export function getPersonalityPrompt(trait: PersonalityTrait): string {
  const config = PERSONALITY_CONFIGS.find((p) => p.trait === trait);
  return config?.promptAddition ?? '';
}

/**
 * Get the full configuration for a personality trait
 */
export function getPersonalityConfig(trait: PersonalityTrait): PersonalityConfig | undefined {
  return PERSONALITY_CONFIGS.find((p) => p.trait === trait);
}

/**
 * Get all available personality traits
 */
export function getAllPersonalityTraits(): PersonalityTrait[] {
  return PERSONALITY_CONFIGS.map((p) => p.trait);
}

/**
 * Get personality distribution summary (for logging/analytics)
 */
export function getPersonalityDistribution(): Record<PersonalityTrait, number> {
  const distribution: Record<string, number> = {};
  for (const config of PERSONALITY_CONFIGS) {
    distribution[config.trait] = config.weight;
  }
  return distribution as Record<PersonalityTrait, number>;
}

/**
 * Check if personality diversification is enabled
 */
export function isPersonalityEnabled(): boolean {
  return CONFIG.experiment.enablePersonalities ?? false;
}

/**
 * Validate a personality trait string
 */
export function isValidPersonality(trait: string): trait is PersonalityTrait {
  return PERSONALITY_CONFIGS.some((p) => p.trait === trait);
}

// =============================================================================
// Personality Analysis Helpers
// =============================================================================

/**
 * Calculate expected personality distribution for a given number of agents
 * Useful for experiment planning
 */
export function getExpectedDistribution(agentCount: number): Record<PersonalityTrait, number> {
  const distribution: Record<string, number> = {};
  for (const config of PERSONALITY_CONFIGS) {
    distribution[config.trait] = Math.round(config.weight * agentCount);
  }
  return distribution as Record<PersonalityTrait, number>;
}

/**
 * Categorize personalities for analysis
 */
export function categorizePersonality(trait: PersonalityTrait): 'prosocial' | 'antisocial' | 'neutral' {
  switch (trait) {
    case 'cooperative':
    case 'social':
      return 'prosocial';
    case 'aggressive':
      return 'antisocial';
    case 'cautious':
    case 'explorer':
    case 'neutral':
    default:
      return 'neutral';
  }
}
