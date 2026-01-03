/**
 * LLM Adapter Registry
 */

import type { LLMAdapter, LLMType } from './types';
// API adapters (reliable, controllable)
import { ClaudeAPIAdapter } from './adapters/claude-api';
import { OpenAIAPIAdapter } from './adapters/openai-api';
import { GeminiAPIAdapter } from './adapters/gemini-api';
import { DeepSeekAPIAdapter } from './adapters/deepseek-api';
import { QwenAPIAdapter } from './adapters/qwen-api';
import { GLMAPIAdapter } from './adapters/glm-api';
import { GrokAPIAdapter } from './adapters/grok-api';
import { CONFIG } from '../config';

// Adapter registry
const adapters: Map<LLMType, LLMAdapter> = new Map();

// Initialize adapters with configurable timeout
function initAdapters(): void {
  const timeout = CONFIG.llm.defaultTimeoutMs;
  // Primary LLMs via API (reliable)
  adapters.set('claude', new ClaudeAPIAdapter(timeout));
  adapters.set('codex', new OpenAIAPIAdapter(timeout));
  adapters.set('gemini', new GeminiAPIAdapter(timeout));
  // Secondary LLMs via API
  adapters.set('deepseek', new DeepSeekAPIAdapter(timeout));
  adapters.set('qwen', new QwenAPIAdapter(timeout));
  adapters.set('glm', new GLMAPIAdapter(timeout));
  adapters.set('grok', new GrokAPIAdapter(timeout));
}

// Initialize on module load
initAdapters();

/**
 * Get adapter by type
 */
export function getAdapter(type: LLMType): LLMAdapter | undefined {
  return adapters.get(type);
}

/**
 * Get all adapters
 */
export function getAllAdapters(): LLMAdapter[] {
  return Array.from(adapters.values());
}

/**
 * Check which adapters are available
 */
export async function getAvailableAdapters(): Promise<LLMAdapter[]> {
  const results = await Promise.all(
    Array.from(adapters.values()).map(async (adapter) => ({
      adapter,
      available: await adapter.isAvailable(),
    }))
  );

  return results.filter((r) => r.available).map((r) => r.adapter);
}

/**
 * Log adapter availability
 */
export async function logAdapterStatus(): Promise<void> {
  console.log('\n📡 LLM Adapter Status:');

  for (const [type, adapter] of adapters) {
    const available = await adapter.isAvailable();
    const status = available ? '✅' : '❌';
    console.log(`  ${status} ${adapter.name} (${type})`);
  }

  console.log('');
}

// Export types and utilities
export * from './types';
export { buildFullPrompt, buildFinalPrompt, buildAvailableActions, getActiveTransformations } from './prompt-builder';
export { parseResponse, getFallbackDecision } from './response-parser';

// Export Capability Normalization (for experiments)
export {
  MODEL_CAPABILITIES,
  getNormalizationConfig,
  normalizePrompt,
  normalizeLatency,
  getNormalizedMaxTokens,
  getCapabilitySummary,
  getLatencyStats,
  resetLatencyStats,
  type ModelCapabilities,
  type NormalizationConfig,
} from './capability-normalizer';

// Export Synthetic Vocabulary (for experiments)
export {
  SYNTHETIC_VOCABULARY,
  applySyntheticVocabulary,
  reverseSyntheticVocabulary,
  isSyntheticVocabularyEnabled,
  getVocabularyByCategory,
  getVocabularyStats,
  generateVocabularyDocumentation,
  type VocabularyMapping,
} from './prompts/synthetic-vocabulary';

// Export external agent adapter (Phase 3: A2A Protocol)
export { ExternalAgentAdapter, createExternalAgentAdapter } from './adapters/external-api';

// Export scientific experiment decision generators
export { getRandomWalkDecision, getRandomExplorerDecision } from './random-walk';

// Export Lizard Brain (heuristic decision system)
export {
  tryLizardBrain,
  wouldUseLizardBrain,
  recordLizardBrain,
  recordWizardBrain,
  getLizardBrainStats,
  resetLizardBrainStats,
} from './lizard-brain';

// Export Decision Cache
export {
  getCachedDecision,
  cacheDecision,
  clearCache,
  getCacheStats,
  resetCacheStats,
  isCacheEnabled,
} from './decision-cache';
