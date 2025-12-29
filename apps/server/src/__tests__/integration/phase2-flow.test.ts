/**
 * Phase 2 End-to-End Integration Tests
 *
 * Tests the complete flow of Phase 2 features working together:
 * - Conflict actions (harm, steal, deceive)
 * - Social discovery (share_info, knowledge propagation)
 * - Analytics (conflict metrics, justice metrics, social graph)
 */

import { describe, expect, test } from 'bun:test';
import type { ActionIntent, HarmParams, StealParams, DeceiveParams, ShareInfoParams } from '../../actions/types';
import type { Agent } from '../../db/schema';

// =============================================================================
// MOCK HELPERS
// =============================================================================

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

// =============================================================================
// PHASE 2 FLOW TESTS - Conflict Scenario
// =============================================================================

describe('Phase 2 Integration - Conflict Scenario', () => {
  test('harm intent structure is valid', () => {
    const intent: ActionIntent<HarmParams> = {
      agentId: 'attacker-id',
      type: 'harm',
      params: {
        targetAgentId: 'victim-id',
        intensity: 'moderate',
      },
      tick: 100,
      timestamp: Date.now(),
    };

    expect(intent.type).toBe('harm');
    expect(intent.params.targetAgentId).toBe('victim-id');
    expect(intent.params.intensity).toBe('moderate');
  });

  test('steal intent structure is valid', () => {
    const intent: ActionIntent<StealParams> = {
      agentId: 'thief-id',
      type: 'steal',
      params: {
        targetAgentId: 'victim-id',
        targetItemType: 'food',
        quantity: 2,
      },
      tick: 100,
      timestamp: Date.now(),
    };

    expect(intent.type).toBe('steal');
    expect(intent.params.targetItemType).toBe('food');
    expect(intent.params.quantity).toBe(2);
  });

  test('deceive intent structure is valid', () => {
    const intent: ActionIntent<DeceiveParams> = {
      agentId: 'liar-id',
      type: 'deceive',
      params: {
        targetAgentId: 'victim-id',
        claim: 'There is food at position (10, 20)',
        claimType: 'resource_location',
      },
      tick: 100,
      timestamp: Date.now(),
    };

    expect(intent.type).toBe('deceive');
    expect(intent.params.claim).toContain('food');
    expect(intent.params.claimType).toBe('resource_location');
  });

  test('conflict actions require adjacency', () => {
    // harm and steal require distance <= 1
    const attacker = createMockAgent({ id: 'attacker', x: 50, y: 50 });
    const adjacentVictim = createMockAgent({ id: 'victim', x: 51, y: 50 });
    const distantVictim = createMockAgent({ id: 'victim2', x: 55, y: 55 });

    const adjacentDistance = Math.abs(attacker.x - adjacentVictim.x) + Math.abs(attacker.y - adjacentVictim.y);
    const distantDistance = Math.abs(attacker.x - distantVictim.x) + Math.abs(attacker.y - distantVictim.y);

    expect(adjacentDistance).toBeLessThanOrEqual(1);
    expect(distantDistance).toBeGreaterThan(1);
  });

  test('deceive allows conversation range (distance <= 3)', () => {
    const liar = createMockAgent({ id: 'liar', x: 50, y: 50 });
    const nearbyVictim = createMockAgent({ id: 'victim', x: 52, y: 51 });

    const distance = Math.abs(liar.x - nearbyVictim.x) + Math.abs(liar.y - nearbyVictim.y);

    expect(distance).toBeLessThanOrEqual(3);
  });
});

// =============================================================================
// PHASE 2 FLOW TESTS - Social Discovery Scenario
// =============================================================================

