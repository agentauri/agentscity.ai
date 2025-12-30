/**
 * Claude API Adapter
 * Uses Anthropic API directly for reliable, controllable LLM calls
 */

import Anthropic from '@anthropic-ai/sdk';
import { BaseLLMAdapter, type LLMCallResult } from './base';
import type { LLMType, LLMMethod } from '../types';

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
    if (!this.client) {
      this.client = new Anthropic();
    }
    return this.client;
  }

  async isAvailable(): Promise<boolean> {
    return !!process.env.ANTHROPIC_API_KEY;
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
}
