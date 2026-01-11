/**
 * Base LLM Adapter - Abstract class for all adapters
 *
 * Includes response caching to reduce API costs.
 * Includes OpenTelemetry tracing for observability.
 * Supports experimental transformations (synthetic vocabulary, capability normalization).
 *
 * Phase 5: Personality and RAG Memory Support
 * - Uses personality from observation.self.personality
 * - Integrates with RAG-lite memory retrieval when enabled
 */

import type { LLMAdapter, LLMType, LLMMethod, AgentObservation, AgentDecision } from '../types';
import { buildFinalPromptWithMemories } from '../prompt-builder';
import { parseResponse, getFallbackDecision } from '../response-parser';
import { getCachedResponse, cacheResponse } from '../../cache/llm-cache';
import {
  normalizeLatency,
  getNormalizationConfig,
  getNormalizedMaxTokens,
} from '../capability-normalizer';
import {
  reverseSyntheticVocabulary,
  isSyntheticVocabularyEnabled,
} from '../prompts/synthetic-vocabulary';
import {
  startLLMSpan,
  addLLMMetrics,
  markSpanSuccess,
  markSpanError,
  createTracedLogger,
} from '../../telemetry';
import { logPrompt, isPromptLoggingEnabled } from '../prompt-logger';

// Traced logger for LLM operations
const logger = createTracedLogger('LLM');

/**
 * Create fallback decision (scientific model - no location checks)
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
 * Result from LLM call including metrics
 */
export interface LLMCallResult {
  response: string;
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
}

/**
 * Options for raw prompt calls (used by Genesis system)
 */
export interface RawPromptOptions {
  temperature?: number;
  maxTokens?: number;
}

/**
 * Result from raw prompt call
 */
export interface RawPromptResult {
  response: string;
  inputTokens?: number;
  outputTokens?: number;
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
   * Call the LLM with a raw prompt (no observation wrapping).
   * Used by Genesis system for meta-generation.
   * Subclasses should override to provide temperature and maxTokens support.
   */
  async callWithRawPrompt(
    prompt: string,
    options?: RawPromptOptions
  ): Promise<RawPromptResult> {
    // Default implementation delegates to callLLMWithMetrics
    const result = await this.callLLMWithMetrics(prompt);
    return {
      response: result.response,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    };
  }

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
   * Get the max tokens for this adapter, respecting normalization settings.
   */
  protected getMaxTokens(): number {
    const config = getNormalizationConfig();
    return getNormalizedMaxTokens(this.type, config);
  }

  /**
   * Make a decision based on observation.
   * First checks the cache, then calls the LLM if no cached response is found.
   * Includes OpenTelemetry tracing for all operations.
   * Applies experimental transformations (synthetic vocabulary, latency normalization).
   *
   * Phase 5: Now supports personality injection and RAG memory retrieval.
   */
  async decide(observation: AgentObservation): Promise<AgentDecision> {
    const startTime = Date.now();
    const agentId = observation.self.id;
    const personality = observation.self.personality;
    const normConfig = getNormalizationConfig();

    // Start tracing span for this LLM call
    const span = startLLMSpan(this.type, agentId, {
      attributes: {
        'llm.adapter_name': this.name,
        'llm.method': this.method,
        'llm.capability_normalization': normConfig.enabled,
        'llm.synthetic_vocabulary': isSyntheticVocabularyEnabled(),
        'llm.personality': personality ?? 'none',
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

        // Log cache hit for Live Inspector (still useful to see what decisions were made)
        if (isPromptLoggingEnabled()) {
          // Build prompt just for logging (we don't actually send it to LLM)
          const prompt = await buildFinalPromptWithMemories(agentId, observation, personality);
          logPrompt({
            agentId,
            tick: observation.tick,
            observation,
            personality,
            llmType: this.type,
            fullPrompt: prompt,
            decision: cachedDecision,
            processingTimeMs: durationMs,
            usedFallback: false,
            usedCache: true,
          }).catch((err) => logger.error('Failed to log prompt:', err));
        }

        return cachedDecision;
      }

      span.setAttribute('llm.cache_hit', false);

      // Build prompt with experimental transformations
      // Phase 5: Uses buildFinalPromptWithMemories which:
      // - Retrieves contextual memories via RAG-lite (if enabled)
      // - Injects personality into system prompt (if enabled)
      const prompt = await buildFinalPromptWithMemories(
        agentId,
        observation,
        personality
      );
      span.setAttribute('llm.prompt_length', prompt.length);

      // Call LLM with metrics
      const llmStartTime = Date.now();
      const result = await this.callLLMWithMetrics(prompt);
      const llmDurationMs = Date.now() - llmStartTime;

      // Apply latency normalization if enabled
      // This adds artificial delay to fast models to level the playing field
      if (normConfig.enabled) {
        await normalizeLatency(this.type, llmDurationMs, normConfig);
        span.setAttribute('llm.latency_normalized', true);
      }

      const totalDurationMs = Date.now() - startTime;

      // Add metrics to span
      addLLMMetrics(span, {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        totalTokens: (result.inputTokens ?? 0) + (result.outputTokens ?? 0),
        durationMs: totalDurationMs,
        model: result.model,
        usedFallback: false,
      });

      // Reverse synthetic vocabulary in response if enabled
      // This converts the model's response back to standard terms for parsing
      let responseText = result.response;
      if (isSyntheticVocabularyEnabled()) {
        responseText = reverseSyntheticVocabulary(responseText);
      }

      // Parse response
      const decision = parseResponse(responseText);

      if (decision) {
        // Cache the successful decision
        await cacheResponse(observation, this.type, decision);
        span.setAttribute('llm.decision_action', decision.action);
        markSpanSuccess(span);
        span.end();

        // Log prompt for Live Inspector (async, non-blocking)
        if (isPromptLoggingEnabled()) {
          logPrompt({
            agentId,
            tick: observation.tick,
            observation,
            personality,
            llmType: this.type,
            fullPrompt: prompt,
            decision,
            rawResponse: responseText,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            processingTimeMs: totalDurationMs,
            usedFallback: false,
            usedCache: false,
          }).catch((err) => logger.error('Failed to log prompt:', err));
        }

        return decision;
      }

      // Fallback if parsing failed - do not cache fallback decisions
      logger.warn(`${this.name}: Failed to parse response, using fallback`);
      span.setAttribute('llm.parse_failed', true);
      addLLMMetrics(span, { usedFallback: true });
      markSpanSuccess(span);
      span.end();

      const fallbackDecision = createFallbackDecision(observation);

      // Log fallback for Live Inspector
      if (isPromptLoggingEnabled()) {
        logPrompt({
          agentId,
          tick: observation.tick,
          observation,
          personality,
          llmType: this.type,
          fullPrompt: prompt,
          decision: fallbackDecision,
          rawResponse: responseText,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          processingTimeMs: totalDurationMs,
          usedFallback: true,
          usedCache: false,
        }).catch((err) => logger.error('Failed to log prompt:', err));
      }

      return fallbackDecision;
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
