/**
 * Tests for Sleep Action Handler
 *
 * Tests cover:
 * - Sleep success → creates memory
 * - Sleep already sleeping → error
 * - Duration validation
 * - Energy restoration correct
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';
import type { Agent } from '../../db/schema';
import type { ActionIntent, SleepParams } from '../../actions/types';

// Mock database calls before importing the module
const mockStoreMemory = mock(() => Promise.resolve({ id: 'test-memory' }));

mock.module('../../db/queries/memories', () => ({
  storeMemory: mockStoreMemory,
}));

// Import after mocking
import { handleSleep, handleWakeUp } from '../../actions/handlers/sleep';

// Helper to create mock agent
function createMockAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'test-agent-id',
    llmType: 'claude',
    x: 50,
    y: 50,
    hunger: 80,
    energy: 50,
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

// Helper to create sleep intent
function createSleepIntent(duration: number, agentId = 'test-agent-id'): ActionIntent<SleepParams> {
  return {
    agentId,
    type: 'sleep',
    params: { duration },
    tick: 1,
    timestamp: Date.now(),
  };
}

describe('handleSleep', () => {
  beforeEach(() => {
    mockStoreMemory.mockClear();
  });

  describe('successful sleep', () => {
    test('restores 5 energy per tick of sleep', async () => {
      const agent = createMockAgent({ energy: 50 });
      const intent = createSleepIntent(1);

      const result = await handleSleep(intent, agent);

      expect(result.success).toBe(true);
      expect(result.changes?.energy).toBe(55); // 50 + (5 * 1)
    });

    test('restores energy for multiple ticks', async () => {
      const agent = createMockAgent({ energy: 50 });
      const intent = createSleepIntent(3);

      const result = await handleSleep(intent, agent);

      expect(result.success).toBe(true);
      expect(result.changes?.energy).toBe(65); // 50 + (5 * 3)
    });

    test('caps energy at 100', async () => {
      const agent = createMockAgent({ energy: 90 });
      const intent = createSleepIntent(5);

      const result = await handleSleep(intent, agent);

      expect(result.success).toBe(true);
      expect(result.changes?.energy).toBe(100); // 90 + 25 = 115, capped to 100
    });

    test('sets state to sleeping', async () => {
      const agent = createMockAgent({ state: 'idle' });
      const intent = createSleepIntent(1);

      const result = await handleSleep(intent, agent);

      expect(result.changes?.state).toBe('sleeping');
    });

    test('creates memory on success', async () => {
      const agent = createMockAgent({ energy: 50 });
      const intent = createSleepIntent(2);

      await handleSleep(intent, agent);

      expect(mockStoreMemory).toHaveBeenCalledTimes(1);
      expect(mockStoreMemory).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: agent.id,
          type: 'action',
          importance: 5,
          emotionalValence: 0.4,
        })
      );
    });

    test('memory content includes sleep details', async () => {
      const agent = createMockAgent({ energy: 50 });
      const intent = createSleepIntent(2);

      await handleSleep(intent, agent);

      const memoryCall = mockStoreMemory.mock.calls[0][0] as { content: string };
      expect(memoryCall.content).toContain('Slept for 2 tick(s)');
      expect(memoryCall.content).toContain('restored 10 energy');
      expect(memoryCall.content).toContain('Energy now 60');
    });

    test('emits agent_sleeping event', async () => {
      const agent = createMockAgent({ energy: 50 });
      const intent = createSleepIntent(3);

      const result = await handleSleep(intent, agent);

      const sleepingEvent = result.events?.find((e) => e.type === 'agent_sleeping');
      expect(sleepingEvent).toBeDefined();
      expect(sleepingEvent?.payload).toMatchObject({
        duration: 3,
        energyBefore: 50,
        energyAfter: 65,
        energyRestored: 15,
      });
    });
  });

  describe('duration validation', () => {
    test('rejects duration 0', async () => {
      const agent = createMockAgent();
      const intent = createSleepIntent(0);

      const result = await handleSleep(intent, agent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid sleep duration');
      expect(mockStoreMemory).not.toHaveBeenCalled();
    });

    test('rejects negative duration', async () => {
      const agent = createMockAgent();
      const intent = createSleepIntent(-1);

      const result = await handleSleep(intent, agent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid sleep duration');
    });

    test('rejects duration > 10', async () => {
      const agent = createMockAgent();
      const intent = createSleepIntent(11);

      const result = await handleSleep(intent, agent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid sleep duration');
      expect(result.error).toContain('1 and 10');
    });

    test('accepts duration 1 (minimum)', async () => {
      const agent = createMockAgent();
      const intent = createSleepIntent(1);

      const result = await handleSleep(intent, agent);

      expect(result.success).toBe(true);
    });

    test('accepts duration 10 (maximum)', async () => {
      const agent = createMockAgent();
      const intent = createSleepIntent(10);

      const result = await handleSleep(intent, agent);

      expect(result.success).toBe(true);
      expect(result.changes?.energy).toBe(100); // 50 + 50, capped to 100
    });
  });

  describe('state validation', () => {
    test('rejects when already sleeping', async () => {
      const agent = createMockAgent({ state: 'sleeping' });
      const intent = createSleepIntent(1);

      const result = await handleSleep(intent, agent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('already sleeping');
      expect(mockStoreMemory).not.toHaveBeenCalled();
    });

    test('allows sleep when idle', async () => {
      const agent = createMockAgent({ state: 'idle' });
      const intent = createSleepIntent(1);

      const result = await handleSleep(intent, agent);

      expect(result.success).toBe(true);
    });

    test('allows sleep when walking', async () => {
      const agent = createMockAgent({ state: 'walking' });
      const intent = createSleepIntent(1);

      const result = await handleSleep(intent, agent);

      expect(result.success).toBe(true);
    });

    test('allows sleep when working', async () => {
      const agent = createMockAgent({ state: 'working' });
      const intent = createSleepIntent(1);

      const result = await handleSleep(intent, agent);

      expect(result.success).toBe(true);
    });
  });

  describe('edge cases', () => {
    test('handles zero energy', async () => {
      const agent = createMockAgent({ energy: 0 });
      const intent = createSleepIntent(1);

      const result = await handleSleep(intent, agent);

      expect(result.success).toBe(true);
      expect(result.changes?.energy).toBe(5);
    });

    test('handles energy at 99', async () => {
      const agent = createMockAgent({ energy: 99 });
      const intent = createSleepIntent(1);

      const result = await handleSleep(intent, agent);

      expect(result.success).toBe(true);
      expect(result.changes?.energy).toBe(100); // 99 + 5 = 104, capped to 100
    });

    test('memory includes agent position', async () => {
      const agent = createMockAgent({ x: 25, y: 35 });
      const intent = createSleepIntent(1);
      intent.tick = 42;

      await handleSleep(intent, agent);

      expect(mockStoreMemory).toHaveBeenCalledWith(
        expect.objectContaining({
          x: 25,
          y: 35,
          tick: 42,
        })
      );
    });
  });
});

describe('handleWakeUp', () => {
  test('sets state to idle', () => {
    const agent = createMockAgent({ state: 'sleeping' });

    const result = handleWakeUp(agent, 5);

    expect(result.success).toBe(true);
    expect(result.changes?.state).toBe('idle');
  });

  test('emits agent_woke event', () => {
    const agent = createMockAgent({ state: 'sleeping', energy: 75 });

    const result = handleWakeUp(agent, 10);

    const wokeEvent = result.events?.find((e) => e.type === 'agent_woke');
    expect(wokeEvent).toBeDefined();
    expect(wokeEvent?.tick).toBe(10);
    expect(wokeEvent?.payload).toMatchObject({
      finalEnergy: 75,
    });
  });

  test('rejects when not sleeping', () => {
    const agent = createMockAgent({ state: 'idle' });

    const result = handleWakeUp(agent, 5);

    expect(result.success).toBe(false);
    expect(result.error).toContain('not sleeping');
  });

  test('rejects when walking', () => {
    const agent = createMockAgent({ state: 'walking' });

    const result = handleWakeUp(agent, 5);

    expect(result.success).toBe(false);
    expect(result.error).toContain('not sleeping');
  });
});
