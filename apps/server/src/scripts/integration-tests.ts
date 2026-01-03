/**
 * End-to-End Integration Tests
 *
 * Tests that all experimental features work correctly together:
 * - Emergent prompts with personality
 * - Baseline agents (including Q-learning)
 * - Statistical significance tests
 * - Composite shocks
 * - Ensemble comparison
 *
 * Usage:
 *   bun run src/scripts/integration-tests.ts
 *   bun run src/scripts/integration-tests.ts --verbose
 *   bun run src/scripts/integration-tests.ts --filter "personality"
 */

import { parseArgs } from 'util';

// =============================================================================
// Types
// =============================================================================

interface TestResult {
  name: string;
  category: string;
  passed: boolean;
  duration: number;
  error?: string;
}

interface TestSuite {
  name: string;
  tests: Array<{
    name: string;
    fn: () => Promise<void>;
  }>;
}

// =============================================================================
// Test Utilities
// =============================================================================

let testResults: TestResult[] = [];
let currentCategory = '';

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

function assertInRange(value: number, min: number, max: number, message: string): void {
  if (value < min || value > max) {
    throw new Error(`${message}: ${value} not in range [${min}, ${max}]`);
  }
}

function assertDefined<T>(value: T | undefined | null, message: string): asserts value is T {
  if (value === undefined || value === null) {
    throw new Error(`${message}: value is undefined or null`);
  }
}

// =============================================================================
// Test Suites
// =============================================================================

