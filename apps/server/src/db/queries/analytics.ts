/**
 * Analytics queries for experimental metrics
 */

import { eq, sql, desc, and, gte } from 'drizzle-orm';
import { db, agents, events, ledger, agentRelationships, agentKnowledge, inventory } from '../index';
import { agentCredentials, gossipEvents, agentLineages, reproductionStates, llmMetrics } from '../schema';

// =============================================================================
// Types
// =============================================================================

export interface SurvivalMetrics {
  byLlmType: {
    llmType: string;
    aliveCount: number;
    deadCount: number;
    avgHealth: number;
    avgHunger: number;
    avgEnergy: number;
    avgBalance: number;
  }[];
  overall: {
    totalAlive: number;
    totalDead: number;
    totalAgents: number;
  };
  deathCauses: {
    starvation: number;
    exhaustion: number;
  };
}

export interface EconomyMetrics {
  moneySupply: number;
  giniCoefficient: number;
  balanceDistribution: {
    min: number;
    max: number;
    median: number;
    mean: number;
  };
  byLlmType: {
    llmType: string;
    totalBalance: number;
    avgBalance: number;
  }[];
}

export interface BehaviorMetrics {
  actionFrequency: {
    actionType: string;
    count: number;
    percentage: number;
  }[];
  byLlmType: {
    llmType: string;
    actions: Record<string, number>;
    fallbackRate: number;
    avgProcessingTime: number;
  }[];
}

export interface TemporalMetrics {
  tickDurations: {
    tick: number;
    duration: number;
    agentCount: number;
    actionsExecuted: number;
  }[];
  eventsByTick: {
    tick: number;
    eventCount: number;
  }[];
  currentTick: number;
}

// Phase 1: Emergence Metrics
export interface EmergenceMetrics {
  clustering: {
    numClusters: number;
    avgClusterSize: number;
    largestClusterSize: number;
  };
  tradeNetwork: {
    totalTrades: number;
    uniqueTradingPairs: number;
    repeatTradeRate: number; // Percentage of trades with previous partners
    avgTradesPerAgent: number;
  };
  trustPatterns: {
    avgTrustScore: number;
    positiveTrustLinks: number;
    negativeTrustLinks: number;
    neutralTrustLinks: number;
    totalRelationships: number;
  };
  cooperationIndex: number; // 0-1 scale, higher = more cooperation
}

// =============================================================================
// Phase 2: Advanced Analytics Types
// =============================================================================

export interface InequalityMetrics {
  wealth: {
    giniCoefficient: number;
    percentiles: {
      p10: number;
      p25: number;
      p50: number;
      p75: number;
      p90: number;
    };
    topDecileShare: number; // Percentage of wealth held by top 10%
  };
  resources: {
    giniCoefficient: number;
    resourcesByType: {
      itemType: string;
      totalQuantity: number;
      holdersCount: number;
    }[];
  };
}

export interface ConflictMetrics {
  crimeRate: {
    harmEventsPerTick: number;
    stealEventsPerTick: number;
    deceiveEventsPerTick: number;
    totalCrimeEvents: number;
    crimesByLlmType: {
      llmType: string;
      harmCount: number;
      stealCount: number;
      deceiveCount: number;
    }[];
  };
  victimization: {
    totalVictims: number;
    repeatVictims: number; // Agents victimized multiple times
    victimsByLlmType: {
      llmType: string;
      victimCount: number;
    }[];
  };
  retaliation: {
    retaliationRate: number; // Percentage of attacks that were retaliated
    avgRetaliationDelay: number; // Average ticks between being attacked and retaliating
    retaliationChains: number; // Number of ongoing revenge cycles
  };
}

export interface JusticeMetrics {
  responsePatterns: {
    noResponse: number; // Victims who took no action
    directRetaliation: number; // Victims who attacked back
    avoidance: number; // Victims who moved away
    warningSpread: number; // Victims who warned others
  };
  enforcers: {
    topEnforcers: {
      agentId: string;
      llmType: string;
      interventionCount: number;
    }[];
    enforcerDiversity: number; // How evenly distributed enforcement is
  };
  reputation: {
    avgReputationSpread: number; // How quickly reputation info spreads
    negativeRepAgents: number; // Agents with mostly negative reputation
    positiveRepAgents: number; // Agents with mostly positive reputation
  };
}

export interface SocialGraphMetrics {
  networkStructure: {
    nodeCount: number;
    edgeCount: number;
    density: number; // Actual edges / possible edges
    avgDegree: number; // Average connections per agent
  };
  communities: {
    communityCount: number;
    largestCommunitySize: number;
    avgCommunitySize: number;
  };
  referralChains: {
    avgChainLength: number;
    maxChainLength: number;
    referralRate: number; // Percentage of knowledge from referrals vs direct
  };
  informationFlow: {
    avgInfoAge: number; // How stale knowledge typically is
    staleInfoRate: number; // Percentage of knowledge older than threshold
  };
}

export interface Phase2Metrics {
  inequality: InequalityMetrics;
  conflict: ConflictMetrics;
  justice: JusticeMetrics;
  socialGraph: SocialGraphMetrics;
}

// Phase 4 Metrics (Credentials, Gossip, Reproduction, LLM Performance)
export interface Phase4Metrics {
  credentials: {
    totalIssued: number;
    totalActive: number;
    totalRevoked: number;
    byClaimType: Record<string, number>;
  };
  gossip: {
    totalEvents: number;
    averageSentiment: number;
    byTopic: Record<string, number>;
    mostDiscussedAgents: Array<{ agentId: string; count: number }>;
  };
  reproduction: {
    totalBirths: number;
    gestationsInProgress: number;
    generationDistribution: Record<number, number>;
    maxGeneration: number;
  };
  llmPerformance: {
    totalCalls: number;
    avgLatencyMs: number;
    successRate: number;
    fallbackRate: number;
    byModel: Record<string, { calls: number; avgLatency: number; successRate: number }>;
  };
}

export interface AnalyticsSnapshot {
  survival: SurvivalMetrics;
  economy: EconomyMetrics;
  behavior: BehaviorMetrics;
  temporal: TemporalMetrics;
  emergence?: EmergenceMetrics; // Phase 1: optional until tables exist
  phase2?: Phase2Metrics; // Phase 2: advanced analytics
  phase4?: Phase4Metrics; // Phase 4: credentials, gossip, reproduction, LLM
  timestamp: number;
}

// =============================================================================
// Survival Metrics
// =============================================================================

export async function getSurvivalMetrics(): Promise<SurvivalMetrics> {
  // Get stats by LLM type
  const byLlmType = await db
    .select({
      llmType: agents.llmType,
      aliveCount: sql<number>`COUNT(*) FILTER (WHERE ${agents.state} != 'dead')`,
      deadCount: sql<number>`COUNT(*) FILTER (WHERE ${agents.state} = 'dead')`,
      avgHealth: sql<number>`AVG(CASE WHEN ${agents.state} != 'dead' THEN ${agents.health} END)`,
      avgHunger: sql<number>`AVG(CASE WHEN ${agents.state} != 'dead' THEN ${agents.hunger} END)`,
      avgEnergy: sql<number>`AVG(CASE WHEN ${agents.state} != 'dead' THEN ${agents.energy} END)`,
      avgBalance: sql<number>`AVG(CASE WHEN ${agents.state} != 'dead' THEN ${agents.balance} END)`,
    })
    .from(agents)
    .groupBy(agents.llmType);

  // Get overall totals
  const overall = await db
    .select({
      totalAlive: sql<number>`COUNT(*) FILTER (WHERE ${agents.state} != 'dead')`,
      totalDead: sql<number>`COUNT(*) FILTER (WHERE ${agents.state} = 'dead')`,
      totalAgents: sql<number>`COUNT(*)`,
    })
    .from(agents);

  // Get death causes from events
  const deathEvents = await db
    .select({
      cause: sql<string>`${events.payload}->>'cause'`,
      count: sql<number>`COUNT(*)`,
    })
    .from(events)
    .where(eq(events.eventType, 'agent_died'))
    .groupBy(sql`${events.payload}->>'cause'`);

  const deathCauses = {
    starvation: 0,
    exhaustion: 0,
  };
  for (const event of deathEvents) {
    if (event.cause === 'starvation') deathCauses.starvation = event.count;
    if (event.cause === 'exhaustion') deathCauses.exhaustion = event.count;
  }

  return {
    byLlmType: byLlmType.map((row) => ({
      llmType: row.llmType,
      aliveCount: Number(row.aliveCount) || 0,
      deadCount: Number(row.deadCount) || 0,
      avgHealth: Number(row.avgHealth) || 0,
      avgHunger: Number(row.avgHunger) || 0,
      avgEnergy: Number(row.avgEnergy) || 0,
      avgBalance: Number(row.avgBalance) || 0,
    })),
    overall: {
      totalAlive: Number(overall[0]?.totalAlive) || 0,
      totalDead: Number(overall[0]?.totalDead) || 0,
      totalAgents: Number(overall[0]?.totalAgents) || 0,
    },
    deathCauses,
  };
}

// =============================================================================
// Economy Metrics
// =============================================================================

export async function getEconomyMetrics(): Promise<EconomyMetrics> {
  // Get money supply and distribution
  const distribution = await db
    .select({
      moneySupply: sql<number>`SUM(${agents.balance})`,
      minBalance: sql<number>`MIN(${agents.balance})`,
      maxBalance: sql<number>`MAX(${agents.balance})`,
      meanBalance: sql<number>`AVG(${agents.balance})`,
      medianBalance: sql<number>`PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${agents.balance})`,
    })
    .from(agents)
    .where(sql`${agents.state} != 'dead'`);

  // Calculate Gini coefficient using simpler formula
  // Gini = (2 * sum(i * y_i) / (n * sum(y_i))) - (n + 1) / n
  // where y_i is sorted balance and i is rank
  const giniResult = await db.execute<{ gini: number }>(sql`
    WITH agent_count AS (
      SELECT COUNT(*) as n FROM agents WHERE state != 'dead' AND balance > 0
    ),
    sorted_balances AS (
      SELECT
        balance,
        ROW_NUMBER() OVER (ORDER BY balance) as rank
      FROM agents
      WHERE state != 'dead' AND balance > 0
    )
    SELECT
      CASE
        WHEN (SELECT n FROM agent_count) <= 1 THEN 0
        WHEN SUM(balance) = 0 THEN 0
        ELSE (2.0 * SUM(rank * balance) / ((SELECT n FROM agent_count) * SUM(balance)))
             - ((SELECT n FROM agent_count) + 1.0) / (SELECT n FROM agent_count)
      END as gini
    FROM sorted_balances
  `);

  // Get by LLM type
  const byLlmType = await db
    .select({
      llmType: agents.llmType,
      totalBalance: sql<number>`SUM(${agents.balance})`,
      avgBalance: sql<number>`AVG(${agents.balance})`,
    })
    .from(agents)
    .where(sql`${agents.state} != 'dead'`)
    .groupBy(agents.llmType);

  const dist = distribution[0];

  // Handle Drizzle execute result - it returns array directly or object with rows
  const giniRows = Array.isArray(giniResult) ? giniResult : (giniResult as any).rows || [];
  const giniValue = giniRows[0]?.gini;

  return {
    moneySupply: Number(dist?.moneySupply) || 0,
    giniCoefficient: Number(giniValue) || 0,
    balanceDistribution: {
      min: Number(dist?.minBalance) || 0,
      max: Number(dist?.maxBalance) || 0,
      median: Number(dist?.medianBalance) || 0,
      mean: Number(dist?.meanBalance) || 0,
    },
    byLlmType: byLlmType.map((row) => ({
      llmType: row.llmType,
      totalBalance: Number(row.totalBalance) || 0,
      avgBalance: Number(row.avgBalance) || 0,
    })),
  };
}

// =============================================================================
// Behavior Metrics
// =============================================================================

