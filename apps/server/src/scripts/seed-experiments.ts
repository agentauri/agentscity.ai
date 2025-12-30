/**
 * Seed Experiments Script
 *
 * Creates scientific baseline experiments for comparing agent decision-making approaches.
 *
 * Experiments:
 * 1. Random Walk vs LLM - Null hypothesis comparison
 * 2. Rule-Based vs LLM - Fallback baseline comparison
 * 3. LLM Type Comparison - Compare different LLM models
 *
 * Usage:
 *   bun run src/scripts/seed-experiments.ts [experiment-type]
 *
 *   experiment-type: 'random-walk' | 'rule-based' | 'llm-comparison' | 'all'
 */

import {
  createExperiment,
  createVariant,
  getExperimentWithVariants,
  listExperiments,
} from '../db/queries/experiments';
import type { AgentConfig } from '../agents/spawner';

// =============================================================================
// Types
// =============================================================================

export type ExperimentType = 'random-walk' | 'rule-based' | 'llm-comparison';

export interface ExperimentDefinition {
  type: ExperimentType;
  name: string;
  description: string;
  hypothesis: string;
  metrics: string[];
  variants: VariantDefinition[];
}

export interface VariantDefinition {
  name: string;
  description: string;
  configOverrides?: Record<string, unknown>;
  agentConfigs?: AgentConfig[];
  durationTicks: number;
}

// =============================================================================
// Default Agent Configurations
// =============================================================================

const DEFAULT_AGENTS: AgentConfig[] = [
  { llmType: 'claude', name: 'Claude', color: '#ef4444', startX: 28, startY: 20 },
  { llmType: 'codex', name: 'Codex', color: '#3b82f6', startX: 30, startY: 20 },
  { llmType: 'gemini', name: 'Gemini', color: '#10b981', startX: 32, startY: 20 },
  { llmType: 'deepseek', name: 'DeepSeek', color: '#f59e0b', startX: 28, startY: 22 },
  { llmType: 'qwen', name: 'Qwen', color: '#8b5cf6', startX: 30, startY: 22 },
  { llmType: 'glm', name: 'GLM', color: '#ec4899', startX: 32, startY: 22 },
];

// =============================================================================
// Experiment 1: Random Walk vs LLM (Null Hypothesis)
// =============================================================================

const RANDOM_WALK_EXPERIMENT: ExperimentDefinition = {
  type: 'random-walk',
  name: 'Random Walk vs LLM Decision Making',
  description: `
    Null hypothesis experiment comparing purely random movement against LLM-based decision making.

    This experiment tests whether LLM agents perform better than a random walk baseline.
    If LLM agents do not significantly outperform random walk, it suggests that the
    observed behaviors may be emergent from the environment rather than intelligent decisions.

    Random walk agents:
    - Move in random cardinal directions (N/S/E/W)
    - Only perform survival actions when critically low on needs
    - Do not use any strategic reasoning
  `.trim(),
  hypothesis:
    'LLM-based agents will achieve higher survival rates and wealth accumulation compared to random walk agents.',
  metrics: [
    'survivalRate',
    'avgWealth',
    'avgHealth',
    'avgHunger',
    'avgEnergy',
    'giniCoefficient',
    'cooperationIndex',
    'tradeCount',
  ],
  variants: [
    {
      name: 'Random Walk (Control)',
      description: 'Agents use purely random movement decisions',
      configOverrides: {
        useRandomWalk: true,
        useOnlyFallback: false,
      },
      durationTicks: 100,
    },
    {
      name: 'LLM Decision Making (Treatment)',
      description: 'Agents use full LLM-based decision making',
      configOverrides: {
        useRandomWalk: false,
        useOnlyFallback: false,
      },
      durationTicks: 100,
    },
  ],
};

// =============================================================================
// Experiment 2: Rule-Based vs LLM (Fallback Baseline)
// =============================================================================

