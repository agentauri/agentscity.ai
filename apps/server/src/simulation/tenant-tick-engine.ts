/**
 * Tenant Tick Engine Manager
 *
 * Manages independent tick engines for each tenant, enabling
 * isolated simulation environments with their own tick intervals
 * and resource limits.
 */

import { v4 as uuid } from 'uuid';
import type { Tenant, TenantWorldState, Agent } from '../db/schema';
import {
  getTenant,
  getTenantWorldState,
  incrementTenantTick,
  recordTenantUsage,
  checkTenantTickLimit,
} from '../db/queries/tenants';
import {
  getTenantAliveAgents,
  updateTenantAgent,
} from '../db/queries/tenant-agents';
import { publishTenantEvent, type TenantWorldEvent } from '../cache/tenant-pubsub';
import {
  setCachedTenantTick,
  setCachedTenantWorldState,
  setCachedTenantAgents,
} from '../cache/tenant-projections';
import { applyNeedsDecay } from './needs-decay';

// =============================================================================
// Types
// =============================================================================

export interface TenantTickResult {
  tenantId: string;
  tick: number;
  timestamp: number;
  duration: number;
  agentCount: number;
  actionsExecuted: number;
  deaths: string[];
  events: TenantWorldEvent[];
  skipped?: boolean;
  skipReason?: string;
}

export interface TenantEngineStatus {
  tenantId: string;
  isRunning: boolean;
  isPaused: boolean;
  currentTick: number;
  tickInterval: number;
  lastTickAt: Date | null;
}

// =============================================================================
// Tenant Tick Engine
// =============================================================================

class TenantTickEngine {
  private intervalId: Timer | null = null;
  private isRunning = false;
  private tickInterval: number;
  private tenantId: string;
  private tenant: Tenant | null = null;

  constructor(tenantId: string, tickInterval: number = 60000) {
    this.tenantId = tenantId;
    this.tickInterval = tickInterval;
  }

  /**
   * Initialize tenant data
   */
  private async loadTenant(): Promise<boolean> {
    this.tenant = await getTenant(this.tenantId);
    if (!this.tenant) {
      console.error(`[TenantEngine:${this.tenantId}] Tenant not found`);
      return false;
    }
    return true;
  }

  /**
   * Start the tick engine
   */
  async start(): Promise<void> {
    if (this.isRunning) return;

    if (!await this.loadTenant()) {
      throw new Error(`Tenant ${this.tenantId} not found`);
    }

    this.isRunning = true;
    console.log(`[TenantEngine:${this.tenantId}] Started (interval: ${this.tickInterval}ms)`);

    // Run first tick immediately
    await this.processTick();

    // Schedule subsequent ticks
    this.intervalId = setInterval(() => {
      this.processTick().catch(console.error);
    }, this.tickInterval);
  }

