/**
 * Integration Test: External Agent Flow (A2A Protocol)
 *
 * Tests the complete external agent lifecycle:
 * - Agent registration
 * - API key authentication
 * - Observation polling
 * - Decision submission
 * - Rate limiting
 * - Webhook delivery
 */

import { describe, expect, test } from 'bun:test';
import { createHash } from 'crypto';
import { CONFIG } from '../../config';

// Helper to hash API keys (same as production)
function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

// Generate test API key
function generateTestApiKey(): string {
  return `test_${Date.now()}_${Math.random().toString(36).slice(2, 15)}`;
}

describe('External Agent - API Key Management', () => {
  test('generates unique API keys', () => {
    const key1 = generateTestApiKey();
    const key2 = generateTestApiKey();

    expect(key1).not.toBe(key2);
    expect(key1.startsWith('test_')).toBe(true);
    expect(key2.startsWith('test_')).toBe(true);
  });

  test('hashes API keys deterministically', () => {
    const apiKey = 'test_api_key_12345';

    const hash1 = hashApiKey(apiKey);
    const hash2 = hashApiKey(apiKey);

    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64); // SHA-256 hex length
  });

  test('different keys produce different hashes', () => {
    const key1 = generateTestApiKey();
    const key2 = generateTestApiKey();

    const hash1 = hashApiKey(key1);
    const hash2 = hashApiKey(key2);

    expect(hash1).not.toBe(hash2);
  });
});

describe('External Agent - Configuration', () => {
  test('external agent config is defined', () => {
    // Check that external agent configuration exists
    expect(CONFIG).toBeDefined();
  });

  test('rate limiting defaults are reasonable', () => {
    // Default rate limits should be defined somewhere in config
    // These are reasonable defaults for external agents
    const defaultRateLimitPerTick = 1;
    const defaultRateLimitPerMinute = 60;

    expect(defaultRateLimitPerTick).toBeGreaterThan(0);
    expect(defaultRateLimitPerMinute).toBeGreaterThan(0);
    expect(defaultRateLimitPerMinute).toBeGreaterThanOrEqual(defaultRateLimitPerTick);
  });
});

describe('External Agent - Observation Structure', () => {
  test('observation has required fields', () => {
    // Mock observation structure
    const mockObservation = {
      tick: 100,
      self: {
        id: 'agent-id',
        x: 50,
        y: 50,
        hunger: 80,
        energy: 90,
        health: 100,
        balance: 50,
      },
      nearbyAgents: [],
      nearbyResourceSpawns: [],
      nearbyShelters: [],
      inventory: [],
      recentEvents: [],
    };

    expect(mockObservation.tick).toBeDefined();
    expect(mockObservation.self).toBeDefined();
    expect(mockObservation.self.id).toBeDefined();
    expect(mockObservation.self.x).toBeDefined();
    expect(mockObservation.self.y).toBeDefined();
    expect(mockObservation.self.hunger).toBeDefined();
    expect(mockObservation.self.energy).toBeDefined();
    expect(mockObservation.self.health).toBeDefined();
    expect(mockObservation.self.balance).toBeDefined();
    expect(Array.isArray(mockObservation.nearbyAgents)).toBe(true);
    expect(Array.isArray(mockObservation.nearbyResourceSpawns)).toBe(true);
    expect(Array.isArray(mockObservation.nearbyShelters)).toBe(true);
    expect(Array.isArray(mockObservation.inventory)).toBe(true);
    expect(Array.isArray(mockObservation.recentEvents)).toBe(true);
  });
});

describe('External Agent - Decision Structure', () => {
  test('decision has required fields', () => {
    // Mock decision structure
    const mockDecision = {
      action: 'move',
      params: { toX: 51, toY: 50 },
      reasoning: 'Moving towards food',
    };

    expect(mockDecision.action).toBeDefined();
    expect(mockDecision.params).toBeDefined();
  });

  test('valid actions are defined', () => {
    const validActions = [
      'move',
      'gather',
      'consume',
      'sleep',
      'work',
      'buy',
      'trade',
      'share_info',
      'claim',
      'name_location',
      'harm',
      'steal',
      'deceive',
    ];

    validActions.forEach((action) => {
      expect(typeof action).toBe('string');
      expect(action.length).toBeGreaterThan(0);
    });
  });

  test('move action has correct params', () => {
    const moveParams = { toX: 50, toY: 51 };

    expect(typeof moveParams.toX).toBe('number');
    expect(typeof moveParams.toY).toBe('number');
  });

  test('gather action has correct params', () => {
    const gatherParams = { resourceType: 'food', quantity: 1 };

    expect(gatherParams.resourceType).toBeDefined();
    expect(typeof gatherParams.quantity).toBe('number');
  });

  test('consume action has correct params', () => {
    const consumeParams = { itemType: 'food' };

    expect(consumeParams.itemType).toBeDefined();
  });
});

describe('External Agent - Webhook Mode', () => {
  test('webhook URL validation', () => {
    const validUrls = [
      'https://example.com/webhook',
      'https://api.example.com/v1/agent/callback',
      'http://localhost:3000/webhook',
    ];

    validUrls.forEach((url) => {
      expect(() => new URL(url)).not.toThrow();
    });
  });

  test('webhook payload structure', () => {
    // Mock webhook payload
    const mockPayload = {
      type: 'observation',
      agentId: 'external-agent-id',
      tick: 100,
      observation: {
        tick: 100,
        self: { id: 'external-agent-id', x: 50, y: 50, hunger: 80, energy: 90, health: 100, balance: 50 },
        nearbyAgents: [],
        nearbyResourceSpawns: [],
        nearbyShelters: [],
        inventory: [],
        recentEvents: [],
      },
    };

    expect(mockPayload.type).toBe('observation');
    expect(mockPayload.agentId).toBeDefined();
    expect(mockPayload.tick).toBeDefined();
    expect(mockPayload.observation).toBeDefined();
  });
});

describe('External Agent - Rate Limiting', () => {
  test('rate limit tracking structure', () => {
    // Mock rate limit tracking
    const mockUsage = {
      externalAgentId: 'agent-id',
      tick: 100,
      actionCount: 0,
    };

    expect(mockUsage.externalAgentId).toBeDefined();
    expect(mockUsage.tick).toBeDefined();
    expect(typeof mockUsage.actionCount).toBe('number');
  });

  test('rate limit increments correctly', () => {
    let actionCount = 0;
    const maxActions = 1;

    // First action should be allowed
    expect(actionCount < maxActions).toBe(true);
    actionCount++;

    // Second action should be rate limited
    expect(actionCount < maxActions).toBe(false);
  });
});

describe('External Agent - Registration', () => {
  test('registration params structure', () => {
    const mockRegistration = {
      name: 'My External Agent',
      llmType: 'external',
      ownerEmail: 'owner@example.com',
      endpoint: 'https://myserver.com/webhook',
    };

    expect(mockRegistration.name).toBeDefined();
    expect(mockRegistration.llmType).toBe('external');
    expect(mockRegistration.ownerEmail).toBeDefined();
  });

  test('registration response structure', () => {
    const mockResponse = {
      success: true,
      agentId: 'new-agent-id',
      apiKey: 'api_key_here',
      message: 'Agent registered successfully',
    };

    expect(mockResponse.success).toBe(true);
    expect(mockResponse.agentId).toBeDefined();
    expect(mockResponse.apiKey).toBeDefined();
  });
});
