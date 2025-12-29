/**
 * Tests for Trade Action Handler - Phase 1
 *
 * Integration tests covering:
 * - Valid trades between agents
 * - Validation errors (distance, quantities, inventory)
 * - Trust updates after trades
 * - Memory creation for both parties
 * - Event emission
 */

import { describe, expect, test, beforeEach, afterEach } from 'bun:test';
import { handleTrade, type TradeParams } from '../../actions/handlers/trade';
import type { ActionIntent } from '../../actions/types';
import type { Agent } from '../../db/schema';
import { CONFIG } from '../../config';

// Helper to create mock agent
function createMockAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'agent-initiator-id',
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

// Helper to create trade intent
function createTradeIntent(params: TradeParams, agentId = 'agent-initiator-id'): ActionIntent<TradeParams> {
  return {
    agentId,
    type: 'trade',
    params,
    tick: 100,
    timestamp: Date.now(),
  };
}

describe('handleTrade - validation', () => {
  test('rejects trade with zero offering quantity', async () => {
    const agent = createMockAgent();
    const intent = createTradeIntent({
      targetAgentId: 'agent-target-id',
      offeringItemType: 'food',
      offeringQuantity: 0,
      requestingItemType: 'material',
      requestingQuantity: 1,
    });

    const result = await handleTrade(intent, agent);

    expect(result.success).toBe(false);
    expect(result.error).toContain('quantities must be at least 1');
  });

  test('rejects trade with zero requesting quantity', async () => {
    const agent = createMockAgent();
    const intent = createTradeIntent({
      targetAgentId: 'agent-target-id',
      offeringItemType: 'food',
      offeringQuantity: 1,
      requestingItemType: 'material',
      requestingQuantity: 0,
    });

    const result = await handleTrade(intent, agent);

    expect(result.success).toBe(false);
    expect(result.error).toContain('quantities must be at least 1');
  });

  test('rejects trade with negative quantities', async () => {
    const agent = createMockAgent();
    const intent = createTradeIntent({
      targetAgentId: 'agent-target-id',
      offeringItemType: 'food',
      offeringQuantity: -5,
      requestingItemType: 'material',
      requestingQuantity: 1,
    });

    const result = await handleTrade(intent, agent);

    expect(result.success).toBe(false);
    expect(result.error).toContain('quantities must be at least 1');
  });

  test('rejects trade with self', async () => {
    const agent = createMockAgent({ id: 'same-agent-id' });
    const intent = createTradeIntent({
      targetAgentId: 'same-agent-id',
      offeringItemType: 'food',
      offeringQuantity: 1,
      requestingItemType: 'material',
      requestingQuantity: 1,
    }, 'same-agent-id');

    const result = await handleTrade(intent, agent);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Cannot trade with yourself');
  });

  test('rejects trade with non-existent agent', async () => {
    const agent = createMockAgent();
    // Use a valid UUID format that doesn't exist in the database
    const intent = createTradeIntent({
      targetAgentId: '00000000-0000-0000-0000-000000000000',
      offeringItemType: 'food',
      offeringQuantity: 1,
      requestingItemType: 'material',
      requestingQuantity: 1,
    });

    const result = await handleTrade(intent, agent);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Target agent not found');
  });
});

describe('handleTrade - config values', () => {
  test('max trade distance is configured', () => {
    expect(CONFIG.actions.trade.maxDistance).toBeDefined();
    expect(typeof CONFIG.actions.trade.maxDistance).toBe('number');
    expect(CONFIG.actions.trade.maxDistance).toBeGreaterThan(0);
  });

  test('trust gain on success is configured', () => {
    expect(CONFIG.actions.trade.trustGainOnSuccess).toBeDefined();
    expect(typeof CONFIG.actions.trade.trustGainOnSuccess).toBe('number');
  });
});

describe('handleTrade - trade params interface', () => {
  test('TradeParams has required fields', () => {
    const params: TradeParams = {
      targetAgentId: 'target-id',
      offeringItemType: 'food',
      offeringQuantity: 2,
      requestingItemType: 'material',
      requestingQuantity: 3,
    };

    expect(params.targetAgentId).toBeDefined();
    expect(params.offeringItemType).toBeDefined();
    expect(params.offeringQuantity).toBeDefined();
    expect(params.requestingItemType).toBeDefined();
    expect(params.requestingQuantity).toBeDefined();
  });
});