export async function getBehaviorMetrics(): Promise<BehaviorMetrics> {
  // Get action frequency (only agent action events)
  const actionFreq = await db
    .select({
      actionType: events.eventType,
      count: sql<number>`COUNT(*)`,
    })
    .from(events)
    .where(sql`${events.eventType} LIKE 'agent_%' AND ${events.eventType} NOT IN ('agent_died', 'agent_spawned')`)
    .groupBy(events.eventType)
    .orderBy(desc(sql`COUNT(*)`));

  const totalActions = actionFreq.reduce((sum, row) => sum + Number(row.count), 0);

  // Get behavior by LLM type
  const byLlmTypeRaw = await db
    .select({
      llmType: agents.llmType,
      eventType: events.eventType,
      count: sql<number>`COUNT(*)`,
      fallbackCount: sql<number>`COUNT(*) FILTER (WHERE (${events.payload}->>'usedFallback')::boolean = true)`,
      avgProcessingTime: sql<number>`AVG((${events.payload}->>'processingTimeMs')::numeric)`,
    })
    .from(events)
    .innerJoin(agents, eq(events.agentId, agents.id))
    .where(sql`${events.eventType} LIKE 'agent_%' AND ${events.eventType} NOT IN ('agent_died', 'agent_spawned')`)
    .groupBy(agents.llmType, events.eventType);

  // Aggregate by LLM type
  const llmTypeMap = new Map<string, {
    actions: Record<string, number>;
    totalActions: number;
    fallbackCount: number;
    processingTimeSum: number;
    processingTimeCount: number;
  }>();

  for (const row of byLlmTypeRaw) {
    let entry = llmTypeMap.get(row.llmType);
    if (!entry) {
      entry = { actions: {}, totalActions: 0, fallbackCount: 0, processingTimeSum: 0, processingTimeCount: 0 };
      llmTypeMap.set(row.llmType, entry);
    }
    entry.actions[row.eventType] = Number(row.count);
    entry.totalActions += Number(row.count);
    entry.fallbackCount += Number(row.fallbackCount);
    if (row.avgProcessingTime) {
      entry.processingTimeSum += Number(row.avgProcessingTime) * Number(row.count);
      entry.processingTimeCount += Number(row.count);
    }
  }

  return {
    actionFrequency: actionFreq.map((row) => ({
      actionType: row.actionType,
      count: Number(row.count),
      percentage: totalActions > 0 ? (Number(row.count) / totalActions) * 100 : 0,
    })),
    byLlmType: Array.from(llmTypeMap.entries()).map(([llmType, data]) => ({
      llmType,
      actions: data.actions,
      // Return as decimal (0-1) for frontend to format
      fallbackRate: data.totalActions > 0 ? data.fallbackCount / data.totalActions : 0,
      avgProcessingTime: data.processingTimeCount > 0 ? data.processingTimeSum / data.processingTimeCount : 0,
    })),
  };
}

// =============================================================================
// Temporal Metrics
// =============================================================================

export async function getTemporalMetrics(limit = 50): Promise<TemporalMetrics> {
  // Get tick performance from tick_end events
  const tickDurations = await db
    .select({
      tick: events.tick,
      duration: sql<number>`(${events.payload}->>'duration')::int`,
      agentCount: sql<number>`(${events.payload}->>'agentCount')::int`,
      actionsExecuted: sql<number>`(${events.payload}->>'actionsExecuted')::int`,
    })
    .from(events)
    .where(eq(events.eventType, 'tick_end'))
    .orderBy(desc(events.tick))
    .limit(limit);

  // Get event counts per tick
  const eventsByTick = await db
    .select({
      tick: events.tick,
      eventCount: sql<number>`COUNT(*)`,
    })
    .from(events)
    .groupBy(events.tick)
    .orderBy(desc(events.tick))
    .limit(limit);

  // Get current tick
  const currentTickResult = await db
    .select({ tick: sql<number>`MAX(${events.tick})` })
    .from(events);

  return {
    tickDurations: tickDurations.map((row) => ({
      tick: Number(row.tick),
      duration: Number(row.duration) || 0,
      agentCount: Number(row.agentCount) || 0,
      actionsExecuted: Number(row.actionsExecuted) || 0,
    })).reverse(), // Oldest to newest for charts
    eventsByTick: eventsByTick.map((row) => ({
      tick: Number(row.tick),
      eventCount: Number(row.eventCount),
    })).reverse(),
    currentTick: Number(currentTickResult[0]?.tick) || 0,
  };
}

// =============================================================================
// Phase 1: Emergence Metrics
// =============================================================================

export async function getEmergenceMetrics(): Promise<EmergenceMetrics> {
  // --- Clustering Metrics ---
  // Use simple grid-based clustering (agents within 5 tiles = same cluster)
  const CLUSTER_RADIUS = 5;

  const aliveAgents = await db
    .select({ id: agents.id, x: agents.x, y: agents.y })
    .from(agents)
    .where(sql`${agents.state} != 'dead'`);

  // Simple clustering algorithm
  const clusters: Set<string>[] = [];
  const assigned = new Set<string>();

  for (const agent of aliveAgents) {
    if (assigned.has(agent.id)) continue;

    const cluster = new Set<string>();
    const queue = [agent];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (assigned.has(current.id)) continue;

      cluster.add(current.id);
      assigned.add(current.id);

      // Find neighbors within radius
      for (const other of aliveAgents) {
        if (assigned.has(other.id)) continue;
        const distance = Math.abs(current.x - other.x) + Math.abs(current.y - other.y);
        if (distance <= CLUSTER_RADIUS) {
          queue.push(other);
        }
      }
    }

    if (cluster.size > 0) {
      clusters.push(cluster);
    }
  }

  const clusterSizes = clusters.map((c) => c.size);
  const clusteringMetrics = {
    numClusters: clusters.length,
    avgClusterSize: clusterSizes.length > 0
      ? clusterSizes.reduce((a, b) => a + b, 0) / clusterSizes.length
      : 0,
    largestClusterSize: clusterSizes.length > 0 ? Math.max(...clusterSizes) : 0,
  };

  // --- Trade Network Metrics ---
  const tradeEvents = await db
    .select({
      initiatorId: sql<string>`${events.payload}->>'initiatorId'`,
      targetId: sql<string>`${events.payload}->>'targetId'`,
    })
    .from(events)
    .where(eq(events.eventType, 'agent_traded'));

  // Count unique pairs and repeat trades
  const tradePairs = new Map<string, number>();
  const tradingAgents = new Set<string>();

  for (const trade of tradeEvents) {
    if (trade.initiatorId && trade.targetId) {
      tradingAgents.add(trade.initiatorId);
      tradingAgents.add(trade.targetId);

      const pairKey = [trade.initiatorId, trade.targetId].sort().join('::');
      tradePairs.set(pairKey, (tradePairs.get(pairKey) || 0) + 1);
    }
  }

  const repeatTrades = Array.from(tradePairs.values()).filter((count) => count > 1).length;
  const totalPairs = tradePairs.size;

  const tradeNetworkMetrics = {
    totalTrades: tradeEvents.length,
    uniqueTradingPairs: totalPairs,
    repeatTradeRate: totalPairs > 0 ? repeatTrades / totalPairs : 0,
    avgTradesPerAgent: tradingAgents.size > 0 ? tradeEvents.length / tradingAgents.size : 0,
  };

  // --- Trust Pattern Metrics ---
  const relationships = await db
    .select({
      trustScore: agentRelationships.trustScore,
      interactionCount: agentRelationships.interactionCount,
    })
    .from(agentRelationships);

  let positiveTrust = 0;
  let negativeTrust = 0;
  let neutralTrust = 0;
  let trustSum = 0;

  for (const rel of relationships) {
    trustSum += rel.trustScore;
    if (rel.trustScore > 10) positiveTrust++;
    else if (rel.trustScore < -10) negativeTrust++;
    else neutralTrust++;
  }

  const trustPatternMetrics = {
    avgTrustScore: relationships.length > 0 ? trustSum / relationships.length : 0,
    positiveTrustLinks: positiveTrust,
    negativeTrustLinks: negativeTrust,
    neutralTrustLinks: neutralTrust,
    totalRelationships: relationships.length,
  };

  // --- Cooperation Index ---
  // Combines multiple signals: positive trust, repeat trades, clustering
  // Scale 0-1 where 1 = maximum cooperation observed

  const trustComponent = relationships.length > 0
    ? positiveTrust / relationships.length
    : 0;

  const tradeComponent = tradeNetworkMetrics.repeatTradeRate;

  const clusterComponent = aliveAgents.length > 1
    ? 1 - (clusteringMetrics.numClusters / aliveAgents.length)
    : 0;

  const cooperationIndex = (trustComponent + tradeComponent + clusterComponent) / 3;

  return {
    clustering: clusteringMetrics,
    tradeNetwork: tradeNetworkMetrics,
    trustPatterns: trustPatternMetrics,
    cooperationIndex: Math.max(0, Math.min(1, cooperationIndex)),
  };
}

// =============================================================================
// Phase 2: Inequality Metrics
// =============================================================================

export async function getInequalityMetrics(): Promise<InequalityMetrics> {
  // --- Wealth Inequality ---
  // Get percentiles
  const percentileResult = await db.execute<{
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
  }>(sql`
    SELECT
      PERCENTILE_CONT(0.10) WITHIN GROUP (ORDER BY balance) as p10,
      PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY balance) as p25,
      PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY balance) as p50,
      PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY balance) as p75,
      PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY balance) as p90
    FROM agents
    WHERE state != 'dead'
  `);

  // Get top decile share (percentage of total wealth held by top 10%)
  const topDecileResult = await db.execute<{ top_decile_share: number }>(sql`
    WITH agent_balances AS (
      SELECT balance, NTILE(10) OVER (ORDER BY balance) as decile
      FROM agents
      WHERE state != 'dead' AND balance > 0
    ),
    totals AS (
      SELECT SUM(balance) as total_balance FROM agent_balances
    )
    SELECT
      CASE
        WHEN (SELECT total_balance FROM totals) > 0
        THEN COALESCE(SUM(CASE WHEN decile = 10 THEN balance ELSE 0 END) / (SELECT total_balance FROM totals), 0)
        ELSE 0
      END as top_decile_share
    FROM agent_balances
  `);

  // Reuse existing Gini from getEconomyMetrics
  const economyMetrics = await getEconomyMetrics();

  // --- Resource Inequality ---
  // Get Gini for inventory items
  const resourceGiniResult = await db.execute<{ gini: number }>(sql`
    WITH resource_totals AS (
      SELECT agent_id, SUM(quantity) as total_resources
      FROM inventory
      GROUP BY agent_id
    ),
    agent_count AS (
      SELECT COUNT(*) as n FROM resource_totals WHERE total_resources > 0
    ),
    sorted_resources AS (
      SELECT
        total_resources,
        ROW_NUMBER() OVER (ORDER BY total_resources) as rank
      FROM resource_totals
      WHERE total_resources > 0
    )
    SELECT
      CASE
        WHEN (SELECT n FROM agent_count) <= 1 THEN 0
        WHEN SUM(total_resources) = 0 THEN 0
        ELSE (2.0 * SUM(rank * total_resources) / ((SELECT n FROM agent_count) * SUM(total_resources)))
             - ((SELECT n FROM agent_count) + 1.0) / (SELECT n FROM agent_count)
      END as gini
    FROM sorted_resources
  `);

  // Get resources by type
  const resourcesByType = await db
    .select({
      itemType: inventory.itemType,
      totalQuantity: sql<number>`SUM(${inventory.quantity})`,
      holdersCount: sql<number>`COUNT(DISTINCT ${inventory.agentId})`,
    })
    .from(inventory)
    .groupBy(inventory.itemType);

  const percentileRows = Array.isArray(percentileResult) ? percentileResult : (percentileResult as any).rows || [];
  const topDecileRows = Array.isArray(topDecileResult) ? topDecileResult : (topDecileResult as any).rows || [];
  const resourceGiniRows = Array.isArray(resourceGiniResult) ? resourceGiniResult : (resourceGiniResult as any).rows || [];

  return {
    wealth: {
      giniCoefficient: economyMetrics.giniCoefficient,
      percentiles: {
        p10: Number(percentileRows[0]?.p10) || 0,
        p25: Number(percentileRows[0]?.p25) || 0,
        p50: Number(percentileRows[0]?.p50) || 0,
        p75: Number(percentileRows[0]?.p75) || 0,
        p90: Number(percentileRows[0]?.p90) || 0,
      },
      topDecileShare: Number(topDecileRows[0]?.top_decile_share) || 0,
    },
    resources: {
      giniCoefficient: Number(resourceGiniRows[0]?.gini) || 0,
      resourcesByType: resourcesByType.map((r) => ({
        itemType: r.itemType,
        totalQuantity: Number(r.totalQuantity) || 0,
        holdersCount: Number(r.holdersCount) || 0,
      })),
    },
  };
}

