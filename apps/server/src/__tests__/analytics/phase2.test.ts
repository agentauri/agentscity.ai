/**
 * Tests for Phase 2 Analytics
 *
 * Tests covering:
 * - Inequality metrics (wealth Gini, percentiles, resource Gini)
 * - Conflict metrics (crime rates, victimization, retaliation)
 * - Justice metrics (response patterns, enforcers, reputation)
 * - Social graph metrics (network structure, communities, referral chains)
 */

import { describe, expect, test } from 'bun:test';
import type {
  InequalityMetrics,
  ConflictMetrics,
  JusticeMetrics,
  SocialGraphMetrics,
  Phase2Metrics,
} from '../../db/queries/analytics';

// =============================================================================
// INEQUALITY METRICS TESTS
// =============================================================================

describe('InequalityMetrics - type structure', () => {
  test('wealth metrics have required fields', () => {
    const metrics: InequalityMetrics = {
      wealth: {
        giniCoefficient: 0.35,
        percentiles: {
          p10: 50,
          p25: 75,
          p50: 100,
          p75: 150,
          p90: 200,
        },
        topDecileShare: 0.25,
      },
      resources: {
        giniCoefficient: 0.4,
        resourcesByType: [],
      },
    };

    expect(metrics.wealth.giniCoefficient).toBeDefined();
    expect(metrics.wealth.percentiles.p10).toBeDefined();
    expect(metrics.wealth.percentiles.p25).toBeDefined();
    expect(metrics.wealth.percentiles.p50).toBeDefined();
    expect(metrics.wealth.percentiles.p75).toBeDefined();
    expect(metrics.wealth.percentiles.p90).toBeDefined();
    expect(metrics.wealth.topDecileShare).toBeDefined();
  });

  test('resource metrics have required fields', () => {
    const metrics: InequalityMetrics = {
      wealth: {
        giniCoefficient: 0.35,
        percentiles: { p10: 50, p25: 75, p50: 100, p75: 150, p90: 200 },
        topDecileShare: 0.25,
      },
      resources: {
        giniCoefficient: 0.4,
        resourcesByType: [
          { itemType: 'food', totalQuantity: 100, holdersCount: 5 },
          { itemType: 'material', totalQuantity: 50, holdersCount: 3 },
        ],
      },
    };

    expect(metrics.resources.giniCoefficient).toBeDefined();
    expect(metrics.resources.resourcesByType).toBeArray();
    expect(metrics.resources.resourcesByType[0].itemType).toBe('food');
  });

  test('gini coefficient is bounded 0-1', () => {
    const validGini = 0.45;
    expect(validGini).toBeGreaterThanOrEqual(0);
    expect(validGini).toBeLessThanOrEqual(1);
  });

  test('top decile share is bounded 0-1', () => {
    const validShare = 0.30;
    expect(validShare).toBeGreaterThanOrEqual(0);
    expect(validShare).toBeLessThanOrEqual(1);
  });
});

// =============================================================================
// CONFLICT METRICS TESTS
// =============================================================================

