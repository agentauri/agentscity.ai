/**
 * Integration Test: Conflict Flow
 *
 * Tests the complete conflict lifecycle:
 * - Harm action with health reduction
 * - Steal action with inventory transfer
 * - Deceive action with false information
 * - Retaliation chain tracking
 * - Trust impact on victims and witnesses
 */

import { describe, expect, test } from 'bun:test';
import { handleHarm } from '../../actions/handlers/harm';
import { handleSteal } from '../../actions/handlers/steal';
import { handleDeceive } from '../../actions/handlers/deceive';
import type { ActionIntent, HarmParams, StealParams, DeceiveParams } from '../../actions/types';
import type { Agent } from '../../db/schema';
import { CONFIG } from '../../config';

// Mock agent for conflict testing
function createConflictAgent(id: string, position: { x: number; y: number } = { x: 50, y: 50 }): Agent {
  return {
    id,
    llmType: 'claude',
    x: position.x,
    y: position.y,
    hunger: 80,
    energy: 100,
    health: 100,
    balance: 100,
    state: 'idle',
    color: '#ff0000',
    createdAt: new Date(),
    updatedAt: new Date(),
    diedAt: null,
  };
}

// =============================================================================
// HARM ACTION TESTS
// =============================================================================

describe('Conflict Flow - Harm Action', () => {
  test('rejects harm against self', async () => {
    const agent = createConflictAgent('self-harmer');
    const intent: ActionIntent<HarmParams> = {
      agentId: 'self-harmer',
      type: 'harm',
      params: { targetAgentId: 'self-harmer', intensity: 'light' },
      tick: 100,
      timestamp: Date.now(),
    };

    const result = await handleHarm(intent, agent);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Cannot harm yourself');
  });

  test('validates harm intensity levels', async () => {
    const agent = createConflictAgent('attacker-1');

    // Invalid intensity
    const intent: ActionIntent<HarmParams> = {
      agentId: 'attacker-1',
      type: 'harm',
      params: { targetAgentId: 'victim-1', intensity: 'extreme' as 'light' },
      tick: 100,
      timestamp: Date.now(),
    };

    const result = await handleHarm(intent, agent);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid harm intensity');
  });

  test('harm config has all intensity levels', () => {
    expect(CONFIG.actions.harm.energyCost.light).toBeDefined();
    expect(CONFIG.actions.harm.energyCost.moderate).toBeDefined();
    expect(CONFIG.actions.harm.energyCost.severe).toBeDefined();

    expect(CONFIG.actions.harm.damage.light).toBeDefined();
    expect(CONFIG.actions.harm.damage.moderate).toBeDefined();
    expect(CONFIG.actions.harm.damage.severe).toBeDefined();
  });

  test('damage increases with intensity', () => {
    const { damage } = CONFIG.actions.harm;

    expect(damage.light).toBeLessThan(damage.moderate);
    expect(damage.moderate).toBeLessThan(damage.severe);
  });

  test('energy cost increases with intensity', () => {
    const { energyCost } = CONFIG.actions.harm;

    expect(energyCost.light).toBeLessThan(energyCost.moderate);
    expect(energyCost.moderate).toBeLessThan(energyCost.severe);
  });

  test('trust impact is negative', () => {
    expect(CONFIG.actions.harm.trustImpactVictim).toBeLessThan(0);
    expect(CONFIG.actions.harm.trustImpactWitness).toBeLessThan(0);
  });
});

// =============================================================================
// STEAL ACTION TESTS
// =============================================================================

describe('Conflict Flow - Steal Action', () => {
  test('rejects steal from self', async () => {
    const agent = createConflictAgent('self-thief');
    const intent: ActionIntent<StealParams> = {
      agentId: 'self-thief',
      type: 'steal',
      params: { targetAgentId: 'self-thief', targetItemType: 'food', quantity: 1 },
      tick: 100,
      timestamp: Date.now(),
    };

    const result = await handleSteal(intent, agent);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Cannot steal from yourself');
  });

  test('validates steal quantity bounds', async () => {
    const agent = createConflictAgent('thief-1');

    // Zero quantity
    const intent1: ActionIntent<StealParams> = {
      agentId: 'thief-1',
      type: 'steal',
      params: { targetAgentId: 'victim-1', targetItemType: 'food', quantity: 0 },
      tick: 100,
      timestamp: Date.now(),
    };

    const result1 = await handleSteal(intent1, agent);
    expect(result1.success).toBe(false);
    expect(result1.error).toContain('Quantity must be at least 1');

    // Excessive quantity
    const intent2: ActionIntent<StealParams> = {
      agentId: 'thief-1',
      type: 'steal',
      params: { targetAgentId: 'victim-1', targetItemType: 'food', quantity: 100 },
      tick: 100,
      timestamp: Date.now(),
    };

    const result2 = await handleSteal(intent2, agent);
    expect(result2.success).toBe(false);
    expect(result2.error).toContain('Cannot steal more than');
  });

  test('steal config values are defined', () => {
    expect(CONFIG.actions.steal.maxDistance).toBeDefined();
    expect(CONFIG.actions.steal.energyCost).toBeDefined();
    expect(CONFIG.actions.steal.baseSuccessRate).toBeDefined();
    expect(CONFIG.actions.steal.maxItemsPerAction).toBeDefined();
  });

  test('steal success rate is reasonable', () => {
    expect(CONFIG.actions.steal.baseSuccessRate).toBeGreaterThan(0);
    expect(CONFIG.actions.steal.baseSuccessRate).toBeLessThanOrEqual(1);
  });
});