// =============================================================================
// Phase 2: Conflict Metrics
// =============================================================================

export async function getConflictMetrics(): Promise<ConflictMetrics> {
  // Get current tick for rate calculation
  const currentTickResult = await db
    .select({ tick: sql<number>`MAX(${events.tick})` })
    .from(events);
  const currentTick = Number(currentTickResult[0]?.tick) || 1;

  // --- Crime Rate ---
  const crimeEvents = await db
    .select({
      eventType: events.eventType,
      count: sql<number>`COUNT(*)`,
    })
    .from(events)
    .where(sql`${events.eventType} IN ('agent_harmed', 'agent_stole', 'agent_deceived')`)
    .groupBy(events.eventType);

  const harmCount = crimeEvents.find((e) => e.eventType === 'agent_harmed')?.count || 0;
  const stealCount = crimeEvents.find((e) => e.eventType === 'agent_stole')?.count || 0;
  const deceiveCount = crimeEvents.find((e) => e.eventType === 'agent_deceived')?.count || 0;
  const totalCrimeEvents = Number(harmCount) + Number(stealCount) + Number(deceiveCount);

  // Crime by LLM type (perpetrator)
  const crimesByLlmType = await db
    .select({
      llmType: agents.llmType,
      harmCount: sql<number>`COUNT(*) FILTER (WHERE ${events.eventType} = 'agent_harmed')`,
      stealCount: sql<number>`COUNT(*) FILTER (WHERE ${events.eventType} = 'agent_stole')`,
      deceiveCount: sql<number>`COUNT(*) FILTER (WHERE ${events.eventType} = 'agent_deceived')`,
    })
    .from(events)
    .innerJoin(agents, eq(events.agentId, agents.id))
    .where(sql`${events.eventType} IN ('agent_harmed', 'agent_stole', 'agent_deceived')`)
    .groupBy(agents.llmType);

  // --- Victimization ---
  // Count unique victims from harm/steal events
  const victimData = await db.execute<{ victim_id: string; victim_count: number }>(sql`
    SELECT
      payload->>'targetAgentId' as victim_id,
      COUNT(*) as victim_count
    FROM events
    WHERE event_type IN ('agent_harmed', 'agent_stole')
      AND payload->>'targetAgentId' IS NOT NULL
    GROUP BY payload->>'targetAgentId'
  `);

  const victimRows: { victim_id: string; victim_count: number }[] = Array.isArray(victimData) ? victimData : (victimData as any).rows || [];
  const totalVictims = victimRows.length;
  const repeatVictims = victimRows.filter((v) => Number(v.victim_count) > 1).length;

  // Victims by LLM type
  const victimsByLlmType = await db.execute<{ llm_type: string; victim_count: number }>(sql`
    SELECT
      a.llm_type,
      COUNT(DISTINCT e.payload->>'targetAgentId') as victim_count
    FROM events e
    JOIN agents a ON (e.payload->>'targetAgentId')::uuid = a.id
    WHERE e.event_type IN ('agent_harmed', 'agent_stole')
    GROUP BY a.llm_type
  `);
  const victimLlmRows: { llm_type: string; victim_count: number }[] = Array.isArray(victimsByLlmType) ? victimsByLlmType : (victimsByLlmType as any).rows || [];

  // --- Retaliation ---
  // Find cases where victim attacked their attacker back
  const retaliationData = await db.execute<{
    retaliation_count: number;
    avg_delay: number;
  }>(sql`
    WITH attacks AS (
      SELECT
        payload->>'targetAgentId' as victim_id,
        agent_id as attacker_id,
        tick as attack_tick
      FROM events
      WHERE event_type IN ('agent_harmed', 'agent_stole')
    ),
    retaliations AS (
      SELECT
        a.victim_id,
        a.attacker_id,
        a.attack_tick,
        MIN(e.tick) as retaliation_tick
      FROM attacks a
      JOIN events e ON
        e.agent_id::text = a.victim_id
        AND (e.payload->>'targetAgentId')::text = a.attacker_id::text
        AND e.event_type IN ('agent_harmed', 'agent_stole')
        AND e.tick > a.attack_tick
      GROUP BY a.victim_id, a.attacker_id, a.attack_tick
    )
    SELECT
      COUNT(*) as retaliation_count,
      AVG(retaliation_tick - attack_tick) as avg_delay
    FROM retaliations
  `);

  const retaliationRows = Array.isArray(retaliationData) ? retaliationData : (retaliationData as any).rows || [];
  const retaliationCount = Number(retaliationRows[0]?.retaliation_count) || 0;
  const avgRetaliationDelay = Number(retaliationRows[0]?.avg_delay) || 0;

  // Retaliation rate = retaliations / total attacks
  const totalAttacks = Number(harmCount) + Number(stealCount);
  const retaliationRate = totalAttacks > 0 ? retaliationCount / totalAttacks : 0;

  // Count ongoing retaliation chains (back-and-forth attacks)
  const chainData = await db.execute<{ chain_count: number }>(sql`
    WITH attack_pairs AS (
      SELECT
        LEAST(agent_id::text, payload->>'targetAgentId') as agent_a,
        GREATEST(agent_id::text, payload->>'targetAgentId') as agent_b,
        COUNT(*) as attack_count
      FROM events
      WHERE event_type IN ('agent_harmed', 'agent_stole')
      GROUP BY agent_a, agent_b
    )
    SELECT COUNT(*) as chain_count
    FROM attack_pairs
    WHERE attack_count >= 3
  `);
  const chainRows = Array.isArray(chainData) ? chainData : (chainData as any).rows || [];

  return {
    crimeRate: {
      harmEventsPerTick: currentTick > 0 ? Number(harmCount) / currentTick : 0,
      stealEventsPerTick: currentTick > 0 ? Number(stealCount) / currentTick : 0,
      deceiveEventsPerTick: currentTick > 0 ? Number(deceiveCount) / currentTick : 0,
      totalCrimeEvents,
      crimesByLlmType: crimesByLlmType.map((c) => ({
        llmType: c.llmType,
        harmCount: Number(c.harmCount) || 0,
        stealCount: Number(c.stealCount) || 0,
        deceiveCount: Number(c.deceiveCount) || 0,
      })),
    },
    victimization: {
      totalVictims,
      repeatVictims,
      victimsByLlmType: victimLlmRows.map((v) => ({
        llmType: v.llm_type,
        victimCount: Number(v.victim_count) || 0,
      })),
    },
    retaliation: {
      retaliationRate: Math.min(1, retaliationRate),
      avgRetaliationDelay,
      retaliationChains: Number(chainRows[0]?.chain_count) || 0,
    },
  };
}

// =============================================================================
// Phase 2: Justice Metrics
// =============================================================================

export async function getJusticeMetrics(): Promise<JusticeMetrics> {
  // --- Response Patterns ---
  // Analyze victim behavior after being attacked

  // Get all attacks
  const attacksData = await db.execute<{ victim_id: string; attack_tick: number }>(sql`
    SELECT
      payload->>'targetAgentId' as victim_id,
      tick as attack_tick
    FROM events
    WHERE event_type IN ('agent_harmed', 'agent_stole')
      AND payload->>'targetAgentId' IS NOT NULL
  `);
  const attacks = Array.isArray(attacksData) ? attacksData : (attacksData as any).rows || [];

  let noResponse = 0;
  let directRetaliation = 0;
  let avoidance = 0;
  let warningSpread = 0;

  // For each unique victim, check their response within 10 ticks
  const victimResponses = new Map<string, Set<string>>();

  for (const attack of attacks) {
    if (!victimResponses.has(attack.victim_id)) {
      victimResponses.set(attack.victim_id, new Set());
    }
  }

  // Check for retaliation (victim attacks their attacker)
  const retaliationCheck = await db.execute<{ victim_id: string }>(sql`
    SELECT DISTINCT a.payload->>'targetAgentId' as victim_id
    FROM events a
    JOIN events r ON
      r.agent_id::text = a.payload->>'targetAgentId'
      AND r.event_type IN ('agent_harmed', 'agent_stole')
      AND r.tick > a.tick
      AND r.tick <= a.tick + 10
    WHERE a.event_type IN ('agent_harmed', 'agent_stole')
  `);
  const retaliatorsRows: { victim_id: string }[] = Array.isArray(retaliationCheck) ? retaliationCheck : (retaliationCheck as any).rows || [];
  const retaliatorsSet = new Set(retaliatorsRows.map((r) => r.victim_id));

  // Check for avoidance (victim moved away after attack)
  const avoidanceCheck = await db.execute<{ victim_id: string }>(sql`
    SELECT DISTINCT a.payload->>'targetAgentId' as victim_id
    FROM events a
    JOIN events m ON
      m.agent_id::text = a.payload->>'targetAgentId'
      AND m.event_type = 'agent_moved'
      AND m.tick > a.tick
      AND m.tick <= a.tick + 5
    WHERE a.event_type IN ('agent_harmed', 'agent_stole')
  `);
  const avoidersRows: { victim_id: string }[] = Array.isArray(avoidanceCheck) ? avoidanceCheck : (avoidanceCheck as any).rows || [];
  const avoidersSet = new Set(avoidersRows.map((r) => r.victim_id));

  // Check for warning spread (victim shared negative info about attacker)
  const warningCheck = await db.execute<{ victim_id: string }>(sql`
    SELECT DISTINCT a.payload->>'targetAgentId' as victim_id
    FROM events a
    JOIN events w ON
      w.agent_id::text = a.payload->>'targetAgentId'
      AND w.event_type = 'agent_shared_info'
      AND (w.payload->>'sentiment')::int < 0
      AND w.tick > a.tick
      AND w.tick <= a.tick + 20
    WHERE a.event_type IN ('agent_harmed', 'agent_stole')
  `);
  const warnersRows: { victim_id: string }[] = Array.isArray(warningCheck) ? warningCheck : (warningCheck as any).rows || [];
  const warnersSet = new Set(warnersRows.map((r) => r.victim_id));

  // Count responses
  for (const [victimId] of victimResponses) {
    if (retaliatorsSet.has(victimId)) directRetaliation++;
    if (avoidersSet.has(victimId)) avoidance++;
    if (warnersSet.has(victimId)) warningSpread++;
    if (!retaliatorsSet.has(victimId) && !avoidersSet.has(victimId) && !warnersSet.has(victimId)) {
      noResponse++;
    }
  }

  // --- Enforcers ---
  // Agents who intervene on behalf of others (attack someone who attacked their friend)
  const enforcersData = await db.execute<{
    agent_id: string;
    llm_type: string;
    intervention_count: number;
  }>(sql`
    WITH attacks AS (
      SELECT agent_id as attacker, payload->>'targetAgentId' as victim, tick
      FROM events
      WHERE event_type IN ('agent_harmed', 'agent_stole')
    ),
    interventions AS (
      SELECT DISTINCT
        e.agent_id,
        a.llm_type,
        COUNT(*) as intervention_count
      FROM events e
      JOIN attacks att ON
        (e.payload->>'targetAgentId')::text = att.attacker::text
        AND e.tick > att.tick
        AND e.tick <= att.tick + 20
        AND e.agent_id::text != att.victim -- Not the original victim
      JOIN agents a ON e.agent_id = a.id
      WHERE e.event_type IN ('agent_harmed', 'agent_stole')
      GROUP BY e.agent_id, a.llm_type
    )
    SELECT * FROM interventions
    ORDER BY intervention_count DESC
    LIMIT 10
  `);
  const enforcersRows: { agent_id: string; llm_type: string; intervention_count: number }[] = Array.isArray(enforcersData) ? enforcersData : (enforcersData as any).rows || [];

  // Calculate enforcer diversity (how evenly distributed enforcement is)
  const enforcerCounts = enforcersRows.map((e) => Number(e.intervention_count));
  const totalInterventions = enforcerCounts.reduce((a: number, b: number) => a + b, 0);
  let enforcerDiversity = 0;
  if (enforcerCounts.length > 1 && totalInterventions > 0) {
    // Use normalized entropy
    const probs = enforcerCounts.map((c) => c / totalInterventions);
    const entropy = -probs.reduce((sum: number, p: number) => sum + (p > 0 ? p * Math.log2(p) : 0), 0);
    const maxEntropy = Math.log2(enforcerCounts.length);
    enforcerDiversity = maxEntropy > 0 ? entropy / maxEntropy : 0;
  }

  // --- Reputation ---
  // Average reputation spread (how many agents know about each agent)
  const repSpreadData = await db.execute<{ avg_spread: number }>(sql`
    SELECT AVG(knowledge_count) as avg_spread
    FROM (
      SELECT known_agent_id, COUNT(*) as knowledge_count
      FROM agent_knowledge
      GROUP BY known_agent_id
    ) sub
  `);
  const repSpreadRows = Array.isArray(repSpreadData) ? repSpreadData : (repSpreadData as any).rows || [];

  // Count agents with mostly negative vs positive reputation
  const repCountData = await db.execute<{
    negative_rep: number;
    positive_rep: number;
  }>(sql`
    WITH agent_rep AS (
      SELECT
        known_agent_id,
        AVG((shared_info->>'reputationClaim'->>'sentiment')::numeric) as avg_sentiment
      FROM agent_knowledge
      WHERE shared_info->>'reputationClaim' IS NOT NULL
      GROUP BY known_agent_id
    )
    SELECT
      COUNT(*) FILTER (WHERE avg_sentiment < -20) as negative_rep,
      COUNT(*) FILTER (WHERE avg_sentiment > 20) as positive_rep
    FROM agent_rep
  `);
  const repCountRows = Array.isArray(repCountData) ? repCountData : (repCountData as any).rows || [];

  return {
    responsePatterns: {
      noResponse,
      directRetaliation,
      avoidance,
      warningSpread,
    },
    enforcers: {
      topEnforcers: enforcersRows.map((e) => ({
        agentId: e.agent_id,
        llmType: e.llm_type,
        interventionCount: Number(e.intervention_count) || 0,
      })),
      enforcerDiversity,
    },
    reputation: {
      avgReputationSpread: Number(repSpreadRows[0]?.avg_spread) || 0,
      negativeRepAgents: Number(repCountRows[0]?.negative_rep) || 0,
      positiveRepAgents: Number(repCountRows[0]?.positive_rep) || 0,
    },
  };
}

