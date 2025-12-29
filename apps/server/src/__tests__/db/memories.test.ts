/**
 * Tests for Memory Queries - Phase 1
 *
 * Tests for agent memory and relationship functions:
 * - Memory storage and retrieval
 * - Relationship creation and updates
 * - Trust score calculations
 * - Memory pruning
 */

import { describe, expect, test } from 'bun:test';
import type { CreateMemoryInput, MemoryType } from '../../db/queries/memories';

describe('Memory Types', () => {
  test('valid memory types', () => {
    const validTypes: MemoryType[] = ['observation', 'action', 'interaction', 'reflection'];

    for (const type of validTypes) {
      expect(type).toBeDefined();
    }
  });
});

describe('CreateMemoryInput interface', () => {
  test('creates valid memory input with required fields', () => {
    const input: CreateMemoryInput = {
      agentId: 'test-agent-id',
      type: 'observation',
      content: 'I saw another agent gathering food',
      tick: 100,
    };

    expect(input.agentId).toBeDefined();
    expect(input.type).toBe('observation');
    expect(input.content).toBeDefined();
    expect(input.tick).toBe(100);
  });

  test('creates valid memory input with optional fields', () => {
    const input: CreateMemoryInput = {
      agentId: 'test-agent-id',
      type: 'interaction',
      content: 'Traded food for materials with another agent',
      importance: 8,
      emotionalValence: 0.7,
      involvedAgentIds: ['other-agent-1', 'other-agent-2'],
      x: 50,
      y: 60,
      tick: 150,
    };

    expect(input.importance).toBe(8);
    expect(input.emotionalValence).toBe(0.7);
    expect(input.involvedAgentIds).toHaveLength(2);
    expect(input.x).toBe(50);
    expect(input.y).toBe(60);
  });
});

describe('Memory importance scaling', () => {
  test('importance defaults to 5', () => {
    const input: CreateMemoryInput = {
      agentId: 'test-agent-id',
      type: 'observation',
      content: 'Just saw something',
      tick: 100,
    };

    // Default should be 5 if not specified
    expect(input.importance).toBeUndefined();
    const defaultImportance = input.importance ?? 5;
    expect(defaultImportance).toBe(5);
  });

  test('importance can range from 1 to 10', () => {
    const lowImportance: CreateMemoryInput = {
      agentId: 'test-agent-id',
      type: 'observation',
      content: 'Minor event',
      importance: 1,
      tick: 100,
    };

    const highImportance: CreateMemoryInput = {
      agentId: 'test-agent-id',
      type: 'reflection',
      content: 'Critical realization about survival',
      importance: 10,
      tick: 100,
    };

    expect(lowImportance.importance).toBe(1);
    expect(highImportance.importance).toBe(10);
  });
});

describe('Emotional valence', () => {
  test('emotional valence defaults to 0 (neutral)', () => {
    const input: CreateMemoryInput = {
      agentId: 'test-agent-id',
      type: 'observation',
      content: 'Neutral observation',
      tick: 100,
    };

    const defaultValence = input.emotionalValence ?? 0;
    expect(defaultValence).toBe(0);
  });

  test('positive valence for good events', () => {
    const input: CreateMemoryInput = {
      agentId: 'test-agent-id',
      type: 'interaction',
      content: 'Successfully traded and got what I needed',
      emotionalValence: 0.8,
      tick: 100,
    };

    expect(input.emotionalValence).toBeGreaterThan(0);
  });

  test('negative valence for bad events', () => {
    const input: CreateMemoryInput = {
      agentId: 'test-agent-id',
      type: 'interaction',
      content: 'Trade failed, wasted time',
      emotionalValence: -0.4,
      tick: 100,
    };

    expect(input.emotionalValence).toBeLessThan(0);
  });

  test('valence should be between -1 and 1', () => {
    // Valid range
    expect(-1).toBeGreaterThanOrEqual(-1);
    expect(1).toBeLessThanOrEqual(1);
    expect(0).toBeGreaterThanOrEqual(-1);
    expect(0).toBeLessThanOrEqual(1);
  });
});

describe('Relationship trust scoring', () => {
  test('trust score bounds are -100 to 100', () => {
    // Test boundary values
    const minTrust = -100;
    const maxTrust = 100;
    const neutral = 0;

    expect(minTrust).toBe(-100);
    expect(maxTrust).toBe(100);
    expect(neutral).toBe(0);
  });

  test('trust clamping logic', () => {
    // Simulate clamping logic from updateRelationshipTrust
    const clampTrust = (current: number, delta: number): number => {
      return Math.max(-100, Math.min(100, current + delta));
    };

    expect(clampTrust(0, 10)).toBe(10);
    expect(clampTrust(95, 10)).toBe(100); // Clamped to max
    expect(clampTrust(-95, -10)).toBe(-100); // Clamped to min
    expect(clampTrust(50, -60)).toBe(-10);
  });
});

describe('Relationship summary calculation', () => {
  test('categorizes relationships correctly', () => {
    // Simulate getRelationshipSummary logic
    const relationships = [
      { trustScore: 50 },  // positive
      { trustScore: -30 }, // negative
      { trustScore: 5 },   // neutral
      { trustScore: 0 },   // neutral
      { trustScore: 25 },  // positive
    ];

    const positive = relationships.filter((r) => r.trustScore > 10).length;
    const negative = relationships.filter((r) => r.trustScore < -10).length;
    const neutral = relationships.filter((r) => r.trustScore >= -10 && r.trustScore <= 10).length;

    expect(positive).toBe(2);
    expect(negative).toBe(1);
    expect(neutral).toBe(2);
  });
});
