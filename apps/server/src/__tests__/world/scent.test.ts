import { describe, expect, test, beforeEach, mock } from 'bun:test';

// In-memory store for mocking Redis
let scentStore: Map<string, string> = new Map();

// Mock Redis BEFORE importing scent module
const mockRedisSetex = mock(async (key: string, _ttl: number, value: string) => {
  scentStore.set(key, value);
  return 'OK';
});

const mockRedisMget = mock(async (...keys: string[]) => {
  return keys.map(key => scentStore.get(key) ?? null);
});

const mockRedisKeys = mock(async (pattern: string) => {
  const prefix = pattern.replace('*', '');
  return Array.from(scentStore.keys()).filter(k => k.startsWith(prefix));
});

const mockRedisDel = mock(async (...keys: string[]) => {
  keys.forEach(k => scentStore.delete(k));
  return keys.length;
});

mock.module('../../cache', () => ({
  redis: {
    setex: mockRedisSetex,
    mget: mockRedisMget,
    keys: mockRedisKeys,
    del: mockRedisDel,
  },
  checkRedisConnection: () => Promise.resolve(true),
}));

// Import AFTER mocking
import { leaveScent, getScentsAt, calculateScentStrength } from '../../world/scent';

describe('Scent System (Stigmergy)', () => {
  const agentId = 'test-agent-123';
  const pos = { x: 10, y: 10 };

  beforeEach(() => {
    // Clear in-memory store
    scentStore = new Map();
    mockRedisSetex.mockClear();
    mockRedisMget.mockClear();
    mockRedisKeys.mockClear();
    mockRedisDel.mockClear();
  });

  test('leaveScent stores data in Redis', async () => {
    await leaveScent(pos.x, pos.y, agentId, 100);

    const scents = await getScentsAt([pos]);
    expect(scents).toHaveLength(1);
    expect(scents[0].agentId).toBe(agentId);
    expect(scents[0].tick).toBe(100);
  });

  test('getScentsAt retrieves multiple locations', async () => {
    await leaveScent(10, 10, 'agent1', 100);
    await leaveScent(11, 11, 'agent2', 105);

    const scents = await getScentsAt([{ x: 10, y: 10 }, { x: 11, y: 11 }, { x: 12, y: 12 }]);
    expect(scents).toHaveLength(2);
    expect(scents.find(s => s.x === 10)?.agentId).toBe('agent1');
    expect(scents.find(s => s.x === 11)?.agentId).toBe('agent2');
  });

  test('calculateScentStrength returns correct labels based on age', () => {
    // Assuming scentDurationTicks is 20 (default)
    expect(calculateScentStrength(100, 101)).toBe('strong');
    expect(calculateScentStrength(100, 110)).toBe('weak');
    expect(calculateScentStrength(100, 118)).toBe('faint');
  });
});
