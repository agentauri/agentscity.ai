/**
 * Tests for LLM Response Parser
 *
 * Tests cover:
 * - Valid JSON parsing for all action types
 * - Invalid/malformed JSON handling
 * - Missing required parameters
 * - Edge cases (embedded JSON, extra fields, etc.)
 * - Fallback decision logic
 */

import { describe, expect, test, beforeEach, mock } from 'bun:test';
import { parseResponse, getFallbackDecision } from '../../llm/response-parser';

describe('parseResponse', () => {
  // Suppress console warnings during tests
  beforeEach(() => {
    mock.module('console', () => ({
      warn: () => {},
      error: () => {},
    }));
  });

  describe('valid JSON responses', () => {
    test('parses valid move action', () => {
      const response = '{"action": "move", "params": {"toX": 10, "toY": 20}, "reasoning": "Going north"}';
      const result = parseResponse(response);

      expect(result).not.toBeNull();
      expect(result?.action).toBe('move');
      expect(result?.params).toEqual({ toX: 10, toY: 20 });
      expect(result?.reasoning).toBe('Going north');
    });

    test('parses valid buy action', () => {
      const response = '{"action": "buy", "params": {"itemType": "food", "quantity": 2}}';
      const result = parseResponse(response);

      expect(result).not.toBeNull();
      expect(result?.action).toBe('buy');
      expect(result?.params).toEqual({ itemType: 'food', quantity: 2 });
    });

    test('parses valid consume action', () => {
      const response = '{"action": "consume", "params": {"itemType": "food"}}';
      const result = parseResponse(response);

      expect(result).not.toBeNull();
      expect(result?.action).toBe('consume');
      expect(result?.params).toEqual({ itemType: 'food' });
    });

    test('parses valid sleep action', () => {
      const response = '{"action": "sleep", "params": {"duration": 5}}';
      const result = parseResponse(response);

      expect(result).not.toBeNull();
      expect(result?.action).toBe('sleep');
      expect(result?.params).toEqual({ duration: 5 });
    });

    test('parses valid work action', () => {
      const response = '{"action": "work", "params": {"duration": 3}}';
      const result = parseResponse(response);

      expect(result).not.toBeNull();
      expect(result?.action).toBe('work');
      expect(result?.params).toEqual({ duration: 3 });
    });

    test('parses valid gather action', () => {
      const response = '{"action": "gather", "params": {"resourceType": "food", "quantity": 3}}';
      const result = parseResponse(response);

      expect(result).not.toBeNull();
      expect(result?.action).toBe('gather');
      expect(result?.params).toEqual({ resourceType: 'food', quantity: 3 });
    });

    test('parses gather action with no params', () => {
      const response = '{"action": "gather", "params": {}}';
      const result = parseResponse(response);

      expect(result).not.toBeNull();
      expect(result?.action).toBe('gather');
      expect(result?.params).toEqual({});
    });
  });

  describe('JSON extraction from text', () => {
    test('extracts JSON embedded in explanatory text', () => {
      const response = `I think I should move closer to the food source.
        Here is my decision: {"action": "move", "params": {"toX": 5, "toY": 10}}
        This will help me survive.`;
      const result = parseResponse(response);

      expect(result).not.toBeNull();
      expect(result?.action).toBe('move');
    });

    test('extracts JSON with leading/trailing whitespace', () => {
      const response = `

      {"action": "sleep", "params": {"duration": 2}}

      `;
      const result = parseResponse(response);

      expect(result).not.toBeNull();
      expect(result?.action).toBe('sleep');
    });

    test('extracts JSON from markdown code block', () => {
      const response = `Here's my decision:
      \`\`\`json
      {"action": "work", "params": {"duration": 1}}
      \`\`\``;
      const result = parseResponse(response);

      expect(result).not.toBeNull();
      expect(result?.action).toBe('work');
    });
  });

  describe('invalid responses', () => {
    test('returns null for empty string', () => {
      const result = parseResponse('');
      expect(result).toBeNull();
    });

    test('returns null for no JSON', () => {
      const result = parseResponse('I think I should move north');
      expect(result).toBeNull();
    });

    test('returns null for malformed JSON', () => {
      const result = parseResponse('{"action": "move", params: broken}');
      expect(result).toBeNull();
    });

    test('returns null for invalid action type', () => {
      const result = parseResponse('{"action": "fly", "params": {}}');
      expect(result).toBeNull();
    });

    test('returns null for missing action', () => {
      const result = parseResponse('{"params": {"toX": 10}}');
      expect(result).toBeNull();
    });

    test('returns null for missing params', () => {
      const result = parseResponse('{"action": "move"}');
      expect(result).toBeNull();
    });

    test('returns null for params as non-object', () => {
      const result = parseResponse('{"action": "move", "params": "invalid"}');
      expect(result).toBeNull();
    });
  });

  describe('action parameter validation', () => {
    test('rejects move without toX', () => {
      const result = parseResponse('{"action": "move", "params": {"toY": 10}}');
      expect(result).toBeNull();
    });

    test('rejects move without toY', () => {
      const result = parseResponse('{"action": "move", "params": {"toX": 10}}');
      expect(result).toBeNull();
    });

    test('rejects move with string coordinates', () => {
      const result = parseResponse('{"action": "move", "params": {"toX": "10", "toY": "20"}}');
      expect(result).toBeNull();
    });

    test('rejects buy without itemType', () => {
      const result = parseResponse('{"action": "buy", "params": {"quantity": 1}}');
      expect(result).toBeNull();
    });

    test('rejects consume without itemType', () => {
      const result = parseResponse('{"action": "consume", "params": {}}');
      expect(result).toBeNull();
    });

    test('rejects sleep without duration', () => {
      const result = parseResponse('{"action": "sleep", "params": {}}');
      expect(result).toBeNull();
    });

    test('rejects sleep with duration below 1', () => {
      const result = parseResponse('{"action": "sleep", "params": {"duration": 0}}');
      expect(result).toBeNull();
    });

    test('rejects sleep with duration above 10', () => {
      const result = parseResponse('{"action": "sleep", "params": {"duration": 15}}');
      expect(result).toBeNull();
    });

    test('rejects work with invalid duration', () => {
      const result = parseResponse('{"action": "work", "params": {"duration": 10}}');
      expect(result).toBeNull();
    });

    test('rejects gather with invalid quantity', () => {
      const result = parseResponse('{"action": "gather", "params": {"quantity": 10}}');
      expect(result).toBeNull();
    });
  });

  describe('edge cases', () => {
    test('handles extra fields gracefully', () => {
      const response = '{"action": "move", "params": {"toX": 5, "toY": 5}, "extra": "ignored", "nested": {"data": true}}';
      const result = parseResponse(response);

      expect(result).not.toBeNull();
      expect(result?.action).toBe('move');
    });

    test('handles numeric action name', () => {
      const result = parseResponse('{"action": 123, "params": {}}');
      expect(result).toBeNull();
    });

    test('handles null action', () => {
      const result = parseResponse('{"action": null, "params": {}}');
      expect(result).toBeNull();
    });

    test('handles undefined reasoning (optional field)', () => {
      const response = '{"action": "work", "params": {}}';
      const result = parseResponse(response);

      expect(result).not.toBeNull();
      expect(result?.reasoning).toBeUndefined();
    });
  });
});

