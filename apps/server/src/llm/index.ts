/**
 * LLM Adapter Registry
 */

import type { LLMAdapter, LLMType } from './types';
import { ClaudeCLIAdapter } from './adapters/claude-cli';
import { CodexCLIAdapter } from './adapters/codex-cli';
import { GeminiCLIAdapter } from './adapters/gemini-cli';
import { DeepSeekAPIAdapter } from './adapters/deepseek-api';
import { QwenAPIAdapter } from './adapters/qwen-api';
import { GLMAPIAdapter } from './adapters/glm-api';

// Adapter registry
const adapters: Map<LLMType, LLMAdapter> = new Map();

// Initialize adapters
function initAdapters(): void {
  adapters.set('claude', new ClaudeCLIAdapter());
  adapters.set('codex', new CodexCLIAdapter());
  adapters.set('gemini', new GeminiCLIAdapter());
  adapters.set('deepseek', new DeepSeekAPIAdapter());
  adapters.set('qwen', new QwenAPIAdapter());
  adapters.set('glm', new GLMAPIAdapter());
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
export { buildFullPrompt, buildAvailableActions } from './prompt-builder';
export { parseResponse, getFallbackDecision } from './response-parser';
