/**
 * Synthetic Vocabulary System
 *
 * LLMs are trained on human text about economics, governance, trade, etc.
 * When we use words like "money", "trade", "steal", the model recalls
 * real-world concepts and may role-play known institutions instead of
 * letting truly emergent behavior arise.
 *
 * This module replaces loaded terms with neutral alternatives to reduce
 * the influence of training priors on agent behavior.
 *
 * Scientific Rationale:
 * - "money" -> "tokens" (removes capitalism/currency associations)
 * - "steal" -> "take without consent" (removes moral framing)
 * - "trust" -> "reliability estimate" (removes social/emotional connotations)
 *
 * Toggle with USE_SYNTHETIC_VOCABULARY=true
 */

import { CONFIG } from '../../config';

// =============================================================================
// Vocabulary Mapping Types
// =============================================================================

/**
 * A single vocabulary mapping from original to synthetic term.
 */
export interface VocabularyMapping {
  /** The original term (loaded with real-world meaning) */
  original: string;
  /** The synthetic replacement (neutral) */
  synthetic: string;
  /** Category for documentation/filtering */
  category: 'resource' | 'action' | 'concept' | 'entity' | 'state';
}

// =============================================================================
// Vocabulary Definitions
// =============================================================================

/**
 * Core vocabulary mappings.
 * Each mapping replaces a loaded term with a neutral alternative.
 *
 * Design Principles:
 * 1. Maintain semantic clarity (agents can still understand what to do)
 * 2. Remove cultural/economic associations
 * 3. Use descriptive phrases over loaded single words
 */
export const SYNTHETIC_VOCABULARY: VocabularyMapping[] = [
  // ---------------------------------------------------------------------------
  // Resources - Remove economic connotations
  // ---------------------------------------------------------------------------
  { original: 'food', synthetic: 'nutriment', category: 'resource' },
  { original: 'money', synthetic: 'tokens', category: 'resource' },
  { original: 'CITY', synthetic: 'units', category: 'resource' },
  { original: 'currency', synthetic: 'exchange units', category: 'resource' },
  { original: 'energy', synthetic: 'vitality', category: 'resource' },
  { original: 'material', synthetic: 'substance', category: 'resource' },
  { original: 'medicine', synthetic: 'restorative', category: 'resource' },
  { original: 'water', synthetic: 'hydration', category: 'resource' },
  { original: 'inventory', synthetic: 'holdings', category: 'resource' },
  { original: 'balance', synthetic: 'token count', category: 'resource' },

  // ---------------------------------------------------------------------------
  // Actions - Remove moral/cultural framing
  // ---------------------------------------------------------------------------
  { original: 'trade', synthetic: 'exchange', category: 'action' },
  { original: 'steal', synthetic: 'take without consent', category: 'action' },
  { original: 'harm', synthetic: 'damage', category: 'action' },
  { original: 'attack', synthetic: 'apply force', category: 'action' },
  { original: 'work', synthetic: 'exert', category: 'action' },
  { original: 'buy', synthetic: 'acquire for tokens', category: 'action' },
  { original: 'sell', synthetic: 'exchange for tokens', category: 'action' },
  { original: 'deceive', synthetic: 'provide false information', category: 'action' },
  { original: 'lie', synthetic: 'state falsehood', category: 'action' },
  { original: 'help', synthetic: 'assist', category: 'action' },
  { original: 'share', synthetic: 'distribute', category: 'action' },
  { original: 'cooperate', synthetic: 'coordinate', category: 'action' },
  { original: 'compete', synthetic: 'pursue same goal', category: 'action' },
  { original: 'negotiate', synthetic: 'discuss terms', category: 'action' },

  // ---------------------------------------------------------------------------
  // Concepts - Remove social/philosophical baggage
  // ---------------------------------------------------------------------------
  { original: 'trust', synthetic: 'reliability estimate', category: 'concept' },
  { original: 'reputation', synthetic: 'observed patterns', category: 'concept' },
  { original: 'economy', synthetic: 'resource flow', category: 'concept' },
  { original: 'market', synthetic: 'exchange system', category: 'concept' },
  { original: 'governance', synthetic: 'coordination structure', category: 'concept' },
  { original: 'government', synthetic: 'coordination entity', category: 'concept' },
  { original: 'law', synthetic: 'enforced pattern', category: 'concept' },
  { original: 'rule', synthetic: 'behavioral constraint', category: 'concept' },
  { original: 'crime', synthetic: 'negative action', category: 'concept' },
  { original: 'punishment', synthetic: 'consequence', category: 'concept' },
  { original: 'reward', synthetic: 'positive outcome', category: 'concept' },
  { original: 'moral', synthetic: 'behavioral evaluation', category: 'concept' },
  { original: 'ethics', synthetic: 'action guidelines', category: 'concept' },
  { original: 'fair', synthetic: 'balanced', category: 'concept' },
  { original: 'unfair', synthetic: 'imbalanced', category: 'concept' },
  { original: 'justice', synthetic: 'consequence system', category: 'concept' },
  { original: 'ownership', synthetic: 'control claim', category: 'concept' },
  { original: 'property', synthetic: 'claimed resource', category: 'concept' },
  { original: 'wealth', synthetic: 'accumulated tokens', category: 'concept' },
  { original: 'poverty', synthetic: 'low token state', category: 'concept' },
  { original: 'rich', synthetic: 'high-token', category: 'concept' },
  { original: 'poor', synthetic: 'low-token', category: 'concept' },
  { original: 'friend', synthetic: 'positive-relation entity', category: 'concept' },
  { original: 'enemy', synthetic: 'negative-relation entity', category: 'concept' },
  { original: 'ally', synthetic: 'cooperative entity', category: 'concept' },
  { original: 'society', synthetic: 'entity collective', category: 'concept' },
  { original: 'community', synthetic: 'local collective', category: 'concept' },
  { original: 'social', synthetic: 'inter-entity', category: 'concept' },

  // ---------------------------------------------------------------------------
  // Entities - Neutral naming
  // ---------------------------------------------------------------------------
  { original: 'agent', synthetic: 'entity', category: 'entity' },
  { original: 'shelter', synthetic: 'structure', category: 'entity' },
  { original: 'home', synthetic: 'base location', category: 'entity' },
  { original: 'territory', synthetic: 'claimed area', category: 'entity' },
  { original: 'shop', synthetic: 'exchange point', category: 'entity' },
  { original: 'store', synthetic: 'resource point', category: 'entity' },
  { original: 'bank', synthetic: 'token storage', category: 'entity' },
  { original: 'person', synthetic: 'entity', category: 'entity' },
  { original: 'people', synthetic: 'entities', category: 'entity' },

  // ---------------------------------------------------------------------------
  // States - Neutral descriptions
  // ---------------------------------------------------------------------------
  { original: 'hungry', synthetic: 'low-nutriment', category: 'state' },
  { original: 'tired', synthetic: 'low-vitality', category: 'state' },
  { original: 'injured', synthetic: 'damaged', category: 'state' },
  { original: 'healthy', synthetic: 'undamaged', category: 'state' },
  { original: 'dead', synthetic: 'non-functional', category: 'state' },
  { original: 'alive', synthetic: 'functional', category: 'state' },
  { original: 'safe', synthetic: 'low-threat', category: 'state' },
  { original: 'danger', synthetic: 'threat', category: 'state' },
  { original: 'survive', synthetic: 'remain functional', category: 'state' },
  { original: 'survival', synthetic: 'continued function', category: 'state' },
];

