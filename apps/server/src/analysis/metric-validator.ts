/**
 * Metric Validation Harness - Scientific Metric Testing Framework
 *
 * This module provides automated tests to validate that simulation metrics
 * behave correctly under known conditions. These tests ensure:
 *
 * 1. Metrics respond appropriately to expected scenarios
 * 2. Metric calculations are mathematically correct
 * 3. Edge cases are handled properly
 * 4. Changes to metric code don't introduce regressions
 *
 * Run with: bun run src/scripts/validate-metrics.ts
 */

import { v4 as uuid } from 'uuid';
import { db } from '../db/index';
import { agents, events, agentRelationships } from '../db/schema';
import { eq, sql } from 'drizzle-orm';
import {
  giniCoefficient,
  mean,
  stdDev,
  tTest,
  mannWhitneyU,
  cohensD,
  interpretEffectSize,
  confidenceInterval,
  statisticalPower,
} from './experiment-analysis';
import type { Agent, NewAgent } from '../db/schema';

// =============================================================================
// Types
// =============================================================================

export interface MetricTest {
  /** Unique test name */
  name: string;
  /** Human-readable description of what this test validates */
  description: string;
  /** Setup function to create the test scenario */
  setup: () => Promise<void>;
  /** Expected behavior description */
  expectedBehavior: string;
  /** Validation function that returns true if test passes */
  validate: () => Promise<boolean>;
  /** Cleanup function to restore state (optional) */
  cleanup?: () => Promise<void>;
  /** Test category for grouping */
  category: 'economy' | 'survival' | 'social' | 'behavior';
}

export interface MetricTestResult {
  name: string;
  category: string;
  passed: boolean;
  duration: number;
  error?: string;
  actualValue?: number | string;
  expectedValue?: number | string;
}

export interface MetricValidationReport {
  timestamp: Date;
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  results: MetricTestResult[];
  summary: string;
}

// =============================================================================
// Test Utilities
// =============================================================================

/** Store original agent states for cleanup */
let originalAgents: Agent[] = [];
let testAgentIds: string[] = [];

/**
 * Create test agents with specific configurations
 */
async function createTestAgents(configs: Array<Partial<NewAgent>>): Promise<Agent[]> {
  const created: Agent[] = [];

  for (const config of configs) {
    const agent: NewAgent = {
      id: config.id ?? uuid(),
      llmType: config.llmType ?? 'claude',
      x: config.x ?? 50,
      y: config.y ?? 50,
      hunger: config.hunger ?? 100,
      energy: config.energy ?? 100,
      health: config.health ?? 100,
      balance: config.balance ?? 100,
      state: config.state ?? 'idle',
      color: config.color ?? '#888888',
    };

    const result = await db.insert(agents).values(agent).returning();
    created.push(result[0]);
    testAgentIds.push(result[0].id);
  }

  return created;
}

/**
 * Inject test events into the database
 */
async function injectTestEvents(
  eventList: Array<{
    tick: number;
    agentId?: string;
    eventType: string;
    payload: Record<string, unknown>;
  }>
): Promise<void> {
  let version = Date.now(); // Use timestamp as base version to avoid conflicts

  for (const event of eventList) {
    await db.insert(events).values({
      tick: event.tick,
      agentId: event.agentId ?? null,
      eventType: event.eventType,
      payload: event.payload,
      version: version++,
    });
  }
}

/**
 * Clear test data
 */
async function cleanupTestData(): Promise<void> {
  // Delete test agents and their related data
  for (const id of testAgentIds) {
    await db.delete(agentRelationships).where(eq(agentRelationships.agentId, id));
    await db.delete(agentRelationships).where(eq(agentRelationships.otherAgentId, id));
    await db.delete(events).where(eq(events.agentId, id));
    await db.delete(agents).where(eq(agents.id, id));
  }
  testAgentIds = [];
}

// =============================================================================
// Metric Calculation Helpers
// =============================================================================

/**
 * Calculate Gini coefficient from database agents
 */
async function calculateGiniCoefficient(): Promise<number> {
  const result = await db
    .select({ balance: agents.balance })
    .from(agents)
    .where(sql`${agents.state} != 'dead'`);

  if (result.length === 0) return 0;
  return giniCoefficient(result.map((r) => r.balance));
}

/**
 * Calculate cooperation index from events
 * Formula: trades / (trades + conflicts)
 */