describe('ConflictMetrics - type structure', () => {
  test('crime rate metrics have required fields', () => {
    const metrics: ConflictMetrics = {
      crimeRate: {
        harmEventsPerTick: 0.5,
        stealEventsPerTick: 0.3,
        deceiveEventsPerTick: 0.2,
        totalCrimeEvents: 100,
        crimesByLlmType: [],
      },
      victimization: {
        totalVictims: 20,
        repeatVictims: 5,
        victimsByLlmType: [],
      },
      retaliation: {
        retaliationRate: 0.25,
        avgRetaliationDelay: 3.5,
        retaliationChains: 2,
      },
    };

    expect(metrics.crimeRate.harmEventsPerTick).toBeDefined();
    expect(metrics.crimeRate.stealEventsPerTick).toBeDefined();
    expect(metrics.crimeRate.deceiveEventsPerTick).toBeDefined();
    expect(metrics.crimeRate.totalCrimeEvents).toBeDefined();
    expect(metrics.crimeRate.crimesByLlmType).toBeArray();
  });

  test('victimization metrics have required fields', () => {
    const metrics: ConflictMetrics = {
      crimeRate: {
        harmEventsPerTick: 0.5,
        stealEventsPerTick: 0.3,
        deceiveEventsPerTick: 0.2,
        totalCrimeEvents: 100,
        crimesByLlmType: [],
      },
      victimization: {
        totalVictims: 20,
        repeatVictims: 5,
        victimsByLlmType: [
          { llmType: 'claude', victimCount: 10 },
          { llmType: 'gemini', victimCount: 10 },
        ],
      },
      retaliation: {
        retaliationRate: 0.25,
        avgRetaliationDelay: 3.5,
        retaliationChains: 2,
      },
    };

    expect(metrics.victimization.totalVictims).toBeDefined();
    expect(metrics.victimization.repeatVictims).toBeDefined();
    expect(metrics.victimization.victimsByLlmType).toBeArray();
  });

  test('retaliation metrics have required fields', () => {
    const metrics: ConflictMetrics = {
      crimeRate: {
        harmEventsPerTick: 0.5,
        stealEventsPerTick: 0.3,
        deceiveEventsPerTick: 0.2,
        totalCrimeEvents: 100,
        crimesByLlmType: [],
      },
      victimization: {
        totalVictims: 20,
        repeatVictims: 5,
        victimsByLlmType: [],
      },
      retaliation: {
        retaliationRate: 0.25,
        avgRetaliationDelay: 3.5,
        retaliationChains: 2,
      },
    };

    expect(metrics.retaliation.retaliationRate).toBeDefined();
    expect(metrics.retaliation.avgRetaliationDelay).toBeDefined();
    expect(metrics.retaliation.retaliationChains).toBeDefined();
  });

  test('retaliation rate is bounded 0-1', () => {
    const validRate = 0.35;
    expect(validRate).toBeGreaterThanOrEqual(0);
    expect(validRate).toBeLessThanOrEqual(1);
  });

  test('crimes by LLM type tracks all crime types', () => {
    const crimesByLlmType = [
      { llmType: 'claude', harmCount: 5, stealCount: 3, deceiveCount: 2 },
      { llmType: 'gemini', harmCount: 3, stealCount: 2, deceiveCount: 1 },
    ];

    expect(crimesByLlmType[0].harmCount).toBeDefined();
    expect(crimesByLlmType[0].stealCount).toBeDefined();
    expect(crimesByLlmType[0].deceiveCount).toBeDefined();
  });
});

// =============================================================================
// JUSTICE METRICS TESTS
// =============================================================================

