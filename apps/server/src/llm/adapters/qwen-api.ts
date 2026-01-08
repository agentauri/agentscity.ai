/**
 * Qwen API Adapter
 * Uses OpenAI-compatible API (Alibaba Cloud)
 */

import { BaseLLMAdapter } from './base';
import type { LLMType, LLMMethod } from '../types';
import { getEffectiveKey, isKeyDisabled } from '../key-manager';

export class QwenAPIAdapter extends BaseLLMAdapter {
  readonly type: LLMType = 'qwen';
  readonly method: LLMMethod = 'api';
  readonly name = 'Qwen (API)';

  // DashScope API (Alibaba Cloud) - International endpoint
  private readonly endpoint = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions';
  private readonly model = 'qwen-flash';
  private readonly timeout: number;

  constructor(timeout = 30000) {
    super();
    this.timeout = timeout;
  }

  private getApiKey(): string | undefined {
    return getEffectiveKey('qwen');
  }

  async isAvailable(): Promise<boolean> {
    if (isKeyDisabled('qwen')) return false;
    return !!this.getApiKey();
  }

  protected async callLLM(prompt: string): Promise<string> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('QWEN_API_KEY not set');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 500,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Qwen API error: ${response.status} ${error}`);
      }

      const data = await response.json() as {
        choices: Array<{ message: { content: string } }>;
      };

      return data.choices[0]?.message?.content ?? '';
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Qwen API timeout after ${this.timeout}ms`);
      }
      throw error;
    }
  }
}