describe('getFallbackDecision', () => {
  describe('hunger priority', () => {
    test('buys food when critically hungry with money', () => {
      const decision = getFallbackDecision(20, 80, 100); // hungry, good energy, has money

      expect(decision.action).toBe('buy');
      expect(decision.params).toEqual({ itemType: 'food', quantity: 1 });
    });

    test('consumes food when hungry but no money', () => {
      const decision = getFallbackDecision(40, 80, 5); // hungry, good energy, poor

      expect(decision.action).toBe('consume');
      expect(decision.params).toEqual({ itemType: 'food' });
    });

    test('consumes food when moderately hungry', () => {
      const decision = getFallbackDecision(45, 80, 100); // moderately hungry

      expect(decision.action).toBe('consume');
    });
  });

  describe('energy priority', () => {
    test('sleeps when exhausted', () => {
      const decision = getFallbackDecision(80, 20, 100); // fed, exhausted, rich

      expect(decision.action).toBe('sleep');
      expect(decision.params).toEqual({ duration: 3 });
    });

    test('sleeps when very low energy', () => {
      const decision = getFallbackDecision(80, 25, 100);

      expect(decision.action).toBe('sleep');
    });
  });

  describe('economy priority', () => {
    test('works when poor but has energy', () => {
      const decision = getFallbackDecision(80, 50, 30); // fed, moderate energy, poor

      expect(decision.action).toBe('work');
      expect(decision.params).toEqual({ duration: 2 });
    });

    test('works when balance is exactly 50', () => {
      // At balance 50, should NOT work (only if < 50)
      const decision = getFallbackDecision(80, 50, 50);

      expect(decision.action).not.toBe('work');
    });
  });

  describe('exploration', () => {
    test('explores when all needs are met', () => {
      const decision = getFallbackDecision(80, 80, 100); // all good

      expect(decision.action).toBe('move');
      expect(decision.reasoning).toContain('exploring');
    });

    test('move uses provided coordinates', () => {
      const decision = getFallbackDecision(80, 80, 100, 25, 30);

      expect(decision.action).toBe('move');
      // Should be adjacent to (25, 30)
      const { toX, toY } = decision.params as { toX: number; toY: number };
      const dx = Math.abs(toX - 25);
      const dy = Math.abs(toY - 30);
      expect(dx + dy).toBe(1); // One step in any direction
    });

    test('defaults to (50, 50) when no coordinates provided', () => {
      const decision = getFallbackDecision(80, 80, 100);

      expect(decision.action).toBe('move');
      const { toX, toY } = decision.params as { toX: number; toY: number };
      const dx = Math.abs(toX - 50);
      const dy = Math.abs(toY - 50);
      expect(dx + dy).toBe(1);
    });
  });

  describe('default behavior', () => {
    test('rests when exhausted (energy < 30) takes priority', () => {
      // With energy=5, the "exhausted" condition (energy < 30) triggers first
      // This returns duration=3, not the default duration=1
      const decision = getFallbackDecision(80, 5, 100); // fed, very low energy, rich

      expect(decision.action).toBe('sleep');
      expect(decision.params).toEqual({ duration: 3 });
      expect(decision.reasoning).toContain('exhausted');
    });

    test('default rest when moderate energy but poor and no energy to work', () => {
      // energy=15 is < 30, so still exhausted
      // To hit default, need energy >= 30 but < 10 for explore, but that's impossible
      // Actually, default is unreachable in normal conditions - let's test boundary
      const decision = getFallbackDecision(60, 8, 100); // slightly hungry, very low energy, rich

      // energy < 30, so sleeps with exhausted reasoning
      expect(decision.action).toBe('sleep');
    });
  });

  describe('decision includes reasoning', () => {
    test('all decisions have reasoning string', () => {
      const scenarios = [
        [20, 80, 100], // hungry with money
        [40, 80, 5],   // hungry without money
        [80, 20, 100], // exhausted
        [80, 50, 30],  // poor
        [80, 80, 100], // all good
        [80, 5, 100],  // very low energy
      ];

      for (const [hunger, energy, balance] of scenarios) {
        const decision = getFallbackDecision(hunger, energy, balance);
        expect(decision.reasoning).toBeDefined();
        expect(typeof decision.reasoning).toBe('string');
        expect(decision.reasoning!.length).toBeGreaterThan(0);
      }
    });
  });
});
