/**
 * Tick Engine - Core simulation loop
 *
 * Each tick:
 * 1. COLLECT - Get agent decisions
 * 2. VALIDATE - Check action feasibility
 * 3. RESOLVE - Handle conflicts deterministically
 * 4. APPLY - Execute actions
 * 5. DECAY - Apply needs decay
 * 6. EMIT - Publish events
 */

import { v4 as uuid } from 'uuid';
import {
  startTickSpan,
  addTickMetrics,
  markSpanSuccess,
  markSpanError,
  withSpan,
  createTracedLogger,
} from '../telemetry';
import { TICK_INTERVAL_MS } from '@agentscity/shared';
import { incrementTick, getCurrentTick, getWorldState } from '../db/queries/world';
import { getAliveAgents, updateAgent } from '../db/queries/agents';
import { appendEvent } from '../db/queries/events';
import { publishEvent, type WorldEvent } from '../cache/pubsub';
import { setCachedTick, setCachedWorldState, setCachedAgents } from '../cache/projections';
import { applyNeedsDecay, type DecayResult } from './needs-decay';
import { processAgentsTick } from '../agents/orchestrator';
import { captureVariantSnapshot, updateVariantStatus, updateExperimentStatus, getNextPendingVariant } from '../db/queries/experiments';
import { updateAllAgentRoles } from '../db/queries/roles';
import { getGestatingStates, completeReproduction, createLineage, getLineage } from '../db/queries/reproduction';
import { createAgent } from '../db/queries/agents';
import { CONFIG } from '../config';
import type { Agent, NewAgent } from '../db/schema';

// Role update interval (every N ticks)
const ROLE_UPDATE_INTERVAL = 20;

// Traced logger for tick engine
const logger = createTracedLogger('TickEngine');

export interface TickResult {
  tick: number;
  timestamp: number;
  duration: number;
  agentCount: number;
  actionsExecuted: number;
  deaths: string[];
  events: WorldEvent[];
}

export interface ActionIntent {
  agentId: string;
  type: string;
  params: Record<string, unknown>;
}

type ActionHandler = (
  intent: ActionIntent,
  agent: Agent
) => Promise<{ success: boolean; changes?: Partial<Agent>; events?: WorldEvent[] }>;

// Experiment context for A/B testing
export interface ExperimentContext {
  experimentId: string;
  variantId: string;
  durationTicks: number;
  startTick?: number;
  /** Variant-specific config overrides for scientific experiments */
  variantConfig?: {
    /** Use random walk decisions instead of LLM (null hypothesis) */
    useRandomWalk?: boolean;
    /** Use only fallback decisions instead of LLM (rule-based baseline) */
    useOnlyFallback?: boolean;
  };
}

class TickEngine {
  private intervalId: Timer | null = null;
  private isRunning = false;
  private tickInterval: number;
  private actionHandlers: Map<string, ActionHandler> = new Map();
  private experimentContext: ExperimentContext | null = null;

  constructor(tickInterval = TICK_INTERVAL_MS) {
    this.tickInterval = tickInterval;
  }

  /**
   * Set experiment context for A/B testing
   */
  setExperimentContext(context: ExperimentContext): void {
    this.experimentContext = context;
    console.log(`[TickEngine] Experiment context set: variant ${context.variantId}, duration ${context.durationTicks} ticks`);
  }

  /**
   * Clear experiment context
   */
  clearExperimentContext(): void {
    this.experimentContext = null;
    console.log('[TickEngine] Experiment context cleared');
  }

  /**
   * Get current experiment context
   */
  getExperimentContext(): ExperimentContext | null {
    return this.experimentContext;
  }

  registerActionHandler(actionType: string, handler: ActionHandler): void {
    this.actionHandlers.set(actionType, handler);
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    console.log(`Tick engine started (interval: ${this.tickInterval}ms)`);

    // Run first tick immediately
    await this.processTick();

    // Schedule subsequent ticks
    this.intervalId = setInterval(() => {
      this.processTick().catch(console.error);
    }, this.tickInterval);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('Tick engine stopped');
  }