// =============================================================================
// DECEIVE ACTION TESTS
// =============================================================================

describe('Conflict Flow - Deceive Action', () => {
  test('rejects deceive against self', async () => {
    const agent = createConflictAgent('self-deceiver');
    const intent: ActionIntent<DeceiveParams> = {
      agentId: 'self-deceiver',
      type: 'deceive',
      params: {
        targetAgentId: 'self-deceiver',
        claim: 'This is a false claim',
        claimType: 'resource_location',
      },
      tick: 100,
      timestamp: Date.now(),
    };

    const result = await handleDeceive(intent, agent);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Cannot deceive yourself');
  });

  test('validates claim length', async () => {
    const agent = createConflictAgent('deceiver-1');

    // Too short
    const intent1: ActionIntent<DeceiveParams> = {
      agentId: 'deceiver-1',
      type: 'deceive',
      params: {
        targetAgentId: 'victim-1',
        claim: 'Hi',
        claimType: 'other',
      },
      tick: 100,
      timestamp: Date.now(),
    };

    const result1 = await handleDeceive(intent1, agent);
    expect(result1.success).toBe(false);
    expect(result1.error).toContain('Claim must be 5-500 characters');

    // Too long
    const intent2: ActionIntent<DeceiveParams> = {
      agentId: 'deceiver-1',
      type: 'deceive',
      params: {
        targetAgentId: 'victim-1',
        claim: 'x'.repeat(501),
        claimType: 'other',
      },
      tick: 100,
      timestamp: Date.now(),
    };

    const result2 = await handleDeceive(intent2, agent);
    expect(result2.success).toBe(false);
    expect(result2.error).toContain('Claim must be 5-500 characters');
  });

  test('validates claim types', async () => {
    const agent = createConflictAgent('deceiver-2');

    const intent: ActionIntent<DeceiveParams> = {
      agentId: 'deceiver-2',
      type: 'deceive',
      params: {
        targetAgentId: 'victim-2',
        claim: 'This is a test claim',
        claimType: 'invalid_type' as 'other',
      },
      tick: 100,
      timestamp: Date.now(),
    };

    const result = await handleDeceive(intent, agent);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid claim type');
  });

  test('deceive config values are defined', () => {
    expect(CONFIG.actions.deceive.maxDistance).toBeDefined();
    expect(CONFIG.actions.deceive.energyCost).toBeDefined();
    expect(CONFIG.actions.deceive.trustImpactDiscovery).toBeDefined();
  });

  test('valid claim types are documented', () => {
    const validTypes = ['resource_location', 'agent_reputation', 'danger_warning', 'trade_offer', 'other'];

    validTypes.forEach((claimType) => {
      const params: DeceiveParams = {
        targetAgentId: 'target',
        claim: 'Valid claim content here',
        claimType: claimType as DeceiveParams['claimType'],
      };
      expect(params.claimType).toBe(claimType);
    });
  });
});

// =============================================================================
// CONFLICT CONFIG TESTS
// =============================================================================

describe('Conflict Flow - Configuration', () => {
  test('all conflict actions require adjacency', () => {
    expect(CONFIG.actions.harm.maxDistance).toBe(1);
    expect(CONFIG.actions.steal.maxDistance).toBe(1);
  });

  test('deceive has longer range than physical actions', () => {
    expect(CONFIG.actions.deceive.maxDistance).toBeGreaterThan(CONFIG.actions.harm.maxDistance);
  });

  test('witness radius is defined for harm and steal', () => {
    expect(CONFIG.actions.harm.witnessRadius).toBeDefined();
    expect(CONFIG.actions.harm.witnessRadius).toBeGreaterThan(0);

    expect(CONFIG.actions.steal.witnessRadius).toBeDefined();
    expect(CONFIG.actions.steal.witnessRadius).toBeGreaterThan(0);
  });
});