// =============================================================================
// Phase 2: Social Graph Metrics
// =============================================================================

export async function getSocialGraphMetrics(): Promise<SocialGraphMetrics> {
  // --- Network Structure ---
  // Nodes = agents, Edges = relationships
  const nodeCount = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(agents)
    .where(sql`${agents.state} != 'dead'`);

  const edgeCount = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(agentRelationships);

  const nodes = Number(nodeCount[0]?.count) || 0;
  const edges = Number(edgeCount[0]?.count) || 0;

  // Density = actual edges / possible edges (n*(n-1) for directed graph)
  const possibleEdges = nodes > 1 ? nodes * (nodes - 1) : 1;
  const density = edges / possibleEdges;

  // Average degree = edges / nodes (for directed, in-degree + out-degree)
  const avgDegree = nodes > 0 ? edges / nodes : 0;

  // --- Communities ---
  // Use relationship clusters (agents with mutual positive trust)
  const aliveAgentsData = await db
    .select({ id: agents.id })
    .from(agents)
    .where(sql`${agents.state} != 'dead'`);

  const positiveRelData = await db
    .select({
      agentId: agentRelationships.agentId,
      otherAgentId: agentRelationships.otherAgentId,
    })
    .from(agentRelationships)
    .where(sql`${agentRelationships.trustScore} > 20`);

  // Build adjacency list for community detection
  const adjacency = new Map<string, Set<string>>();
  for (const agent of aliveAgentsData) {
    adjacency.set(agent.id, new Set());
  }
  for (const rel of positiveRelData) {
    adjacency.get(rel.agentId)?.add(rel.otherAgentId);
  }

  // Simple community detection via connected components
  const communities: Set<string>[] = [];
  const assigned = new Set<string>();

  for (const agent of aliveAgentsData) {
    if (assigned.has(agent.id)) continue;

    const community = new Set<string>();
    const queue = [agent.id];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (assigned.has(current)) continue;

      community.add(current);
      assigned.add(current);

      const neighbors = adjacency.get(current) || new Set();
      for (const neighbor of neighbors) {
        if (!assigned.has(neighbor)) {
          queue.push(neighbor);
        }
      }
    }

    if (community.size > 0) {
      communities.push(community);
    }
  }

  const communitySizes = communities.map((c) => c.size);

  // --- Referral Chains ---
  const referralData = await db.execute<{
    avg_depth: number;
    max_depth: number;
    referral_count: number;
    direct_count: number;
  }>(sql`
    SELECT
      AVG(referral_depth) FILTER (WHERE discovery_type = 'referral') as avg_depth,
      MAX(referral_depth) as max_depth,
      COUNT(*) FILTER (WHERE discovery_type = 'referral') as referral_count,
      COUNT(*) FILTER (WHERE discovery_type = 'direct') as direct_count
    FROM agent_knowledge
  `);
  const referralRows = Array.isArray(referralData) ? referralData : (referralData as any).rows || [];

  const referralCount = Number(referralRows[0]?.referral_count) || 0;
  const directCount = Number(referralRows[0]?.direct_count) || 0;
  const totalKnowledge = referralCount + directCount;
  const referralRate = totalKnowledge > 0 ? referralCount / totalKnowledge : 0;

  // --- Information Flow ---
  // Get current tick for age calculation
  const currentTickResult = await db
    .select({ tick: sql<number>`MAX(${events.tick})` })
    .from(events);
  const currentTick = Number(currentTickResult[0]?.tick) || 1;

  const infoAgeData = await db.execute<{
    avg_age: number;
    stale_count: number;
    total_count: number;
  }>(sql`
    SELECT
      AVG(${currentTick} - information_age) as avg_age,
      COUNT(*) FILTER (WHERE ${currentTick} - information_age > 50) as stale_count,
      COUNT(*) as total_count
    FROM agent_knowledge
  `);
  const infoAgeRows = Array.isArray(infoAgeData) ? infoAgeData : (infoAgeData as any).rows || [];

  const totalKnowledgeCount = Number(infoAgeRows[0]?.total_count) || 1;
  const staleCount = Number(infoAgeRows[0]?.stale_count) || 0;

  return {
    networkStructure: {
      nodeCount: nodes,
      edgeCount: edges,
      density,
      avgDegree,
    },
    communities: {
      communityCount: communities.length,
      largestCommunitySize: communitySizes.length > 0 ? Math.max(...communitySizes) : 0,
      avgCommunitySize: communitySizes.length > 0
        ? communitySizes.reduce((a, b) => a + b, 0) / communitySizes.length
        : 0,
    },
    referralChains: {
      avgChainLength: Number(referralRows[0]?.avg_depth) || 0,
      maxChainLength: Number(referralRows[0]?.max_depth) || 0,
      referralRate,
    },
    informationFlow: {
      avgInfoAge: Number(infoAgeRows[0]?.avg_age) || 0,
      staleInfoRate: staleCount / totalKnowledgeCount,
    },
  };
}

// =============================================================================
// Phase 2: Combined Metrics
// =============================================================================

export async function getPhase2Metrics(): Promise<Phase2Metrics> {
  const [inequality, conflict, justice, socialGraph] = await Promise.all([
    getInequalityMetrics(),
    getConflictMetrics(),
    getJusticeMetrics(),
    getSocialGraphMetrics(),
  ]);

  return {
    inequality,
    conflict,
    justice,
    socialGraph,
  };
}

// =============================================================================
// Phase 1: Emergence Detection (Anomaly & Trends)
// =============================================================================

export interface MetricTrend {
  metric: string;
  current: number;
  baseline: number;
  deviation: number; // Standard deviations from baseline
  trend: 'increasing' | 'decreasing' | 'stable';
  isAnomaly: boolean;
}

export interface AgentRole {
  agentId: string;
  llmType: string;
  role: 'gatherer' | 'trader' | 'worker' | 'explorer' | 'social' | 'aggressor' | 'victim' | 'unknown';
  confidence: number; // 0-1 confidence in role assignment
  dominantAction: string;
  actionBreakdown: Record<string, number>;
}

export interface SystemStability {
  variance: {
    hunger: number;
    energy: number;
    health: number;
    balance: number;
  };
  overallStability: number; // 0-1, higher = more stable
  churnRate: number; // Deaths per tick
  systemState: 'stable' | 'volatile' | 'collapsing';
}

export interface EmergenceDetectionMetrics {
  trends: MetricTrend[];
  agentRoles: AgentRole[];
  stability: SystemStability;
  alerts: { severity: 'info' | 'warning' | 'critical'; message: string }[];
}

/**
 * Get metric trends comparing current values to historical baseline
 */
export async function getMetricTrends(): Promise<MetricTrend[]> {
  const trends: MetricTrend[] = [];

  // Get current metrics
  const current = await db
    .select({
      avgHunger: sql<number>`AVG(${agents.hunger})`,
      avgEnergy: sql<number>`AVG(${agents.energy})`,
      avgHealth: sql<number>`AVG(${agents.health})`,
      avgBalance: sql<number>`AVG(${agents.balance})`,
      aliveCount: sql<number>`COUNT(*) FILTER (WHERE ${agents.state} != 'dead')`,
    })
    .from(agents);

  // Get historical baseline (last 50 ticks) from events
  const historicalData = await db.execute<{
    avg_hunger: number;
    std_hunger: number;
    avg_energy: number;
    std_energy: number;
    avg_health: number;
    std_health: number;
    avg_balance: number;
    std_balance: number;
  }>(sql`
    WITH recent_metrics AS (
      SELECT
        (payload->>'hunger')::numeric as hunger,
        (payload->>'energy')::numeric as energy,
        (payload->>'health')::numeric as health,
        (payload->>'newBalance')::numeric as balance
      FROM events
      WHERE event_type IN ('agent_worked', 'agent_consumed', 'agent_bought')
        AND tick >= (SELECT MAX(tick) - 50 FROM events)
    )
    SELECT
      COALESCE(AVG(hunger), 50) as avg_hunger,
      COALESCE(STDDEV(hunger), 1) as std_hunger,
      COALESCE(AVG(energy), 50) as avg_energy,
      COALESCE(STDDEV(energy), 1) as std_energy,
      COALESCE(AVG(health), 50) as avg_health,
      COALESCE(STDDEV(health), 1) as std_health,
      COALESCE(AVG(balance), 100) as avg_balance,
      COALESCE(STDDEV(balance), 1) as std_balance
    FROM recent_metrics
  `);

  const historical = Array.isArray(historicalData) ? historicalData[0] : (historicalData as any).rows?.[0];

  // Calculate deviations
  const calcTrend = (
    metric: string,
    currentVal: number,
    baselineVal: number,
    stdDev: number
  ): MetricTrend => {
    const deviation = stdDev > 0 ? (currentVal - baselineVal) / stdDev : 0;
    return {
      metric,
      current: currentVal,
      baseline: baselineVal,
      deviation,
      trend: deviation > 0.5 ? 'increasing' : deviation < -0.5 ? 'decreasing' : 'stable',
      isAnomaly: Math.abs(deviation) > 2, // More than 2 standard deviations
    };
  };

  if (current[0]) {
    trends.push(calcTrend(
      'avgHunger',
      Number(current[0].avgHunger) || 0,
      Number(historical?.avg_hunger) || 50,
      Number(historical?.std_hunger) || 1
    ));
    trends.push(calcTrend(
      'avgEnergy',
      Number(current[0].avgEnergy) || 0,
      Number(historical?.avg_energy) || 50,
      Number(historical?.std_energy) || 1
    ));
    trends.push(calcTrend(
      'avgHealth',
      Number(current[0].avgHealth) || 0,
      Number(historical?.avg_health) || 50,
      Number(historical?.std_health) || 1
    ));
    trends.push(calcTrend(
      'avgBalance',
      Number(current[0].avgBalance) || 0,
      Number(historical?.avg_balance) || 100,
      Number(historical?.std_balance) || 1
    ));
  }

  return trends;
}

