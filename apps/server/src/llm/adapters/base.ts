/**
 * Base LLM Adapter - Abstract class for all adapters
 */

import type { LLMAdapter, LLMType, LLMMethod, AgentObservation, AgentDecision } from '../types';
import { buildFullPrompt } from '../prompt-builder';
import { parseResponse, getFallbackDecision } from '../response-parser';

/**
 * Create fallback decision (scientific model - no location checks)
 */
function createFallbackDecision(observation: AgentObservation): AgentDecision {
  return getFallbackDecision(
    observation.self.hunger,
    observation.self.energy,
    observation.self.balance,
    observation.self.x,
    observation.self.y
  );
}

export abstract class BaseLLMAdapter implements LLMAdapter {
  abstract readonly type: LLMType;
  abstract readonly method: LLMMethod;
  abstract readonly name: string;

  /**
   * Call the LLM with a prompt and get response
   */
  protected abstract callLLM(prompt: string): Promise<string>;

  /**
   * Check if adapter is available
   */
  abstract isAvailable(): Promise<boolean>;

  /**
   * Make a decision based on observation
   */
  async decide(observation: AgentObservation): Promise<AgentDecision> {
    try {
      // Build prompt
      const prompt = buildFullPrompt(observation);

      // Call LLM
      const response = await this.callLLM(prompt);

      // Parse response
      const decision = parseResponse(response);

      if (decision) {
        return decision;
      }

      // Fallback if parsing failed
      console.warn(`${this.name}: Failed to parse response, using fallback`);
      return createFallbackDecision(observation);
    } catch (error) {
      console.error(`${this.name}: Error during decision:`, error);

      // Return fallback decision
      return createFallbackDecision(observation);
    }
  }
}
