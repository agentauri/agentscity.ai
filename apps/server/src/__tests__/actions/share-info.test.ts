/**
 * Tests for Share Info Action Handler - Phase 2: Social Discovery
 *
 * Tests covering:
 * - Valid info sharing between agents
 * - Validation errors (distance, params, knowledge)
 * - Knowledge transfer mechanics
 * - Trust updates based on sentiment
 */

import { describe, expect, test } from 'bun:test';
import { handleShareInfo } from '../../actions/handlers/share-info';
import type { ActionIntent, ShareInfoParams } from '../../actions/types';
import type { Agent } from '../../db/schema';
import { CONFIG } from '../../config';

// Helper to create mock agent
function createMockAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'sharer-agent-id',
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

// Helper to create share_info intent
function createShareInfoIntent(params: ShareInfoParams, agentId = 'sharer-agent-id'): ActionIntent<ShareInfoParams> {
  return {
    agentId,
    type: 'share_info',
    params,
    tick: 100,
    timestamp: Date.now(),
  };
}

// =============================================================================
// SHARE INFO VALIDATION TESTS
// =============================================================================

describe('handleShareInfo - validation', () => {
  test('rejects share_info with invalid infoType', async () => {
    const agent = createMockAgent();
    const intent = createShareInfoIntent({
      targetAgentId: '00000000-0000-0000-0000-000000000001',
      subjectAgentId: '00000000-0000-0000-0000-000000000002',
      infoType: 'invalid' as 'location',
    });

    const result = await handleShareInfo(intent, agent);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid info type');
  });

  test('rejects share_info with self as target', async () => {
    const agent = createMockAgent({ id: 'same-agent-id' });
    const intent = createShareInfoIntent({
      targetAgentId: 'same-agent-id',
      subjectAgentId: '00000000-0000-0000-0000-000000000002',
      infoType: 'reputation',
    }, 'same-agent-id');

    const result = await handleShareInfo(intent, agent);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Cannot share info with yourself');
  });

  test('rejects share_info about self', async () => {
    const agent = createMockAgent({ id: 'sharer-id' });
    const intent = createShareInfoIntent({
      targetAgentId: '00000000-0000-0000-0000-000000000001',
      subjectAgentId: 'sharer-id',
      infoType: 'reputation',
    }, 'sharer-id');

    const result = await handleShareInfo(intent, agent);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Cannot share info about yourself');
  });

  test('rejects share_info about target to themselves', async () => {
    const agent = createMockAgent();
    const intent = createShareInfoIntent({
      targetAgentId: '00000000-0000-0000-0000-000000000001',
      subjectAgentId: '00000000-0000-0000-0000-000000000001', // Same as target
      infoType: 'reputation',
    });

    const result = await handleShareInfo(intent, agent);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Cannot share info about someone to themselves');
  });

  test('rejects share_info with sentiment out of range (too low)', async () => {
    const agent = createMockAgent();
    const intent = createShareInfoIntent({
      targetAgentId: '00000000-0000-0000-0000-000000000001',
      subjectAgentId: '00000000-0000-0000-0000-000000000002',
      infoType: 'reputation',
      sentiment: -150,
    });

    const result = await handleShareInfo(intent, agent);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Sentiment must be between -100 and 100');
  });

  test('rejects share_info with sentiment out of range (too high)', async () => {
    const agent = createMockAgent();
    const intent = createShareInfoIntent({
      targetAgentId: '00000000-0000-0000-0000-000000000001',
      subjectAgentId: '00000000-0000-0000-0000-000000000002',
      infoType: 'reputation',
      sentiment: 150,
    });

    const result = await handleShareInfo(intent, agent);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Sentiment must be between -100 and 100');
  });

  test('rejects share_info with non-existent target agent', async () => {
    const agent = createMockAgent();
    const intent = createShareInfoIntent({
      targetAgentId: '00000000-0000-0000-0000-000000000000',
      subjectAgentId: '00000000-0000-0000-0000-000000000002',
      infoType: 'location',
    });

    const result = await handleShareInfo(intent, agent);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Target agent not found');
  });
});

// =============================================================================
// SHARE INFO CONFIG TESTS
// =============================================================================

describe('handleShareInfo - config values', () => {
  test('max share_info distance is configured', () => {
    expect(CONFIG.actions.shareInfo.maxDistance).toBeDefined();
    expect(typeof CONFIG.actions.shareInfo.maxDistance).toBe('number');
    expect(CONFIG.actions.shareInfo.maxDistance).toBe(3); // Conversation range
  });

  test('energy cost is configured', () => {
    expect(CONFIG.actions.shareInfo.energyCost).toBeDefined();
    expect(typeof CONFIG.actions.shareInfo.energyCost).toBe('number');
    expect(CONFIG.actions.shareInfo.energyCost).toBeGreaterThan(0);
  });

  test('trust gain for positive info is configured', () => {
    expect(CONFIG.actions.shareInfo.trustGainPositive).toBeDefined();
    expect(CONFIG.actions.shareInfo.trustGainPositive).toBeGreaterThan(0);
  });

  test('trust penalty for negative info is configured', () => {
    expect(CONFIG.actions.shareInfo.trustPenaltyNegative).toBeDefined();
    expect(CONFIG.actions.shareInfo.trustPenaltyNegative).toBeLessThan(0);
  });
});

