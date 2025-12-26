/**
 * GLM API Adapter
 * Uses OpenAI-compatible API (Zhipu AI)
 */

import { BaseLLMAdapter } from './base';
import type { LLMType, LLMMethod } from '../types';

export class GLMAPIAdapter extends BaseLLMAdapter {
  readonly type: LLMType = 'glm';
  readonly method: LLMMethod = 'api';
  readonly name = 'GLM (API)';

  // Zhipu AI API
  private readonly endpoint = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
  private readonly model = 'glm-4';
  private readonly timeout: number;

  constructor(timeout = 30000) {
    super();
    this.timeout = timeout;
  }

  private getApiKey(): string | undefined {
    return process.env.GLM_API_KEY;
  }

  async isAvailable(): Promise<boolean> {
    return !!this.getApiKey();
  }

  protected async callLLM(prompt: string): Promise<string> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('GLM_API_KEY not set');
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
        throw new Error(`GLM API error: ${response.status} ${error}`);
      }

      const data = await response.json() as {
        choices: Array<{ message: { content: string } }>;
      };

      return data.choices[0]?.message?.content ?? '';
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`GLM API timeout after ${this.timeout}ms`);
      }
      throw error;
    }
  }
}