const testSuites: TestSuite[] = [
  // ===========================================================================
  // Personality + Emergent Prompts
  // ===========================================================================
  {
    name: 'Personality in Emergent Prompts',
    tests: [
      {
        name: 'buildEmergentSystemPrompt accepts personality parameter',
        fn: async () => {
          const { buildEmergentSystemPrompt } = await import('../llm/prompts/emergent-prompt');

          // Test with each personality type
          const personalities = ['aggressive', 'cooperative', 'cautious', 'explorer', 'social', 'neutral'] as const;

          for (const personality of personalities) {
            const prompt = buildEmergentSystemPrompt(personality);
            assert(typeof prompt === 'string', `Prompt should be string for ${personality}`);
            assert(prompt.length > 0, `Prompt should not be empty for ${personality}`);

            // Non-neutral personalities should include "Your Inner Nature"
            if (personality !== 'neutral') {
              assert(prompt.includes('Your Inner Nature'), `Prompt should include personality section for ${personality}`);
            }
          }
        },
      },
      {
        name: 'buildFullPrompt passes personality to emergent mode',
        fn: async () => {
          const { buildFullPrompt } = await import('../llm/prompt-builder');
          const { setEmergentPromptMode } = await import('../config');

          // Enable emergent mode
          setEmergentPromptMode(true);

          const mockObservation = {
            tick: 1,
            timestamp: Date.now(),
            self: { id: 'test', x: 50, y: 50, hunger: 80, energy: 80, health: 100, balance: 100, state: 'idle' as const },
            nearbyAgents: [],
            nearbyResourceSpawns: [],
            nearbyShelters: [],
            nearbyLocations: [],
            availableActions: [],
            recentEvents: [],
            inventory: [],
          };

          const prompt = buildFullPrompt(mockObservation, { personality: 'cooperative' });
          assert(prompt.includes('Your Inner Nature'), 'Emergent prompt should include personality');
          assert(prompt.includes('connection'), 'Cooperative personality should mention connection');

          // Restore
          setEmergentPromptMode(false);
        },
      },
    ],
  },

  // ===========================================================================
  // Baseline Agents (including Q-learning)
  // ===========================================================================
  {
    name: 'Baseline Agents',
    tests: [
      {
        name: 'Q-learning agent can be created',
        fn: async () => {
          const { createBaselineAgent, QLearningAgent } = await import('../agents/baselines');

          const agent = createBaselineAgent('qlearning');
          assert(agent instanceof QLearningAgent, 'Should create QLearningAgent instance');
          assertEqual(agent.type, 'qlearning', 'Agent type should be qlearning');
        },
      },
      {
        name: 'Q-learning agent makes valid decisions',
        fn: async () => {
          const { QLearningAgent } = await import('../agents/baselines');

          const agent = new QLearningAgent();

          const mockObservation = {
            self: { id: 'test-ql', x: 50, y: 50, hunger: 30, energy: 80, health: 100, balance: 100, state: 'idle' as const },
            nearbyAgents: [],
            nearbyResourceSpawns: [{ id: 's1', x: 50, y: 50, resourceType: 'food' as const, currentAmount: 5, maxAmount: 10 }],
            nearbyShelters: [],
            inventory: [{ type: 'food', quantity: 2 }],
            currentTick: 1,
            biome: 'plains' as const,
          };

          const decision = agent.decide(mockObservation);
          assertDefined(decision, 'Decision should be defined');
          assertDefined(decision.action, 'Decision should have action');
          assertDefined(decision.reasoning, 'Decision should have reasoning');
          assert(decision.reasoning.includes('[Q-Learning]'), 'Reasoning should indicate Q-learning source');
        },
      },
      {
        name: 'All baseline types are registered',
        fn: async () => {
          const { BASELINE_LLM_TYPES, isBaselineAgent } = await import('../agents/baselines');

          const expectedTypes = ['baseline_random', 'baseline_rule', 'baseline_sugarscape', 'baseline_qlearning'];

          for (const type of expectedTypes) {
            assert(BASELINE_LLM_TYPES.includes(type as any), `${type} should be in BASELINE_LLM_TYPES`);
            assert(isBaselineAgent(type), `${type} should be recognized as baseline agent`);
          }
        },
      },
      {
        name: 'Q-learning stats functions work',
        fn: async () => {
          const { getQLearningStats, resetQLearningState } = await import('../agents/baselines');

          // Reset first
          resetQLearningState();

          const stats = getQLearningStats();
          assertEqual(stats.stateCount, 0, 'Should start with 0 states after reset');
          assertEqual(stats.totalQValues, 0, 'Should start with 0 Q-values after reset');
        },
      },
    ],
  },

  // ===========================================================================
  // Statistical Significance Tests
  // ===========================================================================
  {
    name: 'Statistical Tests',
    tests: [
      {
        name: 'performSignificanceTest returns complete results',
        fn: async () => {
          const { performSignificanceTest } = await import('../analysis/metric-validator');

          const group1 = [10, 12, 11, 13, 10, 12, 11, 13, 10, 12];
          const group2 = [20, 22, 21, 23, 20, 22, 21, 23, 20, 22];

          const result = performSignificanceTest(group1, group2, { testName: 'test-comparison' });

          assertDefined(result.pValue, 'Should have p-value');
          assertDefined(result.isSignificant, 'Should have significance flag');
          assertDefined(result.effectSize, 'Should have effect size');
          assertDefined(result.confidenceInterval, 'Should have confidence interval');
          assertDefined(result.power, 'Should have power');

          assertInRange(result.pValue, 0, 1, 'P-value should be between 0 and 1');
          assert(result.isSignificant, 'Should detect significant difference');
        },
      },
      {
        name: 'Multiple comparison corrections work correctly',
        fn: async () => {
          const {
            bonferroniCorrection,
            holmBonferroniCorrection,
            benjaminiHochbergCorrection,
            applyMultipleComparisonCorrections,
          } = await import('../analysis/metric-validator');

          const pValues = [0.01, 0.02, 0.03, 0.04, 0.05];

          // Bonferroni
          const bonf = bonferroniCorrection(pValues);
          assertEqual(bonf[0], 0.05, 'Bonferroni: 0.01 * 5 = 0.05');
          assertEqual(bonf[1], 0.10, 'Bonferroni: 0.02 * 5 = 0.10');

          // Holm
          const holm = holmBonferroniCorrection(pValues);
          assert(holm[0] <= bonf[0], 'Holm should be <= Bonferroni for smallest p-value');

          // FDR
          const fdr = benjaminiHochbergCorrection(pValues);
          assert(fdr[0] <= bonf[0], 'FDR should be <= Bonferroni for smallest p-value');

          // Combined
          const result = applyMultipleComparisonCorrections(pValues, 0.05);
          assertEqual(result.originalPValues.length, 5, 'Should preserve original p-values');
          assertEqual(result.bonferroniAdjusted.length, 5, 'Should have Bonferroni adjusted');
          assertEqual(result.holmAdjusted.length, 5, 'Should have Holm adjusted');
          assertEqual(result.fdrAdjusted.length, 5, 'Should have FDR adjusted');
        },
      },
      {
        name: 'Chi-squared test works',
        fn: async () => {
          const { chiSquaredTest } = await import('../analysis/metric-validator');

          // Heavily skewed distribution
          const observed = [100, 10, 10, 10, 10];
          const expected = [28, 28, 28, 28, 28];

          const result = chiSquaredTest(observed, expected);
          assertEqual(result.testName, 'chi_squared', 'Should be chi-squared test');
          assert(result.isSignificant, 'Should detect significant difference');
          assert(result.statistic > 0, 'Chi-squared statistic should be positive');
        },
      },
      {
        name: 'Kolmogorov-Smirnov test works',
        fn: async () => {
          const { kolmogorovSmirnovTest } = await import('../analysis/metric-validator');

          const group1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
          const group2 = [50, 51, 52, 53, 54, 55, 56, 57, 58, 59];

          const result = kolmogorovSmirnovTest(group1, group2);
          assertEqual(result.testName, 'kolmogorov_smirnov', 'Should be KS test');
          assert(result.isSignificant, 'Should detect different distributions');
          assertInRange(result.statistic, 0, 1, 'KS statistic should be between 0 and 1');
        },
      },
      {
        name: 'Comprehensive comparison includes all tests',
        fn: async () => {
          const { comprehensiveStatisticalComparison } = await import('../analysis/metric-validator');

          const group1 = [10, 12, 11, 13, 10];
          const group2 = [20, 22, 21, 23, 20];

          const result = comprehensiveStatisticalComparison(group1, group2, 'test');

          assertDefined(result.tTest, 'Should have t-test');
          assertDefined(result.mannWhitneyU, 'Should have Mann-Whitney U');
          assertDefined(result.permutation, 'Should have permutation test');
          assertDefined(result.ksTest, 'Should have KS test');
          assertDefined(result.effectSize, 'Should have effect size');
          assertDefined(result.power, 'Should have power');
          assertDefined(result.recommendation, 'Should have recommendation');
        },
      },
    ],
  },

  // ===========================================================================
  // Composite Shocks
  // ===========================================================================
  {
    name: 'Composite Shocks',
    tests: [
      {
        name: 'Composite shock templates are defined',
        fn: async () => {
          const { COMPOSITE_SHOCK_TEMPLATES, getCompositeShockTemplates } = await import('../simulation/shocks');

          const templates = getCompositeShockTemplates();
          const expectedTemplates = [
            'economic_crisis',
            'perfect_storm',
            'boom_bust_cycle',
            'epidemic_waves',
            'managed_growth',
            'isolation_scarcity',
            'rapid_change',
          ];

          for (const name of expectedTemplates) {
            assertDefined(templates[name], `Template ${name} should exist`);
          }
        },
      },
      {
        name: 'createCompositeFromTemplate creates valid config',
        fn: async () => {
          const { createCompositeFromTemplate, validateCompositeShock } = await import('../simulation/shocks');

          const composite = createCompositeFromTemplate('economic_crisis', 100);

          assertDefined(composite.id, 'Should have ID');
          assertEqual(composite.name, 'Economic Crisis', 'Should have correct name');
          assertEqual(composite.mode, 'sequence', 'Should have correct mode');
          assert(composite.shocks.length >= 2, 'Should have multiple shocks');

          const validation = validateCompositeShock(composite);
          assert(validation.valid, `Should be valid: ${validation.errors.join(', ')}`);
        },
      },
      {
        name: 'Composite modes work correctly',
        fn: async () => {
          const { createCompositeShock, validateCompositeShock } = await import('../simulation/shocks');

          // Parallel mode
          const parallel = createCompositeShock({
            name: 'Test Parallel',
            description: 'Test',
            mode: 'parallel',
            shocks: [
              { type: 'resource_boom', scheduledTick: 0, intensity: 0.5 },
              { type: 'immigration', scheduledTick: 0, intensity: 0.5 },
            ],
          });
          assertEqual(parallel.mode, 'parallel', 'Should be parallel mode');

          // Sequence mode
          const sequence = createCompositeShock({
            name: 'Test Sequence',
            description: 'Test',
            mode: 'sequence',
            shocks: [
              { type: 'resource_boom', scheduledTick: 0, intensity: 0.5 },
              { type: 'resource_collapse', scheduledTick: 0, intensity: 0.5 },
            ],
            delayBetweenShocks: 5,
          });
          assertEqual(sequence.mode, 'sequence', 'Should be sequence mode');

          // Cascade mode
          const cascade = createCompositeShock({
            name: 'Test Cascade',
            description: 'Test',
            mode: 'cascade',
            shocks: [
              { type: 'plague', scheduledTick: 0, intensity: 0.8 },
              { type: 'plague', scheduledTick: 0, intensity: 0.5 },
            ],
            delayBetweenShocks: 10,
            cascadeDecay: 0.6,
          });
          assertEqual(cascade.mode, 'cascade', 'Should be cascade mode');

          // All should be valid
          assert(validateCompositeShock(parallel).valid, 'Parallel should be valid');
          assert(validateCompositeShock(sequence).valid, 'Sequence should be valid');
          assert(validateCompositeShock(cascade).valid, 'Cascade should be valid');
        },
      },
      {
        name: 'Random composite generation works',
        fn: async () => {
          const { generateRandomComposite, validateCompositeShock } = await import('../simulation/shocks');

          for (const complexity of [1, 2, 3] as const) {
            const composite = generateRandomComposite(100, complexity);

            assertDefined(composite.id, 'Should have ID');
            assertDefined(composite.name, 'Should have name');
            assert(composite.shocks.length >= complexity + 1, `Should have at least ${complexity + 1} shocks`);

            const validation = validateCompositeShock(composite);
            assert(validation.valid, `Random composite (complexity ${complexity}) should be valid: ${validation.errors.join(', ')}`);
          }
        },
      },
    ],
  },

  // ===========================================================================
  // Ensemble Comparison
  // ===========================================================================
  {
    name: 'Ensemble Comparison',
    tests: [
      {
        name: 'Comparison functions are exported',
        fn: async () => {
          const {
            compareExperiments,
            generateReport,
            formatTable,
            formatCSV,
            formatLaTeX,
          } = await import('./compare-ensembles');

          assertDefined(compareExperiments, 'compareExperiments should be exported');
          assertDefined(generateReport, 'generateReport should be exported');
          assertDefined(formatTable, 'formatTable should be exported');
          assertDefined(formatCSV, 'formatCSV should be exported');
          assertDefined(formatLaTeX, 'formatLaTeX should be exported');
        },
      },
      {
        name: 'Format functions produce valid output',
        fn: async () => {
          const { generateReport, formatTable, formatCSV, formatLaTeX } = await import('./compare-ensembles');
          const { EnsembleResult: _EnsembleResultType } = await import('./run-ensemble') as { EnsembleResult: unknown };

          // Create mock ensemble results - type defined inline since dynamic import types are complex
          type EnsembleResult = {
            experiment: { configFile: string | null; name: string; description: string; seedsUsed: number[]; ticksPerRun: number; decisionMode: string; timestamp: string; durationMs: number };
            aggregated: Record<string, { mean: number; std: number; ci95: [number, number]; min: number; max: number; median: number }>;
            perRun: Array<Record<string, number>>;
          };
          const mockResult1: EnsembleResult = {
            experiment: { configFile: null, name: 'Test1', description: '', seedsUsed: [1, 2], ticksPerRun: 10, decisionMode: 'fallback', timestamp: '', durationMs: 1000 },
            aggregated: {
              gini: { mean: 0.3, std: 0.1, ci95: [0.2, 0.4], min: 0.2, max: 0.4, median: 0.3 },
              cooperationIndex: { mean: 0.5, std: 0.1, ci95: [0.4, 0.6], min: 0.4, max: 0.6, median: 0.5 },
              survivalRate: { mean: 0.8, std: 0.1, ci95: [0.7, 0.9], min: 0.7, max: 0.9, median: 0.8 },
              timeToFirstDeath: { mean: 50, std: 10, ci95: [40, 60], min: 40, max: 60, median: 50 },
              timeToFirstTrade: { mean: 5, std: 2, ci95: [3, 7], min: 3, max: 7, median: 5 },
              timeToFirstConflict: { mean: 20, std: 5, ci95: [15, 25], min: 15, max: 25, median: 20 },
              llmCallCount: { mean: 100, std: 20, ci95: [80, 120], min: 80, max: 120, median: 100 },
              lizardBrainUsageRate: { mean: 0.3, std: 0.1, ci95: [0.2, 0.4], min: 0.2, max: 0.4, median: 0.3 },
              avgWealth: { mean: 100, std: 20, ci95: [80, 120], min: 80, max: 120, median: 100 },
              avgHealth: { mean: 80, std: 10, ci95: [70, 90], min: 70, max: 90, median: 80 },
              tradeCount: { mean: 10, std: 3, ci95: [7, 13], min: 7, max: 13, median: 10 },
              harmCount: { mean: 2, std: 1, ci95: [1, 3], min: 1, max: 3, median: 2 },
              stealCount: { mean: 1, std: 0.5, ci95: [0.5, 1.5], min: 0, max: 2, median: 1 },
              deathCount: { mean: 1, std: 0.5, ci95: [0.5, 1.5], min: 0, max: 2, median: 1 },
            },
            perRun: [
              { seed: 1, gini: 0.3, cooperationIndex: 0.5, survivalRate: 0.8, timeToFirstDeath: 50, timeToFirstTrade: 5, timeToFirstConflict: 20, llmCallCount: 100, lizardBrainUsageRate: 0.3, finalTick: 10, totalEvents: 100, avgWealth: 100, avgHealth: 80, avgHunger: 70, avgEnergy: 60, tradeCount: 10, harmCount: 2, stealCount: 1, deathCount: 1 },
              { seed: 2, gini: 0.3, cooperationIndex: 0.5, survivalRate: 0.8, timeToFirstDeath: 50, timeToFirstTrade: 5, timeToFirstConflict: 20, llmCallCount: 100, lizardBrainUsageRate: 0.3, finalTick: 10, totalEvents: 100, avgWealth: 100, avgHealth: 80, avgHunger: 70, avgEnergy: 60, tradeCount: 10, harmCount: 2, stealCount: 1, deathCount: 1 },
            ],
          };

          const mockResult2 = { ...mockResult1, experiment: { ...mockResult1.experiment, name: 'Test2' } };

          const report = generateReport(['file1.json', 'file2.json'], [mockResult1, mockResult2], 0.05, 'holm');

          // Test formatters
          const table = formatTable(report);
          assert(table.length > 0, 'Table format should produce output');
          assert(table.includes('Test1'), 'Table should include experiment name');

          const csv = formatCSV(report);
          assert(csv.includes(','), 'CSV should contain commas');
          assert(csv.includes('Metric'), 'CSV should have header');

          const latex = formatLaTeX(report);
          assert(latex.includes('\\begin{table}'), 'LaTeX should contain table environment');
          assert(latex.includes('\\end{table}'), 'LaTeX should close table environment');
        },
      },
    ],
  },

  // ===========================================================================
  // Feature Integration
  // ===========================================================================
  {
    name: 'Feature Integration',
    tests: [
      {
        name: 'All features can be imported together',
        fn: async () => {
          // Import all major features
          const prompts = await import('../llm/prompt-builder');
          const emergent = await import('../llm/prompts/emergent-prompt');
          const baselines = await import('../agents/baselines');
          const shocks = await import('../simulation/shocks');
          const metrics = await import('../analysis/metric-validator');

          // Verify key exports exist
          assertDefined(prompts.buildSystemPrompt, 'buildSystemPrompt');
          assertDefined(prompts.buildFullPrompt, 'buildFullPrompt');
          assertDefined(emergent.buildEmergentSystemPrompt, 'buildEmergentSystemPrompt');
          assertDefined(baselines.QLearningAgent, 'QLearningAgent');
          assertDefined(shocks.COMPOSITE_SHOCK_TEMPLATES, 'COMPOSITE_SHOCK_TEMPLATES');
          assertDefined(metrics.performSignificanceTest, 'performSignificanceTest');
        },
      },
      {
        name: 'Environment toggles work correctly',
        fn: async () => {
          const { setEmergentPromptMode, isEmergentPromptEnabled } = await import('../config');

          // Test toggle
          setEmergentPromptMode(false);
          assertEqual(isEmergentPromptEnabled(), false, 'Should be disabled');

          setEmergentPromptMode(true);
          assertEqual(isEmergentPromptEnabled(), true, 'Should be enabled');

          // Reset
          setEmergentPromptMode(false);
        },
      },
    ],
  },
];

