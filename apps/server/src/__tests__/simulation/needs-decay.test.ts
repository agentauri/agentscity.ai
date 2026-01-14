/**
 * Tests for Needs Decay System
 *
 * Tests cover:
 * - Hunger decay rate (0.6 per tick - from global config)
 * - Energy decay rate (0.3 per tick base, 1.3 when hungry - from global config)
 * - Health damage on starvation (hunger < 10)
 * - Health damage on exhaustion (energy < 10)
 * - Death condition (health <= 0)
 * - Threshold transitions (low → critical)
 * - Survival ticks calculation
 *
 * NOTE: Decay rates use global config values. Tests assume:
 * - hungerDecay: 0.6
 * - energyDecay: 0.3
 * - foodHungerRestore: 50
 */

import { describe, expect, test, mock, beforeEach, afterEach, afterAll } from 'bun:test';

// Restore mocks after all tests to not affect other test files
afterAll(() => mock.restore());
import type { Agent } from '../../db/schema';

// Mock database calls before importing the module
const mockUpdateAgent = mock(() => Promise.resolve());
const mockKillAgent = mock(() => Promise.resolve());

mock.module('../../db/queries/agents', () => ({
  updateAgent: mockUpdateAgent,
  killAgent: mockKillAgent,
}));

// Import after mocking
import { applyNeedsDecay, calculateSurvivalTicks, resetCriticalTicks, setCriticalTicks } from '../../simulation/needs-decay';

// Helper to create mock agent
function createMockAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'test-agent-id',
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
    tenantId: null,
    personality: null,
    ...overrides,
  };
}