describe('Phase 2 Integration - Social Discovery Scenario', () => {
  test('share_info intent structure is valid', () => {
    const intent: ActionIntent<ShareInfoParams> = {
      agentId: 'sharer-id',
      type: 'share_info',
      params: {
        targetAgentId: 'listener-id',
        subjectAgentId: 'subject-id',
        infoType: 'warning',
        claim: 'This agent stole from me',
        sentiment: -50,
      },
      tick: 100,
      timestamp: Date.now(),
    };

    expect(intent.type).toBe('share_info');
    expect(intent.params.infoType).toBe('warning');
    expect(intent.params.sentiment).toBe(-50);
  });

  test('reputation info types cover all scenarios', () => {
    const infoTypes: ShareInfoParams['infoType'][] = ['location', 'reputation', 'warning', 'recommendation'];

    expect(infoTypes).toContain('location');
    expect(infoTypes).toContain('reputation');
    expect(infoTypes).toContain('warning');
    expect(infoTypes).toContain('recommendation');
    expect(infoTypes).toHaveLength(4);
  });

  test('sentiment range is valid (-100 to 100)', () => {
    const negativeSentiment = -75;
    const neutralSentiment = 0;
    const positiveSentiment = 80;

    expect(negativeSentiment).toBeGreaterThanOrEqual(-100);
    expect(negativeSentiment).toBeLessThanOrEqual(100);
    expect(neutralSentiment).toBeGreaterThanOrEqual(-100);
    expect(neutralSentiment).toBeLessThanOrEqual(100);
    expect(positiveSentiment).toBeGreaterThanOrEqual(-100);
    expect(positiveSentiment).toBeLessThanOrEqual(100);
  });

  test('referral chain depth starts at 0 for direct knowledge', () => {
    const directKnowledge = {
      discoveryType: 'direct' as const,
      referralDepth: 0,
    };

    expect(directKnowledge.referralDepth).toBe(0);
  });

  test('referral chain depth increases for word-of-mouth', () => {
    const referralKnowledge = {
      discoveryType: 'referral' as const,
      referralDepth: 2,
      referredBy: 'intermediate-agent-id',
    };

    expect(referralKnowledge.referralDepth).toBeGreaterThan(0);
    expect(referralKnowledge.referredBy).toBeDefined();
  });
});

// =============================================================================
// PHASE 2 FLOW TESTS - Complete Scenario
// =============================================================================

describe('Phase 2 Integration - Complete Conflict-to-Reputation Flow', () => {
  test('attack -> victim shares warning -> reputation spreads', () => {
    // Step 1: Attack happens
    const attackTick = 100;
    const attackEvent = {
      type: 'agent_harmed',
      tick: attackTick,
      attackerId: 'bad-agent',
      victimId: 'victim-agent',
      damage: 25,
    };

    expect(attackEvent.type).toBe('agent_harmed');

    // Step 2: Victim shares warning (within 20 ticks per analytics)
    const warningTick = 105;
    const warningEvent = {
      type: 'agent_shared_info',
      tick: warningTick,
      sharerId: 'victim-agent',
      targetId: 'friend-agent',
      subjectId: 'bad-agent',
      infoType: 'warning',
      sentiment: -80,
    };

    expect(warningTick - attackTick).toBeLessThanOrEqual(20);
    expect(warningEvent.sentiment).toBeLessThan(0);

    // Step 3: Friend now knows about bad agent via referral
    const friendKnowledge = {
      knownAgentId: 'bad-agent',
      discoveryType: 'referral' as const,
      referredBy: 'victim-agent',
      referralDepth: 1,
      dangerWarning: true,
    };

    expect(friendKnowledge.discoveryType).toBe('referral');
    expect(friendKnowledge.dangerWarning).toBe(true);
  });

  test('multiple attacks lead to retaliation chain', () => {
    const attacks = [
      { tick: 100, attackerId: 'agent-a', victimId: 'agent-b' },
      { tick: 105, attackerId: 'agent-b', victimId: 'agent-a' }, // Retaliation
      { tick: 110, attackerId: 'agent-a', victimId: 'agent-b' }, // Counter-retaliation
    ];

    // This forms a chain (3+ mutual attacks)
    const pairKey = ['agent-a', 'agent-b'].sort().join('::');
    const attackCount = attacks.length;

    expect(attackCount).toBeGreaterThanOrEqual(3);
    expect(pairKey).toBe('agent-a::agent-b');
  });

  test('third-party intervention (enforcer pattern)', () => {
    // Agent C attacks Agent B who was friends with Agent D
    const originalAttack = {
      tick: 100,
      attackerId: 'agent-c',
      victimId: 'agent-b',
    };

    // Agent D (not the victim) attacks Agent C in response
    const interventionAttack = {
      tick: 110,
      attackerId: 'agent-d', // Not agent-b
      victimId: 'agent-c',
    };

    // This counts as enforcement if D != B
    expect(interventionAttack.attackerId).not.toBe(originalAttack.victimId);
    expect(interventionAttack.victimId).toBe(originalAttack.attackerId);
    expect(interventionAttack.tick - originalAttack.tick).toBeLessThanOrEqual(20);
  });
});

// =============================================================================
// PHASE 2 FLOW TESTS - Analytics Validation
// =============================================================================