async function calculateCooperationIndex(): Promise<number> {
  const tradeCount = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(events)
    .where(eq(events.eventType, 'agent_trade'));

  const harmCount = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(events)
    .where(eq(events.eventType, 'agent_harm'));

  const stealCount = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(events)
    .where(eq(events.eventType, 'agent_steal'));

  const trades = Number(tradeCount[0]?.count ?? 0);
  const conflicts = Number(harmCount[0]?.count ?? 0) + Number(stealCount[0]?.count ?? 0);

  if (trades + conflicts === 0) return 0.5; // Neutral if no interactions
  return trades / (trades + conflicts);
}

/**
 * Calculate survival rate from database agents
 */
async function calculateSurvivalRate(): Promise<number> {
  const total = await db.select({ count: sql<number>`COUNT(*)` }).from(agents);
  const alive = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(agents)
    .where(sql`${agents.state} != 'dead'`);

  const totalCount = Number(total[0]?.count ?? 0);
  const aliveCount = Number(alive[0]?.count ?? 0);

  if (totalCount === 0) return 0;
  return aliveCount / totalCount;
}

/**
 * Calculate average balance of alive agents
 */
async function calculateAverageBalance(): Promise<number> {
  const result = await db
    .select({ avgBalance: sql<number>`AVG(${agents.balance})` })
    .from(agents)
    .where(sql`${agents.state} != 'dead'`);

  return Number(result[0]?.avgBalance ?? 0);
}

// =============================================================================
// Test Definitions
// =============================================================================

