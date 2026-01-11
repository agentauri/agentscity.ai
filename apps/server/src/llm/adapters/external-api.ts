/**
 * External Agent Adapter (Phase 3: A2A Protocol)
 *
 * Handles webhook-based communication with external agents.
 * External agents receive observations and return decisions via HTTP.
 */

import type { LLMAdapter, LLMType, LLMMethod, AgentObservation, AgentDecision } from '../types';
import { parseResponse, getFallbackDecision } from '../response-parser';

/**
 * Configuration for external agent webhook
 */
export interface ExternalAgentConfig {
  endpoint: string;
  timeout?: number; // ms, default 25000
  retries?: number; // default 1
}

/**
 * Create fallback decision for external agents
 * Includes social context for employment and trading decisions
 */
function createFallbackDecision(observation: AgentObservation): AgentDecision {
  return getFallbackDecision(
    observation.self.hunger,
    observation.self.energy,
    observation.self.balance,
    observation.self.x,
    observation.self.y,
    observation.inventory,
    observation.nearbyResourceSpawns,
    observation.nearbyShelters,
    // Social context (Phase 1.2)
    observation.nearbyJobOffers,
    observation.activeEmployments,
    observation.nearbyAgents
  );
}

/**
 * External Agent Adapter for webhook-based decision making
 *
 * Unlike other adapters, this one:
 * 1. Sends structured observation (not prompt text)
 * 2. Expects structured decision response
 * 3. Has configurable endpoint per agent
 */
export class ExternalAgentAdapter implements LLMAdapter {
  readonly type: LLMType = 'external';
  readonly method: LLMMethod = 'api';
  readonly name: string;

  private endpoint: string;
  private timeout: number;
  private retries: number;

  constructor(config: ExternalAgentConfig) {
    this.endpoint = config.endpoint;
    this.timeout = config.timeout ?? 25000; // 25s default (leaving 5s buffer before tick timeout)
    this.retries = config.retries ?? 1;
    this.name = `External Agent (${new URL(this.endpoint).hostname})`;
  }

  /**
   * Check if the external endpoint is reachable
   */
  async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(this.endpoint, {
        method: 'OPTIONS',
        signal: controller.signal,
      });

      clearTimeout(timeout);
      return response.ok || response.status === 405; // 405 = method not allowed but endpoint exists
    } catch {
      return false;
    }
  }

  /**
   * Make a decision by calling the external agent's endpoint
   */
  async decide(observation: AgentObservation): Promise<AgentDecision> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const decision = await this.callExternalAgent(observation);
        return decision;
      } catch (error) {
        lastError = error as Error;
        console.warn(`[ExternalAgent] Attempt ${attempt + 1} failed:`, lastError.message);

        if (attempt < this.retries) {
          // Wait before retry (exponential backoff)
          await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }

    console.error(`[ExternalAgent] All attempts failed, using fallback:`, lastError?.message);
    return createFallbackDecision(observation);
  }

  /**
   * Call the external agent's endpoint with observation
   */
  private async callExternalAgent(observation: AgentObservation): Promise<AgentDecision> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-SimAgents-Tick': observation.tick.toString(),
          'X-SimAgents-Agent-Id': observation.self.id,
        },
        body: JSON.stringify({
          tick: observation.tick,
          observation: this.serializeObservation(observation),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`External agent responded with HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Validate response structure
      const decision = this.parseExternalResponse(data);

      if (!decision) {
        throw new Error('Invalid decision format from external agent');
      }

      return decision;
    } catch (error) {
      clearTimeout(timeout);

      if ((error as any).name === 'AbortError') {
        throw new Error(`External agent timed out after ${this.timeout}ms`);
      }

      throw error;
    }
  }

  /**
   * Serialize observation for external agent
   * Simplified format focusing on essential data
   */
  private serializeObservation(observation: AgentObservation): Record<string, unknown> {
    return {
      tick: observation.tick,
      timestamp: observation.timestamp,
      self: observation.self,
      nearbyAgents: observation.nearbyAgents,
      nearbyResourceSpawns: observation.nearbyResourceSpawns,
      nearbyShelters: observation.nearbyShelters,
      inventory: observation.inventory,
      availableActions: observation.availableActions.map((a) => ({
        type: a.type,
        description: a.description,
        requirements: a.requirements,
        cost: a.cost,
      })),
      recentEvents: observation.recentEvents,
      // Phase 1 data
      recentMemories: observation.recentMemories,
      relationships: observation.relationships,
      nearbyClaims: observation.nearbyClaims,
      nearbyLocationNames: observation.nearbyLocationNames,
      // Phase 2 data
      knownAgents: observation.knownAgents,
    };
  }

  /**
   * Parse and validate external agent's response
   */
  private parseExternalResponse(data: unknown): AgentDecision | null {
    if (!data || typeof data !== 'object') {
      return null;
    }

    const response = data as Record<string, unknown>;

    // Accept both wrapped and unwrapped formats
    // Format 1: { action, params, reasoning }
    // Format 2: { decision: { action, params, reasoning } }
    const decision = response.decision ?? response;

    if (typeof decision !== 'object' || decision === null) {
      return null;
    }

    const decisionObj = decision as Record<string, unknown>;

    // Use the standard response parser for validation
    const jsonStr = JSON.stringify({
      action: decisionObj.action,
      params: decisionObj.params,
      reasoning: decisionObj.reasoning,
    });

    return parseResponse(jsonStr);
  }
}

/**
 * Create an external agent adapter for a specific endpoint
 */
export function createExternalAgentAdapter(endpoint: string, timeout?: number): ExternalAgentAdapter {
  return new ExternalAgentAdapter({ endpoint, timeout });
}
