/**
 * Claude API Adapter
 * Uses Anthropic API directly for reliable, controllable LLM calls
 */

import Anthropic from '@anthropic-ai/sdk';
import { BaseLLMAdapter, type LLMCallResult, type RawPromptOptions, type RawPromptResult } from './base';
import type { LLMType, LLMMethod } from '../types';
import { getEffectiveKey, isKeyDisabled } from '../key-manager';

const MODEL_NAME = 'claude-3-5-haiku-20241022';

export class ClaudeAPIAdapter extends BaseLLMAdapter {
  readonly type: LLMType = 'claude';
  readonly method: LLMMethod = 'api';
  readonly name = 'Claude Haiku (API)';

  private client: Anthropic | null = null;
  private readonly timeout: number;

  constructor(timeout = 30000) {
    super();
    this.timeout = timeout;
  }

  private getClient(): Anthropic {
    const apiKey = getEffectiveKey('claude');
    // Recreate client if key changed
    if (!this.client || this.currentApiKey !== apiKey) {
      this.client = new Anthropic({ apiKey });
      this.currentApiKey = apiKey;
    }
    return this.client;
  }

  private currentApiKey?: string;

  async isAvailable(): Promise<boolean> {
    if (isKeyDisabled('claude')) return false;
    return !!getEffectiveKey('claude');
  }

  protected async callLLM(prompt: string): Promise<string> {
    const result = await this.callLLMWithMetrics(prompt);
    return result.response;
  }

  protected override async callLLMWithMetrics(prompt: string): Promise<LLMCallResult> {
    const client = this.getClient();

    const response = await client.messages.create({
      model: MODEL_NAME,
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    const responseText = textBlock?.type === 'text' ? textBlock.text : '';

    return {
      response: responseText,
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
      model: MODEL_NAME,
    };
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

    const response = await client.messages.create({
      model: MODEL_NAME,
      max_tokens: options?.maxTokens ?? 4096,
      temperature: options?.temperature ?? 0.8,
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    const responseText = textBlock?.type === 'text' ? textBlock.text : '';

    return {
      response: responseText,
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
    };
  }
}
