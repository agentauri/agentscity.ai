import { describe, expect, test, beforeEach, afterAll } from 'bun:test';
import { leaveScent, getScentsAt, calculateScentStrength } from '../../world/scent';
import { redis } from '../../cache';

describe('Scent System (Stigmergy)', () => {
  const agentId = 'test-agent-123';
  const pos = { x: 10, y: 10 };

  beforeEach(async () => {
    // Clear relevant keys in redis
    const keys = await redis.keys('world:scent:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
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
