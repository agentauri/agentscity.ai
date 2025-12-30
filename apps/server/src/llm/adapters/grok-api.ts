/**
 * Grok API Adapter
 * Uses xAI API (OpenAI-compatible)
 */

import { BaseLLMAdapter } from './base';
import type { LLMType, LLMMethod } from '../types';

export class GrokAPIAdapter extends BaseLLMAdapter {
  readonly type: LLMType = 'grok';
  readonly method: LLMMethod = 'api';
  readonly name = 'Grok (API)';

  // xAI API (OpenAI-compatible)
  private readonly endpoint = 'https://api.x.ai/v1/chat/completions';
  private readonly model = 'grok-2';
  private readonly timeout: number;

  constructor(timeout = 30000) {
    super();
    this.timeout = timeout;
  }

  private getApiKey(): string | undefined {
    return process.env.GROK_API_KEY;
  }

  async isAvailable(): Promise<boolean> {
    return !!this.getApiKey();
  }

  protected async callLLM(prompt: string): Promise<string> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('GROK_API_KEY not set');
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
        throw new Error(`Grok API error: ${response.status} ${error}`);
      }

      const data = await response.json() as {
        choices: Array<{ message: { content: string } }>;
      };

      return data.choices[0]?.message?.content ?? '';
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Grok API timeout after ${this.timeout}ms`);
      }
      throw error;
    }
  }
}
