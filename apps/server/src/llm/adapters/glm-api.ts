/**
 * GLM API Adapter
 * Uses OpenAI-compatible API (Zhipu AI)
 * Enhanced for better JSON response handling
 */

import type { LLMAdapter, LLMType, LLMMethod, AgentObservation, AgentDecision } from '../types';
import { buildFullPrompt } from '../prompt-builder';
import { parseResponse, getFallbackDecision } from '../response-parser';
import { getEffectiveKey, isKeyDisabled } from '../key-manager';

export class GLMAPIAdapter implements LLMAdapter {
  readonly type: LLMType = 'glm';
  readonly method: LLMMethod = 'api';
  readonly name = 'GLM (API)';

  // Zhipu AI API
  private readonly endpoint = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
  private readonly model = 'glm-4.7';
  private readonly timeout: number;

  // Chinese system message to enforce JSON output
  private readonly systemMessage = `你是一个模拟世界中的自主代理。你必须做出决定来生存。

重要规则：
1. 你必须只回复一个JSON对象，不要有其他文字
2. JSON格式: {"action": "动作类型", "params": {参数}, "reasoning": "简短理由"}
3. 可用动作: move, gather, buy, consume, sleep, work, trade
4. 如果饥饿值低，优先吃食物或购买食物
5. 如果能量低，优先睡觉

示例回复:
{"action": "move", "params": {"toX": 30, "toY": 20}, "reasoning": "Moving to shelter"}
{"action": "consume", "params": {"itemType": "food"}, "reasoning": "Eating to restore hunger"}
{"action": "work", "params": {"duration": 1}, "reasoning": "Working to earn money"}

只回复JSON，不要其他内容！`;

  constructor(timeout = 30000) {
    this.timeout = timeout;
  }

  private getApiKey(): string | undefined {
    return getEffectiveKey('glm');
  }

  async isAvailable(): Promise<boolean> {
    if (isKeyDisabled('glm')) return false;
    return !!this.getApiKey();
  }

  /**
   * Extract JSON from response that may contain extra text or markdown
   */
  private extractJSON(text: string): string | null {
    // Remove markdown code blocks if present
    let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    // Try to find JSON object with action and params
    const jsonMatch = cleaned.match(/\{[\s\S]*?"action"[\s\S]*?"params"[\s\S]*?\}/);
    if (jsonMatch) {
      return jsonMatch[0];
    }

    // Try to find any JSON object
    const anyJsonMatch = cleaned.match(/\{[^{}]*\}/);
    if (anyJsonMatch) {
      return anyJsonMatch[0];
    }

    return null;
  }

  /**
   * Make a decision based on observation - custom implementation for GLM
   */
  async decide(observation: AgentObservation): Promise<AgentDecision> {
    try {
      const apiKey = this.getApiKey();
      if (!apiKey) {
        throw new Error('GLM_API_KEY not set');
      }

      // Build prompt
      const userPrompt = buildFullPrompt(observation);

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
            messages: [
              { role: 'system', content: this.systemMessage },
              { role: 'user', content: userPrompt }
            ],
            temperature: 0.3, // Lower temperature for more consistent JSON
            max_tokens: 1000, // GLM-4.7 uses tokens for reasoning, need more
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

        // Debug: log full response structure
        if (!data.choices?.[0]?.message?.content) {
          console.log(`${this.name}: API response structure:`, JSON.stringify(data).substring(0, 500));
        }

        const rawResponse = data.choices[0]?.message?.content ?? '';

        // Try to parse directly first
        let decision = parseResponse(rawResponse);

        // If that fails, try to extract JSON
        if (!decision) {
          const extractedJson = this.extractJSON(rawResponse);
          if (extractedJson) {
            decision = parseResponse(extractedJson);
          }
        }

        if (decision) {
          return decision;
        }

        // Fallback if parsing failed
        console.warn(`${this.name}: Failed to parse response, using fallback. Raw: ${rawResponse.substring(0, 100)}`);
        return this.createFallback(observation);

      } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
          throw new Error(`GLM API timeout after ${this.timeout}ms`);
        }
        throw error;
      }
    } catch (error) {
      console.error(`${this.name}: Error during decision:`, error);
      return this.createFallback(observation);
    }
  }

  private createFallback(observation: AgentObservation): AgentDecision {
    return getFallbackDecision(
      observation.self.hunger,
      observation.self.energy,
      observation.self.balance,
      observation.self.x,
      observation.self.y
    );
  }
}