  async processTick(): Promise<TickResult> {
    const startTime = Date.now();
    const allEvents: WorldEvent[] = [];
    const deaths: string[] = [];

    // Check if paused
    const worldState = await getWorldState();
    if (worldState?.isPaused) {
      return {
        tick: worldState.currentTick,
        timestamp: startTime,
        duration: 0,
        agentCount: 0,
        actionsExecuted: 0,
        deaths: [],
        events: [],
      };
    }

    // Increment tick
    const newState = await incrementTick();
    const tick = newState.currentTick;

    // Start tracing span for this tick
    const tickSpan = startTickSpan(tick);

    // Emit tick_start event
    const tickStartEvent: WorldEvent = {
      id: uuid(),
      type: 'tick_start',
      tick,
      timestamp: startTime,
      payload: {},
    };
    allEvents.push(tickStartEvent);
    await publishEvent(tickStartEvent);

    // Get all alive agents
    const agents = await getAliveAgents();

    // Phase 1-4: COLLECT, VALIDATE, RESOLVE, APPLY
    // The orchestrator handles all of these phases:
    // - Builds observations for each agent
    // - Queues LLM decision jobs
    // - Executes actions and updates agent state
    let actionsExecuted = 0;
    try {
      const agentResults = await processAgentsTick(tick);
      actionsExecuted = agentResults.filter((r) => r.actionResult?.success).length;

      // Emit events for agent actions
      for (const result of agentResults) {
        if (result.actionResult?.success && result.decision) {
          const actionEvent: WorldEvent = {
            id: uuid(),
            type: `agent_${result.decision.action}` as string,
            tick,
            timestamp: Date.now(),
            agentId: result.agentId,
            payload: {
              action: result.decision.action,
              params: result.decision.params,
              reasoning: result.decision.reasoning,
              usedFallback: result.usedFallback,
              processingTimeMs: result.processingTimeMs,
            },
          };
          allEvents.push(actionEvent);
          await publishEvent(actionEvent);
        }
      }
    } catch (error) {
      logger.error('Error processing agent decisions', error);
      tickSpan.setAttribute('tick.error', 'agent_decisions_failed');
    }

    // Phase 5: DECAY - Apply needs decay
    const decayResults: DecayResult[] = [];
    for (const agent of agents) {
      const result = await applyNeedsDecay(agent, tick);
      decayResults.push(result);

      // Check for death
      if (result.died) {
        deaths.push(agent.id);
        const deathEvent: WorldEvent = {
          id: uuid(),
          type: 'agent_died',
          tick,
          timestamp: Date.now(),
          agentId: agent.id,
          payload: {
            cause: result.deathCause,
            finalState: result.newState,
          },
        };
        allEvents.push(deathEvent);
        await publishEvent(deathEvent);
      } else if (result.events.length > 0) {
        allEvents.push(...result.events);
        for (const event of result.events) {
          await publishEvent(event);
        }
      }
    }

    // Phase 6: EMIT - Store events and update cache
    for (const event of allEvents) {
      try {
        await appendEvent({
          tick: event.tick,
          agentId: event.agentId ?? null,
          eventType: event.type,
          payload: event.payload,
        });
      } catch {
        // DB errors shouldn't crash the tick engine - events were already published via SSE
      }
    }

    // Update cache
    const aliveAgents = await getAliveAgents();
    await setCachedTick(tick);
    await setCachedAgents(aliveAgents);
    await setCachedWorldState({
      tick,
      timestamp: Date.now(),
      agentCount: aliveAgents.length,
      isPaused: newState.isPaused ?? false,
    });

    // Emit tick_end event
    const duration = Date.now() - startTime;
    const tickEndEvent: WorldEvent = {
      id: uuid(),
      type: 'tick_end',
      tick,
      timestamp: Date.now(),
      payload: {
        duration,
        agentCount: aliveAgents.length,
        actionsExecuted,
        deaths: deaths.length,
      },
    };
    allEvents.push(tickEndEvent);
    await publishEvent(tickEndEvent);

    // Experiment snapshot and completion check
    if (this.experimentContext) {
      const ctx = this.experimentContext;

      // Set start tick if not set
      if (ctx.startTick === undefined) {
        ctx.startTick = tick;
      }

      const ticksElapsed = tick - ctx.startTick;

      // Capture snapshot at configured interval
      if (tick % CONFIG.experiment.snapshotInterval === 0) {
        try {
          await captureVariantSnapshot(ctx.variantId, tick);
          console.log(`[TickEngine] Captured snapshot for variant ${ctx.variantId} at tick ${tick}`);
        } catch (error) {
          console.error('[TickEngine] Error capturing snapshot:', error);
        }
      }

      // Check if variant duration is reached
      if (ticksElapsed >= ctx.durationTicks) {
        console.log(`[TickEngine] Variant ${ctx.variantId} completed after ${ticksElapsed} ticks`);

        // Mark variant as completed
        await updateVariantStatus(ctx.variantId, 'completed', { endTick: tick });

        // Stop the engine
        this.stop();

        // Check if there are more variants to run
        const nextVariant = await getNextPendingVariant(ctx.experimentId);
        if (!nextVariant) {
          // All variants done, mark experiment as completed
          await updateExperimentStatus(ctx.experimentId, 'completed');
          console.log(`[TickEngine] Experiment ${ctx.experimentId} completed`);
        } else {
          console.log(`[TickEngine] Next variant pending: ${nextVariant.name}`);
        }

        // Clear context
        this.clearExperimentContext();
      }
    }

    // Role crystallization: update agent roles periodically
    if (tick % ROLE_UPDATE_INTERVAL === 0) {
      try {
        const rolesUpdated = await updateAllAgentRoles(tick);
        if (rolesUpdated > 0) {
          console.log(`[TickEngine] Updated ${rolesUpdated} agent roles at tick ${tick}`);
        }
      } catch (error) {
        console.error('[TickEngine] Error updating agent roles:', error);
      }
    }

    // Phase 4: Gestation completion - spawn offspring when gestation period ends
    try {
      const gestatingStates = await getGestatingStates();
      for (const state of gestatingStates) {
        const gestationEndTick = state.gestationStartTick + state.gestationDurationTicks;
        if (tick >= gestationEndTick) {
          // Spawn the offspring
          const offspring = await this.spawnOffspring(state, tick);
          if (offspring) {
            await completeReproduction(state.id, offspring.id);

            // Emit birth event
            const birthEvent: WorldEvent = {
              id: uuid(),
              type: 'agent_born',
              tick,
              timestamp: Date.now(),
              agentId: offspring.id,
              payload: {
                parentId: state.parentAgentId,
                partnerId: state.partnerAgentId,
                generation: offspring.generation,
                x: offspring.x,
                y: offspring.y,
              },
            };
            allEvents.push(birthEvent);
            await publishEvent(birthEvent);

            console.log(`[TickEngine] Offspring ${offspring.id.slice(0, 8)} born to parent ${state.parentAgentId.slice(0, 8)}`);
          }
        }
      }
    } catch (error) {
      console.error('[TickEngine] Error processing gestations:', error);
    }

    logger.info(`Tick ${tick} completed in ${duration}ms`, {
      agentCount: aliveAgents.length,
      deaths: deaths.length,
      actionsExecuted,
    });

    // Add metrics to tracing span and end it
    addTickMetrics(tickSpan, {
      agentCount: aliveAgents.length,
      actionsExecuted,
      deaths: deaths.length,
      durationMs: duration,
      isPaused: false,
    });
    markSpanSuccess(tickSpan);
    tickSpan.end();

    return {
      tick,
      timestamp: startTime,
      duration,
      agentCount: aliveAgents.length,
      actionsExecuted,
      deaths,
      events: allEvents,
    };
  }

