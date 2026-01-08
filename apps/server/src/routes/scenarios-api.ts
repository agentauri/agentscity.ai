/**
 * Scenario Injection API
 *
 * Endpoints for runtime modifications to the simulation.
 * Used for "chaos monkey" style testing and experimental interventions.
 *
 * NOTE: All write endpoints require admin authentication via X-Admin-Key header.
 *
 * Endpoints:
 * - POST /api/scenarios/shock     - Economic shock (modify currency)
 * - POST /api/scenarios/disaster  - Natural disaster (remove resources)
 * - POST /api/scenarios/abundance - Resource abundance (boost resources)
 * - POST /api/scenarios/rule      - Modify simulation rules
 * - GET  /api/scenarios/history   - Get scenario injection history
 */

import type { FastifyInstance } from 'fastify';
import { db } from '../db';
import { agents, resourceSpawns, events } from '../db/schema';
import { eq, sql, and, between } from 'drizzle-orm';
import { getCurrentTick } from '../db/queries/world';
import { appendEvent } from '../db/queries/events';
import { v4 as uuid } from 'uuid';
import { requireAdmin } from '../middleware/auth';

// =============================================================================
// Types
// =============================================================================

interface ScenarioResult {
  success: boolean;
  scenarioId: string;
  type: string;
  tick: number;
  affectedEntities: number;
  details: Record<string, unknown>;
}

interface EconomicShockBody {
  /** Multiplier for all agent balances (0.5 = halve, 2.0 = double) */
  balanceMultiplier?: number;

  /** Flat amount to add/subtract from all balances */
  balanceAdjustment?: number;

  /** Target specific LLM types (optional) */
  targetLlmTypes?: string[];

  /** Target specific area (optional) */
  area?: {
    x: [number, number];
    y: [number, number];
  };
}

interface DisasterBody {
  /** Center of disaster */
  center: { x: number; y: number };

  /** Radius of effect */
  radius: number;

  /** Intensity (0-1, affects how much is destroyed) */
  intensity?: number;

  /** Types of resources affected */
  affectedTypes?: ('food' | 'energy' | 'material')[];

  /** Also damage agents in area? */
  damageAgents?: boolean;

  /** Agent damage amount if enabled */
  agentDamage?: number;
}

interface AbundanceBody {
  /** Center of abundance (optional, defaults to random) */
  center?: { x: number; y: number };

  /** Radius of effect */
  radius?: number;

  /** Multiplier for resource amounts */
  amountMultiplier?: number;

  /** Multiplier for regen rates */
  regenMultiplier?: number;

  /** Types of resources affected */
  affectedTypes?: ('food' | 'energy' | 'material')[];

  /** Duration in ticks (0 = permanent) */
  durationTicks?: number;
}

interface RuleChangeBody {
  /** Rule to modify */
  rule: 'hunger_decay' | 'energy_decay' | 'work_income' | 'trade_cost' | 'harm_damage';

  /** New value for the rule */
  value: number;

  /** Duration in ticks (0 = permanent) */
  durationTicks?: number;
}

// =============================================================================
// Scenario History (in-memory for now)
// =============================================================================

interface ScenarioHistoryEntry extends ScenarioResult {
  timestamp: Date;
  params: Record<string, unknown>;
}

const scenarioHistory: ScenarioHistoryEntry[] = [];

function addToHistory(result: ScenarioResult, params: Record<string, unknown>): void {
  scenarioHistory.push({
    ...result,
    timestamp: new Date(),
    params,
  });

  // Keep only last 100 entries
  if (scenarioHistory.length > 100) {
    scenarioHistory.shift();
  }
}

// =============================================================================
// Active Rule Overrides
// =============================================================================

export interface RuleOverride {
  rule: string;
  originalValue: number;
  newValue: number;
  expiresAtTick: number | null;
  scenarioId: string;
}

const activeRuleOverrides: Map<string, RuleOverride> = new Map();

/**
 * Get current value for a rule (with override if active)
 */
export async function getRuleValue(rule: string, defaultValue: number): Promise<number> {
  const override = activeRuleOverrides.get(rule);
  if (!override) return defaultValue;

  // Compare against simulation tick, not wall clock time
  const currentTick = await getCurrentTick();
  if (override.expiresAtTick !== null && currentTick >= override.expiresAtTick) {
    activeRuleOverrides.delete(rule);
    return defaultValue;
  }

  return override.newValue;
}

