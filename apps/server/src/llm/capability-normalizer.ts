/**
 * Model Capability Normalizer
 *
 * Different LLMs have different capabilities (context window, speed, reasoning).
 * This module normalizes these capabilities to reduce confounding variables
 * in experiments. When enabled, all models are constrained to the same limits.
 *
 * Use Cases:
 * - A/B testing: Ensure differences are due to strategy, not capability
 * - Fair comparison: Level the playing field between models
 * - Scientific rigor: Control for infrastructure variables
 */

import type { LLMType } from './types';
import { CONFIG } from '../config';

// =============================================================================
// Model Capabilities Registry
// =============================================================================

/**
 * Capabilities for a specific LLM model.
 * These represent the model's native capabilities before normalization.
 */
export interface ModelCapabilities {
  /** Maximum output tokens the model can generate */
  maxTokens: number;
  /** Average latency in milliseconds for a typical request */
  avgLatencyMs: number;
  /** Maximum context window in tokens */
  contextWindow: number;
  /** Approximate characters per token (for estimation) */
  charsPerToken: number;
}

/**
 * Known capabilities for each LLM type.
 * These values are estimates based on typical usage patterns.
 */
export const MODEL_CAPABILITIES: Record<LLMType, ModelCapabilities> = {
  claude: {
    maxTokens: 4096,
    avgLatencyMs: 800,
    contextWindow: 100000,
    charsPerToken: 4,
  },
  gemini: {
    maxTokens: 4096,
    avgLatencyMs: 500,
    contextWindow: 32000,
    charsPerToken: 4,
  },
  codex: {
    maxTokens: 4096,
    avgLatencyMs: 1200,
    contextWindow: 128000,
    charsPerToken: 4,
  },
  deepseek: {
    maxTokens: 4096,
    avgLatencyMs: 600,
    contextWindow: 64000,
    charsPerToken: 4,
  },
  qwen: {
    maxTokens: 4096,
    avgLatencyMs: 700,
    contextWindow: 32000,
    charsPerToken: 4,
  },
  glm: {
    maxTokens: 4096,
    avgLatencyMs: 900,
    contextWindow: 32000,
    charsPerToken: 4,
  },
  grok: {
    maxTokens: 4096,
    avgLatencyMs: 1000,
    contextWindow: 8000,
    charsPerToken: 4,
  },
  external: {
    maxTokens: 2048,
    avgLatencyMs: 1000,
    contextWindow: 8000,
    charsPerToken: 4,
  },
  // Baseline agents (non-LLM) - instant decisions, no context needed
  baseline_random: {
    maxTokens: 0,
    avgLatencyMs: 1,
    contextWindow: 0,
    charsPerToken: 0,
  },
  baseline_rule: {
    maxTokens: 0,
    avgLatencyMs: 1,
    contextWindow: 0,
    charsPerToken: 0,
  },
  baseline_sugarscape: {
    maxTokens: 0,
    avgLatencyMs: 1,
    contextWindow: 0,
    charsPerToken: 0,
  },
  baseline_qlearning: {
    maxTokens: 0,
    avgLatencyMs: 1,
    contextWindow: 0,
    charsPerToken: 0,
  },
};

// =============================================================================
// Normalization Configuration
// =============================================================================

/**
 * Configuration for capability normalization.
 * When enabled, all models are constrained to these limits.
 */
export interface NormalizationConfig {
  /** Whether normalization is enabled */
  enabled: boolean;
  /** Target max tokens for all models */
  targetTokens: number;
  /** Target latency - add artificial delay to fast models */
  artificialLatencyMs: number;
  /** Max context characters (normalized to smallest common denominator) */
  truncateContext: number;
}

/**
 * Default normalization config (conservative values).
 * Uses the smallest common denominator to ensure fairness.
 */
export const DEFAULT_NORMALIZATION: NormalizationConfig = {
  enabled: false,
  targetTokens: 2048,        // Conservative limit
  artificialLatencyMs: 1000, // Slowest common denominator
  truncateContext: 8000,     // Grok's context window as baseline
};

/**
 * Get normalization config from environment/CONFIG.
 */
export function getNormalizationConfig(): NormalizationConfig {
  return {
    enabled: CONFIG.experiment.normalizeCapabilities ?? false,
    targetTokens: CONFIG.experiment.normalizedTokenLimit ?? DEFAULT_NORMALIZATION.targetTokens,
    artificialLatencyMs: CONFIG.experiment.normalizedLatencyMs ?? DEFAULT_NORMALIZATION.artificialLatencyMs,
    truncateContext: CONFIG.experiment.normalizedContextChars ?? DEFAULT_NORMALIZATION.truncateContext,
  };
}

// =============================================================================
// Prompt Normalization
// =============================================================================

/**
 * Truncate prompt intelligently to fit within context limit.
 * Preserves critical sections (system prompt, warnings) while trimming middle.
 *
 * @param prompt - The full prompt text
 * @param maxChars - Maximum characters allowed
 * @returns Truncated prompt
 */
