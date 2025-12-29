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
import { TICK_INTERVAL_MS } from '@agentscity/shared';
import { incrementTick, getCurrentTick, getWorldState } from '../db/queries/world';
import { getAliveAgents, updateAgent } from '../db/queries/agents';
import { appendEvent } from '../db/queries/events';
import { publishEvent, type WorldEvent } from '../cache/pubsub';
import { setCachedTick, setCachedWorldState, setCachedAgents } from '../cache/projections';
import { applyNeedsDecay, type DecayResult } from './needs-decay';
import { processAgentsTick } from '../agents/orchestrator';
import type { Agent } from '../db/schema';

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

class TickEngine {
  private intervalId: Timer | null = null;
  private isRunning = false;
  private tickInterval: number;
  private actionHandlers: Map<string, ActionHandler> = new Map();

  constructor(tickInterval = TICK_INTERVAL_MS) {
    this.tickInterval = tickInterval;
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
      console.error('[TickEngine] Error processing agent decisions:', error);
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

    console.log(`Tick ${tick} completed in ${duration}ms (${aliveAgents.length} agents, ${deaths.length} deaths)`);

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
}

// Singleton instance
export const tickEngine = new TickEngine();
