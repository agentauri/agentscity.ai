/**
 * Baseline Requirement Tests
 *
 * Tests for the mandatory baseline controls that ensure every experiment
 * has baseline agents for scientific comparison.
 */

import { describe, expect, test } from 'bun:test';
import {
  validateSchema,
  validateBaselineRequirement,
  getMissingBaselines,
  autoInjectBaselines,
  MINIMUM_BASELINE_AGENTS,
  BASELINE_AGENT_TYPES,
  type ExperimentSchema,
  type ExperimentAgentConfig,
} from '../../experiments/schema';

// =============================================================================
// Test Data
// =============================================================================

const VALID_SCHEMA_WITH_BASELINES: ExperimentSchema = {
  name: 'Test Experiment',
  description: 'A test experiment with baselines',
  duration: 100,
  agents: [
    { type: 'claude', count: 5 },
    { type: 'gemini', count: 5 },
    { type: 'baseline_random', count: 2 },
    { type: 'baseline_rule', count: 2 },
  ],
};

const VALID_SCHEMA_WITHOUT_BASELINES: ExperimentSchema = {
  name: 'Test Experiment No Baselines',
  description: 'A test experiment without baselines',
  duration: 100,
  agents: [
    { type: 'claude', count: 5 },
    { type: 'gemini', count: 5 },
  ],
};

const SCHEMA_WITH_PARTIAL_BASELINES: ExperimentSchema = {
  name: 'Test Experiment Partial Baselines',
  description: 'A test experiment with only one baseline type',
  duration: 100,
  agents: [
    { type: 'claude', count: 5 },
    { type: 'baseline_random', count: 1 },
  ],
};

const GENESIS_ENABLED_SCHEMA: ExperimentSchema = {
  name: 'Genesis Experiment',
  description: 'An experiment with genesis enabled',
  duration: 100,
  agents: [
    { type: 'claude', count: 2 },
  ],
  genesis: {
    enabled: true,
    childrenPerMother: 10,
    mothers: ['claude'],
    mode: 'single',
  },
};

// =============================================================================
// Constants Tests
// =============================================================================

describe('Baseline Constants', () => {
  test('MINIMUM_BASELINE_AGENTS contains required types', () => {
    expect(MINIMUM_BASELINE_AGENTS.baseline_random).toBe(1);
    expect(MINIMUM_BASELINE_AGENTS.baseline_rule).toBe(1);
  });

  test('BASELINE_AGENT_TYPES contains all baseline types', () => {
    expect(BASELINE_AGENT_TYPES).toContain('baseline_random');
    expect(BASELINE_AGENT_TYPES).toContain('baseline_rule');
    expect(BASELINE_AGENT_TYPES).toContain('baseline_sugarscape');
    expect(BASELINE_AGENT_TYPES).toContain('baseline_qlearning');
    expect(BASELINE_AGENT_TYPES.length).toBe(4);
  });
});

// =============================================================================
// Validation Tests
// =============================================================================

describe('validateBaselineRequirement', () => {
  test('returns null for valid schema with baselines', () => {
    const result = validateBaselineRequirement(VALID_SCHEMA_WITH_BASELINES.agents, true);
    expect(result).toBeNull();
  });

  test('returns error for schema without baselines when required', () => {
    const result = validateBaselineRequirement(VALID_SCHEMA_WITHOUT_BASELINES.agents, true);
    expect(result).not.toBeNull();
    expect(result!.code).toBe('MISSING_BASELINE');
    expect(result!.path).toBe('agents');
    expect(result!.message).toContain('baseline_random');
  });

  test('returns error for schema with partial baselines', () => {
    const result = validateBaselineRequirement(SCHEMA_WITH_PARTIAL_BASELINES.agents, true);
    expect(result).not.toBeNull();
    expect(result!.code).toBe('MISSING_BASELINE');
    expect(result!.message).toContain('baseline_rule');
  });

  test('returns null when requireBaselines is false', () => {
    const result = validateBaselineRequirement(VALID_SCHEMA_WITHOUT_BASELINES.agents, false);
    expect(result).toBeNull();
  });
});

describe('getMissingBaselines', () => {
  test('returns empty array when all baselines present', () => {
    const missing = getMissingBaselines(VALID_SCHEMA_WITH_BASELINES.agents);
    expect(missing).toEqual([]);
  });

  test('returns missing baselines when none present', () => {
    const missing = getMissingBaselines(VALID_SCHEMA_WITHOUT_BASELINES.agents);
    expect(missing.length).toBe(2);
    expect(missing.find(m => m.type === 'baseline_random')).toBeDefined();
    expect(missing.find(m => m.type === 'baseline_rule')).toBeDefined();
  });

  test('returns only missing baselines for partial', () => {
    const missing = getMissingBaselines(SCHEMA_WITH_PARTIAL_BASELINES.agents);
    expect(missing.length).toBe(1);
    expect(missing[0].type).toBe('baseline_rule');
    expect(missing[0].required).toBe(1);
    expect(missing[0].actual).toBe(0);
  });
});