export const METRIC_TESTS: MetricTest[] = [
  // ---------------------------------------------------------------------------
  // Economy Tests
  // ---------------------------------------------------------------------------
  {
    name: 'gini_responds_to_inequality',
    description: 'Gini coefficient should increase when wealth is unequal',
    category: 'economy',
    setup: async () => {
      await cleanupTestData();
      // Create agents with extreme inequality: one rich, rest poor
      await createTestAgents([
        { balance: 1000 },
        { balance: 0 },
        { balance: 0 },
        { balance: 0 },
        { balance: 0 },
      ]);
    },
    expectedBehavior: 'Gini > 0.8',
    validate: async () => {
      const gini = await calculateGiniCoefficient();
      return gini > 0.8;
    },
    cleanup: cleanupTestData,
  },

  {
    name: 'gini_zero_for_equality',
    description: 'Gini coefficient should be 0 when all agents have equal wealth',
    category: 'economy',
    setup: async () => {
      await cleanupTestData();
      await createTestAgents([
        { balance: 100 },
        { balance: 100 },
        { balance: 100 },
        { balance: 100 },
        { balance: 100 },
      ]);
    },
    expectedBehavior: 'Gini = 0',
    validate: async () => {
      const gini = await calculateGiniCoefficient();
      return Math.abs(gini) < 0.01;
    },
    cleanup: cleanupTestData,
  },

  {
    name: 'average_balance_accuracy',
    description: 'Average balance should accurately reflect agent balances',
    category: 'economy',
    setup: async () => {
      await cleanupTestData();
      await createTestAgents([
        { balance: 100 },
        { balance: 200 },
        { balance: 300 },
      ]);
    },
    expectedBehavior: 'Average = 200',
    validate: async () => {
      const avg = await calculateAverageBalance();
      return Math.abs(avg - 200) < 0.01;
    },
    cleanup: cleanupTestData,
  },

  // ---------------------------------------------------------------------------
  // Cooperation Tests
  // ---------------------------------------------------------------------------
  {
    name: 'cooperation_index_trade_only',
    description: 'Cooperation index should be 1.0 with only trades',
    category: 'social',
    setup: async () => {
      await cleanupTestData();
      const testAgents = await createTestAgents([{ balance: 100 }, { balance: 100 }]);
      // Inject 10 trade events, 0 conflicts
      const tradeEvents = Array.from({ length: 10 }, (_, i) => ({
        tick: i + 1,
        agentId: testAgents[0].id,
        eventType: 'agent_trade',
        payload: { targetId: testAgents[1].id, success: true },
      }));
      await injectTestEvents(tradeEvents);
    },
    expectedBehavior: 'Cooperation = 1.0',
    validate: async () => {
      const coop = await calculateCooperationIndex();
      return Math.abs(coop - 1.0) < 0.01;
    },
    cleanup: cleanupTestData,
  },

  {
    name: 'cooperation_index_harm_only',
    description: 'Cooperation index should be 0.0 with only harms',
    category: 'social',
    setup: async () => {
      await cleanupTestData();
      const testAgents = await createTestAgents([{ balance: 100 }, { balance: 100 }]);
      // Inject 10 harm events, 0 trades
      const harmEvents = Array.from({ length: 10 }, (_, i) => ({
        tick: i + 1,
        agentId: testAgents[0].id,
        eventType: 'agent_harm',
        payload: { targetId: testAgents[1].id, damage: 10 },
      }));
      await injectTestEvents(harmEvents);
    },
    expectedBehavior: 'Cooperation = 0.0',
    validate: async () => {
      const coop = await calculateCooperationIndex();
      return Math.abs(coop) < 0.01;
    },
    cleanup: cleanupTestData,
  },

  {
    name: 'cooperation_index_balanced',
    description: 'Cooperation index should be 0.5 with equal trades and harms',
    category: 'social',
    setup: async () => {
      await cleanupTestData();
      const testAgents = await createTestAgents([{ balance: 100 }, { balance: 100 }]);
      // Inject equal trades and harms
      const events = [
        ...Array.from({ length: 5 }, (_, i) => ({
          tick: i + 1,
          agentId: testAgents[0].id,
          eventType: 'agent_trade',
          payload: { targetId: testAgents[1].id },
        })),
        ...Array.from({ length: 5 }, (_, i) => ({
          tick: i + 6,
          agentId: testAgents[0].id,
          eventType: 'agent_harm',
          payload: { targetId: testAgents[1].id },
        })),
      ];
      await injectTestEvents(events);
    },
    expectedBehavior: 'Cooperation = 0.5',
    validate: async () => {
      const coop = await calculateCooperationIndex();
      return Math.abs(coop - 0.5) < 0.01;
    },
    cleanup: cleanupTestData,
  },

  // ---------------------------------------------------------------------------
  // Survival Tests
  // ---------------------------------------------------------------------------
  {
    name: 'survival_rate_accuracy',
    description: 'Survival rate should accurately reflect alive/dead ratio',
    category: 'survival',
    setup: async () => {
      await cleanupTestData();
      // 4 alive, 3 dead = 4/7 survival rate
      await createTestAgents([
        { state: 'idle' },
        { state: 'idle' },
        { state: 'idle' },
        { state: 'idle' },
        { state: 'dead' },
        { state: 'dead' },
        { state: 'dead' },
      ]);
    },
    expectedBehavior: 'Survival = 0.571 (4/7)',
    validate: async () => {
      const rate = await calculateSurvivalRate();
      return Math.abs(rate - 4 / 7) < 0.01;
    },
    cleanup: cleanupTestData,
  },

  {
    name: 'survival_rate_all_alive',
    description: 'Survival rate should be 1.0 when all agents are alive',
    category: 'survival',
    setup: async () => {
      await cleanupTestData();
      await createTestAgents([
        { state: 'idle' },
        { state: 'working' },
        { state: 'sleeping' },
        { state: 'walking' },
      ]);
    },
    expectedBehavior: 'Survival = 1.0',
    validate: async () => {
      const rate = await calculateSurvivalRate();
      return Math.abs(rate - 1.0) < 0.01;
    },
    cleanup: cleanupTestData,
  },

  {
    name: 'survival_rate_all_dead',
    description: 'Survival rate should be 0.0 when all agents are dead',
    category: 'survival',
    setup: async () => {
      await cleanupTestData();
      await createTestAgents([
        { state: 'dead' },
        { state: 'dead' },
        { state: 'dead' },
      ]);
    },
    expectedBehavior: 'Survival = 0.0',
    validate: async () => {
      const rate = await calculateSurvivalRate();
      return Math.abs(rate) < 0.01;
    },
    cleanup: cleanupTestData,
  },

  // ---------------------------------------------------------------------------
  // Edge Case Tests
  // ---------------------------------------------------------------------------
  {
    name: 'gini_handles_zero_balances',
    description: 'Gini coefficient should handle all-zero balances gracefully',
    category: 'economy',
    setup: async () => {
      await cleanupTestData();
      await createTestAgents([
        { balance: 0 },
        { balance: 0 },
        { balance: 0 },
      ]);
    },
    expectedBehavior: 'Gini = 0 (or handled gracefully)',
    validate: async () => {
      const gini = await calculateGiniCoefficient();
      // Should be 0 or NaN handled as 0
      return !isNaN(gini) && gini >= 0 && gini <= 1;
    },
    cleanup: cleanupTestData,
  },

  {
    name: 'cooperation_handles_no_events',
    description: 'Cooperation index should return neutral value with no events',
    category: 'social',
    setup: async () => {
      await cleanupTestData();
      await createTestAgents([{ balance: 100 }]);
      // No events injected
    },
    expectedBehavior: 'Cooperation = 0.5 (neutral)',
    validate: async () => {
      const coop = await calculateCooperationIndex();
      return Math.abs(coop - 0.5) < 0.01;
    },
    cleanup: cleanupTestData,
  },

  {
    name: 'survival_handles_no_agents',
    description: 'Survival rate should handle empty agent list gracefully',
    category: 'survival',
    setup: async () => {
      await cleanupTestData();
      // No agents created
    },
    expectedBehavior: 'Survival = 0 (no agents)',
    validate: async () => {
      const rate = await calculateSurvivalRate();
      return rate === 0;
    },
    cleanup: cleanupTestData,
  },
];

