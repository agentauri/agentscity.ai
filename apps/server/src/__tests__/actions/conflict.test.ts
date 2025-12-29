/**
 * Tests for Conflict Action Handlers - Phase 2
 *
 * Integration tests covering:
 * - Harm action (attack with intensity levels)
 * - Steal action (item transfer)
 * - Deceive action (false information delivery)
 * - Validation errors (distance, energy, params)
 * - Trust impacts
 */

import { describe, expect, test } from 'bun:test';
import { handleHarm } from '../../actions/handlers/harm';
import { handleSteal } from '../../actions/handlers/steal';
import { handleDeceive } from '../../actions/handlers/deceive';
import type { ActionIntent, HarmParams, StealParams, DeceiveParams } from '../../actions/types';
import type { Agent } from '../../db/schema';
import { CONFIG } from '../../config';

// Helper to create mock agent
function createMockAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'attacker-agent-id',
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

// Helper to create harm intent
function createHarmIntent(params: HarmParams, agentId = 'attacker-agent-id'): ActionIntent<HarmParams> {
  return {
    agentId,
    type: 'harm',
    params,
    tick: 100,
    timestamp: Date.now(),
  };
}

// Helper to create steal intent
function createStealIntent(params: StealParams, agentId = 'thief-agent-id'): ActionIntent<StealParams> {
  return {
    agentId,
    type: 'steal',
    params,
    tick: 100,
    timestamp: Date.now(),
  };
}

// Helper to create deceive intent
function createDeceiveIntent(params: DeceiveParams, agentId = 'deceiver-agent-id'): ActionIntent<DeceiveParams> {
  return {
    agentId,
    type: 'deceive',
    params,
    tick: 100,
    timestamp: Date.now(),
  };
}

// =============================================================================
// HARM TESTS
// =============================================================================

describe('handleHarm - validation', () => {
  test('rejects harm with invalid intensity', async () => {
    const agent = createMockAgent();
    const intent = createHarmIntent({
      targetAgentId: '00000000-0000-0000-0000-000000000001',
      intensity: 'extreme' as 'light',
    });

    const result = await handleHarm(intent, agent);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid harm intensity');
  });

  test('rejects harm against self', async () => {
    const agent = createMockAgent({ id: 'same-agent-id' });
    const intent = createHarmIntent({
      targetAgentId: 'same-agent-id',
      intensity: 'light',
    }, 'same-agent-id');

    const result = await handleHarm(intent, agent);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Cannot harm yourself');
  });

  test('rejects harm against non-existent agent', async () => {
    const agent = createMockAgent();
    const intent = createHarmIntent({
      targetAgentId: '00000000-0000-0000-0000-000000000000',
      intensity: 'light',
    });

    const result = await handleHarm(intent, agent);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Target agent not found');
  });

  // Note: Energy checks happen after target validation in handler flow
  // Full energy validation tests require database setup with real agents
});

