/**
 * Tests for Agent Orchestrator
 *
 * Tests cover:
 * - AgentTickResult interface structure
 * - Fallback decision creation
 * - Result filtering and aggregation logic
 */

import { describe, expect, test } from 'bun:test';
import { getFallbackDecision } from '../../llm';
import type { AgentObservation, AgentDecision } from '../../llm/types';

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Mirrors the orchestrator's createFallbackDecision function
 */
function createFallbackDecision(observation: AgentObservation): AgentDecision {
  return getFallbackDecision(
    observation.self.hunger,
    observation.self.energy,
    observation.self.balance,
    observation.self.x,
    observation.self.y,
    observation.inventory,
    observation.nearbyResourceSpawns,
    observation.nearbyShelters
  );
}

function createMockObservation(overrides: Partial<{
  id: string;
  hunger: number;
  energy: number;
  health: number;
  balance: number;
  x: number;
  y: number;
  inventory: Array<{ type: string; quantity: number }>;
  nearbyShelters: Array<{ id: string; x: number; y: number; canSleep: boolean }>;
  nearbyResourceSpawns: Array<{ id: string; x: number; y: number; resourceType: string; currentAmount: number; maxAmount: number }>;
}> = {}): AgentObservation {
  return {
    tick: 1,
    timestamp: Date.now(),
    self: {
      id: overrides.id ?? 'test-agent',
      x: overrides.x ?? 50,
      y: overrides.y ?? 50,
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
    inventory: overrides.inventory ?? [],
    nearbyShelters: overrides.nearbyShelters,
    nearbyResourceSpawns: overrides.nearbyResourceSpawns,
  };
}

// =============================================================================
// AgentTickResult Structure Tests
// =============================================================================

describe('AgentTickResult', () => {
  describe('interface contract', () => {
    test('successful result has all required fields', () => {
      const result = {
        agentId: 'agent-1',
        llmType: 'claude',
        decision: { action: 'move', params: { toX: 10, toY: 20 } },
        actionResult: { success: true, changes: { x: 10, y: 20 } },
        processingTimeMs: 150,
        usedFallback: false,
      };

      expect(result.agentId).toBeDefined();
      expect(result.llmType).toBeDefined();
      expect(result.decision).toBeDefined();
      expect(result.actionResult).toBeDefined();
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.usedFallback).toBe(false);
    });

    test('fallback result has usedFallback true', () => {
      const result = {
        agentId: 'agent-1',
        llmType: 'claude',
        decision: { action: 'sleep', params: { duration: 3 } },
        actionResult: { success: true },
        processingTimeMs: 5,
        usedFallback: true,
      };

      expect(result.usedFallback).toBe(true);
    });

    test('error result has error field', () => {
      const result = {
        agentId: 'agent-1',
        llmType: 'claude',
        decision: null,
        actionResult: null,
        processingTimeMs: 100,
        usedFallback: true,
        error: 'LLM timeout',
      };

      expect(result.error).toBeDefined();
      expect(result.error).toBe('LLM timeout');
    });
  });
});

// =============================================================================
// Fallback Decision Tests
// =============================================================================

describe('Orchestrator Fallback Decision', () => {
  describe('createFallbackDecision wrapper', () => {
    test('creates valid decision for hungry agent at shelter', () => {
      // Agent is at (50, 50) and there's a shelter there - can buy food
      const observation = createMockObservation({
        hunger: 20,
        balance: 100,
        x: 50,
        y: 50,
        nearbyShelters: [{ id: 'shelter-1', x: 50, y: 50, canSleep: true }],
      });
      const decision = createFallbackDecision(observation);

      expect(decision).toBeDefined();
      expect(decision.action).toBe('buy');
      expect(decision.params).toEqual({ itemType: 'food', quantity: 1 });
    });

    test('hungry agent without shelter forages instead of buying', () => {
      // Agent is hungry but NOT at a shelter - should forage for food
      const observation = createMockObservation({ hunger: 20, balance: 100 });
      const decision = createFallbackDecision(observation);

      expect(decision).toBeDefined();
      // Without shelter and no food, agent forages (60% chance of finding food)
      expect(decision.action).toBe('forage');
      expect(decision.params).toEqual({});
    });

    test('creates valid decision for exhausted agent', () => {
      const observation = createMockObservation({ energy: 20 });
      const decision = createFallbackDecision(observation);

      expect(decision).toBeDefined();
      expect(decision.action).toBe('sleep');
      expect(decision.params).toEqual({ duration: 3 });
    });

    test('creates valid decision for poor agent not at shelter', () => {
      // Poor agent not at shelter forages to find resources
      const observation = createMockObservation({ balance: 25, energy: 50 });
      const decision = createFallbackDecision(observation);

      expect(decision).toBeDefined();
      expect(decision.action).toBe('forage');
      expect(decision.params).toEqual({});
    });

    test('creates valid decision for poor agent at shelter', () => {
      // Poor agent at shelter does public work
      const observation = createMockObservation({
        balance: 30,
        energy: 50,
        x: 50,
        y: 50,
        nearbyShelters: [{ id: 'shelter-1', x: 50, y: 50, canSleep: true }],
      });
      const decision = createFallbackDecision(observation);

      expect(decision).toBeDefined();
      expect(decision.action).toBe('public_work');
      expect(decision.params).toEqual({});
    });

    test('creates exploration decision for healthy agent', () => {
      const observation = createMockObservation({
        hunger: 80,
        energy: 80,
        balance: 100,
        x: 25,
        y: 30,
      });
      const decision = createFallbackDecision(observation);

      expect(decision).toBeDefined();
      expect(decision.action).toBe('move');
      expect(decision.reasoning).toContain('exploring');
    });

    test('uses agent coordinates for movement', () => {
      const observation = createMockObservation({
        hunger: 80,
        energy: 80,
        balance: 100,
        x: 10,
        y: 10,
      });
      const decision = createFallbackDecision(observation);

      expect(decision.action).toBe('move');
      const { toX, toY } = decision.params as { toX: number; toY: number };

      // Should be adjacent to (10, 10)
      const dx = Math.abs(toX - 10);
      const dy = Math.abs(toY - 10);
      expect(dx + dy).toBe(1); // One step in any direction
    });
  });
});

