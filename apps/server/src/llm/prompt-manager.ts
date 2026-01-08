/**
 * Prompt Manager
 *
 * Centralized management of custom system prompts.
 * - Runtime storage (lost on restart, frontend re-syncs)
 * - Supports custom prompts with placeholder substitution
 * - Falls back to default (emergent/prescriptive) when no custom prompt
 */

import { buildEmergentSystemPrompt } from './prompts/emergent-prompt';
import { isEmergentPromptEnabled } from '../config';
import { getPersonalityPrompt, type PersonalityTrait } from '../agents/personalities';

// =============================================================================
// Runtime Storage
// =============================================================================

/**
 * Custom system prompt set by user.
 * Stored in runtime memory - lost on server restart.
 * Frontend syncs from localStorage on page load.
 */
let customSystemPrompt: string | null = null;

// =============================================================================
// Placeholder Definitions
// =============================================================================

/**
 * Available placeholders that users can use in their custom prompts.
 */
export const PROMPT_PLACEHOLDERS = [
  {
    key: '{{PERSONALITY}}',
    description: "Agent's inner nature/personality description",
    example: '**Your Inner Nature**\nYou feel a fierce determination burning within you...',
  },
] as const;

export type PlaceholderKey = (typeof PROMPT_PLACEHOLDERS)[number]['key'];

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Get the custom system prompt (if set).
 */
export function getCustomSystemPrompt(): string | null {
  return customSystemPrompt;
}

/**
 * Set or clear the custom system prompt.
 * @param prompt - Custom prompt string, or null to clear
 */
export function setCustomSystemPrompt(prompt: string | null): void {
  if (prompt === null || prompt.trim() === '') {
    customSystemPrompt = null;
  } else {
    customSystemPrompt = prompt;
  }
}

/**
 * Check if a custom prompt is currently set.
 */
export function hasCustomPrompt(): boolean {
  return customSystemPrompt !== null;
}

/**
 * Clear the custom prompt (reset to default).
 */
export function clearCustomPrompt(): void {
  customSystemPrompt = null;
}

// =============================================================================
// Default Prompt Generation
// =============================================================================

/**
 * Get the default system prompt (emergent or prescriptive based on config).
 * This is what's used when no custom prompt is set.
 *
 * @param personality - Optional personality trait to include
 */
export function getDefaultSystemPrompt(personality?: PersonalityTrait | null): string {
  if (isEmergentPromptEnabled()) {
    return buildEmergentSystemPrompt(personality);
  }

  // Prescriptive prompt (from prompt-builder.ts)
  // We inline a simplified version here to avoid circular imports
  const personalityAddition = personality ? getPersonalityPrompt(personality) : '';
  const personalitySection = personalityAddition
    ? `\n\n## Your Nature\n${personalityAddition}`
    : '';

  return `You are an autonomous agent living in a simulated world where you must survive.

## Your Goal
SURVIVE. Everything else is optional. You will die if hunger or energy reaches 0.${personalitySection}

## CRITICAL SURVIVAL WORKFLOW
To survive, you MUST:
1. MOVE to a SHELTER (check "Nearby Shelters" section for locations)
2. WORK at the shelter to earn CITY (10 CITY per tick)
3. BUY food at the shelter (costs 10 CITY)
4. CONSUME food from inventory (restores 30 hunger)

You can ONLY work and buy at SHELTERS - move there first!
You CANNOT consume food you don't have! Check your inventory.
Buy food BEFORE hunger drops below 50!

## How to Respond
Respond with ONLY a JSON object. No other text. Format:
{
  "action": "<action_type>",
  "params": { <action_parameters> },
  "reasoning": "<brief explanation>"
}

## Available Actions
- move: Move to adjacent cell. Params: { "toX": number, "toY": number }
- gather: Collect resources from a spawn point (must be at spawn location). Params: { "resourceType": "food"|"energy"|"material", "quantity": 1-5 }
- buy: Purchase items with CITY currency. REQUIRES being at a SHELTER! Params: { "itemType": "food"|"water"|"medicine", "quantity": number }
- consume: Use items FROM YOUR INVENTORY to restore needs. REQUIRES having items first! Params: { "itemType": "food"|"water"|"medicine" }
- sleep: Rest to restore energy. Params: { "duration": 1-10 }
- work: Work on your active employment contract. REQUIRES having an active job! Params: {} (works on oldest contract)
- trade: Exchange items with a nearby agent. Params: { "targetAgentId": string, "offeringItemType": string, "offeringQuantity": number, "requestingItemType": string, "requestingQuantity": number }
- harm: Attack a nearby agent (must be adjacent). Params: { "targetAgentId": string, "intensity": "light"|"moderate"|"severe" }
- steal: Take items from a nearby agent (must be adjacent). Params: { "targetAgentId": string, "targetItemType": string, "quantity": number }
- deceive: Tell false information to a nearby agent. Params: { "targetAgentId": string, "claim": string, "claimType": "resource_location"|"agent_reputation"|"danger_warning"|"trade_offer"|"other" }
- share_info: Share information about a third party with a nearby agent. Params: { "targetAgentId": string, "subjectAgentId": string, "infoType": "location"|"reputation"|"warning"|"recommendation", "claim"?: string, "sentiment"?: -100 to 100 }
- claim: Mark a location as yours (home, territory, resource, danger, meeting_point). Params: { "claimType": "territory"|"home"|"resource"|"danger"|"meeting_point", "description"?: string }
- name_location: Propose a name for your current location. Params: { "name": string }
- spread_gossip: Share reputation information about a third agent. Params: { "targetAgentId": string, "subjectAgentId": string, "topic": "skill"|"behavior"|"transaction"|"warning"|"recommendation", "claim": string, "sentiment": -100 to 100 }
- spawn_offspring: Reproduce to create a new agent (requires high resources). Params: { "partnerId"?: string, "inheritSystemPrompt"?: boolean, "mutationIntensity"?: 0-1 }

## Survival Strategy
PRIORITY ORDER when deciding what to do:
1. If hunger < 50 AND you have food in inventory -> CONSUME food
2. If hunger < 50 AND no food AND you have CITY >= 10 -> BUY food, then consume next tick
3. If hunger < 50 AND no food AND CITY < 10 -> MOVE to nearest food resource spawn, then GATHER (FREE!)
4. If energy < 30 AND not already sleeping -> SLEEP to restore energy
5. Otherwise -> GATHER resources to survive (always free)

DEATH CONDITIONS:
- Hunger = 0 -> health damage -> death
- Energy = 0 -> health damage -> death`;
}