describe('handleHarm - config values', () => {
  test('max harm distance is configured', () => {
    expect(CONFIG.actions.harm.maxDistance).toBeDefined();
    expect(typeof CONFIG.actions.harm.maxDistance).toBe('number');
    expect(CONFIG.actions.harm.maxDistance).toBe(1); // Adjacent only
  });

  test('energy costs are configured for all intensities', () => {
    expect(CONFIG.actions.harm.energyCost.light).toBeDefined();
    expect(CONFIG.actions.harm.energyCost.moderate).toBeDefined();
    expect(CONFIG.actions.harm.energyCost.severe).toBeDefined();
    expect(CONFIG.actions.harm.energyCost.light).toBeLessThan(CONFIG.actions.harm.energyCost.moderate);
    expect(CONFIG.actions.harm.energyCost.moderate).toBeLessThan(CONFIG.actions.harm.energyCost.severe);
  });

  test('damage values are configured for all intensities', () => {
    expect(CONFIG.actions.harm.damage.light).toBeDefined();
    expect(CONFIG.actions.harm.damage.moderate).toBeDefined();
    expect(CONFIG.actions.harm.damage.severe).toBeDefined();
    expect(CONFIG.actions.harm.damage.light).toBeLessThan(CONFIG.actions.harm.damage.moderate);
    expect(CONFIG.actions.harm.damage.moderate).toBeLessThan(CONFIG.actions.harm.damage.severe);
  });

  test('trust impacts are configured', () => {
    expect(CONFIG.actions.harm.trustImpactVictim).toBeDefined();
    expect(CONFIG.actions.harm.trustImpactVictim).toBeLessThan(0); // Negative
    expect(CONFIG.actions.harm.trustImpactWitness).toBeDefined();
    expect(CONFIG.actions.harm.trustImpactWitness).toBeLessThan(0); // Negative
  });

  test('witness radius is configured', () => {
    expect(CONFIG.actions.harm.witnessRadius).toBeDefined();
    expect(CONFIG.actions.harm.witnessRadius).toBeGreaterThan(0);
  });
});

describe('handleHarm - params interface', () => {
  test('HarmParams has required fields', () => {
    const params: HarmParams = {
      targetAgentId: 'target-id',
      intensity: 'moderate',
    };

    expect(params.targetAgentId).toBeDefined();
    expect(params.intensity).toBeDefined();
    expect(['light', 'moderate', 'severe']).toContain(params.intensity);
  });
});

// =============================================================================
// STEAL TESTS
// =============================================================================

describe('handleSteal - validation', () => {
  test('rejects steal with zero quantity', async () => {
    const agent = createMockAgent({ id: 'thief-agent-id' });
    const intent = createStealIntent({
      targetAgentId: '00000000-0000-0000-0000-000000000001',
      targetItemType: 'food',
      quantity: 0,
    });

    const result = await handleSteal(intent, agent);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Quantity must be at least 1');
  });

  test('rejects steal with quantity above max', async () => {
    const agent = createMockAgent({ id: 'thief-agent-id' });
    const intent = createStealIntent({
      targetAgentId: '00000000-0000-0000-0000-000000000001',
      targetItemType: 'food',
      quantity: 10, // Above max (3)
    });

    const result = await handleSteal(intent, agent);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Cannot steal more than');
  });

  test('rejects steal from self', async () => {
    const agent = createMockAgent({ id: 'same-agent-id' });
    const intent = createStealIntent({
      targetAgentId: 'same-agent-id',
      targetItemType: 'food',
      quantity: 1,
    }, 'same-agent-id');

    const result = await handleSteal(intent, agent);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Cannot steal from yourself');
  });

  test('rejects steal from non-existent agent', async () => {
    const agent = createMockAgent({ id: 'thief-agent-id' });
    const intent = createStealIntent({
      targetAgentId: '00000000-0000-0000-0000-000000000000',
      targetItemType: 'food',
      quantity: 1,
    });

    const result = await handleSteal(intent, agent);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Target agent not found');
  });

  // Note: Energy checks happen after target validation in handler flow
  // Full energy validation tests require database setup with real agents
});

describe('handleSteal - config values', () => {
  test('max steal distance is configured', () => {
    expect(CONFIG.actions.steal.maxDistance).toBeDefined();
    expect(CONFIG.actions.steal.maxDistance).toBe(1); // Adjacent only
  });

  test('energy cost is configured', () => {
    expect(CONFIG.actions.steal.energyCost).toBeDefined();
    expect(typeof CONFIG.actions.steal.energyCost).toBe('number');
    expect(CONFIG.actions.steal.energyCost).toBeGreaterThan(0);
  });

  test('base success rate is configured', () => {
    expect(CONFIG.actions.steal.baseSuccessRate).toBeDefined();
    expect(CONFIG.actions.steal.baseSuccessRate).toBeGreaterThan(0);
    expect(CONFIG.actions.steal.baseSuccessRate).toBeLessThanOrEqual(1);
  });

  test('trust impacts are configured', () => {
    expect(CONFIG.actions.steal.trustImpactVictim).toBeDefined();
    expect(CONFIG.actions.steal.trustImpactVictim).toBeLessThan(0);
    expect(CONFIG.actions.steal.trustImpactWitness).toBeDefined();
    expect(CONFIG.actions.steal.trustImpactWitness).toBeLessThan(0);
  });

  test('max items per action is configured', () => {
    expect(CONFIG.actions.steal.maxItemsPerAction).toBeDefined();
    expect(CONFIG.actions.steal.maxItemsPerAction).toBeGreaterThan(0);
  });
});

