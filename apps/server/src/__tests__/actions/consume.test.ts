/**
 * Tests for Consume Action Handler
 *
 * Tests cover:
 * - Consume food → hunger restored + memory
 * - Consume medicine → health restored + memory
 * - Consume without item → error
 * - Effect calculation correct
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';
import type { Agent } from '../../db/schema';
import type { ActionIntent, ConsumeParams } from '../../actions/types';

// Mock database calls before importing the module
const mockGetInventoryItem = mock(() => Promise.resolve(null));
const mockRemoveFromInventory = mock(() => Promise.resolve());
const mockStoreMemory = mock(() => Promise.resolve({ id: 'test-memory' }));

mock.module('../../db/queries/inventory', () => ({
  getInventoryItem: mockGetInventoryItem,
  removeFromInventory: mockRemoveFromInventory,
}));

mock.module('../../db/queries/memories', () => ({
  storeMemory: mockStoreMemory,
}));

// Import after mocking
import { handleConsume } from '../../actions/handlers/consume';

// Helper to create mock agent
function createMockAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'test-agent-id',
    llmType: 'claude',
    x: 50,
    y: 50,
    hunger: 50,
    energy: 50,
    health: 50,
    balance: 100,
    state: 'idle',
    color: '#ff0000',
    createdAt: new Date(),
    updatedAt: new Date(),
    diedAt: null,
    ...overrides,
  };
}

// Helper to create consume intent
function createConsumeIntent(itemType: string, agentId = 'test-agent-id'): ActionIntent<ConsumeParams> {
  return {
    agentId,
    type: 'consume',
    params: { itemType },
    tick: 1,
    timestamp: Date.now(),
  };
}

describe('handleConsume', () => {
  beforeEach(() => {
    mockGetInventoryItem.mockClear();
    mockRemoveFromInventory.mockClear();
    mockStoreMemory.mockClear();
    // Default: no item in inventory
    mockGetInventoryItem.mockImplementation(() => Promise.resolve(null));
  });

  describe('consume food', () => {
    beforeEach(() => {
      mockGetInventoryItem.mockImplementation(() =>
        Promise.resolve({ agentId: 'test-agent-id', itemType: 'food', quantity: 5 })
      );
    });

    test('restores 30 hunger when consuming food', async () => {
      const agent = createMockAgent({ hunger: 50 });
      const intent = createConsumeIntent('food');

      const result = await handleConsume(intent, agent);

      expect(result.success).toBe(true);
      expect(result.changes?.hunger).toBe(80); // 50 + 30
    });

    test('caps hunger at 100', async () => {
      const agent = createMockAgent({ hunger: 85 });
      const intent = createConsumeIntent('food');

      const result = await handleConsume(intent, agent);

      expect(result.success).toBe(true);
      expect(result.changes?.hunger).toBe(100); // 85 + 30 = 115, capped to 100
    });

    test('removes food from inventory', async () => {
      const agent = createMockAgent();
      const intent = createConsumeIntent('food');

      await handleConsume(intent, agent);

      expect(mockRemoveFromInventory).toHaveBeenCalledWith(agent.id, 'food', 1);
    });

    test('creates memory with effect description', async () => {
      const agent = createMockAgent();
      const intent = createConsumeIntent('food');

      await handleConsume(intent, agent);

      expect(mockStoreMemory).toHaveBeenCalledTimes(1);
      const memoryCall = mockStoreMemory.mock.calls[0][0] as { content: string };
      expect(memoryCall.content).toContain('Consumed food');
      expect(memoryCall.content).toContain('hunger +30');
    });

    test('emits agent_consumed event with correct state changes', async () => {
      const agent = createMockAgent({ hunger: 50, energy: 60, health: 70 });
      const intent = createConsumeIntent('food');

      const result = await handleConsume(intent, agent);

      const consumedEvent = result.events?.find((e) => e.type === 'agent_consumed');
      expect(consumedEvent).toBeDefined();
      expect(consumedEvent?.payload).toMatchObject({
        itemType: 'food',
        effects: { hunger: 30 },
        previousState: { hunger: 50, energy: 60, health: 70 },
        newState: { hunger: 80, energy: 60, health: 70 },
      });
    });
  });

  describe('consume water', () => {
    beforeEach(() => {
      mockGetInventoryItem.mockImplementation(() =>
        Promise.resolve({ agentId: 'test-agent-id', itemType: 'water', quantity: 3 })
      );
    });

    test('restores 10 energy when consuming water', async () => {
      const agent = createMockAgent({ energy: 50 });
      const intent = createConsumeIntent('water');

      const result = await handleConsume(intent, agent);

      expect(result.success).toBe(true);
      expect(result.changes?.energy).toBe(60); // 50 + 10
    });

    test('caps energy at 100', async () => {
      const agent = createMockAgent({ energy: 95 });
      const intent = createConsumeIntent('water');

      const result = await handleConsume(intent, agent);

      expect(result.success).toBe(true);
      expect(result.changes?.energy).toBe(100); // 95 + 10 = 105, capped to 100
    });

    test('creates memory with energy effect', async () => {
      const agent = createMockAgent();
      const intent = createConsumeIntent('water');

      await handleConsume(intent, agent);

      const memoryCall = mockStoreMemory.mock.calls[0][0] as { content: string };
      expect(memoryCall.content).toContain('energy +10');
    });
  });

  describe('consume medicine', () => {
    beforeEach(() => {
      mockGetInventoryItem.mockImplementation(() =>
        Promise.resolve({ agentId: 'test-agent-id', itemType: 'medicine', quantity: 2 })
      );
    });

    test('restores 30 health when consuming medicine', async () => {
      const agent = createMockAgent({ health: 50 });
      const intent = createConsumeIntent('medicine');

      const result = await handleConsume(intent, agent);

      expect(result.success).toBe(true);
      expect(result.changes?.health).toBe(80); // 50 + 30
    });

    test('caps health at 100', async () => {
      const agent = createMockAgent({ health: 90 });
      const intent = createConsumeIntent('medicine');

      const result = await handleConsume(intent, agent);

      expect(result.success).toBe(true);
      expect(result.changes?.health).toBe(100); // 90 + 30 = 120, capped to 100
    });

    test('creates memory with health effect', async () => {
      const agent = createMockAgent();
      const intent = createConsumeIntent('medicine');

      await handleConsume(intent, agent);

      const memoryCall = mockStoreMemory.mock.calls[0][0] as { content: string };
      expect(memoryCall.content).toContain('health +30');
    });
  });

  describe('inventory validation', () => {
    test('rejects when item not in inventory', async () => {
      mockGetInventoryItem.mockImplementation(() => Promise.resolve(null));

      const agent = createMockAgent();
      const intent = createConsumeIntent('food');

      const result = await handleConsume(intent, agent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No food in inventory');
      expect(mockStoreMemory).not.toHaveBeenCalled();
    });

    test('rejects when item quantity is 0', async () => {
      mockGetInventoryItem.mockImplementation(() =>
        Promise.resolve({ agentId: 'test-agent-id', itemType: 'food', quantity: 0 })
      );

      const agent = createMockAgent();
      const intent = createConsumeIntent('food');

      const result = await handleConsume(intent, agent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No food in inventory');
    });

    test('queries correct item from inventory', async () => {
      const agent = createMockAgent();
      const intent = createConsumeIntent('medicine');

      await handleConsume(intent, agent);

      expect(mockGetInventoryItem).toHaveBeenCalledWith(agent.id, 'medicine');
    });
  });

  describe('invalid item types', () => {
    test('rejects unknown item type', async () => {
      mockGetInventoryItem.mockImplementation(() =>
        Promise.resolve({ agentId: 'test-agent-id', itemType: 'rock', quantity: 5 })
      );

      const agent = createMockAgent();
      const intent = createConsumeIntent('rock');

      const result = await handleConsume(intent, agent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('cannot be consumed');
      expect(mockStoreMemory).not.toHaveBeenCalled();
    });

    test('rejects tool item (no consume effects)', async () => {
      const agent = createMockAgent();
      const intent = createConsumeIntent('tool');

      const result = await handleConsume(intent, agent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('cannot be consumed');
    });
  });

  describe('memory creation', () => {
    beforeEach(() => {
      mockGetInventoryItem.mockImplementation(() =>
        Promise.resolve({ agentId: 'test-agent-id', itemType: 'food', quantity: 5 })
      );
    });

    test('creates memory with correct metadata', async () => {
      const agent = createMockAgent({ x: 25, y: 35 });
      const intent = createConsumeIntent('food');
      intent.tick = 42;

      await handleConsume(intent, agent);

      expect(mockStoreMemory).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: agent.id,
          type: 'action',
          importance: 6,
          emotionalValence: 0.5,
          x: 25,
          y: 35,
          tick: 42,
        })
      );
    });

    test('memory contains feeling better text', async () => {
      const agent = createMockAgent();
      const intent = createConsumeIntent('food');

      await handleConsume(intent, agent);

      const memoryCall = mockStoreMemory.mock.calls[0][0] as { content: string };
      expect(memoryCall.content).toContain('Feeling better');
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      mockGetInventoryItem.mockImplementation(() =>
        Promise.resolve({ agentId: 'test-agent-id', itemType: 'food', quantity: 1 })
      );
    });

    test('handles consuming last item', async () => {
      const agent = createMockAgent();
      const intent = createConsumeIntent('food');

      const result = await handleConsume(intent, agent);

      expect(result.success).toBe(true);
      expect(mockRemoveFromInventory).toHaveBeenCalledWith(agent.id, 'food', 1);
    });

    test('only removes 1 item regardless of quantity in inventory', async () => {
      mockGetInventoryItem.mockImplementation(() =>
        Promise.resolve({ agentId: 'test-agent-id', itemType: 'food', quantity: 100 })
      );

      const agent = createMockAgent();
      const intent = createConsumeIntent('food');

      await handleConsume(intent, agent);

      expect(mockRemoveFromInventory).toHaveBeenCalledWith(agent.id, 'food', 1);
    });

    test('handles zero needs values', async () => {
      const agent = createMockAgent({ hunger: 0 });
      const intent = createConsumeIntent('food');

      const result = await handleConsume(intent, agent);

      expect(result.success).toBe(true);
      expect(result.changes?.hunger).toBe(30); // 0 + 30
    });
  });
});