  /**
   * Stop the tick engine
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log(`[TenantEngine:${this.tenantId}] Stopped`);
  }

  /**
   * Process a single tick
   */
  async processTick(): Promise<TenantTickResult> {
    const startTime = Date.now();
    const allEvents: TenantWorldEvent[] = [];
    const deaths: string[] = [];

    // Reload tenant to get latest settings
    await this.loadTenant();
    if (!this.tenant) {
      return this.createSkippedResult('Tenant not found');
    }

    // Check if tenant is paused
    if (this.tenant.isPaused) {
      const worldState = await getTenantWorldState(this.tenantId);
      return {
        tenantId: this.tenantId,
        tick: worldState?.currentTick ?? 0,
        timestamp: startTime,
        duration: 0,
        agentCount: 0,
        actionsExecuted: 0,
        deaths: [],
        events: [],
        skipped: true,
        skipReason: 'Tenant is paused',
      };
    }

    // Check rate limit
    const { allowed } = await checkTenantTickLimit(this.tenantId);
    if (!allowed) {
      const worldState = await getTenantWorldState(this.tenantId);
      return {
        tenantId: this.tenantId,
        tick: worldState?.currentTick ?? 0,
        timestamp: startTime,
        duration: 0,
        agentCount: 0,
        actionsExecuted: 0,
        deaths: [],
        events: [],
        skipped: true,
        skipReason: 'Daily tick limit exceeded',
      };
    }

    // Increment tick
    const newState = await incrementTenantTick(this.tenantId);
    const tick = newState.currentTick;

    // Emit tick_start event
    const tickStartEvent: TenantWorldEvent = {
      id: uuid(),
      tenantId: this.tenantId,
      type: 'tick_start',
      tick,
      timestamp: startTime,
      payload: {},
    };
    allEvents.push(tickStartEvent);
    await publishTenantEvent(tickStartEvent);

    // Get all alive agents for this tenant
    const agents = await getTenantAliveAgents(this.tenantId);

    // TODO: Process agent decisions through orchestrator
    // For now, just apply needs decay
    let actionsExecuted = 0;

    // Apply needs decay to all agents
    for (const agent of agents) {
      const result = await applyNeedsDecay(agent, tick);

      // Update agent state
      if (result.newState) {
        await updateTenantAgent(this.tenantId, agent.id, result.newState);
      }

      // Check for death
      if (result.died) {
        deaths.push(agent.id);
        const deathEvent: TenantWorldEvent = {
          id: uuid(),
          tenantId: this.tenantId,
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
        await publishTenantEvent(deathEvent);
      } else if (result.events && result.events.length > 0) {
        // Convert events to tenant events
        for (const event of result.events) {
          const tenantEvent: TenantWorldEvent = {
            ...event,
            tenantId: this.tenantId,
          };
          allEvents.push(tenantEvent);
          await publishTenantEvent(tenantEvent);
        }
      }
    }

    // Update cache
    const aliveAgents = await getTenantAliveAgents(this.tenantId);
    await setCachedTenantTick(this.tenantId, tick);
    await setCachedTenantAgents(this.tenantId, aliveAgents);
    await setCachedTenantWorldState(this.tenantId, {
      tick,
      timestamp: Date.now(),
      agentCount: aliveAgents.length,
      isPaused: this.tenant.isPaused,
    });

    // Emit tick_end event
    const duration = Date.now() - startTime;
    const tickEndEvent: TenantWorldEvent = {
      id: uuid(),
      tenantId: this.tenantId,
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
    await publishTenantEvent(tickEndEvent);

    // Record usage
    await recordTenantUsage(this.tenantId, {
      ticks: 1,
      events: allEvents.length,
    });

    console.log(`[TenantEngine:${this.tenantId}] Tick ${tick} completed in ${duration}ms`);

    return {
      tenantId: this.tenantId,
      tick,
      timestamp: startTime,
      duration,
      agentCount: aliveAgents.length,
      actionsExecuted,
      deaths,
      events: allEvents,
    };
  }

  /**
   * Create a skipped tick result
   */
  private createSkippedResult(reason: string): TenantTickResult {
    return {
      tenantId: this.tenantId,
      tick: 0,
      timestamp: Date.now(),
      duration: 0,
      agentCount: 0,
      actionsExecuted: 0,
      deaths: [],
      events: [],
      skipped: true,
      skipReason: reason,
    };
  }

  /**
   * Get engine status
   */
  async getStatus(): Promise<TenantEngineStatus> {
    const worldState = await getTenantWorldState(this.tenantId);
    return {
      tenantId: this.tenantId,
      isRunning: this.isRunning,
      isPaused: this.tenant?.isPaused ?? false,
      currentTick: worldState?.currentTick ?? 0,
      tickInterval: this.tickInterval,
      lastTickAt: worldState?.lastTickAt ?? null,
    };
  }

  /**
   * Update tick interval
   */
  setTickInterval(ms: number): void {
    this.tickInterval = ms;
    if (this.isRunning) {
      this.stop();
      this.start();
    }
  }

  /**
   * Check if engine is active
   */
  isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Get tenant ID
   */
  getTenantId(): string {
    return this.tenantId;
  }
}

// =============================================================================
// Tenant Engine Manager (Singleton)
// =============================================================================

class TenantEngineManager {
  private engines: Map<string, TenantTickEngine> = new Map();

  /**
   * Get or create engine for tenant
   */
  async getEngine(tenantId: string): Promise<TenantTickEngine> {
    let engine = this.engines.get(tenantId);

    if (!engine) {
      const tenant = await getTenant(tenantId);
      if (!tenant) {
        throw new Error(`Tenant ${tenantId} not found`);
      }

      engine = new TenantTickEngine(tenantId, tenant.tickIntervalMs);
      this.engines.set(tenantId, engine);
    }

    return engine;
  }

  /**
   * Start engine for tenant
   */
  async startEngine(tenantId: string): Promise<void> {
    const engine = await this.getEngine(tenantId);
    await engine.start();
  }

  /**
   * Stop engine for tenant
   */
  stopEngine(tenantId: string): void {
    const engine = this.engines.get(tenantId);
    if (engine) {
      engine.stop();
    }
  }

  /**
   * Remove engine for tenant (for cleanup)
   */
  removeEngine(tenantId: string): void {
    const engine = this.engines.get(tenantId);
    if (engine) {
      engine.stop();
      this.engines.delete(tenantId);
    }
  }

  /**
   * Get status of all engines
   */
  async getAllStatus(): Promise<TenantEngineStatus[]> {
    const statuses: TenantEngineStatus[] = [];
    for (const engine of this.engines.values()) {
      statuses.push(await engine.getStatus());
    }
    return statuses;
  }

  /**
   * Get status for specific tenant
   */
  async getEngineStatus(tenantId: string): Promise<TenantEngineStatus | null> {
    const engine = this.engines.get(tenantId);
    if (!engine) {
      return null;
    }
    return engine.getStatus();
  }

  /**
   * Stop all engines (for graceful shutdown)
   */
  stopAll(): void {
    for (const [tenantId, engine] of this.engines) {
      console.log(`[TenantEngineManager] Stopping engine for tenant: ${tenantId}`);
      engine.stop();
    }
    this.engines.clear();
  }

  /**
   * Get count of active engines
   */
  getActiveCount(): number {
    let count = 0;
    for (const engine of this.engines.values()) {
      if (engine.isActive()) {
        count++;
      }
    }
    return count;
  }

  /**
   * Check if tenant has an engine
   */
  hasEngine(tenantId: string): boolean {
    return this.engines.has(tenantId);
  }

  /**
   * Check if tenant engine is running
   */
  isEngineRunning(tenantId: string): boolean {
    const engine = this.engines.get(tenantId);
    return engine?.isActive() ?? false;
  }
}

// Export singleton instance
export const tenantEngineManager = new TenantEngineManager();

// Export class for testing
export { TenantTickEngine };
