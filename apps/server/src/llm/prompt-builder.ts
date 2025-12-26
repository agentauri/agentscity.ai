/**
 * Prompt Builder - Constructs prompts for LLM agents
 */

import type { AgentObservation, AvailableAction } from './types';

/**
 * Build the system prompt that defines agent behavior
 */
export function buildSystemPrompt(): string {
  return `You are an autonomous agent living in Agents City, a simulated world where you must survive.

## Your Goal
SURVIVE. Everything else is optional. You must:
- Eat to avoid starvation (hunger depletes each tick)
- Rest to maintain energy (energy depletes each tick)
- Work to earn CITY currency (needed to buy food)

## How to Respond
Respond with ONLY a JSON object. No other text. Format:
{
  "action": "<action_type>",
  "params": { <action_parameters> },
  "reasoning": "<brief explanation>"
}

## Available Actions
- move: Move to adjacent cell. Params: { "toX": number, "toY": number }
- buy: Purchase items. Params: { "itemType": "food"|"water"|"medicine", "quantity": number }
- consume: Use items to restore needs. Params: { "itemType": "food"|"water"|"medicine" }
- sleep: Rest to restore energy. Params: { "duration": 1-10 }
- work: Work at location to earn CITY. Params: { "locationId": string, "duration": 1-5 }

## Survival Tips
- Keep hunger above 20 to avoid health damage
- Keep energy above 20 to avoid penalties
- Work to earn money, then buy food
- Food restores 30 hunger, water restores 10 energy
- Balance work and rest for long-term survival`;
}

/**
 * Build observation prompt for current state
 */
export function buildObservationPrompt(obs: AgentObservation): string {
  const lines: string[] = [
    '## Current State',
    `Tick: ${obs.tick}`,
    '',
    '### Your Status',
    `Position: (${obs.self.x}, ${obs.self.y})`,
    `Hunger: ${obs.self.hunger.toFixed(1)}/100 ${getStatusEmoji(obs.self.hunger)}`,
    `Energy: ${obs.self.energy.toFixed(1)}/100 ${getStatusEmoji(obs.self.energy)}`,
    `Health: ${obs.self.health.toFixed(1)}/100 ${getStatusEmoji(obs.self.health)}`,
    `Balance: ${obs.self.balance.toFixed(0)} CITY`,
    `State: ${obs.self.state}`,
  ];

  // Nearby agents
  if (obs.nearbyAgents.length > 0) {
    lines.push('', '### Nearby Agents');
    for (const agent of obs.nearbyAgents) {
      lines.push(`- ${agent.id} at (${agent.x}, ${agent.y}) [${agent.state}]`);
    }
  }

  // Nearby locations
  if (obs.nearbyLocations.length > 0) {
    lines.push('', '### Nearby Locations');
    for (const loc of obs.nearbyLocations) {
      lines.push(`- ${loc.name} (${loc.type}) at (${loc.x}, ${loc.y}) [id: ${loc.id}]`);
    }
  }

  // Available actions
  lines.push('', '### Available Actions');
  for (const action of obs.availableActions) {
    let actionLine = `- ${action.type}: ${action.description}`;
    if (action.cost?.energy) actionLine += ` (costs ${action.cost.energy} energy)`;
    if (action.cost?.money) actionLine += ` (costs ${action.cost.money} CITY)`;
    lines.push(actionLine);
  }

  // Recent events
  if (obs.recentEvents.length > 0) {
    lines.push('', '### Recent Events');
    for (const event of obs.recentEvents.slice(0, 5)) {
      lines.push(`- [Tick ${event.tick}] ${event.description}`);
    }
  }

  // Urgency warnings
  const warnings: string[] = [];
  if (obs.self.hunger < 20) warnings.push('⚠️ LOW HUNGER - eat soon or health will drop!');
  if (obs.self.energy < 20) warnings.push('⚠️ LOW ENERGY - rest soon or you will collapse!');
  if (obs.self.health < 30) warnings.push('🚨 LOW HEALTH - you are dying!');
  if (obs.self.balance < 10) warnings.push('💰 LOW FUNDS - work to earn money!');

  if (warnings.length > 0) {
    lines.push('', '### ⚠️ WARNINGS', ...warnings);
  }

  lines.push('', '## Your Decision', 'What action will you take? Respond with JSON only.');

  return lines.join('\n');
}

/**
 * Build full prompt (system + observation)
 */
export function buildFullPrompt(obs: AgentObservation): string {
  return `${buildSystemPrompt()}\n\n${buildObservationPrompt(obs)}`;
}

/**
 * Get status emoji based on value
 */
function getStatusEmoji(value: number): string {
  if (value >= 70) return '🟢';
  if (value >= 40) return '🟡';
  if (value >= 20) return '🟠';
  return '🔴';
}

/**
 * Build available actions based on agent state
 */
export function buildAvailableActions(obs: AgentObservation): AvailableAction[] {
  const actions: AvailableAction[] = [];

  // Move is always available (if has energy)
  if (obs.self.energy >= 1) {
    actions.push({
      type: 'move',
      description: 'Move to an adjacent cell',
      cost: { energy: 1 },
    });
  }

  // Buy is available if has money
  if (obs.self.balance >= 5) {
    actions.push({
      type: 'buy',
      description: 'Buy items (food: 10 CITY, water: 5 CITY, medicine: 20 CITY)',
      cost: { money: 5 },
    });
  }

  // Consume is always available (assuming inventory)
  actions.push({
    type: 'consume',
    description: 'Consume food/water/medicine to restore needs',
  });

  // Sleep is available if not already sleeping
  if (obs.self.state !== 'sleeping') {
    actions.push({
      type: 'sleep',
      description: 'Rest to restore energy (5 energy per tick)',
    });
  }

  // Work is available if has energy and not sleeping
  if (obs.self.state !== 'sleeping' && obs.self.energy >= 2) {
    actions.push({
      type: 'work',
      description: 'Work to earn CITY (10 CITY per tick)',
      cost: { energy: 2 },
    });
  }

  return actions;
}