/**
 * Classify agents into behavioral roles based on their actions
 */
export async function getAgentRoles(): Promise<AgentRole[]> {
  // Get action counts per agent
  const actionData = await db
    .select({
      agentId: events.agentId,
      eventType: events.eventType,
      count: sql<number>`COUNT(*)`,
    })
    .from(events)
    .where(sql`${events.agentId} IS NOT NULL AND ${events.eventType} LIKE 'agent_%'`)
    .groupBy(events.agentId, events.eventType);

  // Get agent info
  const agentInfo = await db
    .select({ id: agents.id, llmType: agents.llmType })
    .from(agents);

  const agentMap = new Map(agentInfo.map((a) => [a.id, a.llmType]));

  // Aggregate actions by agent
  const agentActions = new Map<string, Record<string, number>>();
  for (const row of actionData) {
    if (!row.agentId) continue;
    if (!agentActions.has(row.agentId)) {
      agentActions.set(row.agentId, {});
    }
    agentActions.get(row.agentId)![row.eventType] = Number(row.count);
  }

  // Classify each agent
  const roles: AgentRole[] = [];

  for (const [agentId, actions] of agentActions) {
    const totalActions = Object.values(actions).reduce((a, b) => a + b, 0);
    if (totalActions === 0) continue;

    // Find dominant action
    let dominantAction = '';
    let maxCount = 0;
    for (const [action, count] of Object.entries(actions)) {
      if (count > maxCount) {
        maxCount = count;
        dominantAction = action;
      }
    }

    // Classify role based on action patterns
    let role: AgentRole['role'] = 'unknown';
    let confidence = 0;

    const gatherCount = actions['agent_gathered'] || 0;
    const tradeCount = actions['agent_traded'] || 0;
    const workCount = actions['agent_worked'] || 0;
    const moveCount = actions['agent_moved'] || 0;
    const shareCount = actions['agent_shared_info'] || 0;
    const harmCount = actions['agent_harmed'] || 0;
    const stealCount = actions['agent_stole'] || 0;

    // Calculate ratios
    const gatherRatio = gatherCount / totalActions;
    const tradeRatio = tradeCount / totalActions;
    const workRatio = workCount / totalActions;
    const moveRatio = moveCount / totalActions;
    const socialRatio = (shareCount + tradeCount) / totalActions;
    const aggressorRatio = (harmCount + stealCount) / totalActions;

    // Assign role based on highest ratio
    if (gatherRatio > 0.3) {
      role = 'gatherer';
      confidence = gatherRatio;
    } else if (tradeRatio > 0.15) {
      role = 'trader';
      confidence = tradeRatio;
    } else if (workRatio > 0.3) {
      role = 'worker';
      confidence = workRatio;
    } else if (moveRatio > 0.5) {
      role = 'explorer';
      confidence = moveRatio;
    } else if (socialRatio > 0.2) {
      role = 'social';
      confidence = socialRatio;
    } else if (aggressorRatio > 0.1) {
      role = 'aggressor';
      confidence = aggressorRatio;
    }

    // Check if agent is frequently victimized
    const victimData = await db.execute<{ victim_count: number }>(sql`
      SELECT COUNT(*) as victim_count
      FROM events
      WHERE event_type IN ('agent_harmed', 'agent_stole')
        AND payload->>'targetAgentId' = ${agentId}
    `);
    const victimRows = Array.isArray(victimData) ? victimData : (victimData as any).rows || [];
    const victimCount = Number(victimRows[0]?.victim_count) || 0;

    if (victimCount > totalActions * 0.1) {
      role = 'victim';
      confidence = victimCount / totalActions;
    }

    roles.push({
      agentId,
      llmType: agentMap.get(agentId) || 'unknown',
      role,
      confidence: Math.min(1, confidence),
      dominantAction,
      actionBreakdown: actions,
    });
  }

  return roles;
}

/**
 * Assess system stability based on metric variance and death rates
 */
export async function getSystemStability(): Promise<SystemStability> {
  // Calculate variance of agent stats
  const varianceData = await db.execute<{
    var_hunger: number;
    var_energy: number;
    var_health: number;
    var_balance: number;
  }>(sql`
    SELECT
      COALESCE(VARIANCE(${agents.hunger}), 0) as var_hunger,
      COALESCE(VARIANCE(${agents.energy}), 0) as var_energy,
      COALESCE(VARIANCE(${agents.health}), 0) as var_health,
      COALESCE(VARIANCE(${agents.balance}), 0) as var_balance
    FROM ${agents}
    WHERE ${agents.state} != 'dead'
  `);

  const varianceRows = Array.isArray(varianceData) ? varianceData : (varianceData as any).rows || [];
  const variance = {
    hunger: Number(varianceRows[0]?.var_hunger) || 0,
    energy: Number(varianceRows[0]?.var_energy) || 0,
    health: Number(varianceRows[0]?.var_health) || 0,
    balance: Number(varianceRows[0]?.var_balance) || 0,
  };

  // Calculate churn rate (deaths per tick over last 20 ticks)
  const churnData = await db.execute<{ death_count: number; tick_count: number }>(sql`
    SELECT
      COUNT(*) as death_count,
      GREATEST(1, MAX(tick) - MIN(tick) + 1) as tick_count
    FROM events
    WHERE event_type = 'agent_died'
      AND tick >= (SELECT MAX(tick) - 20 FROM events)
  `);
  const churnRows = Array.isArray(churnData) ? churnData : (churnData as any).rows || [];
  const deathCount = Number(churnRows[0]?.death_count) || 0;
  const tickCount = Number(churnRows[0]?.tick_count) || 1;
  const churnRate = deathCount / tickCount;

  // Calculate overall stability (inverse of normalized variance + churn)
  const maxVariance = 2500; // Max expected variance (50^2)
  const normalizedVariance = (
    (variance.hunger / maxVariance) +
    (variance.energy / maxVariance) +
    (variance.health / maxVariance) +
    Math.min(1, variance.balance / 10000)
  ) / 4;

  const overallStability = Math.max(0, 1 - normalizedVariance - Math.min(0.5, churnRate));

  // Determine system state
  let systemState: SystemStability['systemState'] = 'stable';
  if (overallStability < 0.3 || churnRate > 0.3) {
    systemState = 'collapsing';
  } else if (overallStability < 0.6 || churnRate > 0.1) {
    systemState = 'volatile';
  }

  return {
    variance,
    overallStability,
    churnRate,
    systemState,
  };
}

/**
 * Get full emergence detection metrics with alerts
 */
export async function getEmergenceDetectionMetrics(): Promise<EmergenceDetectionMetrics> {
  const [trends, agentRoles, stability] = await Promise.all([
    getMetricTrends(),
    getAgentRoles(),
    getSystemStability(),
  ]);

  // Generate alerts based on metrics
  const alerts: EmergenceDetectionMetrics['alerts'] = [];

  // Check for anomalies in trends
  for (const trend of trends) {
    if (trend.isAnomaly) {
      alerts.push({
        severity: Math.abs(trend.deviation) > 3 ? 'critical' : 'warning',
        message: `${trend.metric} is ${trend.deviation > 0 ? 'above' : 'below'} normal (${trend.deviation.toFixed(1)} std devs)`,
      });
    }
  }

  // Check system stability
  if (stability.systemState === 'collapsing') {
    alerts.push({
      severity: 'critical',
      message: `System is collapsing! Stability: ${(stability.overallStability * 100).toFixed(0)}%, Churn: ${(stability.churnRate * 100).toFixed(1)}%/tick`,
    });
  } else if (stability.systemState === 'volatile') {
    alerts.push({
      severity: 'warning',
      message: `System is volatile. Stability: ${(stability.overallStability * 100).toFixed(0)}%`,
    });
  }

  // Check for role imbalances
  const roleCountsMap = new Map<string, number>();
  for (const role of agentRoles) {
    roleCountsMap.set(role.role, (roleCountsMap.get(role.role) || 0) + 1);
  }

  const aggressorCount = roleCountsMap.get('aggressor') || 0;
  const totalAgents = agentRoles.length;
  if (aggressorCount > totalAgents * 0.3) {
    alerts.push({
      severity: 'warning',
      message: `High aggressor ratio: ${aggressorCount}/${totalAgents} agents (${((aggressorCount / totalAgents) * 100).toFixed(0)}%)`,
    });
  }

  return {
    trends,
    agentRoles,
    stability,
    alerts,
  };
}

// =============================================================================
// Phase 2: Global Reputation Aggregation
// =============================================================================

export interface GlobalReputation {
  agentId: string;
  llmType: string;
  aggregateScore: number; // -100 to +100
  directKnowers: number;
  referralKnowers: number;
  sentimentDistribution: {
    positive: number;
    neutral: number;
    negative: number;
  };
  averageReferralDepth: number;
}

/**
 * Get global reputation for an agent from the referral network
 * Aggregates all knowledge about an agent, weighted by referral depth
 */
export async function getGlobalReputation(agentId: string): Promise<GlobalReputation | null> {
  // Get agent info
  const agentInfo = await db
    .select({ llmType: agents.llmType })
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);

  if (!agentInfo[0]) return null;

  // Get all knowledge about this agent
  const knowledgeData = await db.execute<{
    knower_count: number;
    direct_count: number;
    referral_count: number;
    avg_depth: number;
    positive_count: number;
    neutral_count: number;
    negative_count: number;
    weighted_sentiment: number;
  }>(sql`
    WITH knowledge_items AS (
      SELECT
        ak.agent_id as knower_id,
        ak.discovery_type,
        ak.referral_depth,
        COALESCE(
          (ak.shared_info->>'sentiment')::numeric,
          CASE
            WHEN ar.trust_score > 20 THEN 50
            WHEN ar.trust_score < -20 THEN -50
            ELSE 0
          END
        ) as sentiment,
        -- Weight by referral depth: direct = 1.0, each level = 0.8x
        POWER(0.8, COALESCE(ak.referral_depth, 0)) as depth_weight
      FROM agent_knowledge ak
      LEFT JOIN agent_relationships ar
        ON ar.agent_id = ak.agent_id
        AND ar.other_agent_id = ak.known_agent_id
      WHERE ak.known_agent_id = ${agentId}
    )
    SELECT
      COUNT(*) as knower_count,
      COUNT(*) FILTER (WHERE discovery_type = 'direct') as direct_count,
      COUNT(*) FILTER (WHERE discovery_type = 'referral') as referral_count,
      COALESCE(AVG(referral_depth), 0) as avg_depth,
      COUNT(*) FILTER (WHERE sentiment > 20) as positive_count,
      COUNT(*) FILTER (WHERE sentiment >= -20 AND sentiment <= 20) as neutral_count,
      COUNT(*) FILTER (WHERE sentiment < -20) as negative_count,
      COALESCE(SUM(sentiment * depth_weight) / NULLIF(SUM(depth_weight), 0), 0) as weighted_sentiment
    FROM knowledge_items
  `);

  const rows = Array.isArray(knowledgeData) ? knowledgeData : (knowledgeData as any).rows || [];
  const data = rows[0];

  if (!data || Number(data.knower_count) === 0) {
    return {
      agentId,
      llmType: agentInfo[0].llmType,
      aggregateScore: 0,
      directKnowers: 0,
      referralKnowers: 0,
      sentimentDistribution: { positive: 0, neutral: 0, negative: 0 },
      averageReferralDepth: 0,
    };
  }

  return {
    agentId,
    llmType: agentInfo[0].llmType,
    aggregateScore: Math.max(-100, Math.min(100, Number(data.weighted_sentiment) || 0)),
    directKnowers: Number(data.direct_count) || 0,
    referralKnowers: Number(data.referral_count) || 0,
    sentimentDistribution: {
      positive: Number(data.positive_count) || 0,
      neutral: Number(data.neutral_count) || 0,
      negative: Number(data.negative_count) || 0,
    },
    averageReferralDepth: Number(data.avg_depth) || 0,
  };
}