// =============================================================================
// Module Validation
// =============================================================================

/**
 * Validate that all required modules can be imported.
 * This provides clearer error messages than failing individual tests.
 */
async function validateModuleImports(): Promise<string[]> {
  const requiredModules = [
    '../llm/prompts/emergent-prompt',
    '../llm/prompt-builder',
    '../agents/baselines',
    '../simulation/shocks',
    '../analysis/metric-validator',
  ];

  const errors: string[] = [];

  for (const modulePath of requiredModules) {
    try {
      await import(modulePath);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to import ${modulePath}: ${errorMsg}`);
    }
  }

  return errors;
}

// =============================================================================
// Test Runner
// =============================================================================

async function runTest(name: string, fn: () => Promise<void>): Promise<TestResult> {
  const start = Date.now();
  try {
    await fn();
    return {
      name,
      category: currentCategory,
      passed: true,
      duration: Date.now() - start,
    };
  } catch (error) {
    return {
      name,
      category: currentCategory,
      passed: false,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runAllTests(options: { verbose: boolean; filter?: string }): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║              AgentsCity Integration Tests                            ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');
  console.log();

  // Validate module imports first
  console.log('▶ Validating module imports...');
  const importErrors = await validateModuleImports();
  if (importErrors.length > 0) {
    console.log('\n\x1b[31m✗ Module import validation failed:\x1b[0m');
    for (const err of importErrors) {
      console.log(`  - ${err}`);
    }
    console.log('\nPlease fix the module errors before running tests.');
    process.exitCode = 1;
    return;
  }
  console.log('  \x1b[32m✓\x1b[0m All modules imported successfully\n');

  testResults = [];
  const startTime = Date.now();

  for (const suite of testSuites) {
    // Apply filter if specified
    if (options.filter && !suite.name.toLowerCase().includes(options.filter.toLowerCase())) {
      continue;
    }

    currentCategory = suite.name;
    console.log(`\n▶ ${suite.name}`);
    console.log('─'.repeat(70));

    for (const test of suite.tests) {
      // Apply filter to test names too
      if (options.filter && !test.name.toLowerCase().includes(options.filter.toLowerCase())) {
        continue;
      }

      const result = await runTest(test.name, test.fn);
      testResults.push(result);

      const status = result.passed ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
      const duration = `(${result.duration}ms)`;

      if (options.verbose || !result.passed) {
        console.log(`  ${status} ${result.name} ${duration}`);
        if (result.error) {
          console.log(`    \x1b[31mError: ${result.error}\x1b[0m`);
        }
      } else {
        process.stdout.write(`  ${status} ${result.name} ${duration}\r\n`);
      }
    }
  }

  // Summary
  const totalDuration = Date.now() - startTime;
  const passed = testResults.filter((r) => r.passed).length;
  const failed = testResults.filter((r) => !r.passed).length;
  const total = testResults.length;

  console.log('\n' + '═'.repeat(70));
  console.log('\n📊 Summary\n');
  console.log(`  Total:  ${total}`);
  console.log(`  Passed: \x1b[32m${passed}\x1b[0m`);
  console.log(`  Failed: \x1b[31m${failed}\x1b[0m`);
  console.log(`  Time:   ${totalDuration}ms`);

  if (failed > 0) {
    console.log('\n❌ Failed Tests:\n');
    for (const result of testResults.filter((r) => !r.passed)) {
      console.log(`  • ${result.category} / ${result.name}`);
      console.log(`    ${result.error}`);
    }
  }

  console.log();

  // Exit with appropriate code
  process.exit(failed > 0 ? 1 : 0);
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      verbose: { type: 'boolean', short: 'v', default: false },
      filter: { type: 'string', short: 'f' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  if (values.help) {
    console.log(`
Integration Tests for AgentsCity

Usage:
  bun run src/scripts/integration-tests.ts [options]

Options:
  -v, --verbose         Show all test output
  -f, --filter PATTERN  Only run tests matching pattern
  -h, --help            Show this help message

Examples:
  bun run src/scripts/integration-tests.ts
  bun run src/scripts/integration-tests.ts --verbose
  bun run src/scripts/integration-tests.ts --filter "personality"
  bun run src/scripts/integration-tests.ts --filter "Q-learning"
`);
    process.exit(0);
  }

  await runAllTests({
    verbose: values.verbose || false,
    filter: values.filter,
  });
}

if (import.meta.main) {
  main().catch((error) => {
    console.error('[Error]', error);
    process.exit(1);
  });
}
