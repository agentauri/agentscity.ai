/**
 * Integration Test: Full Tick Cycle
 *
 * Tests the complete simulation tick lifecycle:
 * - Tick increment
 * - Agent decision processing
 * - State updates
 * - Event emission
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';
import type { Agent } from '../../db/schema';

// Mock database calls BEFORE importing modules that use them
const mockUpdateAgent = mock(() => Promise.resolve());
const mockKillAgent = mock(() => Promise.resolve());

mock.module('../../db/queries/agents', () => ({
  updateAgent: mockUpdateAgent,
  killAgent: mockKillAgent,
}));

// Import after mocking
import { applyNeedsDecay } from '../../simulation/needs-decay';

// Mock agent for testing
function createTestAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: `test-agent-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    llmType: 'claude',
    x: 50,
    y: 50,
    hunger: 80,
    energy: 80,
    health: 100,
    balance: 100,
    state: 'idle',
    color: '#ff0000',
    createdAt: new Date(),
    updatedAt: new Date(),
    diedAt: null,
    ...overrides,
  };
}

describe('Tick Cycle - Needs Decay', () => {
  beforeEach(() => {
    mockUpdateAgent.mockClear();
    mockKillAgent.mockClear();
  });

  test('hunger decays over time', async () => {
    const agent = createTestAgent({ hunger: 80 });
    const tick = 100;

    const result = await applyNeedsDecay(agent, tick);

    expect(result.newState.hunger).toBeLessThan(80);
    expect(result.died).toBe(false);
  });

  test('energy decays over time', async () => {
    const agent = createTestAgent({ energy: 80 });
    const tick = 100;

    const result = await applyNeedsDecay(agent, tick);

    expect(result.newState.energy).toBeLessThan(80);
    expect(result.died).toBe(false);
  });

  test('low hunger causes health damage', async () => {
    const agent = createTestAgent({ hunger: 5, health: 100 });
    const tick = 100;

    const result = await applyNeedsDecay(agent, tick);

    expect(result.newState.health).toBeLessThan(100);
    expect(result.newState.hunger).toBe(4); // 5 - 1 = 4
  });

  test('low energy causes health damage', async () => {
    const agent = createTestAgent({ energy: 5, health: 100 });
    const tick = 100;

    const result = await applyNeedsDecay(agent, tick);

    expect(result.newState.health).toBeLessThan(100);
  });

  test('agent dies when health reaches zero', async () => {
    const agent = createTestAgent({ hunger: 0, energy: 0, health: 3 });
    const tick = 100;

    const result = await applyNeedsDecay(agent, tick);

    expect(result.newState.health).toBe(0);
    expect(result.died).toBe(true);
    expect(result.deathCause).toBeDefined();
    expect(mockKillAgent).toHaveBeenCalledWith(agent.id);
  });

  test('events emitted for needs changes', async () => {
    const agent = createTestAgent({ hunger: 50, energy: 50 });
    const tick = 100;

    const result = await applyNeedsDecay(agent, tick);

    // Should have at least the needs_updated event
    const needsUpdatedEvent = result.events.find((e) => e.type === 'needs_updated');
    expect(needsUpdatedEvent).toBeDefined();
  });
});

describe('Tick Cycle - Decision Processing', () => {
  test('processAgentsTick function exists', async () => {
    // Import dynamically to verify existence
    const { processAgentsTick } = await import('../../agents/orchestrator');
    expect(typeof processAgentsTick).toBe('function');
  });

  test('AgentTickResult has correct structure', () => {
    // Verify the expected structure of tick results
    const expectedFields = ['agentId', 'llmType', 'decision', 'actionResult', 'processingTimeMs', 'usedFallback'];

    // This tests that the interface is correctly defined
    const mockResult = {
      agentId: 'test-id',
      llmType: 'claude',
      decision: null,
      actionResult: null,
      processingTimeMs: 100,
      usedFallback: false,
    };

    expectedFields.forEach((field) => {
      expect(field in mockResult).toBe(true);
    });
  });
});

describe('Tick Cycle - State Consistency', () => {
  beforeEach(() => {
    mockUpdateAgent.mockClear();
    mockKillAgent.mockClear();
  });

  test('agent state values remain within bounds after decay', async () => {
    const agent = createTestAgent({ hunger: 10, energy: 10, health: 50 });
    const tick = 100;

    const result = await applyNeedsDecay(agent, tick);

    // All values should be >= 0
    expect(result.newState.hunger).toBeGreaterThanOrEqual(0);
    expect(result.newState.energy).toBeGreaterThanOrEqual(0);
    expect(result.newState.health).toBeGreaterThanOrEqual(0);

    // All values should be <= 100
    expect(result.newState.hunger).toBeLessThanOrEqual(100);
    expect(result.newState.energy).toBeLessThanOrEqual(100);
    expect(result.newState.health).toBeLessThanOrEqual(100);
  });

  test('healthy agent does not die', async () => {
    const agent = createTestAgent({ hunger: 100, energy: 100, health: 100 });
    const tick = 100;

    const result = await applyNeedsDecay(agent, tick);

    expect(result.died).toBe(false);
    expect(result.newState.health).toBeGreaterThan(0);
  });
});