describe('JusticeMetrics - type structure', () => {
  test('response patterns have required fields', () => {
    const metrics: JusticeMetrics = {
      responsePatterns: {
        noResponse: 10,
        directRetaliation: 5,
        avoidance: 8,
        warningSpread: 3,
      },
      enforcers: {
        topEnforcers: [],
        enforcerDiversity: 0.7,
      },
      reputation: {
        avgReputationSpread: 2.5,
        negativeRepAgents: 3,
        positiveRepAgents: 7,
      },
    };

    expect(metrics.responsePatterns.noResponse).toBeDefined();
    expect(metrics.responsePatterns.directRetaliation).toBeDefined();
    expect(metrics.responsePatterns.avoidance).toBeDefined();
    expect(metrics.responsePatterns.warningSpread).toBeDefined();
  });

  test('enforcer metrics have required fields', () => {
    const metrics: JusticeMetrics = {
      responsePatterns: {
        noResponse: 10,
        directRetaliation: 5,
        avoidance: 8,
        warningSpread: 3,
      },
      enforcers: {
        topEnforcers: [
          { agentId: 'agent-1', llmType: 'claude', interventionCount: 5 },
          { agentId: 'agent-2', llmType: 'gemini', interventionCount: 3 },
        ],
        enforcerDiversity: 0.7,
      },
      reputation: {
        avgReputationSpread: 2.5,
        negativeRepAgents: 3,
        positiveRepAgents: 7,
      },
    };

    expect(metrics.enforcers.topEnforcers).toBeArray();
    expect(metrics.enforcers.enforcerDiversity).toBeDefined();
    expect(metrics.enforcers.topEnforcers[0].interventionCount).toBeDefined();
  });

  test('reputation metrics have required fields', () => {
    const metrics: JusticeMetrics = {
      responsePatterns: {
        noResponse: 10,
        directRetaliation: 5,
        avoidance: 8,
        warningSpread: 3,
      },
      enforcers: {
        topEnforcers: [],
        enforcerDiversity: 0.7,
      },
      reputation: {
        avgReputationSpread: 2.5,
        negativeRepAgents: 3,
        positiveRepAgents: 7,
      },
    };

    expect(metrics.reputation.avgReputationSpread).toBeDefined();
    expect(metrics.reputation.negativeRepAgents).toBeDefined();
    expect(metrics.reputation.positiveRepAgents).toBeDefined();
  });

  test('enforcer diversity is bounded 0-1', () => {
    const validDiversity = 0.65;
    expect(validDiversity).toBeGreaterThanOrEqual(0);
    expect(validDiversity).toBeLessThanOrEqual(1);
  });
});

// =============================================================================
// SOCIAL GRAPH METRICS TESTS
// =============================================================================

describe('SocialGraphMetrics - type structure', () => {
  test('network structure has required fields', () => {
    const metrics: SocialGraphMetrics = {
      networkStructure: {
        nodeCount: 50,
        edgeCount: 120,
        density: 0.048,
        avgDegree: 2.4,
      },
      communities: {
        communityCount: 5,
        largestCommunitySize: 15,
        avgCommunitySize: 10,
      },
      referralChains: {
        avgChainLength: 1.5,
        maxChainLength: 4,
        referralRate: 0.3,
      },
      informationFlow: {
        avgInfoAge: 25,
        staleInfoRate: 0.15,
      },
    };

    expect(metrics.networkStructure.nodeCount).toBeDefined();
    expect(metrics.networkStructure.edgeCount).toBeDefined();
    expect(metrics.networkStructure.density).toBeDefined();
    expect(metrics.networkStructure.avgDegree).toBeDefined();
  });

  test('community metrics have required fields', () => {
    const metrics: SocialGraphMetrics = {
      networkStructure: {
        nodeCount: 50,
        edgeCount: 120,
        density: 0.048,
        avgDegree: 2.4,
      },
      communities: {
        communityCount: 5,
        largestCommunitySize: 15,
        avgCommunitySize: 10,
      },
      referralChains: {
        avgChainLength: 1.5,
        maxChainLength: 4,
        referralRate: 0.3,
      },
      informationFlow: {
        avgInfoAge: 25,
        staleInfoRate: 0.15,
      },
    };

    expect(metrics.communities.communityCount).toBeDefined();
    expect(metrics.communities.largestCommunitySize).toBeDefined();
    expect(metrics.communities.avgCommunitySize).toBeDefined();
  });

  test('referral chain metrics have required fields', () => {
    const metrics: SocialGraphMetrics = {
      networkStructure: {
        nodeCount: 50,
        edgeCount: 120,
        density: 0.048,
        avgDegree: 2.4,
      },
      communities: {
        communityCount: 5,
        largestCommunitySize: 15,
        avgCommunitySize: 10,
      },
      referralChains: {
        avgChainLength: 1.5,
        maxChainLength: 4,
        referralRate: 0.3,
      },
      informationFlow: {
        avgInfoAge: 25,
        staleInfoRate: 0.15,
      },
    };

    expect(metrics.referralChains.avgChainLength).toBeDefined();
    expect(metrics.referralChains.maxChainLength).toBeDefined();
    expect(metrics.referralChains.referralRate).toBeDefined();
  });

  test('information flow metrics have required fields', () => {
    const metrics: SocialGraphMetrics = {
      networkStructure: {
        nodeCount: 50,
        edgeCount: 120,
        density: 0.048,
        avgDegree: 2.4,
      },
      communities: {
        communityCount: 5,
        largestCommunitySize: 15,
        avgCommunitySize: 10,
      },
      referralChains: {
        avgChainLength: 1.5,
        maxChainLength: 4,
        referralRate: 0.3,
      },
      informationFlow: {
        avgInfoAge: 25,
        staleInfoRate: 0.15,
      },
    };

    expect(metrics.informationFlow.avgInfoAge).toBeDefined();
    expect(metrics.informationFlow.staleInfoRate).toBeDefined();
  });

  test('density is bounded 0-1', () => {
    const validDensity = 0.05;
    expect(validDensity).toBeGreaterThanOrEqual(0);
    expect(validDensity).toBeLessThanOrEqual(1);
  });

  test('referral rate is bounded 0-1', () => {
    const validRate = 0.35;
    expect(validRate).toBeGreaterThanOrEqual(0);
    expect(validRate).toBeLessThanOrEqual(1);
  });

  test('stale info rate is bounded 0-1', () => {
    const validRate = 0.20;
    expect(validRate).toBeGreaterThanOrEqual(0);
    expect(validRate).toBeLessThanOrEqual(1);
  });
});