  isActive(): boolean {
    return this.isRunning;
  }

  getTickInterval(): number {
    return this.tickInterval;
  }

  setTickInterval(ms: number): void {
    this.tickInterval = ms;
    if (this.isRunning) {
      this.stop();
      this.start();
    }
  }

  /**
   * Spawn offspring from a completed gestation
   */
  private async spawnOffspring(
    reproductionState: { parentAgentId: string; partnerAgentId: string | null; id: string },
    tick: number
  ): Promise<{ id: string; generation: number; x: number; y: number } | null> {
    try {
      // Get parent info
      const parentAgent = (await getAliveAgents()).find(a => a.id === reproductionState.parentAgentId);
      if (!parentAgent) {
        console.warn(`[TickEngine] Parent agent ${reproductionState.parentAgentId} not found for offspring`);
        return null;
      }

      // Get parent lineage to determine generation
      const parentLineage = await getLineage(reproductionState.parentAgentId);
      const parentGeneration = parentLineage?.generation ?? 0;
      const offspringGeneration = parentGeneration + 1;

      // Determine offspring LLM type (inherit from parent or random mutation)
      const llmTypes: Array<'claude' | 'gemini' | 'codex' | 'deepseek' | 'qwen' | 'glm' | 'grok'> =
        ['claude', 'gemini', 'codex', 'deepseek', 'qwen', 'glm', 'grok'];
      const offspringLLMType = Math.random() < 0.8
        ? parentAgent.llmType as typeof llmTypes[number]
        : llmTypes[Math.floor(Math.random() * llmTypes.length)];

      // Generate offspring color (slight variation from parent)
      const parentColor = parentAgent.color || '#888888';
      const offspringColor = this.mutateColor(parentColor);

      // Spawn near parent
      const offspringX = parentAgent.x + Math.floor(Math.random() * 3) - 1;
      const offspringY = parentAgent.y + Math.floor(Math.random() * 3) - 1;

      // Create offspring agent
      const offspringId = uuid();
      const offspring: NewAgent = {
        id: offspringId,
        llmType: offspringLLMType,
        x: Math.max(0, Math.min(99, offspringX)),
        y: Math.max(0, Math.min(99, offspringY)),
        hunger: CONFIG.actions.spawnOffspring.offspringStartEnergy,
        energy: CONFIG.actions.spawnOffspring.offspringStartEnergy,
        health: 100,
        balance: CONFIG.actions.spawnOffspring.offspringStartBalance,
        state: 'idle',
        color: offspringColor,
      };

      await createAgent(offspring);

      // Create lineage record
      const parentIds = reproductionState.partnerAgentId
        ? [reproductionState.parentAgentId, reproductionState.partnerAgentId]
        : [reproductionState.parentAgentId];

      await createLineage({
        agentId: offspringId,
        generation: offspringGeneration,
        parentIds,
        spawnedAtTick: tick,
        spawnedByParentId: reproductionState.parentAgentId,
        initialBalance: CONFIG.actions.spawnOffspring.offspringStartBalance,
        initialEnergy: CONFIG.actions.spawnOffspring.offspringStartEnergy,
        initialSpawnX: offspring.x,
        initialSpawnY: offspring.y,
        mutations: offspringLLMType !== parentAgent.llmType ? [{ type: 'llm_type', from: parentAgent.llmType, to: offspringLLMType }] : [],
        inheritedRelationships: [],
      });

      return {
        id: offspringId,
        generation: offspringGeneration,
        x: offspring.x,
        y: offspring.y,
      };
    } catch (error) {
      console.error('[TickEngine] Error spawning offspring:', error);
      return null;
    }
  }

  /**
   * Slightly mutate a color for offspring
   */
  private mutateColor(hexColor: string): string {
    // Parse hex color
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);

    // Add small random variation (-20 to +20)
    const mutate = (val: number) => Math.max(0, Math.min(255, val + Math.floor(Math.random() * 41) - 20));

    const newR = mutate(r).toString(16).padStart(2, '0');
    const newG = mutate(g).toString(16).padStart(2, '0');
    const newB = mutate(b).toString(16).padStart(2, '0');

    return `#${newR}${newG}${newB}`;
  }
}

// Singleton instance
export const tickEngine = new TickEngine();