/**
 * Check and expire old rule overrides
 */
export async function expireRuleOverrides(): Promise<void> {
  const currentTick = await getCurrentTick();

  for (const [rule, override] of activeRuleOverrides) {
    if (override.expiresAtTick !== null && currentTick >= override.expiresAtTick) {
      activeRuleOverrides.delete(rule);
      console.log(`[Scenarios] Rule override expired: ${rule}`);
    }
  }
}

// =============================================================================
// Route Registration
// =============================================================================

export async function registerScenarioRoutes(server: FastifyInstance): Promise<void> {
  // ---------------------------------------------------------------------------
  // POST /api/scenarios/shock - Economic shock (requires admin auth)
  // ---------------------------------------------------------------------------
  server.post<{ Body: EconomicShockBody }>('/api/scenarios/shock', {
    preHandler: [requireAdmin],
    schema: {
      description: 'Inject an economic shock - modify agent balances',
      tags: ['Scenarios'],
      body: {
        type: 'object',
        properties: {
          balanceMultiplier: { type: 'number', description: 'Multiply all balances (e.g., 0.5 halves, 2.0 doubles)' },
          balanceAdjustment: { type: 'number', description: 'Add/subtract from all balances' },
          targetLlmTypes: { type: 'array', items: { type: 'string' }, description: 'Target specific LLM types' },
          area: {
            type: 'object',
            properties: {
              x: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
              y: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 2 },
            },
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            scenarioId: { type: 'string' },
            type: { type: 'string' },
            tick: { type: 'number' },
            affectedEntities: { type: 'number' },
            details: { type: 'object' },
          },
        },
      },
    },
  }, async (request) => {
    const { balanceMultiplier = 1, balanceAdjustment = 0, targetLlmTypes, area } = request.body;
    const tick = await getCurrentTick();
    const scenarioId = uuid();

    // Build query conditions
    const conditions = [eq(agents.state, 'idle')]; // Only affect alive agents
    if (targetLlmTypes && targetLlmTypes.length > 0) {
      conditions.push(sql`${agents.llmType} = ANY(${targetLlmTypes})`);
    }
    if (area) {
      conditions.push(
        between(agents.x, area.x[0], area.x[1]),
        between(agents.y, area.y[0], area.y[1])
      );
    }

    // Apply shock
    const result = await db
      .update(agents)
      .set({
        balance: sql`GREATEST(0, ${agents.balance} * ${balanceMultiplier} + ${balanceAdjustment})`,
      })
      .where(and(...conditions))
      .returning({ id: agents.id });

    // Log event
    await appendEvent({
      eventType: 'scenario_shock',
      tick,
      payload: {
        scenarioId,
        balanceMultiplier,
        balanceAdjustment,
        affectedAgents: result.length,
      },
    });

    const scenarioResult: ScenarioResult = {
      success: true,
      scenarioId,
      type: 'economic_shock',
      tick,
      affectedEntities: result.length,
      details: {
        balanceMultiplier,
        balanceAdjustment,
        targetLlmTypes,
        area,
      },
    };

    addToHistory(scenarioResult, request.body as Record<string, unknown>);
    return scenarioResult;
  });

  // ---------------------------------------------------------------------------
  // POST /api/scenarios/disaster - Natural disaster (requires admin auth)
  // ---------------------------------------------------------------------------
  server.post<{ Body: DisasterBody }>('/api/scenarios/disaster', {
    preHandler: [requireAdmin],
    schema: {
      description: 'Trigger a natural disaster - deplete resources in an area',
      tags: ['Scenarios'],
      body: {
        type: 'object',
        required: ['center', 'radius'],
        properties: {
          center: {
            type: 'object',
            required: ['x', 'y'],
            properties: { x: { type: 'number' }, y: { type: 'number' } },
          },
          radius: { type: 'number', minimum: 1 },
          intensity: { type: 'number', minimum: 0, maximum: 1, default: 0.8 },
          affectedTypes: { type: 'array', items: { type: 'string', enum: ['food', 'energy', 'material'] } },
          damageAgents: { type: 'boolean', default: false },
          agentDamage: { type: 'number', default: 20 },
        },
      },
    },
  }, async (request) => {
    const {
      center,
      radius,
      intensity = 0.8,
      affectedTypes,
      damageAgents = false,
      agentDamage = 20,
    } = request.body;
    const tick = await getCurrentTick();
    const scenarioId = uuid();

    // Calculate affected area
    const minX = center.x - radius;
    const maxX = center.x + radius;
    const minY = center.y - radius;
    const maxY = center.y + radius;

    // Deplete resources
    const resourceConditions = [
      between(resourceSpawns.x, minX, maxX),
      between(resourceSpawns.y, minY, maxY),
    ];
    if (affectedTypes && affectedTypes.length > 0) {
      resourceConditions.push(sql`${resourceSpawns.resourceType} = ANY(${affectedTypes})`);
    }

    const resourceResult = await db
      .update(resourceSpawns)
      .set({
        currentAmount: sql`GREATEST(0, ${resourceSpawns.currentAmount} * ${1 - intensity})`,
      })
      .where(and(...resourceConditions))
      .returning({ id: resourceSpawns.id });

    let agentResult: { id: string }[] = [];

    // Optionally damage agents
    if (damageAgents) {
      agentResult = await db
        .update(agents)
        .set({
          health: sql`GREATEST(0, ${agents.health} - ${agentDamage})`,
        })
        .where(and(
          between(agents.x, minX, maxX),
          between(agents.y, minY, maxY),
          sql`${agents.state} != 'dead'`
        ))
        .returning({ id: agents.id });
    }

    // Log event
    await appendEvent({
      eventType: 'scenario_disaster',
      tick,
      payload: {
        scenarioId,
        center,
        radius,
        intensity,
        affectedResources: resourceResult.length,
        affectedAgents: agentResult.length,
      },
    });

    const scenarioResult: ScenarioResult = {
      success: true,
      scenarioId,
      type: 'natural_disaster',
      tick,
      affectedEntities: resourceResult.length + agentResult.length,
      details: {
        center,
        radius,
        intensity,
        resourcesDepleted: resourceResult.length,
        agentsDamaged: agentResult.length,
      },
    };

    addToHistory(scenarioResult, request.body as unknown as Record<string, unknown>);
    return scenarioResult;
  });

  // ---------------------------------------------------------------------------
  // POST /api/scenarios/abundance - Resource abundance (requires admin auth)
  // ---------------------------------------------------------------------------
  server.post<{ Body: AbundanceBody }>('/api/scenarios/abundance', {
    preHandler: [requireAdmin],
    schema: {
      description: 'Create resource abundance - boost resources in an area',
      tags: ['Scenarios'],
      body: {
        type: 'object',
        properties: {
          center: {
            type: 'object',
            properties: { x: { type: 'number' }, y: { type: 'number' } },
          },
          radius: { type: 'number', minimum: 1, default: 20 },
          amountMultiplier: { type: 'number', minimum: 1, default: 2 },
          regenMultiplier: { type: 'number', minimum: 1, default: 1.5 },
          affectedTypes: { type: 'array', items: { type: 'string', enum: ['food', 'energy', 'material'] } },
          durationTicks: { type: 'number', default: 0, description: '0 = permanent' },
        },
      },
    },
  }, async (request) => {
    const {
      center,
      radius = 20,
      amountMultiplier = 2,
      regenMultiplier = 1.5,
      affectedTypes,
    } = request.body;
    const tick = await getCurrentTick();
    const scenarioId = uuid();

    // Build conditions
    const conditions = [];
    if (center) {
      conditions.push(
        between(resourceSpawns.x, center.x - radius, center.x + radius),
        between(resourceSpawns.y, center.y - radius, center.y + radius)
      );
    }
    if (affectedTypes && affectedTypes.length > 0) {
      conditions.push(sql`${resourceSpawns.resourceType} = ANY(${affectedTypes})`);
    }

    // Boost resources
    const result = await db
      .update(resourceSpawns)
      .set({
        currentAmount: sql`LEAST(${resourceSpawns.maxAmount}, ${resourceSpawns.currentAmount} * ${amountMultiplier})`,
        regenRate: sql`${resourceSpawns.regenRate} * ${regenMultiplier}`,
      })
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .returning({ id: resourceSpawns.id });

    // Log event
    await appendEvent({
      eventType: 'scenario_abundance',
      tick,
      payload: {
        scenarioId,
        center,
        radius,
        amountMultiplier,
        regenMultiplier,
        affectedResources: result.length,
      },
    });

    const scenarioResult: ScenarioResult = {
      success: true,
      scenarioId,
      type: 'resource_abundance',
      tick,
      affectedEntities: result.length,
      details: {
        center,
        radius,
        amountMultiplier,
        regenMultiplier,
        resourcesBoosted: result.length,
      },
    };

    addToHistory(scenarioResult, request.body as Record<string, unknown>);
    return scenarioResult;
  });

  // ---------------------------------------------------------------------------
  // POST /api/scenarios/rule - Modify simulation rules (requires admin auth)
  // ---------------------------------------------------------------------------
  server.post<{ Body: RuleChangeBody }>('/api/scenarios/rule', {
    preHandler: [requireAdmin],
    schema: {
      description: 'Modify simulation rules temporarily or permanently',
      tags: ['Scenarios'],
      body: {
        type: 'object',
        required: ['rule', 'value'],
        properties: {
          rule: {
            type: 'string',
            enum: ['hunger_decay', 'energy_decay', 'work_income', 'trade_cost', 'harm_damage'],
          },
          value: { type: 'number' },
          durationTicks: { type: 'number', default: 0, description: '0 = permanent' },
        },
      },
    },
  }, async (request) => {
    const { rule, value, durationTicks = 0 } = request.body;
    const tick = await getCurrentTick();
    const scenarioId = uuid();

    // Default rule values
    const defaultValues: Record<string, number> = {
      hunger_decay: 2,
      energy_decay: 1,
      work_income: 5,
      trade_cost: 0,
      harm_damage: 15,
    };

    const originalValue = await getRuleValue(rule, defaultValues[rule] ?? 0);
    const expiresAtTick = durationTicks > 0 ? tick + durationTicks : null;

    // Store override
    activeRuleOverrides.set(rule, {
      rule,
      originalValue,
      newValue: value,
      expiresAtTick,
      scenarioId,
    });

    // Log event
    await appendEvent({
      eventType: 'scenario_rule_change',
      tick,
      payload: {
        scenarioId,
        rule,
        originalValue,
        newValue: value,
        durationTicks,
        expiresAtTick,
      },
    });

    const scenarioResult: ScenarioResult = {
      success: true,
      scenarioId,
      type: 'rule_change',
      tick,
      affectedEntities: 1,
      details: {
        rule,
        originalValue,
        newValue: value,
        durationTicks,
        expiresAtTick,
        isPermanent: durationTicks === 0,
      },
    };

    addToHistory(scenarioResult, request.body as unknown as Record<string, unknown>);
    return scenarioResult;
  });

  // ---------------------------------------------------------------------------
  // GET /api/scenarios/history - Get scenario injection history
  // ---------------------------------------------------------------------------
  server.get('/api/scenarios/history', {
    schema: {
      description: 'Get history of scenario injections',
      tags: ['Scenarios'],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'number', default: 20 },
          type: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            history: { type: 'array', items: { type: 'object' } },
            activeRuleOverrides: { type: 'array', items: { type: 'object' } },
          },
        },
      },
    },
  }, async (request) => {
    const { limit = 20, type } = request.query as { limit?: number; type?: string };

    let history = [...scenarioHistory].reverse();
    if (type) {
      history = history.filter(h => h.type === type);
    }
    history = history.slice(0, limit);

    return {
      history,
      activeRuleOverrides: Array.from(activeRuleOverrides.values()),
    };
  });

  // ---------------------------------------------------------------------------
  // DELETE /api/scenarios/rules/:rule - Remove a rule override (requires admin auth)
  // ---------------------------------------------------------------------------
  server.delete<{ Params: { rule: string } }>('/api/scenarios/rules/:rule', {
    preHandler: [requireAdmin],
    schema: {
      description: 'Remove an active rule override',
      tags: ['Scenarios'],
      params: {
        type: 'object',
        properties: {
          rule: { type: 'string' },
        },
        required: ['rule'],
      },
    },
  }, async (request, reply) => {
    const { rule } = request.params;

    if (!activeRuleOverrides.has(rule)) {
      return reply.code(404).send({ error: 'Rule override not found' });
    }

    activeRuleOverrides.delete(rule);

    return {
      success: true,
      message: `Rule override '${rule}' removed`,
    };
  });

  console.log('[Routes] Scenario API routes registered');
}

export default registerScenarioRoutes;
