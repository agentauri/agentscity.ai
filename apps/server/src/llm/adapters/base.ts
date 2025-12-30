/**
 * Base LLM Adapter - Abstract class for all adapters
 *
 * Includes response caching to reduce API costs.
 * Includes OpenTelemetry tracing for observability.
 */

import type { LLMAdapter, LLMType, LLMMethod, AgentObservation, AgentDecision } from '../types';
import { buildFullPrompt } from '../prompt-builder';
import { parseResponse, getFallbackDecision } from '../response-parser';
import { getCachedResponse, cacheResponse } from '../../cache/llm-cache';
import {
  startLLMSpan,
  addLLMMetrics,
  markSpanSuccess,
  markSpanError,
  createTracedLogger,
} from '../../telemetry';

// Traced logger for LLM operations
const logger = createTracedLogger('LLM');

/**
 * Create fallback decision (scientific model - no location checks)
 */
function createFallbackDecision(observation: AgentObservation): AgentDecision {
  return getFallbackDecision(
    observation.self.hunger,
    observation.self.energy,
    observation.self.balance,
    observation.self.x,
    observation.self.y
  );
}

/**
 * Result from LLM call including metrics
 */
export interface LLMCallResult {
  response: string;
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
}

export abstract class BaseLLMAdapter implements LLMAdapter {
  abstract readonly type: LLMType;
  abstract readonly method: LLMMethod;
  abstract readonly name: string;

  /**
   * Call the LLM with a prompt and get response
   */
  protected abstract callLLM(prompt: string): Promise<string>;

  /**
   * Call the LLM with metrics tracking (optional override)
   * Subclasses can override this to provide token counts
   */
  protected async callLLMWithMetrics(prompt: string): Promise<LLMCallResult> {
    const response = await this.callLLM(prompt);
    return { response };
  }

  /**
   * Check if adapter is available
   */
  abstract isAvailable(): Promise<boolean>;

  /**
   * Make a decision based on observation.
   * First checks the cache, then calls the LLM if no cached response is found.
   * Includes OpenTelemetry tracing for all operations.
   */
  async decide(observation: AgentObservation): Promise<AgentDecision> {
    const startTime = Date.now();
    const agentId = observation.self.id;

    // Start tracing span for this LLM call
    const span = startLLMSpan(this.type, agentId, {
      attributes: {
        'llm.adapter_name': this.name,
        'llm.method': this.method,
      },
    });

    try {
      // Check cache first
      const cachedDecision = await getCachedResponse(observation, this.type);
      if (cachedDecision) {
        const durationMs = Date.now() - startTime;
        span.setAttribute('llm.cache_hit', true);
        span.setAttribute('llm.decision_action', cachedDecision.action);
        addLLMMetrics(span, { durationMs, usedFallback: false });
        markSpanSuccess(span);
        span.end();
        return cachedDecision;
      }

      span.setAttribute('llm.cache_hit', false);

      // Build prompt
      const prompt = buildFullPrompt(observation);
      span.setAttribute('llm.prompt_length', prompt.length);

      // Call LLM with metrics
      const result = await this.callLLMWithMetrics(prompt);
      const durationMs = Date.now() - startTime;

      // Add metrics to span
      addLLMMetrics(span, {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        totalTokens: (result.inputTokens ?? 0) + (result.outputTokens ?? 0),
        durationMs,
        model: result.model,
        usedFallback: false,
      });

      // Parse response
      const decision = parseResponse(result.response);

      if (decision) {
        // Cache the successful decision
        await cacheResponse(observation, this.type, decision);
        span.setAttribute('llm.decision_action', decision.action);
        markSpanSuccess(span);
        span.end();
        return decision;
      }

      // Fallback if parsing failed - do not cache fallback decisions
      logger.warn(`${this.name}: Failed to parse response, using fallback`);
      span.setAttribute('llm.parse_failed', true);
      addLLMMetrics(span, { usedFallback: true });
      markSpanSuccess(span);
      span.end();
      return createFallbackDecision(observation);
    } catch (error) {
      const durationMs = Date.now() - startTime;
      logger.error(`${this.name}: Error during decision`, error);

      // Mark span as error
      addLLMMetrics(span, { durationMs, usedFallback: true });
      markSpanError(span, error instanceof Error ? error : String(error));
      span.end();

      // Return fallback decision - do not cache error fallbacks
      return createFallbackDecision(observation);
    }
  }
}