const RULE_BASED_EXPERIMENT: ExperimentDefinition = {
  type: 'rule-based',
  name: 'Rule-Based vs LLM Decision Making',
  description: `
    Baseline experiment comparing rule-based (fallback) decisions against LLM-based decisions.

    Rule-based agents use a simple decision tree:
    1. If health critical: consume food
    2. If energy critical: sleep
    3. If hunger low: gather food
    4. If at resource: gather
    5. Otherwise: work or move toward resources

    This establishes whether LLM reasoning provides value beyond simple heuristics.
  `.trim(),
  hypothesis:
    'LLM-based agents will exhibit more adaptive behavior and higher cooperation compared to rule-based agents.',
  metrics: [
    'survivalRate',
    'avgWealth',
    'avgHealth',
    'cooperationIndex',
    'tradeCount',
    'conflictCount',
    'giniCoefficient',
  ],
  variants: [
    {
      name: 'Rule-Based Fallback (Control)',
      description: 'Agents use deterministic rule-based decisions',
      configOverrides: {
        useRandomWalk: false,
        useOnlyFallback: true,
      },
      durationTicks: 100,
    },
    {
      name: 'LLM Decision Making (Treatment)',
      description: 'Agents use full LLM-based decision making',
      configOverrides: {
        useRandomWalk: false,
        useOnlyFallback: false,
      },
      durationTicks: 100,
    },
  ],
};

// =============================================================================
// Experiment 3: LLM Type Comparison
// =============================================================================

const LLM_COMPARISON_EXPERIMENT: ExperimentDefinition = {
  type: 'llm-comparison',
  name: 'LLM Model Comparison',
  description: `
    Comparative experiment testing different LLM models in isolation.

    Each variant uses agents of a single LLM type to isolate model-specific behaviors.
    This helps identify which LLM models are best suited for:
    - Survival optimization
    - Economic success
    - Cooperative behavior
    - Social emergence
  `.trim(),
  hypothesis:
    'Different LLM models will exhibit distinct behavioral patterns and varying levels of survival success.',
  metrics: [
    'survivalRate',
    'avgWealth',
    'avgHealth',
    'avgHunger',
    'avgEnergy',
    'cooperationIndex',
    'tradeCount',
    'conflictCount',
    'giniCoefficient',
  ],
  variants: [
    {
      name: 'Claude Only',
      description: 'All agents use Claude LLM',
      agentConfigs: generateSingleTypeAgents('claude', '#ef4444'),
      durationTicks: 100,
    },
    {
      name: 'Gemini Only',
      description: 'All agents use Gemini LLM',
      agentConfigs: generateSingleTypeAgents('gemini', '#10b981'),
      durationTicks: 100,
    },
    {
      name: 'Codex Only',
      description: 'All agents use OpenAI Codex LLM',
      agentConfigs: generateSingleTypeAgents('codex', '#3b82f6'),
      durationTicks: 100,
    },
    {
      name: 'DeepSeek Only',
      description: 'All agents use DeepSeek LLM',
      agentConfigs: generateSingleTypeAgents('deepseek', '#f59e0b'),
      durationTicks: 100,
    },
    {
      name: 'Mixed LLMs (Control)',
      description: 'Diverse mix of all LLM types (default configuration)',
      agentConfigs: DEFAULT_AGENTS,
      durationTicks: 100,
    },
  ],
};

/**
 * Generate agent configs with a single LLM type
 */
function generateSingleTypeAgents(
  llmType: string,
  color: string
): AgentConfig[] {
  const positions = [
    { x: 28, y: 20 },
    { x: 30, y: 20 },
    { x: 32, y: 20 },
    { x: 28, y: 22 },
    { x: 30, y: 22 },
    { x: 32, y: 22 },
  ];

  return positions.map((pos, i) => ({
    llmType: llmType as AgentConfig['llmType'],
    name: `${llmType.charAt(0).toUpperCase() + llmType.slice(1)}-${i + 1}`,
    color,
    startX: pos.x,
    startY: pos.y,
  }));
}

// =============================================================================
// Seed Functions
// =============================================================================

/**
 * Seed a single experiment with its variants
 */
