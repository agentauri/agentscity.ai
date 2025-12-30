/**
 * Gemini API Adapter
 * Uses Google AI API directly for reliable, controllable LLM calls
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { BaseLLMAdapter } from './base';
import type { LLMType, LLMMethod } from '../types';

export class GeminiAPIAdapter extends BaseLLMAdapter {
  readonly type: LLMType = 'gemini';
  readonly method: LLMMethod = 'api';
  readonly name = 'Gemini (API)';

  private client: GoogleGenerativeAI | null = null;
  private readonly timeout: number;

  constructor(timeout = 30000) {
    super();
    this.timeout = timeout;
  }

  private getClient(): GoogleGenerativeAI {
    if (!this.client) {
      this.client = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);
    }
    return this.client;
  }

  async isAvailable(): Promise<boolean> {
    return !!process.env.GOOGLE_AI_API_KEY;
  }

  protected async callLLM(prompt: string): Promise<string> {
    const client = this.getClient();
    const model = client.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const result = await model.generateContent(prompt);
    return result.response.text();
  }
}
