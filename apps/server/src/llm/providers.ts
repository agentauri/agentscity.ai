/**
 * LLM Provider Definitions
 *
 * Central registry of all supported LLM providers with their metadata.
 * Used by the key management system to display provider info and validate keys.
 */

import type { LLMType } from './types';

export interface LLMProviderInfo {
  type: LLMType;
  displayName: string;
  envVar: string;
  docsUrl: string;
  costInfo: string;
}

/**
 * All supported LLM providers.
 * Order determines display order in the UI.
 */
export const LLM_PROVIDERS: LLMProviderInfo[] = [
  {
    type: 'claude',
    displayName: 'Claude (Anthropic)',
    envVar: 'ANTHROPIC_API_KEY',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    costInfo: 'Haiku: $0.80/1M input, $4/1M output',
  },
  {
    type: 'codex',
    displayName: 'GPT-4o Mini (OpenAI)',
    envVar: 'OPENAI_API_KEY',
    docsUrl: 'https://platform.openai.com/api-keys',
    costInfo: '$0.15/1M input, $0.60/1M output',
  },
  {
    type: 'gemini',
    displayName: 'Gemini (Google)',
    envVar: 'GOOGLE_AI_API_KEY',
    docsUrl: 'https://aistudio.google.com/apikey',
    costInfo: 'Flash: $0.075/1M input, $0.30/1M output',
  },
  {
    type: 'deepseek',
    displayName: 'DeepSeek',
    envVar: 'DEEPSEEK_API_KEY',
    docsUrl: 'https://platform.deepseek.com/api_keys',
    costInfo: '$0.14/1M input, $0.28/1M output',
  },
  {
    type: 'qwen',
    displayName: 'Qwen (Alibaba)',
    envVar: 'QWEN_API_KEY',
    docsUrl: 'https://dashscope.console.aliyun.com/apiKey',
    costInfo: 'Turbo: $0.28/1M input, $0.84/1M output',
  },
  {
    type: 'glm',
    displayName: 'GLM (Zhipu)',
    envVar: 'GLM_API_KEY',
    docsUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
    costInfo: 'Flash: $0.07/1M input, $0.07/1M output',
  },
  {
    type: 'grok',
    displayName: 'Grok (xAI)',
    envVar: 'GROK_API_KEY',
    docsUrl: 'https://console.x.ai',
    costInfo: '$5/1M input, $15/1M output',
  },
];

/**
 * Get provider info by type
 */
export function getProviderInfo(type: LLMType): LLMProviderInfo | undefined {
  return LLM_PROVIDERS.find((p) => p.type === type);
}

/**
 * Get all provider types
 */
export function getAllProviderTypes(): LLMType[] {
  return LLM_PROVIDERS.map((p) => p.type);
}