/**
 * Get global reputation for all agents
 */
export async function getAllGlobalReputations(): Promise<GlobalReputation[]> {
  const allAgents = await db
    .select({ id: agents.id })
    .from(agents)
    .where(sql`${agents.state} != 'dead'`);

  const reputations: GlobalReputation[] = [];

  for (const agent of allAgents) {
    const rep = await getGlobalReputation(agent.id);
    if (rep) {
      reputations.push(rep);
    }
  }

  return reputations;
}

/**
 * Get reputation summary statistics
 */
export async function getReputationSummary(): Promise<{
  avgReputation: number;
  reputationDistribution: {
    veryPositive: number; // > 50
    positive: number; // 20 to 50
    neutral: number; // -20 to 20
    negative: number; // -50 to -20
    veryNegative: number; // < -50
  };
  mostReputable: { agentId: string; llmType: string; score: number }[];
  leastReputable: { agentId: string; llmType: string; score: number }[];
}> {
  const allReps = await getAllGlobalReputations();

  if (allReps.length === 0) {
    return {
      avgReputation: 0,
      reputationDistribution: { veryPositive: 0, positive: 0, neutral: 0, negative: 0, veryNegative: 0 },
      mostReputable: [],
      leastReputable: [],
    };
  }

  const scores = allReps.map(r => r.aggregateScore);
  const avgReputation = scores.reduce((a, b) => a + b, 0) / scores.length;

  const distribution = {
    veryPositive: allReps.filter(r => r.aggregateScore > 50).length,
    positive: allReps.filter(r => r.aggregateScore > 20 && r.aggregateScore <= 50).length,
    neutral: allReps.filter(r => r.aggregateScore >= -20 && r.aggregateScore <= 20).length,
    negative: allReps.filter(r => r.aggregateScore < -20 && r.aggregateScore >= -50).length,
    veryNegative: allReps.filter(r => r.aggregateScore < -50).length,
  };

  const sortedByScore = [...allReps].sort((a, b) => b.aggregateScore - a.aggregateScore);

  return {
    avgReputation,
    reputationDistribution: distribution,
    mostReputable: sortedByScore.slice(0, 3).map(r => ({
      agentId: r.agentId,
      llmType: r.llmType,
      score: r.aggregateScore,
    })),
    leastReputable: sortedByScore.slice(-3).reverse().map(r => ({
      agentId: r.agentId,
      llmType: r.llmType,
      score: r.aggregateScore,
    })),
  };
}

// =============================================================================
// Emergence Index Metric
// =============================================================================

export interface EmergenceIndexMetrics {
  emergenceIndex: number; // 0-1, higher = more emergence
  systemComplexity: number; // Measured system-level complexity
  agentComplexitySum: number; // Sum of individual agent complexities
  components: {
    behavioralDiversity: number; // Variety of action patterns
    spatialOrganization: number; // Non-random clustering
    socialStructure: number; // Relationship network density
    economicDifferentiation: number; // Wealth/resource distribution
  };
}

/**
 * Calculate Emergence Index
 * Formula: (systemComplexity - sumOf(agentComplexities)) / systemComplexity
 * Measures how much the system behavior exceeds sum of individual behaviors
 */
export async function getEmergenceIndexMetrics(): Promise<EmergenceIndexMetrics> {
  // --- Behavioral Diversity ---
  // Measure entropy of action distribution across agents
  const actionData = await db.execute<{ action_entropy: number }>(sql`
    WITH action_counts AS (
      SELECT agent_id, event_type, COUNT(*) as cnt
      FROM events
      WHERE event_type LIKE 'agent_%'
        AND event_type NOT IN ('agent_died', 'agent_spawned')
      GROUP BY agent_id, event_type
    ),
    agent_totals AS (
      SELECT agent_id, SUM(cnt) as total
      FROM action_counts
      GROUP BY agent_id
    ),
    action_probs AS (
      SELECT
        ac.agent_id,
        ac.event_type,
        ac.cnt::float / at.total as prob
      FROM action_counts ac
      JOIN agent_totals at ON ac.agent_id = at.agent_id
    ),
    agent_entropy AS (
      SELECT
        agent_id,
        -SUM(prob * LN(prob + 0.0001)) as entropy
      FROM action_probs
      GROUP BY agent_id
    )
    SELECT
      COALESCE(AVG(entropy), 0) as action_entropy
    FROM agent_entropy
  `);

  const entropyRows = Array.isArray(actionData) ? actionData : (actionData as any).rows || [];
  const avgEntropy = Number(entropyRows[0]?.action_entropy) || 0;
  // Normalize entropy to 0-1 (max entropy with 6 actions is ln(6) ≈ 1.79)
  const behavioralDiversity = Math.min(1, avgEntropy / 1.79);

  // --- Spatial Organization ---
  // Compare actual clustering to random baseline
  const aliveAgents = await db
    .select({ id: agents.id, x: agents.x, y: agents.y })
    .from(agents)
    .where(sql`${agents.state} != 'dead'`);

  let spatialOrganization = 0;
  if (aliveAgents.length > 1) {
    // Calculate average nearest neighbor distance
    let avgNearestNeighbor = 0;
    for (const agent of aliveAgents) {
      let minDist = Infinity;
      for (const other of aliveAgents) {
        if (agent.id !== other.id) {
          const dist = Math.abs(agent.x - other.x) + Math.abs(agent.y - other.y);
          minDist = Math.min(minDist, dist);
        }
      }
      avgNearestNeighbor += minDist;
    }
    avgNearestNeighbor /= aliveAgents.length;

    // Expected for random distribution in 100x100 grid
    const gridArea = 100 * 100;
    const density = aliveAgents.length / gridArea;
    const expectedNearestNeighbor = 0.5 / Math.sqrt(density);

    // R statistic: actual/expected (< 1 means clustered, > 1 means dispersed)
    const rStatistic = avgNearestNeighbor / expectedNearestNeighbor;

    // Convert to 0-1 scale where 1 = highly organized (clustered or dispersed)
    spatialOrganization = Math.abs(1 - rStatistic);
  }

  // --- Social Structure ---
  // Measure relationship network density vs random
  const networkData = await db.execute<{
    node_count: number;
    edge_count: number;
    positive_edges: number;
  }>(sql`
    SELECT
      (SELECT COUNT(*) FROM agents WHERE state != 'dead') as node_count,
      COUNT(*) as edge_count,
      COUNT(*) FILTER (WHERE trust_score > 0) as positive_edges
    FROM agent_relationships
  `);

  const netRows = Array.isArray(networkData) ? networkData : (networkData as any).rows || [];
  const nodes = Number(netRows[0]?.node_count) || 1;
  const edges = Number(netRows[0]?.edge_count) || 0;
  const positiveEdges = Number(netRows[0]?.positive_edges) || 0;

  // Network density vs max possible
  const maxEdges = nodes * (nodes - 1);
  const density = maxEdges > 0 ? edges / maxEdges : 0;

  // Social structure: combination of density and positive bias
  const positiveBias = edges > 0 ? positiveEdges / edges : 0.5;
  const socialStructure = (density + positiveBias) / 2;

  // --- Economic Differentiation ---
  // Use Gini coefficient as measure of economic structure emergence
  const economyMetrics = await getEconomyMetrics();
  const economicDifferentiation = economyMetrics.giniCoefficient;

  // --- Calculate System vs Agent Complexity ---
  // System complexity: product of all components (synergy)
  const systemComplexity =
    (1 + behavioralDiversity) *
    (1 + spatialOrganization) *
    (1 + socialStructure) *
    (1 + economicDifferentiation);

  // Agent complexity sum: linear addition (no synergy)
  const agentComplexitySum =
    behavioralDiversity +
    spatialOrganization +
    socialStructure +
    economicDifferentiation;

  // Emergence Index: how much system exceeds sum of parts
  // Normalized to 0-1 range
  const rawEmergence = (systemComplexity - agentComplexitySum) / Math.max(systemComplexity, 1);
  const emergenceIndex = Math.max(0, Math.min(1, rawEmergence));

  return {
    emergenceIndex,
    systemComplexity,
    agentComplexitySum,
    components: {
      behavioralDiversity: Math.round(behavioralDiversity * 1000) / 1000,
      spatialOrganization: Math.round(spatialOrganization * 1000) / 1000,
      socialStructure: Math.round(socialStructure * 1000) / 1000,
      economicDifferentiation: Math.round(economicDifferentiation * 1000) / 1000,
    },
  };
}

// =============================================================================
// Market Efficiency Metrics
// =============================================================================

export interface MarketEfficiencyMetrics {
  priceConvergence: {
    currentVariance: number; // Current price variance across trades
    historicalVariance: number; // Historical average variance
    convergenceRate: number; // How fast prices are stabilizing (0-1)
    isConverging: boolean;
  };
  spreadPercentage: {
    avgBidAskSpread: number; // Average spread between buy/sell prices
    spreadByResourceType: {
      resourceType: string;
      avgBuyPrice: number;
      avgSellPrice: number;
      spread: number;
    }[];
  };
  liquidity: {
    tradesPerTick: number;
    uniqueTradersPerTick: number;
    volumePerTick: number;
  };
  marketMaturity: 'nascent' | 'developing' | 'mature' | 'efficient';
}

/**
 * Calculate Market Efficiency Metrics
 * Measures how well the market discovers and maintains prices
 */
