/**
 * Tests for Buy Action Handler
 *
 * Tests cover:
 * - Buy at shelter → creates memory
 * - Buy without funds → error
 * - Buy not at shelter → error
 * - Inventory updated
 * - Balance deducted
 */

import { describe, expect, test, mock, beforeEach, afterEach } from 'bun:test';
import type { Agent, Shelter } from '../../db/schema';
import type { ActionIntent, BuyParams } from '../../actions/types';

// Mock database calls before importing the module
const mockAddToInventory = mock(() => Promise.resolve());
const mockGetSheltersAtPosition = mock(() => Promise.resolve([] as Shelter[]));
const mockStoreMemory = mock(() => Promise.resolve({ id: 'test-memory' }));

mock.module('../../db/queries/inventory', () => ({
  addToInventory: mockAddToInventory,
}));

mock.module('../../db/queries/world', () => ({
  getSheltersAtPosition: mockGetSheltersAtPosition,
}));

const mockGetAgentRelationships = mock(() => Promise.resolve([]));

mock.module('../../db/queries/memories', () => ({
  storeMemory: mockStoreMemory,
  getAgentRelationships: mockGetAgentRelationships,
}));

// Import after mocking
import { handleBuy } from '../../actions/handlers/buy';

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

// Helper to create buy intent
function createBuyIntent(
  itemType: string,
  quantity = 1,
  agentId = 'test-agent-id'
): ActionIntent<BuyParams> {
  return {
    agentId,
    type: 'buy',
    params: { itemType, quantity },
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
    createdAt: new Date(),
    tenantId: null,
    ownerAgentId: null,
    ...overrides,
  };
}