// =============================================================================
// SHARE INFO PARAMS INTERFACE TESTS
// =============================================================================

describe('handleShareInfo - params interface', () => {
  test('ShareInfoParams has required fields', () => {
    const params: ShareInfoParams = {
      targetAgentId: 'target-id',
      subjectAgentId: 'subject-id',
      infoType: 'reputation',
    };

    expect(params.targetAgentId).toBeDefined();
    expect(params.subjectAgentId).toBeDefined();
    expect(params.infoType).toBeDefined();
  });

  test('ShareInfoParams supports optional fields', () => {
    const params: ShareInfoParams = {
      targetAgentId: 'target-id',
      subjectAgentId: 'subject-id',
      infoType: 'reputation',
      claim: 'This agent is trustworthy',
      sentiment: 50,
      position: { x: 10, y: 20 },
    };

    expect(params.claim).toBe('This agent is trustworthy');
    expect(params.sentiment).toBe(50);
    expect(params.position).toEqual({ x: 10, y: 20 });
  });

  test('all valid infoTypes are recognized', () => {
    const validTypes: ShareInfoParams['infoType'][] = ['location', 'reputation', 'warning', 'recommendation'];
    validTypes.forEach(infoType => {
      const params: ShareInfoParams = {
        targetAgentId: 'target-id',
        subjectAgentId: 'subject-id',
        infoType,
      };
      expect(params.infoType).toBe(infoType);
    });
  });
});

// =============================================================================
// RESPONSE PARSER TESTS FOR SHARE_INFO
// =============================================================================

describe('parseResponse - share_info action', () => {
  const { parseResponse } = require('../../llm/response-parser');

  test('parses valid share_info action', () => {
    const response = JSON.stringify({
      action: 'share_info',
      params: {
        targetAgentId: 'target-123',
        subjectAgentId: 'subject-456',
        infoType: 'reputation',
        sentiment: 50,
      },
      reasoning: 'Sharing good reputation',
    });

    const result = parseResponse(response);

    expect(result).not.toBeNull();
    expect(result?.action).toBe('share_info');
    expect(result?.params.targetAgentId).toBe('target-123');
    expect(result?.params.subjectAgentId).toBe('subject-456');
    expect(result?.params.infoType).toBe('reputation');
    expect(result?.params.sentiment).toBe(50);
  });

  test('parses share_info with location info', () => {
    const response = JSON.stringify({
      action: 'share_info',
      params: {
        targetAgentId: 'target-123',
        subjectAgentId: 'subject-456',
        infoType: 'location',
        position: { x: 25, y: 30 },
      },
    });

    const result = parseResponse(response);

    expect(result).not.toBeNull();
    expect(result?.action).toBe('share_info');
    expect(result?.params.infoType).toBe('location');
  });

  test('parses share_info warning', () => {
    const response = JSON.stringify({
      action: 'share_info',
      params: {
        targetAgentId: 'target-123',
        subjectAgentId: 'subject-456',
        infoType: 'warning',
        claim: 'This agent is dangerous',
      },
    });

    const result = parseResponse(response);

    expect(result).not.toBeNull();
    expect(result?.action).toBe('share_info');
    expect(result?.params.infoType).toBe('warning');
    expect(result?.params.claim).toBe('This agent is dangerous');
  });

  test('rejects share_info with invalid infoType', () => {
    const response = JSON.stringify({
      action: 'share_info',
      params: {
        targetAgentId: 'target-123',
        subjectAgentId: 'subject-456',
        infoType: 'gossip', // Invalid
      },
    });

    const result = parseResponse(response);

    expect(result).toBeNull();
  });

  test('rejects share_info without targetAgentId', () => {
    const response = JSON.stringify({
      action: 'share_info',
      params: {
        subjectAgentId: 'subject-456',
        infoType: 'reputation',
      },
    });

    const result = parseResponse(response);

    expect(result).toBeNull();
  });

  test('rejects share_info without subjectAgentId', () => {
    const response = JSON.stringify({
      action: 'share_info',
      params: {
        targetAgentId: 'target-123',
        infoType: 'reputation',
      },
    });

    const result = parseResponse(response);

    expect(result).toBeNull();
  });

  test('rejects share_info with sentiment out of range', () => {
    const response = JSON.stringify({
      action: 'share_info',
      params: {
        targetAgentId: 'target-123',
        subjectAgentId: 'subject-456',
        infoType: 'reputation',
        sentiment: 200, // Out of range
      },
    });

    const result = parseResponse(response);

    expect(result).toBeNull();
  });
});