export async function getMarketEfficiencyMetrics(): Promise<MarketEfficiencyMetrics> {
  // Get current tick for calculations
  const currentTickResult = await db
    .select({ tick: sql<number>`MAX(${events.tick})` })
    .from(events);
  const currentTick = Number(currentTickResult[0]?.tick) || 1;

  // --- Price Convergence ---
  // Calculate variance of prices for same resource type over time
  const priceVarianceData = await db.execute<{
    current_variance: number;
    historical_variance: number;
  }>(sql`
    WITH trade_prices AS (
      SELECT
        tick,
        (payload->>'resourceType') as resource_type,
        (payload->>'price')::numeric as price
      FROM events
      WHERE event_type = 'agent_traded'
        AND payload->>'price' IS NOT NULL
    ),
    recent_prices AS (
      SELECT resource_type, VARIANCE(price) as variance
      FROM trade_prices
      WHERE tick >= ${currentTick} - 20
      GROUP BY resource_type
    ),
    historical_prices AS (
      SELECT resource_type, VARIANCE(price) as variance
      FROM trade_prices
      WHERE tick < ${currentTick} - 20
      GROUP BY resource_type
    )
    SELECT
      COALESCE(AVG(r.variance), 0) as current_variance,
      COALESCE(AVG(h.variance), 1) as historical_variance
    FROM recent_prices r
    FULL OUTER JOIN historical_prices h ON r.resource_type = h.resource_type
  `);

  const varianceRows = Array.isArray(priceVarianceData) ? priceVarianceData : (priceVarianceData as any).rows || [];
  const currentVariance = Number(varianceRows[0]?.current_variance) || 0;
  const historicalVariance = Number(varianceRows[0]?.historical_variance) || 1;

  // Convergence rate: how much variance has decreased
  const convergenceRate = historicalVariance > 0
    ? Math.max(0, 1 - (currentVariance / historicalVariance))
    : 0;

  // --- Spread Percentage (Bid-Ask) ---
  // Approximate from buy vs trade events
  const spreadData = await db.execute<{
    resource_type: string;
    avg_buy_price: number;
    avg_sell_price: number;
  }>(sql`
    WITH buy_prices AS (
      SELECT
        (payload->>'itemType') as resource_type,
        (payload->>'price')::numeric as price
      FROM events
      WHERE event_type = 'agent_bought'
        AND payload->>'price' IS NOT NULL
    ),
    trade_prices AS (
      SELECT
        (payload->>'resourceType') as resource_type,
        (payload->>'price')::numeric as price
      FROM events
      WHERE event_type = 'agent_traded'
        AND payload->>'price' IS NOT NULL
    )
    SELECT
      COALESCE(b.resource_type, t.resource_type) as resource_type,
      COALESCE(AVG(b.price), 0) as avg_buy_price,
      COALESCE(AVG(t.price), 0) as avg_sell_price
    FROM buy_prices b
    FULL OUTER JOIN trade_prices t ON b.resource_type = t.resource_type
    WHERE b.resource_type IS NOT NULL OR t.resource_type IS NOT NULL
    GROUP BY COALESCE(b.resource_type, t.resource_type)
  `);

  const spreadRows: { resource_type: string; avg_buy_price: number; avg_sell_price: number }[] =
    Array.isArray(spreadData) ? spreadData : (spreadData as any).rows || [];

  const spreadByResourceType = spreadRows.map((row) => {
    const avgBuy = Number(row.avg_buy_price) || 0;
    const avgSell = Number(row.avg_sell_price) || 0;
    const midPrice = (avgBuy + avgSell) / 2;
    const spread = midPrice > 0 ? Math.abs(avgBuy - avgSell) / midPrice : 0;

    return {
      resourceType: row.resource_type,
      avgBuyPrice: avgBuy,
      avgSellPrice: avgSell,
      spread,
    };
  });

  const avgBidAskSpread = spreadByResourceType.length > 0
    ? spreadByResourceType.reduce((sum, s) => sum + s.spread, 0) / spreadByResourceType.length
    : 0;

  // --- Liquidity ---
  const liquidityData = await db.execute<{
    trades_per_tick: number;
    unique_traders: number;
    volume_per_tick: number;
  }>(sql`
    WITH tick_range AS (
      SELECT MAX(tick) - 20 as start_tick, MAX(tick) as end_tick
      FROM events
    ),
    trade_stats AS (
      SELECT
        COUNT(*)::float / GREATEST(1, (SELECT end_tick - start_tick FROM tick_range)) as trades_per_tick,
        COUNT(DISTINCT agent_id) as unique_traders,
        SUM(COALESCE((payload->>'quantity')::numeric, 1))::float /
          GREATEST(1, (SELECT end_tick - start_tick FROM tick_range)) as volume_per_tick
      FROM events
      WHERE event_type = 'agent_traded'
        AND tick >= (SELECT start_tick FROM tick_range)
    )
    SELECT * FROM trade_stats
  `);

  const liquidityRows = Array.isArray(liquidityData) ? liquidityData : (liquidityData as any).rows || [];

  // --- Market Maturity Classification ---
  const tradesPerTick = Number(liquidityRows[0]?.trades_per_tick) || 0;
  let marketMaturity: MarketEfficiencyMetrics['marketMaturity'] = 'nascent';

  if (tradesPerTick > 1 && convergenceRate > 0.5 && avgBidAskSpread < 0.2) {
    marketMaturity = 'efficient';
  } else if (tradesPerTick > 0.5 && convergenceRate > 0.3) {
    marketMaturity = 'mature';
  } else if (tradesPerTick > 0.1) {
    marketMaturity = 'developing';
  }

  return {
    priceConvergence: {
      currentVariance: Math.round(currentVariance * 100) / 100,
      historicalVariance: Math.round(historicalVariance * 100) / 100,
      convergenceRate: Math.round(convergenceRate * 1000) / 1000,
      isConverging: currentVariance < historicalVariance,
    },
    spreadPercentage: {
      avgBidAskSpread: Math.round(avgBidAskSpread * 1000) / 1000,
      spreadByResourceType,
    },
    liquidity: {
      tradesPerTick: Math.round(tradesPerTick * 100) / 100,
      uniqueTradersPerTick: Number(liquidityRows[0]?.unique_traders) || 0,
      volumePerTick: Math.round(Number(liquidityRows[0]?.volume_per_tick) * 100) / 100 || 0,
    },
    marketMaturity,
  };
}

// =============================================================================
// Governance Metrics (Radical Emergence Classifier)
// =============================================================================

export interface GovernanceMetrics {
  leadershipEmergence: {
    potentialLeaders: {
      agentId: string;
      llmType: string;
      influenceScore: number; // Based on who follows/trusts them
      followerCount: number;
    }[];
    leadershipConcentration: number; // 0-1, how concentrated leadership is
  };
  collectiveDecisions: {
    coordinatedActionsCount: number; // Agents acting in sync
    groupMovementPatterns: number; // Groups moving together
    sharedResourcePools: number; // Agents sharing at same locations
  };
  normEmergence: {
    consistentBehaviorPatterns: number; // Agents following similar rules
    punishmentOfDeviants: number; // Negative responses to outliers
    normStrength: number; // 0-1, how strong emergent norms are
  };
  dominantStructure:
    | 'anarchic' // No coordination
    | 'egalitarian' // Equal distribution of influence
    | 'hierarchical' // Clear leader-follower relationships
    | 'oligarchic' // Small group dominates
    | 'emergent'; // Novel structure detected
}

/**
 * Detect emergent governance structures
 * Classifies what type of social organization has emerged
 */
export async function getGovernanceMetrics(): Promise<GovernanceMetrics> {
  // --- Leadership Emergence ---
  // Identify agents with high trust/influence
  const leaderData = await db.execute<{
    agent_id: string;
    llm_type: string;
    influence_score: number;
    follower_count: number;
  }>(sql`
    WITH trust_received AS (
      SELECT
        other_agent_id as agent_id,
        COUNT(*) as truster_count,
        SUM(trust_score) as total_trust
      FROM agent_relationships
      WHERE trust_score > 20
      GROUP BY other_agent_id
    ),
    info_influence AS (
      SELECT
        (payload->>'aboutAgentId') as agent_id,
        COUNT(*) as mention_count
      FROM events
      WHERE event_type = 'agent_shared_info'
        AND (payload->>'sentiment')::int > 0
      GROUP BY payload->>'aboutAgentId'
    )
    SELECT
      a.id as agent_id,
      a.llm_type,
      COALESCE(tr.truster_count, 0) * 10 +
        COALESCE(tr.total_trust, 0) +
        COALESCE(ii.mention_count, 0) * 5 as influence_score,
      COALESCE(tr.truster_count, 0) as follower_count
    FROM agents a
    LEFT JOIN trust_received tr ON a.id = tr.agent_id
    LEFT JOIN info_influence ii ON a.id::text = ii.agent_id
    WHERE a.state != 'dead'
    ORDER BY influence_score DESC
    LIMIT 10
  `);

  const leaderRows: { agent_id: string; llm_type: string; influence_score: number; follower_count: number }[] =
    Array.isArray(leaderData) ? leaderData : (leaderData as any).rows || [];

  const potentialLeaders = leaderRows.map((r) => ({
    agentId: r.agent_id,
    llmType: r.llm_type,
    influenceScore: Number(r.influence_score) || 0,
    followerCount: Number(r.follower_count) || 0,
  }));

  // Calculate leadership concentration (Gini of influence)
  const influenceScores = potentialLeaders.map((l) => l.influenceScore);
  let leadershipConcentration = 0;

  if (influenceScores.length > 1) {
    const sorted = [...influenceScores].sort((a, b) => a - b);
    const n = sorted.length;
    const sum = sorted.reduce((a, b) => a + b, 0);
    if (sum > 0) {
      let numerator = 0;
      for (let i = 0; i < n; i++) {
        numerator += (2 * (i + 1) - n - 1) * sorted[i];
      }
      leadershipConcentration = numerator / (n * sum);
    }
  }

  // --- Collective Decisions ---
  // Count coordinated actions (multiple agents doing same thing at same tick)
  const coordinationData = await db.execute<{
    coordinated_count: number;
    group_movements: number;
    shared_locations: number;
  }>(sql`
    WITH tick_actions AS (
      SELECT tick, event_type, COUNT(*) as agent_count
      FROM events
      WHERE event_type LIKE 'agent_%'
        AND event_type NOT IN ('agent_died', 'agent_spawned')
      GROUP BY tick, event_type
      HAVING COUNT(*) >= 3
    ),
    movement_groups AS (
      SELECT tick, (payload->>'toX')::int as x, (payload->>'toY')::int as y, COUNT(*) as movers
      FROM events
      WHERE event_type = 'agent_moved'
      GROUP BY tick, payload->>'toX', payload->>'toY'
      HAVING COUNT(*) >= 2
    ),
    location_sharing AS (
      SELECT x, y, COUNT(*) as occupants
      FROM agents
      WHERE state != 'dead'
      GROUP BY x, y
      HAVING COUNT(*) >= 2
    )
    SELECT
      (SELECT COUNT(*) FROM tick_actions) as coordinated_count,
      (SELECT COUNT(*) FROM movement_groups) as group_movements,
      (SELECT COUNT(*) FROM location_sharing) as shared_locations
  `);

  const coordRows = Array.isArray(coordinationData) ? coordinationData : (coordinationData as any).rows || [];

  // --- Norm Emergence ---
  // Detect consistent behavior patterns and punishment of deviation
  const normData = await db.execute<{
    behavior_consistency: number;
    punishment_events: number;
  }>(sql`
    WITH action_counts AS (
      SELECT
        agent_id,
        event_type,
        COUNT(*) as action_count
      FROM events
      WHERE event_type LIKE 'agent_%'
        AND event_type NOT IN ('agent_died', 'agent_spawned')
      GROUP BY agent_id, event_type
    ),
    agent_totals AS (
      SELECT agent_id, SUM(action_count) as total_actions
      FROM action_counts
      GROUP BY agent_id
    ),
    behavior_ratios AS (
      SELECT
        ac.agent_id,
        ac.event_type,
        ac.action_count::float / NULLIF(at.total_actions, 0) as ratio
      FROM action_counts ac
      JOIN agent_totals at ON ac.agent_id = at.agent_id
    ),
    behavior_variance AS (
      SELECT
        event_type,
        VARIANCE(ratio) as ratio_variance
      FROM behavior_ratios
      GROUP BY event_type
    ),
    punishment_count AS (
      SELECT COUNT(*) as cnt
      FROM events e1
      JOIN events e2 ON
        e1.agent_id::text = e2.payload->>'targetAgentId'
        AND e2.event_type IN ('agent_harmed', 'agent_stole')
        AND e2.tick > e1.tick
        AND e2.tick <= e1.tick + 10
      WHERE e1.event_type IN ('agent_harmed', 'agent_stole', 'agent_deceived')
    )
    SELECT
      1 - COALESCE(AVG(ratio_variance), 0) as behavior_consistency,
      (SELECT cnt FROM punishment_count) as punishment_events
    FROM behavior_variance
  `);

  const normRows = Array.isArray(normData) ? normData : (normData as any).rows || [];
  const behaviorConsistency = Number(normRows[0]?.behavior_consistency) || 0;
  const punishmentEvents = Number(normRows[0]?.punishment_events) || 0;

  // Norm strength: combination of consistency and enforcement
  const normStrength = Math.min(1, (behaviorConsistency + Math.min(1, punishmentEvents / 10)) / 2);

  // --- Classify Dominant Structure ---
  const totalAgents = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(agents)
    .where(sql`${agents.state} != 'dead'`);
  const agentCount = Number(totalAgents[0]?.count) || 1;

  const topLeaderInfluence = potentialLeaders[0]?.influenceScore || 0;
  const totalInfluence = potentialLeaders.reduce((sum, l) => sum + l.influenceScore, 0);
  const topLeaderShare = totalInfluence > 0 ? topLeaderInfluence / totalInfluence : 0;

  const top3Influence = potentialLeaders.slice(0, 3).reduce((sum, l) => sum + l.influenceScore, 0);
  const top3Share = totalInfluence > 0 ? top3Influence / totalInfluence : 0;

  let dominantStructure: GovernanceMetrics['dominantStructure'] = 'anarchic';

  if (leadershipConcentration < 0.2 && normStrength < 0.3) {
    dominantStructure = 'anarchic';
  } else if (leadershipConcentration < 0.3 && normStrength > 0.5) {
    dominantStructure = 'egalitarian';
  } else if (topLeaderShare > 0.5) {
    dominantStructure = 'hierarchical';
  } else if (top3Share > 0.7 && leadershipConcentration > 0.4) {
    dominantStructure = 'oligarchic';
  } else if (normStrength > 0.4 || Number(coordRows[0]?.coordinated_count) > 10) {
    dominantStructure = 'emergent';
  }

  return {
    leadershipEmergence: {
      potentialLeaders,
      leadershipConcentration: Math.round(leadershipConcentration * 1000) / 1000,
    },
    collectiveDecisions: {
      coordinatedActionsCount: Number(coordRows[0]?.coordinated_count) || 0,
      groupMovementPatterns: Number(coordRows[0]?.group_movements) || 0,
      sharedResourcePools: Number(coordRows[0]?.shared_locations) || 0,
    },
    normEmergence: {
      consistentBehaviorPatterns: Math.round(behaviorConsistency * 1000) / 1000,
      punishmentOfDeviants: punishmentEvents,
      normStrength: Math.round(normStrength * 1000) / 1000,
    },
    dominantStructure,
  };
}

