import { describe, expect, test, mock, beforeEach } from 'bun:test';
import { buildObservation } from '../../agents/observer';
import type { Agent, ResourceSpawn, Shelter } from '../../db/schema';
import { leaveScent } from '../../world/scent';
import { redis } from '../../cache';

// Mock DB queries
const mockGetRecentEvents = mock(() => Promise.resolve([]));
const mockGetAgentInventory = mock(() => Promise.resolve([]));
const mockGetRecentMemories = mock(() => Promise.resolve([]));
const mockGetAgentRelationships = mock(() => Promise.resolve([]));
const mockGetKnownAgentsForObserver = mock(() => Promise.resolve([]));
const mockGetNearbyClaims = mock(() => Promise.resolve([]));
const mockGetNearbyNamedLocations = mock(() => Promise.resolve([]));
const mockGetLocationNamesForObserver = mock(() => Promise.resolve([]));
const mockGetRecentSignals = mock(() => Promise.resolve([]));

mock.module('../../db/queries/events', () => ({
  getRecentEvents: mockGetRecentEvents,
  getRecentSignals: mockGetRecentSignals,
}));

mock.module('../../db/queries/inventory', () => ({
  getAgentInventory: mockGetAgentInventory,
}));

mock.module('../../db/queries/memories', () => ({
  getRecentMemories: mockGetRecentMemories,
  getAgentRelationships: mockGetAgentRelationships,
}));

mock.module('../../db/queries/knowledge', () => ({
  getKnownAgentsForObserver: mockGetKnownAgentsForObserver,
}));

mock.module('../../db/queries/claims', () => ({
  getNearbyClaims: mockGetNearbyClaims,
}));

mock.module('../../db/queries/naming', () => ({
  getNearbyNamedLocations: mockGetNearbyNamedLocations,
  getLocationNamesForObserver: mockGetLocationNamesForObserver,
}));

function createMockAgent(id: string, x: number, y: number): Agent {
  return {
    id, llmType: 'claude', x, y, hunger: 100, energy: 100, health: 100, balance: 100,
    state: 'idle', color: '#ff0000', createdAt: new Date(), updatedAt: new Date(),
    diedAt: null, tenantId: null, personality: null
  };
}

describe('Observer Discovery Mechanisms', () => {
  beforeEach(async () => {
    mock.restore();
    const keys = await redis.keys('world:scent:*');
    if (keys.length > 0) await redis.del(...keys);
  });

  test('discovers scents in adjacent cells', async () => {
    const agent = createMockAgent('agent-me', 50, 50);
    // Someone was at (51, 50) recently
    await leaveScent(51, 50, 'other-agent', 5);
    
    const obs = await buildObservation(agent, 10, [agent], [], []);
    
    expect(obs.scents).toBeDefined();
    expect(obs.scents).toHaveLength(1);
    expect(obs.scents![0].x).toBe(51);
    expect(obs.scents![0].strength).toBe('strong');
  });

  test('hears signals from long range', async () => {
    const agent = createMockAgent('agent-me', 50, 50);
    const signalEvent = {
      id: 'evt-1',
      agentId: 'agent-shouter',
      eventType: 'agent_signaled',
      tick: 9,
      payload: {
        message: 'HELP!',
        intensity: 5,
        range: 50,
        x: 80, // 30 tiles away
        y: 50
      }
    };
    
    mockGetRecentSignals.mockImplementation(() => Promise.resolve([signalEvent]));
    
    const obs = await buildObservation(agent, 10, [agent], [], []);
    
    expect(obs.signals).toBeDefined();
    expect(obs.signals).toHaveLength(1);
    expect(obs.signals![0].message).toBe('HELP!');
    expect(obs.signals![0].direction).toBe('east');
    expect(obs.signals![0].intensity).toBe('loud');
  });

  test('sees landmarks at extended radius', async () => {
    const agent = createMockAgent('agent-me', 50, 50);
    // Standard visibility is 10, landmark visibility is 25
    
    const obs = await buildObservation(agent, 10, [agent], [], []);
    
    // Check that queries were called with extended radius (25)
    expect(mockGetNearbyClaims).toHaveBeenCalledWith(50, 50, 25);
    expect(mockGetNearbyNamedLocations).toHaveBeenCalledWith(50, 50, 25);
  });
});