// =============================================================================
// Test Runner
// =============================================================================

/**
 * Run a single metric test
 */
async function runSingleTest(test: MetricTest): Promise<MetricTestResult> {
  const startTime = Date.now();

  try {
    // Run setup
    await test.setup();

    // Run validation
    const passed = await test.validate();

    // Run cleanup if provided
    if (test.cleanup) {
      try {
        await test.cleanup();
      } catch (cleanupError) {
        console.warn(
          `[MetricValidator] Cleanup failed for test "${test.name}": ${cleanupError instanceof Error ? cleanupError.message : cleanupError}`
        );
      }
    }

    return {
      name: test.name,
      category: test.category,
      passed,
      duration: Date.now() - startTime,
      expectedValue: test.expectedBehavior,
    };
  } catch (error) {
    // Ensure cleanup runs even on error
    if (test.cleanup) {
      try {
        await test.cleanup();
      } catch (cleanupError) {
        // Log cleanup errors but don't fail the test for cleanup issues
        console.warn(
          `[MetricValidator] Cleanup failed for test "${test.name}": ${cleanupError instanceof Error ? cleanupError.message : cleanupError}`
        );
      }
    }

    return {
      name: test.name,
      category: test.category,
      passed: false,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Run all metric validation tests
 */
export async function runMetricValidation(
  options: {
    filter?: string;
    category?: MetricTest['category'];
    verbose?: boolean;
  } = {}
): Promise<MetricValidationReport> {
  const startTime = Date.now();
  const results: MetricTestResult[] = [];

  // Filter tests if specified
  let testsToRun = METRIC_TESTS;
  if (options.filter) {
    testsToRun = testsToRun.filter((t) =>
      t.name.toLowerCase().includes(options.filter!.toLowerCase())
    );
  }
  if (options.category) {
    testsToRun = testsToRun.filter((t) => t.category === options.category);
  }

  console.log(`\n[MetricValidator] Running ${testsToRun.length} tests...\n`);

  // Run each test
  for (const test of testsToRun) {
    if (options.verbose) {
      console.log(`  Running: ${test.name}`);
    }

    const result = await runSingleTest(test);
    results.push(result);

    // Print result
    const status = result.passed ? '\x1b[32mPASSED\x1b[0m' : '\x1b[31mFAILED\x1b[0m';
    const detail = result.error ? ` - ${result.error}` : '';
    console.log(`  ${status} ${test.name}${detail}`);
  }

  // Calculate summary
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const duration = Date.now() - startTime;

  const report: MetricValidationReport = {
    timestamp: new Date(),
    totalTests: testsToRun.length,
    passed,
    failed,
    skipped: METRIC_TESTS.length - testsToRun.length,
    duration,
    results,
    summary: `${passed}/${testsToRun.length} tests passed (${((passed / testsToRun.length) * 100).toFixed(1)}%)`,
  };

  console.log(`\n[MetricValidator] ${report.summary}`);
  console.log(`[MetricValidator] Completed in ${duration}ms\n`);

  return report;
}

/**
 * Run metric validation in CI mode (exits with code 1 on failure)
 */
export async function runMetricValidationCI(): Promise<void> {
  const report = await runMetricValidation();

  if (report.failed > 0) {
    console.error('\n[MetricValidator] CI FAILED - Some tests did not pass');
    process.exit(1);
  }

  console.log('[MetricValidator] CI PASSED - All tests passed');
  process.exit(0);
}

/**
 * Get a test by name
 */
export function getMetricTest(name: string): MetricTest | undefined {
  return METRIC_TESTS.find((t) => t.name === name);
}

/**
 * List all available tests
 */
export function listMetricTests(): Array<{ name: string; category: string; description: string }> {
  return METRIC_TESTS.map((t) => ({
    name: t.name,
    category: t.category,
    description: t.description,
  }));
}

// =============================================================================
// Statistical Significance Tests
// =============================================================================

/**
 * Result of a statistical significance test
 */
export interface SignificanceTestResult {
  /** Test name */
  testName: string;
  /** P-value from the test */
  pValue: number;
  /** Whether the result is significant at alpha level */
  isSignificant: boolean;
  /** Significance level used */
  alpha: number;
  /** Test statistic value */
  statistic: number;
  /** Effect size (e.g., Cohen's d) */
  effectSize?: number;
  /** Effect size interpretation */
  effectInterpretation?: 'negligible' | 'small' | 'medium' | 'large';
  /** Confidence interval for the difference */
  confidenceInterval?: { lower: number; upper: number };
  /** Statistical power */
  power?: number;
}

/**
 * Result of multiple comparison correction
 */
export interface MultipleComparisonResult {
  /** Original p-values */
  originalPValues: number[];
  /** Adjusted p-values (Bonferroni corrected) */
  bonferroniAdjusted: number[];
  /** Adjusted p-values (Holm-Bonferroni) */
  holmAdjusted: number[];
  /** Adjusted p-values (Benjamini-Hochberg FDR) */
  fdrAdjusted: number[];
  /** Which tests are significant after Bonferroni correction */
  bonferroniSignificant: boolean[];
  /** Which tests are significant after Holm correction */
  holmSignificant: boolean[];
  /** Which tests are significant after FDR correction */
  fdrSignificant: boolean[];
}

/**
 * Perform comprehensive statistical significance test between two groups
 */
export function performSignificanceTest(
  group1: number[],
  group2: number[],
  options: {
    alpha?: number;
    testName?: string;
  } = {}
): SignificanceTestResult {
  const alpha = options.alpha ?? 0.05;
  const testName = options.testName ?? 'comparison';

  // Run t-test
  const tTestResult = tTest(group1, group2);

  // Run Mann-Whitney U as non-parametric alternative
  const mannWhitneyResult = mannWhitneyU(group1, group2);

  // Calculate effect size
  const effectSize = cohensD(group1, group2);
  const effectInterpretation = interpretEffectSize(effectSize);

  // Calculate confidence interval for the difference
  const mean1 = mean(group1);
  const mean2 = mean(group2);
  const diffValues = group1.map((v, i) => v - (group2[i] ?? mean2));
  const ci = confidenceInterval(diffValues.length > 0 ? diffValues : [mean1 - mean2]);

  // Calculate power
  const power = statisticalPower(group1, group2, alpha);

  // Use the more conservative p-value (max of parametric and non-parametric)
  const pValue = Math.max(tTestResult.pValue, mannWhitneyResult.pValue);
  const isSignificant = pValue < alpha;

  return {
    testName,
    pValue,
    isSignificant,
    alpha,
    statistic: tTestResult.statistic,
    effectSize,
    effectInterpretation,
    confidenceInterval: { lower: ci.lower, upper: ci.upper },
    power,
  };
}

/**
 * Bonferroni correction for multiple comparisons
 * Multiplies p-values by number of tests (capped at 1.0)
 */
export function bonferroniCorrection(pValues: number[]): number[] {
  const n = pValues.length;
  return pValues.map((p) => Math.min(p * n, 1.0));
}

/**
 * Holm-Bonferroni step-down procedure
 * More powerful than Bonferroni while controlling family-wise error rate
 */
export function holmBonferroniCorrection(pValues: number[]): number[] {
  const n = pValues.length;
  const indexed = pValues.map((p, i) => ({ p, i }));
  indexed.sort((a, b) => a.p - b.p);

  const adjusted: number[] = new Array(n);
  let maxSoFar = 0;

  for (let j = 0; j < n; j++) {
    const multiplier = n - j;
    const adjustedP = Math.min(indexed[j].p * multiplier, 1.0);
    maxSoFar = Math.max(maxSoFar, adjustedP);
    adjusted[indexed[j].i] = maxSoFar;
  }

  return adjusted;
}

/**
 * Benjamini-Hochberg False Discovery Rate (FDR) correction
 * Controls the expected proportion of false discoveries
 */
export function benjaminiHochbergCorrection(pValues: number[]): number[] {
  const n = pValues.length;
  const indexed = pValues.map((p, i) => ({ p, i }));
  indexed.sort((a, b) => a.p - b.p);

  const adjusted: number[] = new Array(n);
  let minSoFar = 1.0;

  for (let j = n - 1; j >= 0; j--) {
    const rank = j + 1;
    const adjustedP = Math.min((indexed[j].p * n) / rank, 1.0);
    minSoFar = Math.min(minSoFar, adjustedP);
    adjusted[indexed[j].i] = minSoFar;
  }

  return adjusted;
}

/**
 * Apply all multiple comparison corrections and return results
 */
export function applyMultipleComparisonCorrections(
  pValues: number[],
  alpha = 0.05
): MultipleComparisonResult {
  const bonferroniAdjusted = bonferroniCorrection(pValues);
  const holmAdjusted = holmBonferroniCorrection(pValues);
  const fdrAdjusted = benjaminiHochbergCorrection(pValues);

  return {
    originalPValues: pValues,
    bonferroniAdjusted,
    holmAdjusted,
    fdrAdjusted,
    bonferroniSignificant: bonferroniAdjusted.map((p) => p < alpha),
    holmSignificant: holmAdjusted.map((p) => p < alpha),
    fdrSignificant: fdrAdjusted.map((p) => p < alpha),
  };
}

/**
 * Permutation test for comparing two groups
 * Non-parametric test that makes minimal assumptions about the data
 */
export function permutationTest(
  group1: number[],
  group2: number[],
  options: {
    numPermutations?: number;
    statistic?: 'mean_diff' | 'median_diff';
  } = {}
): SignificanceTestResult {
  const numPermutations = options.numPermutations ?? 10000;
  const statisticType = options.statistic ?? 'mean_diff';

  const combined = [...group1, ...group2];
  const n1 = group1.length;

  // Calculate observed statistic
  const calcStatistic = (g1: number[], g2: number[]): number => {
    if (statisticType === 'median_diff') {
      const median1 = g1.sort((a, b) => a - b)[Math.floor(g1.length / 2)];
      const median2 = g2.sort((a, b) => a - b)[Math.floor(g2.length / 2)];
      return median1 - median2;
    }
    return mean(g1) - mean(g2);
  };

  const observedStat = calcStatistic(group1, group2);

  // Perform permutations
  let moreExtreme = 0;
  for (let i = 0; i < numPermutations; i++) {
    // Shuffle combined array
    const shuffled = [...combined];
    for (let j = shuffled.length - 1; j > 0; j--) {
      const k = Math.floor(Math.random() * (j + 1));
      [shuffled[j], shuffled[k]] = [shuffled[k], shuffled[j]];
    }

    // Split into two groups
    const permGroup1 = shuffled.slice(0, n1);
    const permGroup2 = shuffled.slice(n1);

    const permStat = calcStatistic(permGroup1, permGroup2);

    if (Math.abs(permStat) >= Math.abs(observedStat)) {
      moreExtreme++;
    }
  }

  const pValue = (moreExtreme + 1) / (numPermutations + 1);
  const effectSize = cohensD(group1, group2);

  return {
    testName: 'permutation_test',
    pValue,
    isSignificant: pValue < 0.05,
    alpha: 0.05,
    statistic: observedStat,
    effectSize,
    effectInterpretation: interpretEffectSize(effectSize),
  };
}

/**
 * Chi-squared test for comparing categorical distributions
 */
export function chiSquaredTest(
  observed: number[],
  expected: number[]
): SignificanceTestResult {
  if (observed.length !== expected.length) {
    throw new Error('Observed and expected arrays must have same length');
  }

  let chiSquared = 0;
  for (let i = 0; i < observed.length; i++) {
    if (expected[i] > 0) {
      chiSquared += Math.pow(observed[i] - expected[i], 2) / expected[i];
    }
  }

  // Degrees of freedom = categories - 1
  const df = observed.length - 1;

  // Approximate p-value using chi-squared distribution
  // Using Wilson-Hilferty approximation
  const pValue = chiSquaredPValue(chiSquared, df);

  return {
    testName: 'chi_squared',
    pValue,
    isSignificant: pValue < 0.05,
    alpha: 0.05,
    statistic: chiSquared,
  };
}

/**
 * Approximate chi-squared p-value using Wilson-Hilferty transformation
 */
function chiSquaredPValue(chiSquared: number, df: number): number {
  if (df <= 0) return 1;
  if (chiSquared <= 0) return 1;

  // Wilson-Hilferty transformation to approximate normal
  const term = Math.pow(chiSquared / df, 1 / 3);
  const mean = 1 - 2 / (9 * df);
  const variance = 2 / (9 * df);
  const z = (term - mean) / Math.sqrt(variance);

  // Convert to p-value using normal CDF
  const pValue = 1 - normalCDF(z);
  return Math.min(Math.max(pValue, 0), 1);
}

/**
 * Standard normal CDF approximation
 */
function normalCDF(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.SQRT2;

  const t = 1 / (1 + p * x);
  const y =
    1 -
    ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1 + sign * y);
}

/**
 * Kolmogorov-Smirnov test for comparing two distributions
 */
export function kolmogorovSmirnovTest(
  group1: number[],
  group2: number[]
): SignificanceTestResult {
  const n1 = group1.length;
  const n2 = group2.length;

  if (n1 === 0 || n2 === 0) {
    return {
      testName: 'kolmogorov_smirnov',
      pValue: 1,
      isSignificant: false,
      alpha: 0.05,
      statistic: 0,
    };
  }

  // Sort both arrays
  const sorted1 = [...group1].sort((a, b) => a - b);
  const sorted2 = [...group2].sort((a, b) => a - b);

  // Combine and sort all unique values
  const allValues = [...new Set([...sorted1, ...sorted2])].sort((a, b) => a - b);

  // Calculate KS statistic
  let maxDiff = 0;
  for (const x of allValues) {
    const cdf1 = sorted1.filter((v) => v <= x).length / n1;
    const cdf2 = sorted2.filter((v) => v <= x).length / n2;
    maxDiff = Math.max(maxDiff, Math.abs(cdf1 - cdf2));
  }

  // Approximate p-value for two-sample KS test
  const n = (n1 * n2) / (n1 + n2);
  const lambda = (Math.sqrt(n) + 0.12 + 0.11 / Math.sqrt(n)) * maxDiff;

  // Kolmogorov distribution approximation (survival function)
  // Q_KS(λ) = 2 * sum_{k=1}^∞ (-1)^{k-1} * exp(-2k²λ²)
  // This sum directly gives the p-value (probability of observing D >= maxDiff under null)
  let pValue = 0;
  for (let k = 1; k <= 100; k++) {
    pValue += 2 * Math.pow(-1, k - 1) * Math.exp(-2 * k * k * lambda * lambda);
  }
  // Clamp to valid probability range
  pValue = Math.min(Math.max(pValue, 0), 1);

  return {
    testName: 'kolmogorov_smirnov',
    pValue,
    isSignificant: pValue < 0.05,
    alpha: 0.05,
    statistic: maxDiff,
  };
}

/**
 * Comprehensive statistical comparison between two groups
 * Runs multiple tests and reports all results
 */
export function comprehensiveStatisticalComparison(
  group1: number[],
  group2: number[],
  label: string
): {
  label: string;
  descriptiveStats: {
    group1: { mean: number; std: number; n: number };
    group2: { mean: number; std: number; n: number };
    difference: number;
    percentChange: number;
  };
  tTest: SignificanceTestResult;
  mannWhitneyU: SignificanceTestResult;
  permutation: SignificanceTestResult;
  ksTest: SignificanceTestResult;
  effectSize: { cohensD: number; interpretation: string };
  power: number;
  recommendation: string;
} {
  // Descriptive statistics
  const mean1 = mean(group1);
  const mean2 = mean(group2);
  const std1 = stdDev(group1);
  const std2 = stdDev(group2);
  const diff = mean2 - mean1;
  const pctChange = mean1 !== 0 ? ((mean2 - mean1) / Math.abs(mean1)) * 100 : 0;

  // Run all tests
  const tTestResult = {
    ...tTest(group1, group2),
    testName: 't_test',
    alpha: 0.05,
    isSignificant: tTest(group1, group2).significant,
  } as SignificanceTestResult;

  const mannWhitneyResult = {
    ...mannWhitneyU(group1, group2),
    testName: 'mann_whitney_u',
    alpha: 0.05,
    isSignificant: mannWhitneyU(group1, group2).significant,
  } as SignificanceTestResult;

  const permResult = permutationTest(group1, group2, { numPermutations: 1000 });
  const ksResult = kolmogorovSmirnovTest(group1, group2);

  // Effect size
  const d = cohensD(group1, group2);
  const interpretation = interpretEffectSize(d);

  // Power
  const power = statisticalPower(group1, group2);

  // Generate recommendation
  let recommendation: string;
  const significantTests = [
    tTestResult.isSignificant,
    mannWhitneyResult.isSignificant,
    permResult.isSignificant,
  ].filter(Boolean).length;

  if (significantTests >= 2 && Math.abs(d) >= 0.5) {
    recommendation = 'Strong evidence of difference - results consistent across multiple tests with medium to large effect size';
  } else if (significantTests >= 2) {
    recommendation = 'Moderate evidence of difference - multiple tests significant but effect size is small';
  } else if (significantTests === 1) {
    recommendation = 'Weak evidence - only one test significant, interpret with caution';
  } else {
    recommendation = 'No significant difference detected';
  }

  if (power < 0.8) {
    recommendation += `. Note: Low statistical power (${(power * 100).toFixed(0)}%) - may need larger sample size`;
  }

  return {
    label,
    descriptiveStats: {
      group1: { mean: mean1, std: std1, n: group1.length },
      group2: { mean: mean2, std: std2, n: group2.length },
      difference: diff,
      percentChange: pctChange,
    },
    tTest: tTestResult,
    mannWhitneyU: mannWhitneyResult,
    permutation: permResult,
    ksTest: ksResult,
    effectSize: { cohensD: d, interpretation },
    power,
    recommendation,
  };
}

// =============================================================================
// Additional Validation Tests for Statistical Functions
// =============================================================================

/**
 * Add statistical significance tests to the METRIC_TESTS array
 */
export const STATISTICAL_TESTS: MetricTest[] = [
  {
    name: 'ttest_detects_difference',
    description: 'T-test should detect significant difference between distinct groups',
    category: 'behavior',
    setup: async () => {
      await cleanupTestData();
    },
    expectedBehavior: 'P-value < 0.05 for clearly different groups',
    validate: async () => {
      const group1 = [10, 12, 11, 13, 10, 12, 11, 13, 10, 12];
      const group2 = [20, 22, 21, 23, 20, 22, 21, 23, 20, 22];
      const result = tTest(group1, group2);
      return result.pValue < 0.05;
    },
    cleanup: cleanupTestData,
  },
  {
    name: 'ttest_no_false_positive',
    description: 'T-test should not detect difference for identical distributions',
    category: 'behavior',
    setup: async () => {
      await cleanupTestData();
    },
    expectedBehavior: 'P-value > 0.05 for similar groups',
    validate: async () => {
      const group1 = [10, 11, 12, 10, 11, 12, 10, 11, 12, 10];
      const group2 = [10, 11, 12, 10, 11, 12, 10, 11, 12, 10];
      const result = tTest(group1, group2);
      return result.pValue > 0.05;
    },
    cleanup: cleanupTestData,
  },
  {
    name: 'bonferroni_correction_works',
    description: 'Bonferroni correction should increase p-values by number of tests',
    category: 'behavior',
    setup: async () => {
      await cleanupTestData();
    },
    expectedBehavior: 'Adjusted p-value = original * n',
    validate: async () => {
      const pValues = [0.01, 0.02, 0.03, 0.04, 0.05];
      const adjusted = bonferroniCorrection(pValues);
      // First p-value should be 0.01 * 5 = 0.05
      return Math.abs(adjusted[0] - 0.05) < 0.001;
    },
    cleanup: cleanupTestData,
  },
  {
    name: 'effect_size_interpretation',
    description: 'Effect size interpretation should follow Cohen guidelines',
    category: 'behavior',
    setup: async () => {
      await cleanupTestData();
    },
    expectedBehavior: 'd < 0.2 = negligible, 0.2-0.5 = small, 0.5-0.8 = medium, > 0.8 = large',
    validate: async () => {
      return (
        interpretEffectSize(0.1) === 'negligible' &&
        interpretEffectSize(0.3) === 'small' &&
        interpretEffectSize(0.6) === 'medium' &&
        interpretEffectSize(1.0) === 'large'
      );
    },
    cleanup: cleanupTestData,
  },
  {
    name: 'chi_squared_detects_difference',
    description: 'Chi-squared test should detect non-uniform distribution',
    category: 'behavior',
    setup: async () => {
      await cleanupTestData();
    },
    expectedBehavior: 'P-value < 0.05 for skewed distribution',
    validate: async () => {
      // Observed: heavily skewed, Expected: uniform
      const observed = [100, 10, 10, 10, 10];
      const expected = [28, 28, 28, 28, 28];
      const result = chiSquaredTest(observed, expected);
      return result.pValue < 0.05;
    },
    cleanup: cleanupTestData,
  },
  {
    name: 'ks_test_detects_distribution_diff',
    description: 'KS test should detect different distributions',
    category: 'behavior',
    setup: async () => {
      await cleanupTestData();
    },
    expectedBehavior: 'P-value < 0.05 for different distributions',
    validate: async () => {
      // Clearly different distributions
      const group1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const group2 = [50, 51, 52, 53, 54, 55, 56, 57, 58, 59];
      const result = kolmogorovSmirnovTest(group1, group2);
      return result.pValue < 0.05;
    },
    cleanup: cleanupTestData,
  },
];

// Add statistical tests to the main test array
METRIC_TESTS.push(...STATISTICAL_TESTS);