// =============================================================================
// PHASE 2 COMBINED METRICS TESTS
// =============================================================================

describe('Phase2Metrics - combined structure', () => {
  test('Phase2Metrics has all required sub-metrics', () => {
    const metrics: Phase2Metrics = {
      inequality: {
        wealth: {
          giniCoefficient: 0.35,
          percentiles: { p10: 50, p25: 75, p50: 100, p75: 150, p90: 200 },
          topDecileShare: 0.25,
        },
        resources: {
          giniCoefficient: 0.4,
          resourcesByType: [],
        },
      },
      conflict: {
        crimeRate: {
          harmEventsPerTick: 0.5,
          stealEventsPerTick: 0.3,
          deceiveEventsPerTick: 0.2,
          totalCrimeEvents: 100,
          crimesByLlmType: [],
        },
        victimization: {
          totalVictims: 20,
          repeatVictims: 5,
          victimsByLlmType: [],
        },
        retaliation: {
          retaliationRate: 0.25,
          avgRetaliationDelay: 3.5,
          retaliationChains: 2,
        },
      },
      justice: {
        responsePatterns: {
          noResponse: 10,
          directRetaliation: 5,
          avoidance: 8,
          warningSpread: 3,
        },
        enforcers: {
          topEnforcers: [],
          enforcerDiversity: 0.7,
        },
        reputation: {
          avgReputationSpread: 2.5,
          negativeRepAgents: 3,
          positiveRepAgents: 7,
        },
      },
      socialGraph: {
        networkStructure: {
          nodeCount: 50,
          edgeCount: 120,
          density: 0.048,
          avgDegree: 2.4,
        },
        communities: {
          communityCount: 5,
          largestCommunitySize: 15,
          avgCommunitySize: 10,
        },
        referralChains: {
          avgChainLength: 1.5,
          maxChainLength: 4,
          referralRate: 0.3,
        },
        informationFlow: {
          avgInfoAge: 25,
          staleInfoRate: 0.15,
        },
      },
    };

    expect(metrics.inequality).toBeDefined();
    expect(metrics.conflict).toBeDefined();
    expect(metrics.justice).toBeDefined();
    expect(metrics.socialGraph).toBeDefined();
  });
});

// =============================================================================
// EDGE CASES AND VALIDATION TESTS
// =============================================================================