describe('handleBuy', () => {
  // Store original Math.random
  const originalRandom = Math.random;

  beforeEach(() => {
    mockAddToInventory.mockClear();
    mockGetSheltersAtPosition.mockClear();
    mockStoreMemory.mockClear();
    // Default: no shelter at position
    mockGetSheltersAtPosition.mockImplementation(() => Promise.resolve([]));
    // Mock Math.random to always return 1.0 (so transaction never fails)
    Math.random = () => 1.0;
  });

  afterEach(() => {
    // Restore original Math.random
    Math.random = originalRandom;
  });

  describe('successful purchase', () => {
    beforeEach(() => {
      mockGetSheltersAtPosition.mockImplementation(() =>
        Promise.resolve([createMockShelter()])
      );
    });

    test('buys food for 10 CITY', async () => {
      const agent = createMockAgent({ balance: 100 });
      const intent = createBuyIntent('food', 1);

      const result = await handleBuy(intent, agent);

      expect(result.success).toBe(true);
      expect(result.changes?.balance).toBe(90); // 100 - 10
    });

    test('buys water for 5 CITY', async () => {
      const agent = createMockAgent({ balance: 100 });
      const intent = createBuyIntent('water', 1);

      const result = await handleBuy(intent, agent);

      expect(result.success).toBe(true);
      expect(result.changes?.balance).toBe(95); // 100 - 5
    });

    test('buys medicine for 20 CITY', async () => {
      const agent = createMockAgent({ balance: 100 });
      const intent = createBuyIntent('medicine', 1);

      const result = await handleBuy(intent, agent);

      expect(result.success).toBe(true);
      expect(result.changes?.balance).toBe(80); // 100 - 20
    });

    test('buys tool for 30 CITY', async () => {
      const agent = createMockAgent({ balance: 100 });
      const intent = createBuyIntent('tool', 1);

      const result = await handleBuy(intent, agent);

      expect(result.success).toBe(true);
      expect(result.changes?.balance).toBe(70); // 100 - 30
    });

    test('buys multiple items', async () => {
      const agent = createMockAgent({ balance: 100 });
      const intent = createBuyIntent('food', 3);

      const result = await handleBuy(intent, agent);

      expect(result.success).toBe(true);
      expect(result.changes?.balance).toBe(70); // 100 - (10 * 3)
    });

    test('adds items to inventory', async () => {
      const agent = createMockAgent();
      const intent = createBuyIntent('food', 2);

      await handleBuy(intent, agent);

      expect(mockAddToInventory).toHaveBeenCalledWith(agent.id, 'food', 2);
    });

    test('creates memory on success', async () => {
      const agent = createMockAgent({ balance: 100 });
      const intent = createBuyIntent('food', 2);

      await handleBuy(intent, agent);

      expect(mockStoreMemory).toHaveBeenCalledTimes(1);
      expect(mockStoreMemory).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: agent.id,
          type: 'action',
          importance: 4,
          emotionalValence: 0.1, // 0.1 when no trust discount, 0.3 with discount
        })
      );
    });

    test('memory content includes purchase details', async () => {
      const agent = createMockAgent({ balance: 100 });
      const intent = createBuyIntent('food', 2);

      await handleBuy(intent, agent);

      expect(mockStoreMemory.mock.calls.length).toBeGreaterThan(0);
      const memoryCall = (mockStoreMemory.mock.calls as unknown[][])[0]?.[0] as { content: string } | undefined;
      expect(memoryCall?.content).toContain('Bought 2x food');
      expect(memoryCall?.content).toContain('20 CITY');
      expect(memoryCall?.content).toContain('Balance now 80');
    });

    test('emits agent_bought event', async () => {
      const agent = createMockAgent({ balance: 100 });
      const intent = createBuyIntent('food', 2);

      const result = await handleBuy(intent, agent);

      const boughtEvent = result.events?.find((e) => e.type === 'agent_bought');
      expect(boughtEvent).toBeDefined();
      expect(boughtEvent?.payload).toMatchObject({
        itemType: 'food',
        quantity: 2,
        unitPrice: 10,
        totalCost: 20,
        newBalance: 80,
      });
    });

    test('emits balance_changed event', async () => {
      const agent = createMockAgent({ balance: 100 });
      const intent = createBuyIntent('water', 1);

      const result = await handleBuy(intent, agent);

      const balanceEvent = result.events?.find((e) => e.type === 'balance_changed');
      expect(balanceEvent).toBeDefined();
      expect(balanceEvent?.payload).toMatchObject({
        previousBalance: 100,
        newBalance: 95,
        change: -5,
        reason: 'Bought 1x water',
      });
    });
  });

  describe('balance validation', () => {
    beforeEach(() => {
      mockGetSheltersAtPosition.mockImplementation(() =>
        Promise.resolve([createMockShelter()])
      );
    });

    test('rejects when not enough money for single item', async () => {
      const agent = createMockAgent({ balance: 5 });
      const intent = createBuyIntent('food', 1); // Costs 10

      const result = await handleBuy(intent, agent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Not enough money');
      expect(result.error).toContain('need 10');
      expect(result.error).toContain('have 5');
      expect(mockStoreMemory).not.toHaveBeenCalled();
    });

    test('rejects when not enough money for multiple items', async () => {
      const agent = createMockAgent({ balance: 25 });
      const intent = createBuyIntent('food', 3); // Costs 30

      const result = await handleBuy(intent, agent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('need 30');
    });

    test('succeeds with exactly enough money', async () => {
      const agent = createMockAgent({ balance: 10 });
      const intent = createBuyIntent('food', 1);

      const result = await handleBuy(intent, agent);

      expect(result.success).toBe(true);
      expect(result.changes?.balance).toBe(0);
    });

    test('rejects when balance is 0', async () => {
      const agent = createMockAgent({ balance: 0 });
      const intent = createBuyIntent('water', 1);

      const result = await handleBuy(intent, agent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Not enough money');
    });
  });

  describe('location requirements', () => {
    test('rejects when not at shelter', async () => {
      mockGetSheltersAtPosition.mockImplementation(() => Promise.resolve([]));

      const agent = createMockAgent({ x: 50, y: 50, balance: 100 });
      const intent = createBuyIntent('food', 1);

      const result = await handleBuy(intent, agent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Must be at a shelter');
      expect(result.error).toContain('(50, 50)');
      expect(mockStoreMemory).not.toHaveBeenCalled();
    });

    test('queries shelters at correct position', async () => {
      const agent = createMockAgent({ x: 25, y: 35 });
      const intent = createBuyIntent('food', 1);

      await handleBuy(intent, agent);

      expect(mockGetSheltersAtPosition).toHaveBeenCalledWith(25, 35);
    });

    test('succeeds at shelter', async () => {
      mockGetSheltersAtPosition.mockImplementation(() =>
        Promise.resolve([createMockShelter({ x: 30, y: 30 })])
      );

      const agent = createMockAgent({ x: 30, y: 30, balance: 100 });
      const intent = createBuyIntent('food', 1);

      const result = await handleBuy(intent, agent);

      expect(result.success).toBe(true);
    });
  });

  describe('item type validation', () => {
    beforeEach(() => {
      mockGetSheltersAtPosition.mockImplementation(() =>
        Promise.resolve([createMockShelter()])
      );
    });

    test('rejects unknown item type', async () => {
      const agent = createMockAgent({ balance: 100 });
      const intent = createBuyIntent('unknown', 1);

      const result = await handleBuy(intent, agent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown item type');
      expect(result.error).toContain('unknown');
      expect(mockStoreMemory).not.toHaveBeenCalled();
    });

    test('item type check happens before balance check', async () => {
      const agent = createMockAgent({ balance: 1000 });
      const intent = createBuyIntent('rocket', 1);

      const result = await handleBuy(intent, agent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown item type');
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      mockGetSheltersAtPosition.mockImplementation(() =>
        Promise.resolve([createMockShelter()])
      );
    });

    test('default quantity is 1', async () => {
      const agent = createMockAgent({ balance: 100 });
      const intent: ActionIntent<BuyParams> = {
        agentId: agent.id,
        type: 'buy',
        params: { itemType: 'food' }, // No quantity specified
        tick: 1,
        timestamp: Date.now(),
      };

      const result = await handleBuy(intent, agent);

      expect(result.success).toBe(true);
      expect(result.changes?.balance).toBe(90); // 100 - 10 (1 food)
    });

    test('handles large quantity purchase', async () => {
      const agent = createMockAgent({ balance: 1000 });
      const intent = createBuyIntent('food', 100);

      const result = await handleBuy(intent, agent);

      expect(result.success).toBe(true);
      expect(result.changes?.balance).toBe(0); // 1000 - 1000
      expect(mockAddToInventory).toHaveBeenCalledWith(agent.id, 'food', 100);
    });

    test('memory includes shelter position in metadata', async () => {
      const agent = createMockAgent({ x: 25, y: 35 });
      const intent = createBuyIntent('food', 1);

      await handleBuy(intent, agent);

      expect(mockStoreMemory.mock.calls.length).toBeGreaterThan(0);
      const memoryCall = (mockStoreMemory.mock.calls as unknown[][])[0]?.[0] as { x: number; y: number } | undefined;
      // Position is stored in memory metadata, not in content string
      expect(memoryCall?.x).toBe(25);
      expect(memoryCall?.y).toBe(35);
    });
  });
});