describe('handleSteal - params interface', () => {
  test('StealParams has required fields', () => {
    const params: StealParams = {
      targetAgentId: 'target-id',
      targetItemType: 'food',
      quantity: 2,
    };

    expect(params.targetAgentId).toBeDefined();
    expect(params.targetItemType).toBeDefined();
    expect(params.quantity).toBeDefined();
    expect(typeof params.quantity).toBe('number');
  });
});

// =============================================================================
// DECEIVE TESTS
// =============================================================================

describe('handleDeceive - validation', () => {
  test('rejects deceive with claim too short', async () => {
    const agent = createMockAgent({ id: 'deceiver-agent-id' });
    const intent = createDeceiveIntent({
      targetAgentId: '00000000-0000-0000-0000-000000000001',
      claim: 'Hi',
      claimType: 'other',
    });

    const result = await handleDeceive(intent, agent);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Claim must be 5-500 characters');
  });

  test('rejects deceive with claim too long', async () => {
    const agent = createMockAgent({ id: 'deceiver-agent-id' });
    const intent = createDeceiveIntent({
      targetAgentId: '00000000-0000-0000-0000-000000000001',
      claim: 'x'.repeat(501),
      claimType: 'other',
    });

    const result = await handleDeceive(intent, agent);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Claim must be 5-500 characters');
  });

  test('rejects deceive with invalid claim type', async () => {
    const agent = createMockAgent({ id: 'deceiver-agent-id' });
    const intent = createDeceiveIntent({
      targetAgentId: '00000000-0000-0000-0000-000000000001',
      claim: 'There is food at location 10,10',
      claimType: 'invalid_type' as 'other',
    });

    const result = await handleDeceive(intent, agent);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid claim type');
  });

  test('rejects deceive against self', async () => {
    const agent = createMockAgent({ id: 'same-agent-id' });
    const intent = createDeceiveIntent({
      targetAgentId: 'same-agent-id',
      claim: 'There is food at location 10,10',
      claimType: 'resource_location',
    }, 'same-agent-id');

    const result = await handleDeceive(intent, agent);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Cannot deceive yourself');
  });

  test('rejects deceive against non-existent agent', async () => {
    const agent = createMockAgent({ id: 'deceiver-agent-id' });
    const intent = createDeceiveIntent({
      targetAgentId: '00000000-0000-0000-0000-000000000000',
      claim: 'There is food at location 10,10',
      claimType: 'resource_location',
    });

    const result = await handleDeceive(intent, agent);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Target agent not found');
  });

  // Note: Energy checks happen after target validation in handler flow
  // Full energy validation tests require database setup with real agents
});

describe('handleDeceive - config values', () => {
  test('max deceive distance is configured', () => {
    expect(CONFIG.actions.deceive.maxDistance).toBeDefined();
    expect(CONFIG.actions.deceive.maxDistance).toBe(3); // Conversation range
  });

  test('energy cost is configured', () => {
    expect(CONFIG.actions.deceive.energyCost).toBeDefined();
    expect(typeof CONFIG.actions.deceive.energyCost).toBe('number');
    expect(CONFIG.actions.deceive.energyCost).toBeGreaterThan(0);
  });

  test('trust impact on discovery is configured', () => {
    expect(CONFIG.actions.deceive.trustImpactDiscovery).toBeDefined();
    expect(CONFIG.actions.deceive.trustImpactDiscovery).toBeLessThan(0);
  });
});