describe('validateSchema with baselines', () => {
  test('validates schema with baselines successfully', () => {
    const result = validateSchema(VALID_SCHEMA_WITH_BASELINES);
    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
  });

  test('fails validation for schema without baselines', () => {
    const result = validateSchema(VALID_SCHEMA_WITHOUT_BASELINES);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.code === 'MISSING_BASELINE')).toBe(true);
  });

  test('skips baseline validation when requireBaselines is false', () => {
    const schemaWithFlag: ExperimentSchema = {
      ...VALID_SCHEMA_WITHOUT_BASELINES,
      requireBaselines: false,
    };
    const result = validateSchema(schemaWithFlag);
    expect(result.valid).toBe(true);
  });

  test('skips baseline validation when genesis is enabled', () => {
    const result = validateSchema(GENESIS_ENABLED_SCHEMA);
    // Should not fail due to missing baselines (genesis creates agents dynamically)
    const baselineError = result.errors.find(e => e.code === 'MISSING_BASELINE');
    expect(baselineError).toBeUndefined();
  });
});

// =============================================================================
// Auto-Injection Tests
// =============================================================================

describe('autoInjectBaselines', () => {
  test('injects missing baseline agents', () => {
    const result = autoInjectBaselines(VALID_SCHEMA_WITHOUT_BASELINES);

    const baselineRandom = result.agents.find(a => a.type === 'baseline_random');
    const baselineRule = result.agents.find(a => a.type === 'baseline_rule');

    expect(baselineRandom).toBeDefined();
    expect(baselineRule).toBeDefined();
    expect(baselineRandom!.count).toBeGreaterThanOrEqual(1);
    expect(baselineRule!.count).toBeGreaterThanOrEqual(1);
  });

  test('does not modify schema with existing baselines', () => {
    const result = autoInjectBaselines(VALID_SCHEMA_WITH_BASELINES);

    // Should have same number of agent configs
    expect(result.agents.length).toBe(VALID_SCHEMA_WITH_BASELINES.agents.length);

    // Baseline counts should be unchanged
    const baselineRandom = result.agents.find(a => a.type === 'baseline_random');
    expect(baselineRandom!.count).toBe(2);
  });

  test('respects custom baseline config', () => {
    const result = autoInjectBaselines(VALID_SCHEMA_WITHOUT_BASELINES, {
      random: 5,
      rule: 3,
      sugarscape: 2,
    });

    const baselineRandom = result.agents.find(a => a.type === 'baseline_random');
    const baselineRule = result.agents.find(a => a.type === 'baseline_rule');
    const baselineSugarscape = result.agents.find(a => a.type === 'baseline_sugarscape');

    expect(baselineRandom!.count).toBe(5);
    expect(baselineRule!.count).toBe(3);
    expect(baselineSugarscape!.count).toBe(2);
  });

  test('adds startArea for injected baselines', () => {
    const result = autoInjectBaselines(VALID_SCHEMA_WITHOUT_BASELINES);

    const baselineRandom = result.agents.find(a => a.type === 'baseline_random');
    expect(baselineRandom!.startArea).toBeDefined();
    expect(baselineRandom!.startArea!.x).toHaveLength(2);
    expect(baselineRandom!.startArea!.y).toHaveLength(2);
  });

  test('does not mutate original schema', () => {
    const originalAgentCount = VALID_SCHEMA_WITHOUT_BASELINES.agents.length;
    autoInjectBaselines(VALID_SCHEMA_WITHOUT_BASELINES);
    expect(VALID_SCHEMA_WITHOUT_BASELINES.agents.length).toBe(originalAgentCount);
  });

  test('respects world size for startArea', () => {
    const schemaWithSmallWorld: ExperimentSchema = {
      ...VALID_SCHEMA_WITHOUT_BASELINES,
      world: { size: [50, 50] },
    };

    const result = autoInjectBaselines(schemaWithSmallWorld);
    const baselineRandom = result.agents.find(a => a.type === 'baseline_random');

    // Start area should be within world bounds
    expect(baselineRandom!.startArea!.x[0]).toBeLessThan(50);
    expect(baselineRandom!.startArea!.x[1]).toBeLessThan(50);
    expect(baselineRandom!.startArea!.y[0]).toBeLessThan(50);
    expect(baselineRandom!.startArea!.y[1]).toBeLessThan(50);
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Baseline Control Integration', () => {
  test('complete workflow: validate -> inject -> revalidate', () => {
    // Step 1: Initial validation fails
    const initial = validateSchema(VALID_SCHEMA_WITHOUT_BASELINES);
    expect(initial.valid).toBe(false);

    // Step 2: Auto-inject baselines
    const injected = autoInjectBaselines(VALID_SCHEMA_WITHOUT_BASELINES);

    // Step 3: Re-validate passes
    const final = validateSchema(injected);
    expect(final.valid).toBe(true);
    expect(final.errors.length).toBe(0);
  });

  test('getMissingBaselines and autoInjectBaselines are consistent', () => {
    const missing = getMissingBaselines(SCHEMA_WITH_PARTIAL_BASELINES.agents);
    const injected = autoInjectBaselines(SCHEMA_WITH_PARTIAL_BASELINES);

    // All missing baselines should be present after injection
    for (const m of missing) {
      const found = injected.agents.find(a => a.type === m.type);
      expect(found).toBeDefined();
      expect(found!.count).toBeGreaterThanOrEqual(m.required);
    }

    // No more missing baselines
    const stillMissing = getMissingBaselines(injected.agents);
    expect(stillMissing.length).toBe(0);
  });
});