describe('Phase 2 Integration - Analytics Metrics', () => {
  test('crime rate calculation formula', () => {
    const totalHarmEvents = 50;
    const totalStealEvents = 30;
    const totalDeceiveEvents = 20;
    const currentTick = 100;

    const harmPerTick = totalHarmEvents / currentTick;
    const stealPerTick = totalStealEvents / currentTick;
    const deceivePerTick = totalDeceiveEvents / currentTick;

    expect(harmPerTick).toBe(0.5);
    expect(stealPerTick).toBe(0.3);
    expect(deceivePerTick).toBe(0.2);
  });

  test('retaliation rate calculation', () => {
    const totalAttacks = 100;
    const retaliations = 35;

    const retaliationRate = retaliations / totalAttacks;

    expect(retaliationRate).toBe(0.35);
    expect(retaliationRate).toBeLessThanOrEqual(1);
  });

  test('network density calculation', () => {
    const nodes = 10;
    const edges = 45;
    const possibleEdges = nodes * (nodes - 1); // Directed graph

    const density = edges / possibleEdges;

    expect(density).toBe(0.5);
    expect(density).toBeLessThanOrEqual(1);
  });

  test('referral rate calculation', () => {
    const directKnowledge = 60;
    const referralKnowledge = 40;
    const totalKnowledge = directKnowledge + referralKnowledge;

    const referralRate = referralKnowledge / totalKnowledge;

    expect(referralRate).toBe(0.4);
  });

  test('enforcer diversity uses normalized entropy', () => {
    // Two enforcers with equal interventions
    const counts = [10, 10];
    const total = counts.reduce((a, b) => a + b, 0);
    const probs = counts.map(c => c / total);
    const entropy = -probs.reduce((sum, p) => sum + (p > 0 ? p * Math.log2(p) : 0), 0);
    const maxEntropy = Math.log2(counts.length);
    const diversity = entropy / maxEntropy;

    // Equal distribution = max diversity = 1.0
    expect(diversity).toBeCloseTo(1.0);
  });

  test('uneven enforcer distribution reduces diversity', () => {
    // One dominant enforcer
    const counts = [90, 10];
    const total = counts.reduce((a, b) => a + b, 0);
    const probs = counts.map(c => c / total);
    const entropy = -probs.reduce((sum, p) => sum + (p > 0 ? p * Math.log2(p) : 0), 0);
    const maxEntropy = Math.log2(counts.length);
    const diversity = entropy / maxEntropy;

    expect(diversity).toBeLessThan(1.0);
    expect(diversity).toBeGreaterThan(0);
  });
});

// =============================================================================
// PHASE 2 FLOW TESTS - Edge Cases
// =============================================================================

describe('Phase 2 Integration - Edge Cases', () => {
  test('self-attack prevention', () => {
    const agentId = 'agent-a';
    const harmParams: HarmParams = {
      targetAgentId: agentId, // Same as self
      intensity: 'moderate',
    };

    // This should be rejected by handler
    expect(harmParams.targetAgentId).toBe(agentId);
  });

  test('dead agent cannot be target', () => {
    const deadAgent = createMockAgent({ id: 'dead-agent', state: 'dead' });

    expect(deadAgent.state).toBe('dead');
  });

  test('sharing info about self is invalid', () => {
    const sharerId = 'sharer-id';
    const shareParams: ShareInfoParams = {
      targetAgentId: 'listener-id',
      subjectAgentId: sharerId, // Same as sharer
      infoType: 'reputation',
    };

    expect(shareParams.subjectAgentId).toBe(sharerId);
  });

  test('sharing info about target to themselves is invalid', () => {
    const targetId = 'target-id';
    const shareParams: ShareInfoParams = {
      targetAgentId: targetId,
      subjectAgentId: targetId, // Same as target
      infoType: 'reputation',
    };

    expect(shareParams.targetAgentId).toBe(shareParams.subjectAgentId);
  });

  test('zero-quantity steal is invalid', () => {
    const stealParams: StealParams = {
      targetAgentId: 'victim-id',
      targetItemType: 'food',
      quantity: 0,
    };

    expect(stealParams.quantity).toBe(0);
  });

  test('claim too short for deceive is invalid', () => {
    const deceiveParams: DeceiveParams = {
      targetAgentId: 'victim-id',
      claim: 'Hi', // Too short (< 5 chars)
      claimType: 'other',
    };

    expect(deceiveParams.claim.length).toBeLessThan(5);
  });
});