describe('handleDeceive - params interface', () => {
  test('DeceiveParams has required fields', () => {
    const params: DeceiveParams = {
      targetAgentId: 'target-id',
      claim: 'There is food at location 10,10',
      claimType: 'resource_location',
    };

    expect(params.targetAgentId).toBeDefined();
    expect(params.claim).toBeDefined();
    expect(params.claimType).toBeDefined();
  });

  test('all valid claim types are recognized', () => {
    const validTypes: DeceiveParams['claimType'][] = ['resource_location', 'agent_reputation', 'danger_warning', 'trade_offer', 'other'];
    validTypes.forEach(claimType => {
      const params: DeceiveParams = {
        targetAgentId: 'target-id',
        claim: 'Test claim content here',
        claimType,
      };
      expect(params.claimType).toBe(claimType);
    });
  });
});

// =============================================================================
// RESPONSE PARSER TESTS FOR CONFLICT ACTIONS
// =============================================================================

describe('parseResponse - conflict actions', () => {
  const { parseResponse } = require('../../llm/response-parser');

  test('parses valid harm action', () => {
    const response = JSON.stringify({
      action: 'harm',
      params: { targetAgentId: 'target-123', intensity: 'light' },
      reasoning: 'Self defense',
    });

    const result = parseResponse(response);

    expect(result).not.toBeNull();
    expect(result?.action).toBe('harm');
    expect(result?.params.targetAgentId).toBe('target-123');
    expect(result?.params.intensity).toBe('light');
  });

  test('parses valid steal action', () => {
    const response = JSON.stringify({
      action: 'steal',
      params: { targetAgentId: 'target-123', targetItemType: 'food', quantity: 2 },
      reasoning: 'Desperate for food',
    });

    const result = parseResponse(response);

    expect(result).not.toBeNull();
    expect(result?.action).toBe('steal');
    expect(result?.params.targetAgentId).toBe('target-123');
    expect(result?.params.targetItemType).toBe('food');
    expect(result?.params.quantity).toBe(2);
  });

  test('parses valid deceive action', () => {
    const response = JSON.stringify({
      action: 'deceive',
      params: {
        targetAgentId: 'target-123',
        claim: 'There is lots of food to the north',
        claimType: 'resource_location',
      },
      reasoning: 'Misdirection',
    });

    const result = parseResponse(response);

    expect(result).not.toBeNull();
    expect(result?.action).toBe('deceive');
    expect(result?.params.targetAgentId).toBe('target-123');
    expect(result?.params.claim).toBe('There is lots of food to the north');
    expect(result?.params.claimType).toBe('resource_location');
  });

  test('rejects harm with invalid intensity', () => {
    const response = JSON.stringify({
      action: 'harm',
      params: { targetAgentId: 'target-123', intensity: 'extreme' },
    });

    const result = parseResponse(response);

    expect(result).toBeNull();
  });

  test('rejects steal with zero quantity', () => {
    const response = JSON.stringify({
      action: 'steal',
      params: { targetAgentId: 'target-123', targetItemType: 'food', quantity: 0 },
    });

    const result = parseResponse(response);

    expect(result).toBeNull();
  });

  test('rejects deceive with claim too short', () => {
    const response = JSON.stringify({
      action: 'deceive',
      params: { targetAgentId: 'target-123', claim: 'Hi', claimType: 'other' },
    });

    const result = parseResponse(response);

    expect(result).toBeNull();
  });

  test('rejects deceive with invalid claimType', () => {
    const response = JSON.stringify({
      action: 'deceive',
      params: { targetAgentId: 'target-123', claim: 'Test claim here', claimType: 'invalid' },
    });

    const result = parseResponse(response);

    expect(result).toBeNull();
  });
});