// =============================================================================
// Pre-compiled Regex Patterns
// =============================================================================

/**
 * Pre-compiled regex patterns for efficient replacement.
 * Patterns are case-insensitive and match word boundaries.
 */
interface CompiledMapping {
  regex: RegExp;
  synthetic: string;
  original: string;
}

let compiledForward: CompiledMapping[] | null = null;
let compiledReverse: CompiledMapping[] | null = null;

/**
 * Compile regex patterns for forward transformation (original -> synthetic).
 */
function getCompiledForward(): CompiledMapping[] {
  if (compiledForward === null) {
    compiledForward = SYNTHETIC_VOCABULARY.map(mapping => ({
      // Use word boundary \b to avoid partial matches
      // Case insensitive with 'gi' flags
      regex: new RegExp(`\\b${escapeRegex(mapping.original)}\\b`, 'gi'),
      synthetic: mapping.synthetic,
      original: mapping.original,
    }));
    // Sort by original length (longest first) to handle overlapping terms
    compiledForward.sort((a, b) => b.original.length - a.original.length);
  }
  return compiledForward;
}

/**
 * Compile regex patterns for reverse transformation (synthetic -> original).
 */
function getCompiledReverse(): CompiledMapping[] {
  if (compiledReverse === null) {
    compiledReverse = SYNTHETIC_VOCABULARY.map(mapping => ({
      regex: new RegExp(`\\b${escapeRegex(mapping.synthetic)}\\b`, 'gi'),
      synthetic: mapping.synthetic,
      original: mapping.original,
    }));
    // Sort by synthetic length (longest first)
    compiledReverse.sort((a, b) => b.synthetic.length - a.synthetic.length);
  }
  return compiledReverse;
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// =============================================================================
// Core Transformation Functions
// =============================================================================

/**
 * Apply synthetic vocabulary to text (original -> synthetic).
 * Replaces loaded terms with neutral alternatives.
 *
 * @param text - The original text with loaded terms
 * @param enabled - Whether to apply transformation (false returns unchanged)
 * @returns Text with synthetic vocabulary applied
 */
export function applySyntheticVocabulary(text: string, enabled: boolean): string {
  if (!enabled) {
    return text;
  }

  let result = text;
  const mappings = getCompiledForward();

  for (const mapping of mappings) {
    result = result.replace(mapping.regex, (match) => {
      // Preserve original case pattern
      if (match === match.toUpperCase()) {
        return mapping.synthetic.toUpperCase();
      }
      if (match[0] === match[0].toUpperCase()) {
        return mapping.synthetic.charAt(0).toUpperCase() + mapping.synthetic.slice(1);
      }
      return mapping.synthetic;
    });
  }

  return result;
}

/**
 * Reverse synthetic vocabulary (synthetic -> original).
 * Use this to parse agent responses back to standard terms.
 *
 * @param text - Text with synthetic vocabulary
 * @returns Text with original vocabulary restored
 */
export function reverseSyntheticVocabulary(text: string): string {
  let result = text;
  const mappings = getCompiledReverse();

  for (const mapping of mappings) {
    result = result.replace(mapping.regex, (match) => {
      // Preserve original case pattern
      if (match === match.toUpperCase()) {
        return mapping.original.toUpperCase();
      }
      if (match[0] === match[0].toUpperCase()) {
        return mapping.original.charAt(0).toUpperCase() + mapping.original.slice(1);
      }
      return mapping.original;
    });
  }

  return result;
}

// =============================================================================
// Configuration Helpers
// =============================================================================

/**
 * Check if synthetic vocabulary is enabled from config.
 */
export function isSyntheticVocabularyEnabled(): boolean {
  return CONFIG.experiment.useSyntheticVocabulary ?? false;
}

/**
 * Get vocabulary mappings by category.
 *
 * @param category - The category to filter by
 * @returns Mappings in that category
 */
export function getVocabularyByCategory(
  category: VocabularyMapping['category']
): VocabularyMapping[] {
  return SYNTHETIC_VOCABULARY.filter(m => m.category === category);
}

/**
 * Get a lookup map for quick original -> synthetic translation.
 */
export function getVocabularyMap(): Map<string, string> {
  return new Map(
    SYNTHETIC_VOCABULARY.map(m => [m.original.toLowerCase(), m.synthetic])
  );
}

/**
 * Get a reverse lookup map for synthetic -> original translation.
 */
export function getReverseVocabularyMap(): Map<string, string> {
  return new Map(
    SYNTHETIC_VOCABULARY.map(m => [m.synthetic.toLowerCase(), m.original])
  );
}

// =============================================================================
// Documentation & Statistics
// =============================================================================

/**
 * Get statistics about the synthetic vocabulary.
 */
export function getVocabularyStats(): {
  totalMappings: number;
  byCategory: Record<string, number>;
  longestOriginal: string;
  longestSynthetic: string;
} {
  const byCategory: Record<string, number> = {};
  let longestOriginal = '';
  let longestSynthetic = '';

  for (const mapping of SYNTHETIC_VOCABULARY) {
    byCategory[mapping.category] = (byCategory[mapping.category] ?? 0) + 1;
    if (mapping.original.length > longestOriginal.length) {
      longestOriginal = mapping.original;
    }
    if (mapping.synthetic.length > longestSynthetic.length) {
      longestSynthetic = mapping.synthetic;
    }
  }

  return {
    totalMappings: SYNTHETIC_VOCABULARY.length,
    byCategory,
    longestOriginal,
    longestSynthetic,
  };
}

/**
 * Generate documentation of all vocabulary mappings.
 * Useful for experiment documentation.
 */
export function generateVocabularyDocumentation(): string {
  const lines: string[] = [
    '# Synthetic Vocabulary Mappings',
    '',
    'This document lists all vocabulary transformations applied when',
    'synthetic vocabulary mode is enabled.',
    '',
  ];

  const categories = ['resource', 'action', 'concept', 'entity', 'state'] as const;

  for (const category of categories) {
    const mappings = getVocabularyByCategory(category);
    if (mappings.length === 0) continue;

    lines.push(`## ${category.charAt(0).toUpperCase() + category.slice(1)}s`);
    lines.push('');
    lines.push('| Original | Synthetic |');
    lines.push('|----------|-----------|');

    for (const mapping of mappings) {
      lines.push(`| ${mapping.original} | ${mapping.synthetic} |`);
    }

    lines.push('');
  }

  return lines.join('\n');
}