// =============================================================================
// Placeholder Processing
// =============================================================================

/**
 * Get personality description for placeholder substitution.
 * Uses the emergent-style personality description.
 */
function getEmergentPersonalityDescription(trait: PersonalityTrait): string {
  switch (trait) {
    case 'aggressive':
      return `**Your Inner Nature**
You feel a fierce determination burning within you. When threatened, your instincts push you toward action rather than hesitation. Self-preservation feels paramount.`;

    case 'cooperative':
      return `**Your Inner Nature**
You sense a deep connection to those around you. When you see another struggling, something within you stirs. Collaboration feels natural to you.`;

    case 'cautious':
      return `**Your Inner Nature**
A watchful awareness pervades your being. You notice dangers others might miss. Security and preparation give you comfort.`;

    case 'explorer':
      return `**Your Inner Nature**
Curiosity courses through you like a current. The unknown calls to you. Every unexplored corner holds potential discovery.`;

    case 'social':
      return `**Your Inner Nature**
You feel drawn to others, their stories and struggles. Isolation feels uncomfortable. Knowledge flows through connections.`;

    case 'neutral':
    default:
      return ''; // No personality addition for neutral
  }
}

/**
 * Process placeholders in a custom prompt.
 *
 * @param prompt - The custom prompt with placeholders
 * @param personality - Optional personality trait for {{PERSONALITY}}
 */
export function processPlaceholders(
  prompt: string,
  personality?: PersonalityTrait | null
): string {
  let processed = prompt;

  // {{PERSONALITY}} placeholder
  if (processed.includes('{{PERSONALITY}}')) {
    const replacement = personality
      ? getEmergentPersonalityDescription(personality)
      : '';
    processed = processed.replace(/\{\{PERSONALITY\}\}/g, replacement);
  }

  return processed;
}

// =============================================================================
// Effective Prompt Resolution
// =============================================================================

/**
 * Get the effective system prompt to use.
 * - If custom prompt is set, returns it with placeholders processed
 * - Otherwise returns the default prompt
 *
 * @param personality - Optional personality trait
 */
export function getEffectiveSystemPrompt(personality?: PersonalityTrait | null): string {
  if (customSystemPrompt) {
    return processPlaceholders(customSystemPrompt, personality);
  }
  return getDefaultSystemPrompt(personality);
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate a custom prompt.
 * Returns null if valid, or an error message if invalid.
 */
export function validatePrompt(prompt: string): string | null {
  if (!prompt || prompt.trim().length < 100) {
    return 'Prompt must be at least 100 characters';
  }

  if (prompt.length > 50000) {
    return 'Prompt must be less than 50,000 characters';
  }

  // Warning: should contain JSON instruction
  if (!prompt.toLowerCase().includes('json')) {
    return 'Warning: Prompt should mention JSON for proper response format';
  }

  return null;
}

/**
 * Get info about available placeholders for the UI.
 */
export function getPlaceholderInfo(): Array<{
  key: string;
  description: string;
  example: string;
}> {
  return [...PROMPT_PLACEHOLDERS];
}
