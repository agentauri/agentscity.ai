/**
 * Tests for Gather Action Handler
 *
 * Tests cover:
 * - Gather success → creates memory
 * - Gather at depleted spawn → error
 * - Gather wrong resource type → error
 * - Inventory updated correctly
 * - Energy cost applied
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';
import type { Agent, ResourceSpawn } from '../../db/schema';
import type { ActionIntent } from '../../actions/types';
import type { GatherParams } from '../../actions/handlers/gather';

// Mock database calls before importing the module
const mockGetResourceSpawnsAtPosition = mock(() => Promise.resolve([] as ResourceSpawn[]));
const mockHarvestResource = mock(() => Promise.resolve(0));
const mockAddToInventory = mock(() => Promise.resolve());
const mockStoreMemory = mock(() => Promise.resolve({ id: 'test-memory' }));
const mockGetAliveAgents = mock(() => Promise.resolve([] as Agent[]));
const mockCountAgentsAtPosition = mock(() => Promise.resolve(0));

mock.module('../../db/queries/world', () => ({
  getResourceSpawnsAtPosition: mockGetResourceSpawnsAtPosition,
  harvestResource: mockHarvestResource,
}));

mock.module('../../db/queries/inventory', () => ({
  addToInventory: mockAddToInventory,
}));

const mockGetAgentRelationships = mock(() => Promise.resolve([]));

mock.module('../../db/queries/memories', () => ({
  storeMemory: mockStoreMemory,
  getAgentRelationships: mockGetAgentRelationships,
}));

mock.module('../../db/queries/agents', () => ({
  getAliveAgents: mockGetAliveAgents,
  countAgentsAtPosition: mockCountAgentsAtPosition,
}));

// Import after mocking
import { handleGather } from '../../actions/handlers/gather';

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

// Helper to create gather intent
function createGatherIntent(
  params: GatherParams = {},
  agentId = 'test-agent-id'
): ActionIntent<GatherParams> {
  return {
    agentId,
    type: 'gather',
    params,
    tick: 1,
    timestamp: Date.now(),
  };
}

// Helper to create mock resource spawn
function createMockResourceSpawn(overrides: Partial<ResourceSpawn> = {}): ResourceSpawn {
  return {
    id: 'test-spawn-id',
    x: 50,
    y: 50,
    resourceType: 'food',
    currentAmount: 10,
    maxAmount: 20,
    regenRate: 1,
    createdAt: new Date(),
    tenantId: null,
    biome: 'plains',
    discovered: false,
    ...overrides,
  };
}

describe('handleGather', () => {
  beforeEach(() => {
    mockGetResourceSpawnsAtPosition.mockClear();
    mockHarvestResource.mockClear();
    mockAddToInventory.mockClear();
    mockStoreMemory.mockClear();
    mockGetAliveAgents.mockClear();
    mockCountAgentsAtPosition.mockClear();
    // Default: no spawns at position, no other agents (no cooperation bonus)
    mockGetResourceSpawnsAtPosition.mockImplementation(() => Promise.resolve([]));
    mockHarvestResource.mockImplementation(() => Promise.resolve(0));
    mockGetAliveAgents.mockImplementation(() => Promise.resolve([]));
    mockCountAgentsAtPosition.mockImplementation(() => Promise.resolve(0));
  });

  describe('successful gather', () => {
    beforeEach(() => {
      mockGetResourceSpawnsAtPosition.mockImplementation(() =>
        Promise.resolve([createMockResourceSpawn()])
      );
      mockHarvestResource.mockImplementation(() => Promise.resolve(1));
      // Mock having another agent at same position to avoid solo penalty
      // countAgentsAtPosition is local and uses getAliveAgents internally
      mockGetAliveAgents.mockImplementation(() =>
        Promise.resolve([createMockAgent({ id: 'other-agent', x: 50, y: 50 })])
      );
    });

    test('gathers 1 resource by default', async () => {
      const agent = createMockAgent({ energy: 80 });
      const intent = createGatherIntent({});

      const result = await handleGather(intent, agent);

      expect(result.success).toBe(true);
      expect(result.changes?.energy).toBe(79); // -1 energy
    });

    test('gathers specified quantity', async () => {
      mockHarvestResource.mockImplementation(() => Promise.resolve(3));

      const agent = createMockAgent({ energy: 80 });
      const intent = createGatherIntent({ quantity: 3 });

      const result = await handleGather(intent, agent);

      expect(result.success).toBe(true);
      expect(result.changes?.energy).toBe(77); // -3 energy
    });

    test('adds to inventory with correct item type', async () => {
      mockHarvestResource.mockImplementation(() => Promise.resolve(2));

      const agent = createMockAgent();
      const intent = createGatherIntent({ quantity: 2 });

      await handleGather(intent, agent);

      expect(mockAddToInventory).toHaveBeenCalledWith(agent.id, 'food', 2);
    });

    test('converts energy resource to battery item', async () => {
      mockGetResourceSpawnsAtPosition.mockImplementation(() =>
        Promise.resolve([createMockResourceSpawn({ resourceType: 'energy' })])
      );
      mockHarvestResource.mockImplementation(() => Promise.resolve(1));

      const agent = createMockAgent();
      const intent = createGatherIntent({ resourceType: 'energy' });

      await handleGather(intent, agent);

      expect(mockAddToInventory).toHaveBeenCalledWith(agent.id, 'battery', 1);
    });

    test('creates memory on success', async () => {
      const agent = createMockAgent();
      const intent = createGatherIntent({ quantity: 2 });

      await handleGather(intent, agent);

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

    test('memory content includes resource type', async () => {
      mockHarvestResource.mockImplementation(() => Promise.resolve(2));

      const agent = createMockAgent();
      const intent = createGatherIntent({ quantity: 2 });

      await handleGather(intent, agent);

      expect(mockStoreMemory.mock.calls.length).toBeGreaterThan(0);
      const memoryCall = (mockStoreMemory.mock.calls as unknown[][])[0]?.[0] as { content: string } | undefined;
      expect(memoryCall?.content).toContain('Gathered 2x food');
    });

    test('emits agent_gathered event', async () => {
      mockHarvestResource.mockImplementation(() => Promise.resolve(2));

      const agent = createMockAgent({ x: 50, y: 50, energy: 80 });
      const intent = createGatherIntent({ quantity: 2 });

      const result = await handleGather(intent, agent);

      const gatheredEvent = result.events?.find((e) => e.type === 'agent_gathered');
      expect(gatheredEvent).toBeDefined();
      expect(gatheredEvent?.payload).toMatchObject({
        position: { x: 50, y: 50 },
        resourceType: 'food',
        itemType: 'food',
        amountRequested: 2,
        amountGathered: 2,
        energyCost: 2,
        newEnergy: 78,
      });
    });
  });

  describe('quantity validation', () => {
    beforeEach(() => {
      mockGetResourceSpawnsAtPosition.mockImplementation(() =>
        Promise.resolve([createMockResourceSpawn()])
      );
    });

    test('rejects quantity 0', async () => {
      const agent = createMockAgent();
      const intent = createGatherIntent({ quantity: 0 });

      const result = await handleGather(intent, agent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid quantity');
      expect(mockStoreMemory).not.toHaveBeenCalled();
    });

    test('rejects negative quantity', async () => {
      const agent = createMockAgent();
      const intent = createGatherIntent({ quantity: -1 });

      const result = await handleGather(intent, agent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid quantity');
    });

    test('rejects quantity > 5', async () => {
      const agent = createMockAgent();
      const intent = createGatherIntent({ quantity: 6 });

      const result = await handleGather(intent, agent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid quantity');
      expect(result.error).toContain('1 and 5');
    });

    test('accepts quantity 5 (maximum)', async () => {
      mockHarvestResource.mockImplementation(() => Promise.resolve(5));

      const agent = createMockAgent({ energy: 50 });
      const intent = createGatherIntent({ quantity: 5 });

      const result = await handleGather(intent, agent);

      expect(result.success).toBe(true);
    });
  });

  describe('energy requirements', () => {
    beforeEach(() => {
      mockGetResourceSpawnsAtPosition.mockImplementation(() =>
        Promise.resolve([createMockResourceSpawn()])
      );
    });

    test('rejects when not enough energy', async () => {
      const agent = createMockAgent({ energy: 2 }); // Need 3 for quantity 3
      const intent = createGatherIntent({ quantity: 3 });

      const result = await handleGather(intent, agent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Not enough energy');
      expect(result.error).toContain('need 3');
      expect(result.error).toContain('have 2');
      expect(mockStoreMemory).not.toHaveBeenCalled();
    });

    test('succeeds with exactly enough energy', async () => {
      mockHarvestResource.mockImplementation(() => Promise.resolve(3));

      const agent = createMockAgent({ energy: 3 });
      const intent = createGatherIntent({ quantity: 3 });

      const result = await handleGather(intent, agent);

      expect(result.success).toBe(true);
      expect(result.changes?.energy).toBe(0);
    });
  });

  describe('location requirements', () => {
    test('rejects when no resources at position', async () => {
      mockGetResourceSpawnsAtPosition.mockImplementation(() => Promise.resolve([]));

      const agent = createMockAgent({ x: 50, y: 50 });
      const intent = createGatherIntent({});

      const result = await handleGather(intent, agent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No resources at position');
      expect(result.error).toContain('(50, 50)');
      expect(mockStoreMemory).not.toHaveBeenCalled();
    });

    test('queries spawns at correct position', async () => {
      const agent = createMockAgent({ x: 25, y: 35 });
      const intent = createGatherIntent({});

      await handleGather(intent, agent);

      expect(mockGetResourceSpawnsAtPosition).toHaveBeenCalledWith(25, 35);
    });
  });

  describe('resource type filtering', () => {
    test('gathers specified resource type', async () => {
      mockGetResourceSpawnsAtPosition.mockImplementation(() =>
        Promise.resolve([
          createMockResourceSpawn({ resourceType: 'food' }),
          createMockResourceSpawn({ id: 'spawn-2', resourceType: 'energy' }),
        ])
      );
      mockHarvestResource.mockImplementation(() => Promise.resolve(1));

      const agent = createMockAgent();
      const intent = createGatherIntent({ resourceType: 'energy' });

      const result = await handleGather(intent, agent);

      expect(result.success).toBe(true);
      expect(mockHarvestResource).toHaveBeenCalledWith('spawn-2', 1);
    });

    test('rejects when specified resource type not at position', async () => {
      mockGetResourceSpawnsAtPosition.mockImplementation(() =>
        Promise.resolve([createMockResourceSpawn({ resourceType: 'food' })])
      );

      const agent = createMockAgent();
      const intent = createGatherIntent({ resourceType: 'energy' });

      const result = await handleGather(intent, agent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('No energy resource at position');
    });

    test('gathers first available when no type specified', async () => {
      mockGetResourceSpawnsAtPosition.mockImplementation(() =>
        Promise.resolve([
          createMockResourceSpawn({ id: 'first-spawn', resourceType: 'material' }),
          createMockResourceSpawn({ id: 'second-spawn', resourceType: 'food' }),
        ])
      );
      mockHarvestResource.mockImplementation(() => Promise.resolve(1));

      const agent = createMockAgent();
      const intent = createGatherIntent({});

      await handleGather(intent, agent);

      expect(mockHarvestResource).toHaveBeenCalledWith('first-spawn', 1);
    });
  });

  describe('depleted spawn', () => {
    test('rejects when spawn is depleted', async () => {
      mockGetResourceSpawnsAtPosition.mockImplementation(() =>
        Promise.resolve([createMockResourceSpawn({ currentAmount: 0 })])
      );

      const agent = createMockAgent();
      const intent = createGatherIntent({});

      const result = await handleGather(intent, agent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('depleted');
      expect(mockStoreMemory).not.toHaveBeenCalled();
    });
  });

  describe('harvest failure', () => {
    test('rejects when harvest returns 0', async () => {
      mockGetResourceSpawnsAtPosition.mockImplementation(() =>
        Promise.resolve([createMockResourceSpawn()])
      );
      mockHarvestResource.mockImplementation(() => Promise.resolve(0));

      const agent = createMockAgent();
      const intent = createGatherIntent({});

      const result = await handleGather(intent, agent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to gather');
      expect(mockStoreMemory).not.toHaveBeenCalled();
    });
  });

  describe('partial harvest', () => {
    test('handles partial harvest (less than requested)', async () => {
      mockGetResourceSpawnsAtPosition.mockImplementation(() =>
        Promise.resolve([createMockResourceSpawn({ currentAmount: 3 })])
      );
      mockHarvestResource.mockImplementation(() => Promise.resolve(3)); // Only 3 available

      const agent = createMockAgent({ energy: 50 });
      const intent = createGatherIntent({ quantity: 5 }); // Requested 5

      const result = await handleGather(intent, agent);

      expect(result.success).toBe(true);
      // Energy cost based on actual gathered (3), not requested (5)
      expect(result.changes?.energy).toBe(47); // -3 energy
    });
  });
});