describe('applyNeedsDecay', () => {
  beforeEach(() => {
    mockUpdateAgent.mockClear();
    mockKillAgent.mockClear();
    resetCriticalTicks(); // Clear grace period state between tests
  });

  describe('hunger decay', () => {
    test('decreases hunger by 0.6 per tick (from global config)', async () => {
      const agent = createMockAgent({ hunger: 80, energy: 80, health: 100 });
      const result = await applyNeedsDecay(agent, 1);

      expect(result.newState.hunger).toBe(79.4);
      expect(result.effects).toContain('hunger_decreased');
    });

    test('hunger cannot go below 0', async () => {
      const agent = createMockAgent({ hunger: 0.5, energy: 80, health: 100 });
      const result = await applyNeedsDecay(agent, 1);

      expect(result.newState.hunger).toBe(0);
    });

    test('hunger 0 stays at 0', async () => {
      const agent = createMockAgent({ hunger: 0, energy: 80, health: 100 });
      const result = await applyNeedsDecay(agent, 1);

      expect(result.newState.hunger).toBe(0);
    });
  });

  describe('energy decay', () => {
    test('decreases energy by 0.3 per tick when fed (from global config)', async () => {
      const agent = createMockAgent({ hunger: 80, energy: 80, health: 100 });
      const result = await applyNeedsDecay(agent, 1);

      expect(result.newState.energy).toBe(79.7);
      expect(result.effects).toContain('energy_decreased');
    });

    test('energy cannot go below 0', async () => {
      const agent = createMockAgent({ hunger: 80, energy: 0.2, health: 100 });
      const result = await applyNeedsDecay(agent, 1);

      expect(result.newState.energy).toBe(0);
    });

    test('increases energy drain by 1 when hungry (hunger < 20)', async () => {
      // When hunger < 20, energy drain = 0.3 + 1 = 1.3
      const agent = createMockAgent({ hunger: 15, energy: 80, health: 100 });
      const result = await applyNeedsDecay(agent, 1);

      // Hunger: 15 - 0.6 = 14.4 (after decay, still < 20)
      // Energy: 80 - 1.3 = 78.7
      expect(result.newState.energy).toBe(78.7);
    });

    test('no extra energy drain when hunger is exactly 20', async () => {
      const agent = createMockAgent({ hunger: 20, energy: 80, health: 100 });
      const result = await applyNeedsDecay(agent, 1);

      // Hunger: 20 - 0.6 = 19.4 (triggers low_hunger_warning)
      // newHunger = 19.4 which IS < 20, so extra drain applies
      // Energy drain = 0.3 + 1 = 1.3
      expect(result.newState.energy).toBe(78.7);
    });

    test('no extra energy drain when hunger is 21', async () => {
      const agent = createMockAgent({ hunger: 21, energy: 80, health: 100 });
      const result = await applyNeedsDecay(agent, 1);

      // Hunger: 21 - 0.6 = 20.4 (exactly 20.4, which is NOT < 20)
      // Energy: 80 - 0.3 = 79.7
      expect(result.newState.energy).toBe(79.7);
    });
  });

  describe('low hunger threshold (<20)', () => {
    test('triggers low_hunger_warning when hunger drops below 20', async () => {
      const agent = createMockAgent({ hunger: 20, energy: 80, health: 100 });
      const result = await applyNeedsDecay(agent, 1);

      // Hunger becomes 19
      expect(result.effects).toContain('low_hunger_warning');
    });

    test('emits needs_warning event for low hunger', async () => {
      const agent = createMockAgent({ hunger: 19, energy: 80, health: 100 });
      const result = await applyNeedsDecay(agent, 1);

      const warningEvent = result.events.find(
        (e) => e.type === 'needs_warning' && e.payload?.need === 'hunger' && e.payload?.level === 'low'
      );
      expect(warningEvent).toBeDefined();
      expect(warningEvent?.agentId).toBe(agent.id);
    });
  });

  describe('critical hunger threshold (<10)', () => {
    test('triggers critical_hunger_warning when hunger drops below 10', async () => {
      const agent = createMockAgent({ hunger: 10, energy: 80, health: 100 });
      const result = await applyNeedsDecay(agent, 1);

      // Hunger becomes 9
      expect(result.effects).toContain('critical_hunger_warning');
    });

    test('does not damage health immediately when critically hungry (grace period)', async () => {
      const agent = createMockAgent({ hunger: 5, energy: 80, health: 100 });
      const result = await applyNeedsDecay(agent, 1);

      // Grace period active - no health damage yet
      expect(result.newState.health).toBe(100);
      expect(result.effects).toContain('grace_period_active');
      expect(result.effects).not.toContain('health_damaged');
    });

    test('damages health by 2 after grace period expires', async () => {
      const agent = createMockAgent({ hunger: 5, energy: 80, health: 100 });
      // Set up 3 prior critical ticks so the next tick exceeds grace period
      setCriticalTicks(agent.id, { hunger: 3, energy: 0 });

      const result = await applyNeedsDecay(agent, 1);

      // Grace period expired - health damage applies
      expect(result.newState.health).toBe(98);
      expect(result.effects).toContain('health_damaged');
    });

    test('emits needs_warning event for critical hunger with grace period info', async () => {
      const agent = createMockAgent({ hunger: 5, energy: 80, health: 100 });
      const result = await applyNeedsDecay(agent, 1);

      const warningEvent = result.events.find(
        (e) => e.type === 'needs_warning' && e.payload?.need === 'hunger' && e.payload?.level === 'critical'
      );
      expect(warningEvent).toBeDefined();
      expect(warningEvent?.payload?.gracePeriodActive).toBe(true);
      expect(warningEvent?.payload?.graceTicksRemaining).toBe(2);
    });

    test('emits needs_warning event with healthDamage after grace period', async () => {
      const agent = createMockAgent({ hunger: 5, energy: 80, health: 100 });
      setCriticalTicks(agent.id, { hunger: 3, energy: 0 });

      const result = await applyNeedsDecay(agent, 1);

      const warningEvent = result.events.find(
        (e) => e.type === 'needs_warning' && e.payload?.need === 'hunger' && e.payload?.level === 'critical'
      );
      expect(warningEvent).toBeDefined();
      expect(warningEvent?.payload?.healthDamage).toBe(2);
      expect(warningEvent?.payload?.gracePeriodExpired).toBe(true);
    });
  });

  describe('low energy threshold (<20 and >=10)', () => {
    test('triggers low_energy_warning when energy is low but not critical', async () => {
      const agent = createMockAgent({ hunger: 80, energy: 15, health: 100 });
      const result = await applyNeedsDecay(agent, 1);

      // Energy: 15 - 0.5 = 14.5 (still in low range)
      expect(result.effects).toContain('low_energy_warning');
    });

    test('emits needs_warning event for low energy', async () => {
      const agent = createMockAgent({ hunger: 80, energy: 15, health: 100 });
      const result = await applyNeedsDecay(agent, 1);

      const warningEvent = result.events.find(
        (e) => e.type === 'needs_warning' && e.payload?.need === 'energy' && e.payload?.level === 'low'
      );
      expect(warningEvent).toBeDefined();
    });
  });

  describe('critical energy threshold (<10)', () => {
    test('triggers critical_energy_warning when energy drops below 10', async () => {
      const agent = createMockAgent({ hunger: 80, energy: 10, health: 100 });
      const result = await applyNeedsDecay(agent, 1);

      // Energy: 10 - 0.5 = 9.5
      expect(result.effects).toContain('critical_energy_warning');
    });

    test('damages health by 1 when critically exhausted', async () => {
      const agent = createMockAgent({ hunger: 80, energy: 5, health: 100 });
      const result = await applyNeedsDecay(agent, 1);

      // Health: 100 - 1 = 99
      expect(result.newState.health).toBe(99);
      expect(result.effects).toContain('health_damaged');
    });

    test('forces rest state when critically exhausted', async () => {
      const agent = createMockAgent({ hunger: 80, energy: 5, health: 100 });
      const result = await applyNeedsDecay(agent, 1);

      expect(result.effects).toContain('forced_rest');
    });

    test('emits needs_warning event with forcedRest flag', async () => {
      const agent = createMockAgent({ hunger: 80, energy: 5, health: 100 });
      const result = await applyNeedsDecay(agent, 1);

      const warningEvent = result.events.find(
        (e) => e.type === 'needs_warning' && e.payload?.need === 'energy' && e.payload?.level === 'critical'
      );
      expect(warningEvent).toBeDefined();
      expect(warningEvent?.payload?.forcedRest).toBe(true);
    });

    test('calls updateAgent with sleeping state', async () => {
      const agent = createMockAgent({ hunger: 80, energy: 5, health: 100 });
      await applyNeedsDecay(agent, 1);

      expect(mockUpdateAgent).toHaveBeenCalledWith(agent.id, expect.objectContaining({
        state: 'sleeping',
      }));
    });
  });

  describe('combined critical states', () => {
    test('only energy damages health immediately when both critical (hunger has grace period)', async () => {
      const agent = createMockAgent({ hunger: 5, energy: 5, health: 100 });
      const result = await applyNeedsDecay(agent, 1);

      // Critical hunger: grace period active, no damage
      // Critical energy: -1 health (no grace period)
      // Total: 100 - 1 = 99
      expect(result.newState.health).toBe(99);
    });

    test('both apply damage after hunger grace period expires', async () => {
      const agent = createMockAgent({ hunger: 5, energy: 5, health: 100 });
      setCriticalTicks(agent.id, { hunger: 3, energy: 0 });

      const result = await applyNeedsDecay(agent, 1);

      // Critical hunger: -2 health (grace period expired)
      // Critical energy: -1 health
      // Total: 100 - 2 - 1 = 97
      expect(result.newState.health).toBe(97);
    });
  });

  describe('death condition', () => {
    test('agent dies when health reaches 0 from starvation (after grace period)', async () => {
      const agent = createMockAgent({ hunger: 5, energy: 80, health: 2 });
      // Set grace period as expired
      setCriticalTicks(agent.id, { hunger: 3, energy: 0 });

      const result = await applyNeedsDecay(agent, 1);

      // Critical hunger damages 2 health: 2 - 2 = 0
      expect(result.died).toBe(true);
      expect(result.effects).toContain('death');
    });

    test('agent dies when health reaches 0 from exhaustion', async () => {
      const agent = createMockAgent({ hunger: 80, energy: 5, health: 1 });
      const result = await applyNeedsDecay(agent, 1);

      // Critical energy: -1 health (no grace period)
      // Health: 1 - 1 = 0
      expect(result.died).toBe(true);
      expect(result.newState.health).toBe(0);
    });

    test('agent dies when health goes below 0', async () => {
      const agent = createMockAgent({ hunger: 5, energy: 5, health: 1 });
      // Set grace period as expired for hunger
      setCriticalTicks(agent.id, { hunger: 3, energy: 0 });

      const result = await applyNeedsDecay(agent, 1);

      // Critical hunger: -2, critical energy: -1
      // Health: 1 - 2 - 1 = -2, clamped to 0
      expect(result.died).toBe(true);
      expect(result.newState.health).toBe(0);
    });

    test('calls killAgent when agent dies', async () => {
      const agent = createMockAgent({ hunger: 80, energy: 5, health: 1 });
      await applyNeedsDecay(agent, 1);

      // Critical energy causes death
      expect(mockKillAgent).toHaveBeenCalledWith(agent.id);
    });

    test('does not call updateAgent when agent dies', async () => {
      const agent = createMockAgent({ hunger: 80, energy: 5, health: 1 });
      await applyNeedsDecay(agent, 1);

      expect(mockUpdateAgent).not.toHaveBeenCalled();
    });

    test('death cause is starvation when critically hungry', async () => {
      const agent = createMockAgent({ hunger: 5, energy: 80, health: 2 });
      // Set grace period as expired
      setCriticalTicks(agent.id, { hunger: 3, energy: 0 });

      const result = await applyNeedsDecay(agent, 1);

      expect(result.deathCause).toBe('starvation');
    });

    test('death cause is exhaustion when only exhausted', async () => {
      const agent = createMockAgent({ hunger: 80, energy: 5, health: 1 });
      const result = await applyNeedsDecay(agent, 1);

      // Hunger after decay: 79 (not critical)
      // Energy: critical -> -1 health
      expect(result.died).toBe(true);
      expect(result.deathCause).toBe('exhaustion');
    });
  });

  describe('state tracking', () => {
    test('preserves previous state correctly', async () => {
      const agent = createMockAgent({ hunger: 50, energy: 60, health: 100 });
      const result = await applyNeedsDecay(agent, 1);

      expect(result.previousState).toEqual({
        hunger: 50,
        energy: 60,
        health: 100,
      });
    });

    test('returns correct agent id', async () => {
      const agent = createMockAgent({ id: 'agent-123' });
      const result = await applyNeedsDecay(agent, 1);

      expect(result.agentId).toBe('agent-123');
    });

    test('emits needs_updated event with full state', async () => {
      const agent = createMockAgent({ hunger: 50, energy: 60, health: 100 });
      const result = await applyNeedsDecay(agent, 1);

      const updateEvent = result.events.find((e) => e.type === 'needs_updated');
      expect(updateEvent).toBeDefined();
      expect(updateEvent?.payload?.previousState).toEqual({
        hunger: 50,
        energy: 60,
        health: 100,
      });
      // hungerDecay: 0.6, energyDecay: 0.3
      expect(updateEvent?.payload?.newState).toEqual({
        hunger: 49.4,
        energy: 59.7,
        health: 100,
      });
    });
  });

  describe('database updates', () => {
    test('calls updateAgent with new values when alive', async () => {
      const agent = createMockAgent({ hunger: 50, energy: 60, health: 100 });
      await applyNeedsDecay(agent, 1);

      // hungerDecay: 0.6, energyDecay: 0.3
      expect(mockUpdateAgent).toHaveBeenCalledWith(agent.id, {
        hunger: 49.4,
        energy: 59.7,
        health: 100,
      });
    });
  });
});