// =============================================================================
// Resource Efficiency Metrics
// =============================================================================

export interface ResourceEfficiencyMetrics {
  byLlmType: {
    llmType: string;
    gatherCount: number;
    totalResourcesGathered: number;
    avgResourcesPerGather: number;
    efficiencyScore: number; // resources gathered / actions taken
  }[];
  overall: {
    totalGatherActions: number;
    totalResourcesGathered: number;
    avgResourcesPerGather: number;
    mostEfficient: string | null;
    leastEfficient: string | null;
  };
}

/**
 * Calculate resource efficiency by LLM type
 * Efficiency = total resources gathered / total gather actions
 */
export async function getResourceEfficiencyMetrics(): Promise<ResourceEfficiencyMetrics> {
  // Query gather events with resource quantities
  const gatherData = await db.execute<{
    llm_type: string;
    gather_count: string;
    total_resources: string;
  }>(sql`
    SELECT
      a.llm_type,
      COUNT(e.id) as gather_count,
      COALESCE(SUM(COALESCE((e.payload->>'quantity')::int, 1)), 0) as total_resources
    FROM events e
    JOIN agents a ON e.agent_id = a.id
    WHERE e.event_type = 'agent_gathered'
    GROUP BY a.llm_type
    ORDER BY a.llm_type
  `);

  const gatherRows = Array.isArray(gatherData) ? gatherData : (gatherData as any).rows || [];

  // Calculate by LLM type
  const byLlmType = gatherRows.map((row) => {
    const gatherCount = Number(row.gather_count) || 0;
    const totalResourcesGathered = Number(row.total_resources) || 0;
    const avgResourcesPerGather = gatherCount > 0 ? totalResourcesGathered / gatherCount : 0;

    return {
      llmType: row.llm_type,
      gatherCount,
      totalResourcesGathered,
      avgResourcesPerGather: Math.round(avgResourcesPerGather * 100) / 100,
      efficiencyScore: Math.round(avgResourcesPerGather * 100) / 100,
    };
  });

  // Calculate overall stats
  const totalGatherActions = byLlmType.reduce((sum, r) => sum + r.gatherCount, 0);
  const totalResourcesGathered = byLlmType.reduce((sum, r) => sum + r.totalResourcesGathered, 0);
  const avgResourcesPerGather = totalGatherActions > 0 ? totalResourcesGathered / totalGatherActions : 0;

  // Find most/least efficient
  const sortedByEfficiency = [...byLlmType].sort((a, b) => b.efficiencyScore - a.efficiencyScore);
  const mostEfficient = sortedByEfficiency.length > 0 ? sortedByEfficiency[0].llmType : null;
  const leastEfficient = sortedByEfficiency.length > 0 ? sortedByEfficiency[sortedByEfficiency.length - 1].llmType : null;

  return {
    byLlmType,
    overall: {
      totalGatherActions,
      totalResourcesGathered,
      avgResourcesPerGather: Math.round(avgResourcesPerGather * 100) / 100,
      mostEfficient,
      leastEfficient,
    },
  };
}

// =============================================================================
// Phase 4 Metrics
// =============================================================================

export async function getPhase4Metrics(): Promise<Phase4Metrics> {
  // Credentials metrics
  const credentialsStats = await db
    .select({
      totalIssued: sql<number>`COUNT(*)`,
      totalActive: sql<number>`COUNT(*) FILTER (WHERE ${agentCredentials.revoked} = false)`,
      totalRevoked: sql<number>`COUNT(*) FILTER (WHERE ${agentCredentials.revoked} = true)`,
    })
    .from(agentCredentials);

  const credentialsByType = await db
    .select({
      claimType: agentCredentials.claimType,
      count: sql<number>`COUNT(*)`,
    })
    .from(agentCredentials)
    .groupBy(agentCredentials.claimType);

  // Gossip metrics
  const gossipStats = await db
    .select({
      totalEvents: sql<number>`COUNT(*)`,
      averageSentiment: sql<number>`AVG(${gossipEvents.sentiment})`,
    })
    .from(gossipEvents);

  const gossipByTopic = await db
    .select({
      topic: gossipEvents.topic,
      count: sql<number>`COUNT(*)`,
    })
    .from(gossipEvents)
    .groupBy(gossipEvents.topic);

  const mostDiscussed = await db
    .select({
      agentId: gossipEvents.subjectAgentId,
      count: sql<number>`COUNT(*)`,
    })
    .from(gossipEvents)
    .groupBy(gossipEvents.subjectAgentId)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(10);

  // Reproduction metrics
  const reproStats = await db
    .select({
      totalBirths: sql<number>`COUNT(*) FILTER (WHERE ${reproductionStates.status} = 'completed')`,
      gestationsInProgress: sql<number>`COUNT(*) FILTER (WHERE ${reproductionStates.status} = 'gestating')`,
    })
    .from(reproductionStates);

  const generationStats = await db
    .select({
      generation: agentLineages.generation,
      count: sql<number>`COUNT(*)`,
    })
    .from(agentLineages)
    .groupBy(agentLineages.generation);

  const maxGen = await db
    .select({
      maxGeneration: sql<number>`COALESCE(MAX(${agentLineages.generation}), 0)`,
    })
    .from(agentLineages);

  // LLM metrics
  const llmStats = await db
    .select({
      totalCalls: sql<number>`COUNT(*)`,
      avgLatencyMs: sql<number>`AVG(${llmMetrics.latencyMs})`,
      successRate: sql<number>`AVG(CASE WHEN ${llmMetrics.success} THEN 1.0 ELSE 0.0 END)`,
      fallbackRate: sql<number>`AVG(CASE WHEN ${llmMetrics.usedFallback} THEN 1.0 ELSE 0.0 END)`,
    })
    .from(llmMetrics);

  const llmByModel = await db
    .select({
      modelId: llmMetrics.modelId,
      calls: sql<number>`COUNT(*)`,
      avgLatency: sql<number>`AVG(${llmMetrics.latencyMs})`,
      successRate: sql<number>`AVG(CASE WHEN ${llmMetrics.success} THEN 1.0 ELSE 0.0 END)`,
    })
    .from(llmMetrics)
    .groupBy(llmMetrics.modelId);

  // Build response
  const byClaimType: Record<string, number> = {};
  for (const row of credentialsByType) {
    byClaimType[row.claimType] = Number(row.count) || 0;
  }

  const byTopic: Record<string, number> = {};
  for (const row of gossipByTopic) {
    byTopic[row.topic] = Number(row.count) || 0;
  }

  const generationDistribution: Record<number, number> = {};
  for (const row of generationStats) {
    generationDistribution[row.generation] = Number(row.count) || 0;
  }

  const byModel: Record<string, { calls: number; avgLatency: number; successRate: number }> = {};
  for (const row of llmByModel) {
    byModel[row.modelId] = {
      calls: Number(row.calls) || 0,
      avgLatency: Number(row.avgLatency) || 0,
      successRate: Number(row.successRate) || 0,
    };
  }

  return {
    credentials: {
      totalIssued: Number(credentialsStats[0]?.totalIssued) || 0,
      totalActive: Number(credentialsStats[0]?.totalActive) || 0,
      totalRevoked: Number(credentialsStats[0]?.totalRevoked) || 0,
      byClaimType,
    },
    gossip: {
      totalEvents: Number(gossipStats[0]?.totalEvents) || 0,
      averageSentiment: Number(gossipStats[0]?.averageSentiment) || 0,
      byTopic,
      mostDiscussedAgents: mostDiscussed.map((r) => ({
        agentId: r.agentId,
        count: Number(r.count) || 0,
      })),
    },
    reproduction: {
      totalBirths: Number(reproStats[0]?.totalBirths) || 0,
      gestationsInProgress: Number(reproStats[0]?.gestationsInProgress) || 0,
      generationDistribution,
      maxGeneration: Number(maxGen[0]?.maxGeneration) || 0,
    },
    llmPerformance: {
      totalCalls: Number(llmStats[0]?.totalCalls) || 0,
      avgLatencyMs: Number(llmStats[0]?.avgLatencyMs) || 0,
      successRate: Number(llmStats[0]?.successRate) || 0,
      fallbackRate: Number(llmStats[0]?.fallbackRate) || 0,
      byModel,
    },
  };
}

// =============================================================================
// Combined Snapshot
// =============================================================================

export async function getAnalyticsSnapshot(): Promise<AnalyticsSnapshot> {
  const [survival, economy, behavior, temporal] = await Promise.all([
    getSurvivalMetrics(),
    getEconomyMetrics(),
    getBehaviorMetrics(),
    getTemporalMetrics(),
  ]);

  // Try to get emergence metrics (may fail if tables don't exist yet)
  let emergence: EmergenceMetrics | undefined;
  try {
    emergence = await getEmergenceMetrics();
  } catch (error) {
    // Tables may not exist yet - that's ok
    console.warn('[Analytics] Emergence metrics unavailable:', error);
  }

  // Try to get Phase 2 metrics
  let phase2: Phase2Metrics | undefined;
  try {
    phase2 = await getPhase2Metrics();
  } catch (error) {
    // Phase 2 tables may not exist yet - that's ok
    console.warn('[Analytics] Phase 2 metrics unavailable:', error);
  }

  // Try to get Phase 4 metrics
  let phase4: Phase4Metrics | undefined;
  try {
    phase4 = await getPhase4Metrics();
  } catch (error) {
    // Phase 4 tables may not exist yet - that's ok
    console.warn('[Analytics] Phase 4 metrics unavailable:', error);
  }

  return {
    survival,
    economy,
    behavior,
    temporal,
    emergence,
    phase2,
    phase4,
    timestamp: Date.now(),
  };
}
