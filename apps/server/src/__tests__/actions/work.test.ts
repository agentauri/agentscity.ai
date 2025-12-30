/**
 * Tests for Work Action Handler
 *
 * Tests cover:
 * - Work success at shelter → creates memory
 * - Work fail (no shelter) → no memory
 * - Work fail (no energy) → no memory
 * - Duration validation (1-5 ticks)
 * - Balance update correct
 * - Energy cost correct
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';
import type { Agent, Shelter } from '../../db/schema';
import type { ActionIntent, WorkParams } from '../../actions/types';

// Mock database calls before importing the module
const mockGetSheltersAtPosition = mock(() => Promise.resolve([]));
const mockStoreMemory = mock(() => Promise.resolve({ id: 'test-memory' }));

mock.module('../../db/queries/world', () => ({
  getSheltersAtPosition: mockGetSheltersAtPosition,
}));

mock.module('../../db/queries/memories', () => ({
  storeMemory: mockStoreMemory,
}));

// Import after mocking
import { handleWork } from '../../actions/handlers/work';

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
    ...overrides,
  };
}

// Helper to create work intent
function createWorkIntent(duration = 1, agentId = 'test-agent-id'): ActionIntent<WorkParams> {
  return {
    agentId,
    type: 'work',
    params: { duration },
    tick: 1,
    timestamp: Date.now(),
  };
}

// Helper to create mock shelter
function createMockShelter(overrides: Partial<Shelter> = {}): Shelter {
  return {
    id: 'test-shelter-id',
    x: 50,
    y: 50,
    canSleep: true,
    ...overrides,
  };
}

describe('handleWork', () => {
  beforeEach(() => {
    mockGetSheltersAtPosition.mockClear();
    mockStoreMemory.mockClear();
    // Default: no shelter at position
    mockGetSheltersAtPosition.mockImplementation(() => Promise.resolve([]));
  });

  describe('successful work', () => {
    beforeEach(() => {
      // Setup shelter at agent position
      mockGetSheltersAtPosition.mockImplementation(() =>
        Promise.resolve([createMockShelter()])
      );
    });

    test('works for 1 tick and earns 10 CITY', async () => {
      const agent = createMockAgent({ balance: 100, energy: 80 });
      const intent = createWorkIntent(1);

      const result = await handleWork(intent, agent);

      expect(result.success).toBe(true);
      expect(result.changes?.balance).toBe(110); // +10 CITY
      expect(result.changes?.energy).toBe(78); // -2 energy
    });

    test('works for multiple ticks', async () => {
      const agent = createMockAgent({ balance: 100, energy: 80 });
      const intent = createWorkIntent(3);

      const result = await handleWork(intent, agent);

      expect(result.success).toBe(true);
      expect(result.changes?.balance).toBe(130); // +30 CITY (10 * 3)
      expect(result.changes?.energy).toBe(74); // -6 energy (2 * 3)
    });

    test('works for max duration (5 ticks)', async () => {
      const agent = createMockAgent({ balance: 0, energy: 50 });
      const intent = createWorkIntent(5);

      const result = await handleWork(intent, agent);

      expect(result.success).toBe(true);
      expect(result.changes?.balance).toBe(50); // +50 CITY (10 * 5)
      expect(result.changes?.energy).toBe(40); // -10 energy (2 * 5)
    });

    test('creates memory on success', async () => {
      const agent = createMockAgent({ balance: 100, energy: 80 });
      const intent = createWorkIntent(2);

      await handleWork(intent, agent);

      expect(mockStoreMemory).toHaveBeenCalledTimes(1);
      expect(mockStoreMemory).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: agent.id,
          type: 'action',
          importance: 4,
          emotionalValence: 0.3,
          x: agent.x,
          y: agent.y,
          tick: intent.tick,
        })
      );
    });

    test('memory content includes earnings', async () => {
      const agent = createMockAgent({ balance: 100, energy: 80 });
      const intent = createWorkIntent(2);

      await handleWork(intent, agent);

      const memoryCall = mockStoreMemory.mock.calls[0][0] as { content: string };
      expect(memoryCall.content).toContain('Worked for 2 tick(s)');
      expect(memoryCall.content).toContain('20 CITY');
      expect(memoryCall.content).toContain('Balance now 120');
    });

    test('emits agent_worked event', async () => {
      const agent = createMockAgent({ balance: 100, energy: 80 });
      const intent = createWorkIntent(2);

      const result = await handleWork(intent, agent);

      const workedEvent = result.events?.find((e) => e.type === 'agent_worked');
      expect(workedEvent).toBeDefined();
      expect(workedEvent?.payload).toMatchObject({
        duration: 2,
        salary: 20,
        energyCost: 4,
        newBalance: 120,
        newEnergy: 76,
      });
    });

    test('emits balance_changed event', async () => {
      const agent = createMockAgent({ balance: 100, energy: 80 });
      const intent = createWorkIntent(1);

      const result = await handleWork(intent, agent);

      const balanceEvent = result.events?.find((e) => e.type === 'balance_changed');
      expect(balanceEvent).toBeDefined();
      expect(balanceEvent?.payload).toMatchObject({
        previousBalance: 100,
        newBalance: 110,
        change: 10,
      });
    });
  });

  describe('duration validation', () => {
    beforeEach(() => {
      mockGetSheltersAtPosition.mockImplementation(() =>
        Promise.resolve([createMockShelter()])
      );
    });

    test('rejects duration 0', async () => {
      const agent = createMockAgent();
      const intent = createWorkIntent(0);

      const result = await handleWork(intent, agent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid work duration');
      expect(mockStoreMemory).not.toHaveBeenCalled();
    });

    test('rejects negative duration', async () => {
      const agent = createMockAgent();
      const intent = createWorkIntent(-1);

      const result = await handleWork(intent, agent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid work duration');
    });

    test('rejects duration > 5', async () => {
      const agent = createMockAgent();
      const intent = createWorkIntent(6);

      const result = await handleWork(intent, agent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid work duration');
      expect(result.error).toContain('1 and 5');
    });

    test('accepts duration 1 (minimum)', async () => {
      const agent = createMockAgent();
      const intent = createWorkIntent(1);

      const result = await handleWork(intent, agent);

      expect(result.success).toBe(true);
    });

    test('accepts duration 5 (maximum)', async () => {
      const agent = createMockAgent({ energy: 50 });
      const intent = createWorkIntent(5);

      const result = await handleWork(intent, agent);

      expect(result.success).toBe(true);
    });
  });

  describe('state validation', () => {
    beforeEach(() => {
      mockGetSheltersAtPosition.mockImplementation(() =>
        Promise.resolve([createMockShelter()])
      );
    });

    test('rejects work while sleeping', async () => {
      const agent = createMockAgent({ state: 'sleeping' });
      const intent = createWorkIntent(1);

      const result = await handleWork(intent, agent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('sleeping');
      expect(mockStoreMemory).not.toHaveBeenCalled();
    });

    test('allows work when idle', async () => {
      const agent = createMockAgent({ state: 'idle' });
      const intent = createWorkIntent(1);

      const result = await handleWork(intent, agent);

      expect(result.success).toBe(true);
    });

    test('allows work when walking', async () => {
      const agent = createMockAgent({ state: 'walking' });
      const intent = createWorkIntent(1);

      const result = await handleWork(intent, agent);

      expect(result.success).toBe(true);
    });
  });

  describe('energy requirements', () => {
    beforeEach(() => {
      mockGetSheltersAtPosition.mockImplementation(() =>
        Promise.resolve([createMockShelter()])
      );
    });

    test('rejects when not enough energy for 1 tick', async () => {
      const agent = createMockAgent({ energy: 1 }); // Need 2 for 1 tick
      const intent = createWorkIntent(1);

      const result = await handleWork(intent, agent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Not enough energy');
      expect(result.error).toContain('need 2');
      expect(result.error).toContain('have 1');
      expect(mockStoreMemory).not.toHaveBeenCalled();
    });

    test('succeeds with exactly enough energy', async () => {
      const agent = createMockAgent({ energy: 2 }); // Exactly 2 for 1 tick
      const intent = createWorkIntent(1);

      const result = await handleWork(intent, agent);

      expect(result.success).toBe(true);
      expect(result.changes?.energy).toBe(0);
    });

    test('rejects when not enough energy for longer duration', async () => {
      const agent = createMockAgent({ energy: 8 }); // Need 10 for 5 ticks
      const intent = createWorkIntent(5);

      const result = await handleWork(intent, agent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('need 10');
    });

    test('calculates energy cost correctly for each duration', async () => {
      const testCases = [
        { duration: 1, expectedCost: 2 },
        { duration: 2, expectedCost: 4 },
        { duration: 3, expectedCost: 6 },
        { duration: 4, expectedCost: 8 },
        { duration: 5, expectedCost: 10 },
      ];

      for (const { duration, expectedCost } of testCases) {
        const agent = createMockAgent({ energy: 50 });
        const intent = createWorkIntent(duration);

        const result = await handleWork(intent, agent);

        expect(result.success).toBe(true);
        expect(result.changes?.energy).toBe(50 - expectedCost);
      }
    });
  });

  describe('location requirements', () => {
    test('rejects when not at shelter', async () => {
      mockGetSheltersAtPosition.mockImplementation(() => Promise.resolve([]));

      const agent = createMockAgent({ x: 50, y: 50 });
      const intent = createWorkIntent(1);

      const result = await handleWork(intent, agent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Must be at a shelter');
      expect(result.error).toContain('(50, 50)');
      expect(mockStoreMemory).not.toHaveBeenCalled();
    });

    test('succeeds at shelter', async () => {
      mockGetSheltersAtPosition.mockImplementation(() =>
        Promise.resolve([createMockShelter({ x: 30, y: 30 })])
      );

      const agent = createMockAgent({ x: 30, y: 30 });
      const intent = createWorkIntent(1);

      const result = await handleWork(intent, agent);

      expect(result.success).toBe(true);
    });

    test('queries shelters at correct position', async () => {
      const agent = createMockAgent({ x: 25, y: 35 });
      const intent = createWorkIntent(1);

      await handleWork(intent, agent);

      expect(mockGetSheltersAtPosition).toHaveBeenCalledWith(25, 35);
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      mockGetSheltersAtPosition.mockImplementation(() =>
        Promise.resolve([createMockShelter()])
      );
    });

    test('handles zero balance', async () => {
      const agent = createMockAgent({ balance: 0 });
      const intent = createWorkIntent(1);

      const result = await handleWork(intent, agent);

      expect(result.success).toBe(true);
      expect(result.changes?.balance).toBe(10);
    });

    test('handles very high balance', async () => {
      const agent = createMockAgent({ balance: 99990 });
      const intent = createWorkIntent(1);

      const result = await handleWork(intent, agent);

      expect(result.success).toBe(true);
      expect(result.changes?.balance).toBe(100000);
    });

    test('default duration is 1 when not specified', async () => {
      const agent = createMockAgent();
      const intent: ActionIntent<WorkParams> = {
        agentId: agent.id,
        type: 'work',
        params: {}, // No duration specified
        tick: 1,
        timestamp: Date.now(),
      };

      const result = await handleWork(intent, agent);

      expect(result.success).toBe(true);
      expect(result.changes?.balance).toBe(110); // 10 CITY for 1 tick
    });
  });
});