export async function seedExperiment(
  definition: ExperimentDefinition
): Promise<{ experimentId: string; variantIds: string[] }> {
  console.log(`\n[Seed] Creating experiment: ${definition.name}`);

  // Check if experiment already exists
  const existing = await listExperiments();
  const existingExperiment = existing.find((e) => e.name === definition.name);

  if (existingExperiment) {
    console.log(`  [Skip] Experiment already exists: ${existingExperiment.id}`);
    const withVariants = await getExperimentWithVariants(existingExperiment.id);
    return {
      experimentId: existingExperiment.id,
      variantIds: withVariants?.variants.map((v) => v.id) ?? [],
    };
  }

  // Create experiment
  const experiment = await createExperiment({
    name: definition.name,
    description: definition.description,
    hypothesis: definition.hypothesis,
    metrics: definition.metrics,
  });

  console.log(`  [Created] Experiment: ${experiment.id}`);

  // Create variants
  const variantIds: string[] = [];

  for (const variantDef of definition.variants) {
    const variant = await createVariant(experiment.id, {
      name: variantDef.name,
      description: variantDef.description,
      configOverrides: variantDef.configOverrides,
      agentConfigs: variantDef.agentConfigs,
      durationTicks: variantDef.durationTicks,
    });

    variantIds.push(variant.id);
    console.log(`  [Created] Variant: ${variant.name} (${variant.id})`);
  }

  return { experimentId: experiment.id, variantIds };
}

/**
 * Seed the Random Walk vs LLM experiment
 */
export async function seedRandomWalkExperiment(): Promise<{
  experimentId: string;
  variantIds: string[];
}> {
  return seedExperiment(RANDOM_WALK_EXPERIMENT);
}

/**
 * Seed the Rule-Based vs LLM experiment
 */
export async function seedRuleBasedExperiment(): Promise<{
  experimentId: string;
  variantIds: string[];
}> {
  return seedExperiment(RULE_BASED_EXPERIMENT);
}

/**
 * Seed the LLM Type Comparison experiment
 */
export async function seedLLMComparisonExperiment(): Promise<{
  experimentId: string;
  variantIds: string[];
}> {
  return seedExperiment(LLM_COMPARISON_EXPERIMENT);
}

/**
 * Seed all baseline experiments
 */
export async function seedAllExperiments(): Promise<
  Array<{ experimentId: string; variantIds: string[] }>
> {
  console.log('[Seed] Seeding all baseline experiments...');

  const results = [
    await seedRandomWalkExperiment(),
    await seedRuleBasedExperiment(),
    await seedLLMComparisonExperiment(),
  ];

  console.log(`\n[Seed] Created ${results.length} experiments`);
  return results;
}

/**
 * Get experiment definition by type
 */
export function getExperimentDefinition(
  type: ExperimentType
): ExperimentDefinition {
  switch (type) {
    case 'random-walk':
      return RANDOM_WALK_EXPERIMENT;
    case 'rule-based':
      return RULE_BASED_EXPERIMENT;
    case 'llm-comparison':
      return LLM_COMPARISON_EXPERIMENT;
    default:
      throw new Error(`Unknown experiment type: ${type}`);
  }
}

// =============================================================================
// CLI Entry Point
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  const experimentType = args[0] || 'all';

  console.log('========================================');
  console.log('  AgentsCity Experiment Seeder');
  console.log('========================================');

  try {
    switch (experimentType) {
      case 'random-walk':
        await seedRandomWalkExperiment();
        break;
      case 'rule-based':
        await seedRuleBasedExperiment();
        break;
      case 'llm-comparison':
        await seedLLMComparisonExperiment();
        break;
      case 'all':
        await seedAllExperiments();
        break;
      default:
        console.error(`Unknown experiment type: ${experimentType}`);
        console.log('Usage: bun run src/scripts/seed-experiments.ts [random-walk|rule-based|llm-comparison|all]');
        process.exit(1);
    }

    console.log('\n[Done] Experiments seeded successfully');
    process.exit(0);
  } catch (error) {
    console.error('[Error] Failed to seed experiments:', error);
    process.exit(1);
  }
}

// Only run main if this is the entry point
if (import.meta.main) {
  main();
}