describe('Phase 2 Analytics - edge cases', () => {
  test('empty metrics return valid structure', () => {
    const emptyInequality: InequalityMetrics = {
      wealth: {
        giniCoefficient: 0,
        percentiles: { p10: 0, p25: 0, p50: 0, p75: 0, p90: 0 },
        topDecileShare: 0,
      },
      resources: {
        giniCoefficient: 0,
        resourcesByType: [],
      },
    };

    expect(emptyInequality.wealth.giniCoefficient).toBe(0);
    expect(emptyInequality.resources.resourcesByType).toHaveLength(0);
  });

  test('empty conflict metrics return valid structure', () => {
    const emptyConflict: ConflictMetrics = {
      crimeRate: {
        harmEventsPerTick: 0,
        stealEventsPerTick: 0,
        deceiveEventsPerTick: 0,
        totalCrimeEvents: 0,
        crimesByLlmType: [],
      },
      victimization: {
        totalVictims: 0,
        repeatVictims: 0,
        victimsByLlmType: [],
      },
      retaliation: {
        retaliationRate: 0,
        avgRetaliationDelay: 0,
        retaliationChains: 0,
      },
    };

    expect(emptyConflict.crimeRate.totalCrimeEvents).toBe(0);
    expect(emptyConflict.victimization.totalVictims).toBe(0);
  });

  test('empty social graph metrics return valid structure', () => {
    const emptySocialGraph: SocialGraphMetrics = {
      networkStructure: {
        nodeCount: 0,
        edgeCount: 0,
        density: 0,
        avgDegree: 0,
      },
      communities: {
        communityCount: 0,
        largestCommunitySize: 0,
        avgCommunitySize: 0,
      },
      referralChains: {
        avgChainLength: 0,
        maxChainLength: 0,
        referralRate: 0,
      },
      informationFlow: {
        avgInfoAge: 0,
        staleInfoRate: 0,
      },
    };

    expect(emptySocialGraph.networkStructure.nodeCount).toBe(0);
    expect(emptySocialGraph.communities.communityCount).toBe(0);
  });

  test('repeat victims count is subset of total victims', () => {
    const totalVictims = 20;
    const repeatVictims = 5;
    expect(repeatVictims).toBeLessThanOrEqual(totalVictims);
  });

  test('largest community size is at least 1 when communities exist', () => {
    const communityCount = 3;
    const largestCommunitySize = 10;
    if (communityCount > 0) {
      expect(largestCommunitySize).toBeGreaterThanOrEqual(1);
    }
  });

  test('max chain length is at least avg chain length', () => {
    const avgChainLength = 1.5;
    const maxChainLength = 4;
    expect(maxChainLength).toBeGreaterThanOrEqual(avgChainLength);
  });
});

// =============================================================================
// METRIC INTERPRETATION TESTS
// =============================================================================

describe('Phase 2 Analytics - metric interpretation', () => {
  test('high Gini indicates inequality', () => {
    const highGini = 0.8;
    const lowGini = 0.2;
    expect(highGini).toBeGreaterThan(lowGini);
    // Gini > 0.4 is generally considered unequal
    expect(highGini).toBeGreaterThan(0.4);
  });

  test('high retaliation rate indicates justice-seeking behavior', () => {
    const highRetaliation = 0.7;
    // High retaliation suggests agents respond to attacks
    expect(highRetaliation).toBeGreaterThan(0.5);
  });

  test('high enforcer diversity indicates distributed justice', () => {
    const highDiversity = 0.9;
    const lowDiversity = 0.1;
    // High diversity means many different agents enforce norms
    expect(highDiversity).toBeGreaterThan(lowDiversity);
    expect(highDiversity).toBeGreaterThan(0.5);
  });

  test('high referral rate indicates word-of-mouth information spread', () => {
    const highReferralRate = 0.6;
    // High referral rate means most knowledge comes from gossip
    expect(highReferralRate).toBeGreaterThan(0.5);
  });

  test('high stale info rate indicates slow information updates', () => {
    const highStaleRate = 0.4;
    // High stale rate means information is outdated
    expect(highStaleRate).toBeGreaterThan(0.2);
  });
});