// =============================================================================
// Result Aggregation Logic Tests
// =============================================================================

describe('Result Aggregation', () => {
  describe('success counting', () => {
    test('counts successful actions correctly', () => {
      const results = [
        { agentId: '1', actionResult: { success: true }, usedFallback: false },
        { agentId: '2', actionResult: { success: true }, usedFallback: false },
        { agentId: '3', actionResult: { success: false }, usedFallback: false },
        { agentId: '4', actionResult: null, usedFallback: true },
      ];

      const successful = results.filter((r) => r.actionResult?.success).length;
      expect(successful).toBe(2);
    });

    test('counts fallbacks correctly', () => {
      const results = [
        { agentId: '1', usedFallback: false },
        { agentId: '2', usedFallback: true },
        { agentId: '3', usedFallback: true },
        { agentId: '4', usedFallback: false },
      ];

      const fallbacks = results.filter((r) => r.usedFallback).length;
      expect(fallbacks).toBe(2);
    });
  });

  describe('invalid result filtering', () => {
    test('identifies null results', () => {
      const results = [null, undefined, { agentId: '1' }];
      const valid = results.filter((r) => r && r.agentId);

      expect(valid.length).toBe(1);
    });

    test('identifies results without agentId', () => {
      const results = [
        { agentId: '1', decision: {} },
        { agentId: '', decision: {} },
        { decision: {} },
      ];

      const valid = results.filter((r) => r?.agentId);
      expect(valid.length).toBe(1);
    });

    test('identifies results without decision', () => {
      const results = [
        { agentId: '1', decision: { action: 'move' } },
        { agentId: '2', decision: null },
        { agentId: '3', decision: undefined },
      ];

      const valid = results.filter((r) => r?.agentId && r?.decision);
      expect(valid.length).toBe(1);
    });
  });
});

// =============================================================================
// External Agent Handling Tests
// =============================================================================

describe('External Agent Handling', () => {
  describe('agent classification', () => {
    test('correctly identifies external agents by llmType', () => {
      const agents = [
        { id: '1', llmType: 'claude' },
        { id: '2', llmType: 'external' },
        { id: '3', llmType: 'gemini' },
        { id: '4', llmType: 'external' },
      ];

      const external = agents.filter((a) => a.llmType === 'external');
      const regular = agents.filter((a) => a.llmType !== 'external');

      expect(external.length).toBe(2);
      expect(regular.length).toBe(2);
    });
  });

  describe('webhook vs poll mode', () => {
    test('agents with endpoint use webhook mode', () => {
      const externalAgent = {
        id: 'ext-1',
        endpoint: 'https://example.com/webhook',
        isActive: true,
      };

      const usesWebhook = externalAgent.endpoint && externalAgent.isActive;
      expect(usesWebhook).toBe(true);
    });

    test('agents without endpoint use poll mode', () => {
      const externalAgent = {
        id: 'ext-2',
        endpoint: null,
        isActive: true,
      };

      const usesWebhook = externalAgent.endpoint && externalAgent.isActive;
      expect(usesWebhook).toBeFalsy();
    });

    test('inactive agents are skipped', () => {
      const externalAgent = {
        id: 'ext-3',
        endpoint: 'https://example.com/webhook',
        isActive: false,
      };

      const usesWebhook = externalAgent.endpoint && externalAgent.isActive;
      expect(usesWebhook).toBe(false);
    });
  });
});

// =============================================================================
// LLM Type Distribution Tests
// =============================================================================

describe('LLM Type Distribution', () => {
  test('all supported LLM types are valid', () => {
    const supportedTypes = ['claude', 'codex', 'gemini', 'deepseek', 'qwen', 'glm', 'grok', 'external'];

    for (const type of supportedTypes) {
      expect(typeof type).toBe('string');
      expect(type.length).toBeGreaterThan(0);
    }
  });

  test('can group results by LLM type', () => {
    const results = [
      { llmType: 'claude', usedFallback: false },
      { llmType: 'claude', usedFallback: true },
      { llmType: 'gemini', usedFallback: false },
      { llmType: 'codex', usedFallback: false },
    ];

    const byType = results.reduce((acc, r) => {
      acc[r.llmType] = (acc[r.llmType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    expect(byType['claude']).toBe(2);
    expect(byType['gemini']).toBe(1);
    expect(byType['codex']).toBe(1);
  });
});
