/**
 * OpenAI API Adapter
 * Uses OpenAI API directly for reliable, controllable LLM calls
 */

import OpenAI from 'openai';
import { BaseLLMAdapter, type RawPromptOptions, type RawPromptResult } from './base';
import type { LLMType, LLMMethod } from '../types';
import { getEffectiveKey, isKeyDisabled } from '../key-manager';

export class OpenAIAPIAdapter extends BaseLLMAdapter {
  readonly type: LLMType = 'codex';
  readonly method: LLMMethod = 'api';
  readonly name = 'GPT-4o Mini (API)';

  private client: OpenAI | null = null;
  private readonly timeout: number;

  constructor(timeout = 30000) {
    super();
    this.timeout = timeout;
  }

  private currentApiKey?: string;

  private getClient(): OpenAI {
    const apiKey = getEffectiveKey('codex');
    // Recreate client if key changed
    if (!this.client || this.currentApiKey !== apiKey) {
      this.client = new OpenAI({ apiKey });
      this.currentApiKey = apiKey;
    }
    return this.client;
  }

  async isAvailable(): Promise<boolean> {
    if (isKeyDisabled('codex')) return false;
    return !!getEffectiveKey('codex');
  }

  protected async callLLM(prompt: string): Promise<string> {
    const client = this.getClient();

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    return response.choices[0]?.message?.content ?? '';
  }

  /**
   * Call the LLM with a raw prompt and custom options.
   * Used by Genesis system for meta-generation.
   */
  override async callWithRawPrompt(
    prompt: string,
    options?: RawPromptOptions
  ): Promise<RawPromptResult> {
    const client = this.getClient();

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: options?.maxTokens ?? 4096,
      temperature: options?.temperature ?? 0.8,
      messages: [{ role: 'user', content: prompt }],
    });

    return {
      response: response.choices[0]?.message?.content ?? '',
      inputTokens: response.usage?.prompt_tokens,
      outputTokens: response.usage?.completion_tokens,
    };
  }
}