export function truncatePromptIntelligently(prompt: string, maxChars: number): string {
  if (prompt.length <= maxChars) {
    return prompt;
  }

  // Strategy: Keep the beginning (system prompt) and end (recent state + decision prompt)
  // Trim from the middle where historical/verbose content typically lives

  const preserveStart = Math.floor(maxChars * 0.4); // 40% from start
  const preserveEnd = Math.floor(maxChars * 0.5);   // 50% from end
  const truncationMarker = '\n\n[... content truncated for context limit ...]\n\n';
  const markerLength = truncationMarker.length;

  // Ensure we have room for the marker
  const availableChars = maxChars - markerLength;
  const startChars = Math.min(preserveStart, Math.floor(availableChars / 2));
  const endChars = Math.min(preserveEnd, availableChars - startChars);

  const start = prompt.slice(0, startChars);
  const end = prompt.slice(-endChars);

  // Log truncation for debugging
  console.log(`[Normalizer] Truncated prompt from ${prompt.length} to ${maxChars} chars`);

  return start + truncationMarker + end;
}

/**
 * Normalize a prompt according to the configuration.
 *
 * @param prompt - The original prompt
 * @param config - Normalization configuration
 * @returns Normalized prompt (potentially truncated)
 */
export function normalizePrompt(prompt: string, config: NormalizationConfig): string {
  if (!config.enabled) {
    return prompt;
  }

  // Truncate if exceeds normalized context
  if (prompt.length > config.truncateContext) {
    return truncatePromptIntelligently(prompt, config.truncateContext);
  }

  return prompt;
}

// =============================================================================
// Latency Normalization
// =============================================================================

/**
 * Track latency normalization statistics.
 */
interface LatencyStats {
  totalDelayAdded: number;
  callCount: number;
  delaysByModel: Record<string, number>;
}

const latencyStats: LatencyStats = {
  totalDelayAdded: 0,
  callCount: 0,
  delaysByModel: {},
};

/**
 * Apply artificial delay to normalize latency across models.
 * Fast models are slowed down to match the target latency.
 *
 * @param llmType - The LLM type making the call
 * @param actualLatencyMs - The actual time the call took
 * @param config - Normalization configuration
 */
export async function normalizeLatency(
  llmType: LLMType,
  actualLatencyMs: number,
  config: NormalizationConfig
): Promise<void> {
  if (!config.enabled) {
    return;
  }

  const targetLatency = config.artificialLatencyMs;
  const additionalDelay = Math.max(0, targetLatency - actualLatencyMs);

  if (additionalDelay > 0) {
    // Track statistics
    latencyStats.totalDelayAdded += additionalDelay;
    latencyStats.callCount++;
    latencyStats.delaysByModel[llmType] = (latencyStats.delaysByModel[llmType] ?? 0) + additionalDelay;

    // Log the artificial delay
    console.log(`[Normalizer] Adding ${additionalDelay}ms delay to ${llmType} (actual: ${actualLatencyMs}ms, target: ${targetLatency}ms)`);

    // Apply the delay
    await new Promise(resolve => setTimeout(resolve, additionalDelay));
  }
}

/**
 * Get latency normalization statistics.
 */
export function getLatencyStats(): LatencyStats {
  return { ...latencyStats };
}

/**
 * Reset latency statistics.
 */
export function resetLatencyStats(): void {
  latencyStats.totalDelayAdded = 0;
  latencyStats.callCount = 0;
  latencyStats.delaysByModel = {};
}

// =============================================================================
// Token Normalization
// =============================================================================

/**
 * Get the normalized max tokens for a request.
 * When normalization is enabled, returns the target; otherwise returns model default.
 *
 * @param llmType - The LLM type
 * @param config - Normalization configuration
 * @returns Maximum tokens to request
 */
export function getNormalizedMaxTokens(llmType: LLMType, config: NormalizationConfig): number {
  if (!config.enabled) {
    return MODEL_CAPABILITIES[llmType]?.maxTokens ?? 4096;
  }
  return config.targetTokens;
}

// =============================================================================
// Capability Summary
// =============================================================================

/**
 * Get a summary of normalization status for all models.
 * Useful for debugging and experiment documentation.
 */
export function getCapabilitySummary(): {
  normalizationEnabled: boolean;
  config: NormalizationConfig;
  models: Record<LLMType, {
    native: ModelCapabilities;
    normalized: { maxTokens: number; latencyTarget: number; contextLimit: number };
  }>;
} {
  const config = getNormalizationConfig();

  const models = {} as Record<LLMType, {
    native: ModelCapabilities;
    normalized: { maxTokens: number; latencyTarget: number; contextLimit: number };
  }>;

  for (const [type, capabilities] of Object.entries(MODEL_CAPABILITIES)) {
    models[type as LLMType] = {
      native: capabilities,
      normalized: {
        maxTokens: config.enabled ? config.targetTokens : capabilities.maxTokens,
        latencyTarget: config.enabled ? config.artificialLatencyMs : capabilities.avgLatencyMs,
        contextLimit: config.enabled ? config.truncateContext : capabilities.contextWindow * capabilities.charsPerToken,
      },
    };
  }

  return {
    normalizationEnabled: config.enabled,
    config,
    models,
  };
}
