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

    // Phase 1: COLLECT - Get agent decisions
    // (For now, agents don't make decisions - this will be added in Sprint 5-6)
    const actionIntents: ActionIntent[] = [];

    // Phase 2: VALIDATE - Already handled in action handlers

    // Phase 3: RESOLVE - Deterministic conflict resolution (TODO: implement)

    // Phase 4: APPLY - Execute actions
    let actionsExecuted = 0;
    for (const intent of actionIntents) {
      const agent = agents.find((a) => a.id === intent.agentId);
      if (!agent) continue;

      const handler = this.actionHandlers.get(intent.type);
      if (!handler) continue;

      try {
        const result = await handler(intent, agent);
        if (result.success) {
          actionsExecuted++;
          if (result.changes) {
            await updateAgent(intent.agentId, result.changes);
          }
          if (result.events) {
            allEvents.push(...result.events);
            for (const event of result.events) {
              await publishEvent(event);
            }
          }
        }
      } catch (error) {
        console.error(`Action ${intent.type} failed for agent ${intent.agentId}:`, error);
      }
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
      await appendEvent({
        tick: event.tick,
        agentId: event.agentId ?? null,
        eventType: event.type,
        payload: event.payload,
      });
    }

    // Update cache
    const aliveAgents = await getAliveAgents();
    await setCachedTick(tick);
    await setCachedAgents(aliveAgents);
    await setCachedWorldState({
      tick,
      timestamp: Date.now(),
      agentCount: aliveAgents.length,
      isPaused: false,
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
