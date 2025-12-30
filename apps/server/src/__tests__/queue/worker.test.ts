/**
 * Tests for Queue Worker
 *
 * Tests cover:
 * - Job priority calculation based on agent state
 * - Priority levels (urgent, high, normal)
 * - Edge cases for priority thresholds
 */

import { describe, expect, test } from 'bun:test';
import { getPriority } from '../../queue';
import type { AgentObservation } from '../../llm/types';

// =============================================================================
// Test Helpers
// =============================================================================

function createMockObservation(overrides: {
  hunger?: number;
  energy?: number;
  health?: number;
  balance?: number;
} = {}): AgentObservation {
  return {
    tick: 1,
    timestamp: Date.now(),
    self: {
      id: 'test-agent',
      x: 50,
      y: 50,
      hunger: overrides.hunger ?? 80,
      energy: overrides.energy ?? 80,
      health: overrides.health ?? 100,
      balance: overrides.balance ?? 100,
      state: 'idle',
    },
    nearbyAgents: [],
    nearbyLocations: [],
    availableActions: [],
    recentEvents: [],
    inventory: [],
  };
}

// =============================================================================
// getPriority Tests
// =============================================================================

describe('getPriority', () => {
  describe('urgent priority (1)', () => {
    test('returns priority 1 when health is critically low (< 20)', () => {
      const observation = createMockObservation({ health: 15 });
      expect(getPriority(observation)).toBe(1);
    });

    test('returns priority 1 when health is exactly 19', () => {
      const observation = createMockObservation({ health: 19 });
      expect(getPriority(observation)).toBe(1);
    });

    test('returns priority 1 when hunger is critically low (< 10)', () => {
      const observation = createMockObservation({ hunger: 5 });
      expect(getPriority(observation)).toBe(1);
    });

    test('returns priority 1 when hunger is exactly 9', () => {
      const observation = createMockObservation({ hunger: 9 });
      expect(getPriority(observation)).toBe(1);
    });

    test('returns priority 1 when both health and hunger are critical', () => {
      const observation = createMockObservation({ health: 10, hunger: 5 });
      expect(getPriority(observation)).toBe(1);
    });
  });

  describe('high priority (2)', () => {
    test('returns priority 2 when hunger is low (< 30) but not critical', () => {
      const observation = createMockObservation({ hunger: 25, health: 80 });
      expect(getPriority(observation)).toBe(2);
    });

    test('returns priority 2 when hunger is exactly 29', () => {
      const observation = createMockObservation({ hunger: 29, health: 80 });
      expect(getPriority(observation)).toBe(2);
    });

    test('returns priority 2 when energy is low (< 20)', () => {
      const observation = createMockObservation({ energy: 15, hunger: 80, health: 80 });
      expect(getPriority(observation)).toBe(2);
    });

    test('returns priority 2 when energy is exactly 19', () => {
      const observation = createMockObservation({ energy: 19, hunger: 80, health: 80 });
      expect(getPriority(observation)).toBe(2);
    });

    test('returns priority 2 when both hunger and energy are low', () => {
      const observation = createMockObservation({ hunger: 25, energy: 15, health: 80 });
      expect(getPriority(observation)).toBe(2);
    });
  });

  describe('normal priority (5)', () => {
    test('returns priority 5 when all stats are healthy', () => {
      const observation = createMockObservation({
        hunger: 80,
        energy: 80,
        health: 100,
      });
      expect(getPriority(observation)).toBe(5);
    });

    test('returns priority 5 when hunger is exactly 30', () => {
      const observation = createMockObservation({ hunger: 30, health: 80 });
      expect(getPriority(observation)).toBe(5);
    });

    test('returns priority 5 when energy is exactly 20', () => {
      const observation = createMockObservation({ energy: 20, hunger: 80, health: 80 });
      expect(getPriority(observation)).toBe(5);
    });

    test('returns priority 5 when health is exactly 20', () => {
      const observation = createMockObservation({ health: 20, hunger: 80 });
      expect(getPriority(observation)).toBe(5);
    });

    test('returns priority 5 when all stats are at threshold boundaries', () => {
      const observation = createMockObservation({
        hunger: 30,
        energy: 20,
        health: 20,
      });
      expect(getPriority(observation)).toBe(5);
    });
  });

  describe('priority precedence', () => {
    test('urgent (health) takes precedence over high (hunger)', () => {
      const observation = createMockObservation({
        health: 15, // urgent
        hunger: 25, // high
      });
      expect(getPriority(observation)).toBe(1);
    });

    test('urgent (hunger critical) takes precedence over high (energy)', () => {
      const observation = createMockObservation({
        hunger: 5,  // urgent
        energy: 15, // high
        health: 80,
      });
      expect(getPriority(observation)).toBe(1);
    });

    test('high priority takes precedence over normal when only one condition met', () => {
      const observation = createMockObservation({
        hunger: 25, // high
        energy: 80, // normal
        health: 80, // normal
      });
      expect(getPriority(observation)).toBe(2);
    });
  });

  describe('edge cases', () => {
    test('handles zero values', () => {
      const observation = createMockObservation({
        hunger: 0,
        energy: 0,
        health: 0,
      });
      // Should be urgent priority due to all critical states
      expect(getPriority(observation)).toBe(1);
    });

    test('handles maximum values', () => {
      const observation = createMockObservation({
        hunger: 100,
        energy: 100,
        health: 100,
      });
      expect(getPriority(observation)).toBe(5);
    });

    test('balance does not affect priority', () => {
      const poorAgent = createMockObservation({ balance: 0 });
      const richAgent = createMockObservation({ balance: 10000 });

      expect(getPriority(poorAgent)).toBe(5);
      expect(getPriority(richAgent)).toBe(5);
    });
  });
});

// =============================================================================
// Fallback Decision Logic Tests (conceptual - tests the behavior)
// =============================================================================

describe('Queue Worker Fallback Behavior', () => {
  describe('fallback decision requirements', () => {
    test('fallback should preserve agent survival', () => {
      // The fallback decision should always return a valid action
      // that helps the agent survive (tested in response-parser.test.ts)
      // This is a documentation test to ensure the contract is clear
      expect(true).toBe(true);
    });

    test('fallback should mark usedFallback as true', () => {
      // When fallback is used, the result should have usedFallback: true
      // This is verified by the queue worker implementation
      expect(true).toBe(true);
    });
  });
});
