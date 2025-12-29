/**
 * Tests for Move Action Handler
 *
 * Tests movement logic including:
 * - Valid moves to adjacent positions
 * - Invalid position rejection
 * - Energy cost calculation
 * - Path calculation for distant destinations
 */

import { describe, expect, test } from 'bun:test';
import { handleMove } from '../../actions/handlers/move';
import type { ActionIntent, MoveParams } from '../../actions/types';
import type { Agent } from '../../db/schema';

// Helper to create mock agent
function createMockAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'test-agent-id',
    llmType: 'claude',
    x: 50,
    y: 50,
    hunger: 80,
    energy: 100,
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

// Helper to create move intent
function createMoveIntent(toX: number, toY: number, agentId = 'test-agent-id'): ActionIntent<MoveParams> {
  return {
    agentId,
    type: 'move',
    params: { toX, toY },
    tick: 1,
    timestamp: Date.now(),
  };
}

describe('handleMove', () => {
  describe('successful moves', () => {
    test('moves to adjacent position (east)', async () => {
      const agent = createMockAgent({ x: 50, y: 50, energy: 100 });
      const intent = createMoveIntent(51, 50);

      const result = await handleMove(intent, agent);

      expect(result.success).toBe(true);
      expect(result.changes?.x).toBe(51);
      expect(result.changes?.y).toBe(50);
      expect(result.changes?.energy).toBe(99); // -1 energy per tile
      expect(result.changes?.state).toBe('walking');
    });

    test('moves to adjacent position (north)', async () => {
      const agent = createMockAgent({ x: 50, y: 50, energy: 100 });
      const intent = createMoveIntent(50, 49);

      const result = await handleMove(intent, agent);

      expect(result.success).toBe(true);
      expect(result.changes?.x).toBe(50);
      expect(result.changes?.y).toBe(49);
    });

    test('moves to adjacent position (south)', async () => {
      const agent = createMockAgent({ x: 50, y: 50, energy: 100 });
      const intent = createMoveIntent(50, 51);

      const result = await handleMove(intent, agent);

      expect(result.success).toBe(true);
      expect(result.changes?.y).toBe(51);
    });

    test('moves to adjacent position (west)', async () => {
      const agent = createMockAgent({ x: 50, y: 50, energy: 100 });
      const intent = createMoveIntent(49, 50);

      const result = await handleMove(intent, agent);

      expect(result.success).toBe(true);
      expect(result.changes?.x).toBe(49);
    });

    test('moves one step toward distant destination', async () => {
      const agent = createMockAgent({ x: 50, y: 50, energy: 100 });
      const intent = createMoveIntent(55, 55); // 10 tiles away

      const result = await handleMove(intent, agent);

      expect(result.success).toBe(true);
      // Should only move one step
      expect(result.changes?.x).toBe(51); // X first in path algorithm
      expect(result.changes?.y).toBe(50);
      expect(result.changes?.energy).toBe(99); // Only 1 energy for 1 step
    });

    test('emits agent_moved event', async () => {
      const agent = createMockAgent({ x: 50, y: 50, energy: 100 });
      const intent = createMoveIntent(51, 50);

      const result = await handleMove(intent, agent);

      expect(result.events).toHaveLength(1);
      expect(result.events![0].type).toBe('agent_moved');
      expect(result.events![0].agentId).toBe(agent.id);
      expect(result.events![0].payload).toMatchObject({
        from: { x: 50, y: 50 },
        to: { x: 51, y: 50 },
        finalDestination: { x: 51, y: 50 },
        remainingDistance: 0,
        energyCost: 1,
      });
    });

    test('event includes remaining distance for multi-step paths', async () => {
      const agent = createMockAgent({ x: 50, y: 50, energy: 100 });
      const intent = createMoveIntent(55, 50); // 5 steps away

      const result = await handleMove(intent, agent);

      expect(result.events![0].payload.remainingDistance).toBe(4); // 5 - 1 step taken
    });
  });

  describe('invalid position errors', () => {
    test('rejects negative X coordinate', async () => {
      const agent = createMockAgent({ x: 0, y: 0 });
      const intent = createMoveIntent(-1, 0);

      const result = await handleMove(intent, agent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid position');
      expect(result.error).toContain('-1');
    });

    test('rejects negative Y coordinate', async () => {
      const agent = createMockAgent({ x: 0, y: 0 });
      const intent = createMoveIntent(0, -1);

      const result = await handleMove(intent, agent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid position');
    });

    test('rejects X beyond world bounds', async () => {
      const agent = createMockAgent({ x: 99, y: 50 });
      const intent = createMoveIntent(100, 50);

      const result = await handleMove(intent, agent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid position');
    });

    test('rejects Y beyond world bounds', async () => {
      const agent = createMockAgent({ x: 50, y: 99 });
      const intent = createMoveIntent(50, 100);

      const result = await handleMove(intent, agent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid position');
    });
  });

  describe('already at destination', () => {
    test('rejects move to current position', async () => {
      const agent = createMockAgent({ x: 50, y: 50 });
      const intent = createMoveIntent(50, 50);

      const result = await handleMove(intent, agent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Already at destination');
    });
  });

  describe('energy requirements', () => {
    test('fails when energy is 0', async () => {
      const agent = createMockAgent({ x: 50, y: 50, energy: 0 });
      const intent = createMoveIntent(51, 50);

      const result = await handleMove(intent, agent);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Not enough energy');
    });

    test('succeeds with exactly 1 energy', async () => {
      const agent = createMockAgent({ x: 50, y: 50, energy: 1 });
      const intent = createMoveIntent(51, 50);

      const result = await handleMove(intent, agent);

      expect(result.success).toBe(true);
      expect(result.changes?.energy).toBe(0);
    });

    test('costs 1 energy per tile moved', async () => {
      const agent = createMockAgent({ x: 50, y: 50, energy: 50 });
      const intent = createMoveIntent(51, 50);

      const result = await handleMove(intent, agent);

      expect(result.changes?.energy).toBe(49);
    });
  });

  describe('edge cases', () => {
    test('handles move from corner (0,0)', async () => {
      const agent = createMockAgent({ x: 0, y: 0, energy: 100 });
      const intent = createMoveIntent(1, 0);

      const result = await handleMove(intent, agent);

      expect(result.success).toBe(true);
      expect(result.changes?.x).toBe(1);
    });

    test('handles move from corner (99,99)', async () => {
      const agent = createMockAgent({ x: 99, y: 99, energy: 100 });
      const intent = createMoveIntent(98, 99);

      const result = await handleMove(intent, agent);

      expect(result.success).toBe(true);
      expect(result.changes?.x).toBe(98);
    });

    test('handles very long path (only moves one step)', async () => {
      const agent = createMockAgent({ x: 0, y: 0, energy: 100 });
      const intent = createMoveIntent(99, 99); // Maximum distance

      const result = await handleMove(intent, agent);

      expect(result.success).toBe(true);
      // Should only move one step toward destination
      expect(result.changes?.x).toBe(1); // X first in path algorithm
      expect(result.changes?.y).toBe(0);
      expect(result.changes?.energy).toBe(99);
    });
  });
});