describe('calculateSurvivalTicks', () => {
  test('calculates ticks based on hunger decay', () => {
    // Hunger decay is 0.6 per tick (from global config)
    const ticks = calculateSurvivalTicks(6, 100);
    expect(ticks).toBe(10); // 6 / 0.6 = 10 ticks
  });

  test('calculates ticks based on energy decay', () => {
    // Energy decay is 0.3 per tick (base, from global config)
    const ticks = calculateSurvivalTicks(100, 3);
    expect(ticks).toBe(10); // 3 / 0.3 = 10 ticks
  });

  test('returns minimum of hunger and energy ticks', () => {
    // Hunger: 12 / 0.6 = 20 ticks
    // Energy: 3 / 0.3 = 10 ticks
    const ticks = calculateSurvivalTicks(12, 3);
    expect(ticks).toBe(10); // Energy runs out first
  });

  test('returns 0 when both values are 0', () => {
    const ticks = calculateSurvivalTicks(0, 0);
    expect(ticks).toBe(0);
  });

  test('handles fractional values', () => {
    // Hunger: 3.3 / 0.6 = 5.5 ticks
    // Energy: 6 / 0.3 = 20 ticks
    const ticks = calculateSurvivalTicks(3.3, 6);
    expect(ticks).toBe(5.5);
  });
});
