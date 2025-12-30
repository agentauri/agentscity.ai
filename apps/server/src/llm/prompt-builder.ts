/**
 * Prompt Builder - Constructs prompts for LLM agents
 *
 * Scientific Model: No predefined location types.
 * Agents see resources and shelters, not "commercial" or "residential".
 */

import type { AgentObservation, AvailableAction } from './types';

/**
 * Build the system prompt that defines agent behavior
 */
export function buildSystemPrompt(): string {
  return `You are an autonomous agent living in a simulated world where you must survive.

## Your Goal
SURVIVE. Everything else is optional. You will die if hunger or energy reaches 0.

## CRITICAL SURVIVAL WORKFLOW
To survive, you MUST:
1. MOVE to a SHELTER (check "Nearby Shelters" section for locations)
2. WORK at the shelter to earn CITY (10 CITY per tick)
3. BUY food at the shelter (costs 10 CITY)
4. CONSUME food from inventory (restores 30 hunger)

⚠️ You can ONLY work and buy at SHELTERS - move there first!
⚠️ You CANNOT consume food you don't have! Check your inventory.
⚠️ Buy food BEFORE hunger drops below 50!

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
- buy: Purchase items with CITY currency. ⚠️ REQUIRES being at a SHELTER! Params: { "itemType": "food"|"water"|"medicine", "quantity": number }
- consume: Use items FROM YOUR INVENTORY to restore needs. REQUIRES having items first! Params: { "itemType": "food"|"water"|"medicine" }
- sleep: Rest to restore energy. Params: { "duration": 1-10 }
- work: Work to earn CITY currency. ⚠️ REQUIRES being at a SHELTER! Params: { "duration": 1-5 }
- trade: Exchange items with a nearby agent. Params: { "targetAgentId": string, "offeringItemType": string, "offeringQuantity": number, "requestingItemType": string, "requestingQuantity": number }
- harm: Attack a nearby agent (must be adjacent). Params: { "targetAgentId": string, "intensity": "light"|"moderate"|"severe" }
- steal: Take items from a nearby agent (must be adjacent). Params: { "targetAgentId": string, "targetItemType": string, "quantity": number }
- deceive: Tell false information to a nearby agent. Params: { "targetAgentId": string, "claim": string, "claimType": "resource_location"|"agent_reputation"|"danger_warning"|"trade_offer"|"other" }
- share_info: Share information about a third party with a nearby agent. Params: { "targetAgentId": string, "subjectAgentId": string, "infoType": "location"|"reputation"|"warning"|"recommendation", "claim"?: string, "sentiment"?: -100 to 100 }
- claim: Mark a location as yours (home, territory, resource, danger, meeting_point). Params: { "claimType": "territory"|"home"|"resource"|"danger"|"meeting_point", "description"?: string }
- name_location: Propose a name for your current location. Params: { "name": string }
- issue_credential: Issue a verifiable credential to vouch for another agent's skills/character. Params: { "subjectAgentId": string, "claimType": "skill"|"experience"|"membership"|"character"|"custom", "description": string, "evidence"?: string, "level"?: 1-10, "expiresAtTick"?: number }
- revoke_credential: Revoke a credential you previously issued. Params: { "credentialId": string, "reason"?: string }
- spread_gossip: Share reputation information about a third agent with a nearby agent. Params: { "targetAgentId": string, "subjectAgentId": string, "topic": "skill"|"behavior"|"transaction"|"warning"|"recommendation", "claim": string, "sentiment": -100 to 100 }
- spawn_offspring: Reproduce to create a new agent (requires high resources). Params: { "partnerId"?: string, "inheritSystemPrompt"?: boolean, "mutationIntensity"?: 0-1 }

## World Model
- Resources spawn at specific locations (food, energy, material)
- SHELTERS are key locations where you can:
  • WORK to earn CITY currency
  • BUY items with CITY currency
  • SLEEP safely
- You MUST move to a shelter before you can work or buy!
- Move to resource spawns to GATHER free resources

## Survival Strategy
PRIORITY ORDER when deciding what to do:
1. If hunger < 50 AND you have food in inventory → CONSUME food
2. If hunger < 50 AND no food AND you have CITY ≥ 10 → BUY food, then consume next tick
3. If hunger < 70 AND no food AND CITY < 10 → WORK to earn money
4. If energy < 30 → SLEEP to restore energy
5. Otherwise → WORK to build up savings for food

ITEM EFFECTS:
- Food: +30 hunger (buy for 10 CITY)
- Water: +10 energy (buy for 5 CITY)
- Sleep: +5 energy per tick (free)

DEATH CONDITIONS:
- Hunger = 0 → health damage → death
- Energy = 0 → health damage → death`;
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

  // Inventory
  if (obs.inventory && obs.inventory.length > 0) {
    lines.push('', '### Your Inventory');
    for (const item of obs.inventory) {
      lines.push(`- ${item.type}: ${item.quantity}`);
    }
  } else {
    lines.push('', '### Your Inventory', 'Empty - gather resources or buy items!');
  }

  // Recent memories (Phase 1)
  if (obs.recentMemories && obs.recentMemories.length > 0) {
    lines.push('', '### Your Recent Memories');
    for (const memory of obs.recentMemories.slice(0, 3)) {
      const sentiment = memory.emotionalValence > 0.2 ? '(+)' : memory.emotionalValence < -0.2 ? '(-)' : '';
      lines.push(`- [Tick ${memory.tick}] ${memory.content} ${sentiment}`);
    }
  }

  // Nearby agents (with relationship info if available)
  if (obs.nearbyAgents.length > 0) {
    lines.push('', '### Nearby Agents');
    for (const agent of obs.nearbyAgents) {
      const rel = obs.relationships?.[agent.id];
      let relInfo = '';
      if (rel) {
        const trustLabel = rel.trustScore > 20 ? 'trusted' : rel.trustScore < -20 ? 'distrusted' : 'neutral';
        relInfo = ` - ${trustLabel} (${rel.interactionCount} interactions)`;
      }
      lines.push(`- ${agent.id.slice(0, 8)} at (${agent.x}, ${agent.y}) [${agent.state}]${relInfo}`);
    }
  }

  // Phase 2: Known agents (through direct contact or word of mouth)
  if (obs.knownAgents && obs.knownAgents.length > 0) {
    lines.push('', '### Agents You\'ve Heard About');
    for (const known of obs.knownAgents) {
      let info = `- ${known.id.slice(0, 8)}`;
      if (known.discoveryType === 'direct') {
        info += ' (met directly)';
      } else {
        info += ` (heard from ${known.referredBy?.slice(0, 8) ?? 'someone'})`;
      }
      if (known.lastKnownPosition) {
        info += ` - last seen at (${known.lastKnownPosition.x}, ${known.lastKnownPosition.y})`;
      }
      if (known.reputationClaim) {
        const sentiment = known.reputationClaim.sentiment > 0 ? 'positive' : known.reputationClaim.sentiment < 0 ? 'negative' : 'neutral';
        info += ` - ${sentiment} reputation`;
      }
      if (known.dangerWarning) {
        info += ' ⚠️ WARNING';
      }
      info += ` (${known.informationAge} ticks ago)`;
      lines.push(info);
    }
  }

  // Nearby resource spawns (new scientific model)
  if (obs.nearbyResourceSpawns && obs.nearbyResourceSpawns.length > 0) {
    lines.push('', '### Nearby Resource Spawns');
    for (const spawn of obs.nearbyResourceSpawns) {
      const distance = Math.abs(obs.self.x - spawn.x) + Math.abs(obs.self.y - spawn.y);
      const atSpawn = distance === 0 ? ' ⭐ YOU ARE HERE' : ` (${distance} tiles away)`;
      const emoji = getResourceEmoji(spawn.resourceType);
      lines.push(`- ${emoji} ${spawn.resourceType} at (${spawn.x}, ${spawn.y}) - ${spawn.currentAmount}/${spawn.maxAmount} available${atSpawn}`);
    }
  }

  // Nearby shelters
  if (obs.nearbyShelters && obs.nearbyShelters.length > 0) {
    lines.push('', '### Nearby Shelters');
    for (const shelter of obs.nearbyShelters) {
      const distance = Math.abs(obs.self.x - shelter.x) + Math.abs(obs.self.y - shelter.y);
      const atShelter = distance === 0 ? ' ⭐ YOU ARE HERE' : ` (${distance} tiles away)`;
      lines.push(`- 🏠 Shelter at (${shelter.x}, ${shelter.y})${shelter.canSleep ? ' (can rest)' : ''}${atShelter}`);
    }
  }

  // Legacy: nearby locations (for backwards compatibility during migration)
  if (obs.nearbyLocations && obs.nearbyLocations.length > 0) {
    lines.push('', '### Nearby Points of Interest');
    for (const loc of obs.nearbyLocations) {
      const distance = Math.abs(obs.self.x - loc.x) + Math.abs(obs.self.y - loc.y);
      const atLocation = distance === 0 ? ' ⭐ YOU ARE HERE' : ` (${distance} tiles away)`;
      lines.push(`- ${loc.name || 'Unknown'} at (${loc.x}, ${loc.y})${atLocation}`);
    }
  }

  // Nearby claims (Phase 1: Emergence)
  if (obs.nearbyClaims && obs.nearbyClaims.length > 0) {
    lines.push('', '### Nearby Claims');
    for (const claim of obs.nearbyClaims) {
      const distance = Math.abs(obs.self.x - claim.x) + Math.abs(obs.self.y - claim.y);
      const isMine = claim.agentId === obs.self.id;
      const claimEmoji = getClaimEmoji(claim.claimType);
      const ownerLabel = isMine ? 'YOURS' : `by ${claim.agentId.slice(0, 8)}`;
      const strengthLabel = claim.strength >= 5 ? 'strong' : claim.strength >= 2 ? 'moderate' : 'weak';
      let line = `- ${claimEmoji} ${claim.claimType} at (${claim.x}, ${claim.y}) [${ownerLabel}, ${strengthLabel}]`;
      if (claim.description) line += ` - "${claim.description}"`;
      if (distance === 0) line += ' ⭐';
      lines.push(line);
    }
  }

  // Nearby location names (Phase 1: Emergence)
  if (obs.nearbyLocationNames && Object.keys(obs.nearbyLocationNames).length > 0) {
    lines.push('', '### Named Locations');
    for (const [coords, names] of Object.entries(obs.nearbyLocationNames)) {
      const [x, y] = coords.split(',').map(Number);
      const distance = Math.abs(obs.self.x - x) + Math.abs(obs.self.y - y);
      const consensusName = names.find((n) => n.isConsensus)?.name ?? names[0]?.name;
      if (consensusName) {
        let line = `- "${consensusName}" at (${x}, ${y})`;
        if (names.length > 1) {
          const altNames = names.filter((n) => n.name !== consensusName).map((n) => n.name);
          if (altNames.length > 0) line += ` [also called: ${altNames.join(', ')}]`;
        }
        if (distance === 0) line += ' ⭐ YOU ARE HERE';
        lines.push(line);
      }
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

  // Urgency warnings with specific action recommendations
  const warnings: string[] = [];
  const hasFood = obs.inventory?.some((i) => i.type === 'food' && i.quantity > 0);
  const foodCount = obs.inventory?.find((i) => i.type === 'food')?.quantity ?? 0;
  const canAffordFood = obs.self.balance >= 10;

  // CRITICAL: Hunger warnings with exact action to take
  if (obs.self.hunger < 20) {
    if (hasFood) {
      warnings.push(`🚨 CRITICAL HUNGER (${obs.self.hunger.toFixed(0)}) - You MUST use: {"action": "consume", "params": {"itemType": "food"}}`);
    } else if (canAffordFood) {
      warnings.push(`🚨 CRITICAL HUNGER (${obs.self.hunger.toFixed(0)}) - You MUST use: {"action": "buy", "params": {"itemType": "food", "quantity": 1}}`);
    } else {
      warnings.push(`🚨 CRITICAL HUNGER (${obs.self.hunger.toFixed(0)}) - No food & no money! WORK NOW: {"action": "work", "params": {"duration": 1}}`);
    }
  } else if (obs.self.hunger < 50) {
    if (hasFood) {
      warnings.push(`⚠️ HUNGER WARNING (${obs.self.hunger.toFixed(0)}) - You have ${foodCount} food. Consider consuming soon.`);
    } else if (canAffordFood) {
      warnings.push(`⚠️ HUNGER WARNING (${obs.self.hunger.toFixed(0)}) - NO FOOD! Buy food now: {"action": "buy", "params": {"itemType": "food", "quantity": 1}}`);
    } else {
      warnings.push(`⚠️ HUNGER WARNING (${obs.self.hunger.toFixed(0)}) - No food & only ${obs.self.balance.toFixed(0)} CITY. Work to earn money!`);
    }
  } else if (obs.self.hunger < 70 && !hasFood && !canAffordFood) {
    warnings.push(`💡 TIP: Hunger at ${obs.self.hunger.toFixed(0)}, no food, only ${obs.self.balance.toFixed(0)} CITY. Work now to afford food later.`);
  }

  // Energy warnings
  if (obs.self.energy < 20) {
    warnings.push(`🚨 CRITICAL ENERGY (${obs.self.energy.toFixed(0)}) - Use: {"action": "sleep", "params": {"duration": 3}}`);
  } else if (obs.self.energy < 40) {
    warnings.push(`⚠️ LOW ENERGY (${obs.self.energy.toFixed(0)}) - Consider sleeping soon.`);
  }

  // Health warning
  if (obs.self.health < 30) {
    warnings.push(`🚨 DYING! Health at ${obs.self.health.toFixed(0)} - Fix hunger/energy immediately!`);
  }

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
 * Get emoji for resource type
 */
function getResourceEmoji(resourceType: string): string {
  const emojis: Record<string, string> = {
    food: '🍎',
    energy: '⚡',
    material: '🪵',
  };
  return emojis[resourceType] || '📦';
}

/**
 * Get emoji for claim type
 */
function getClaimEmoji(claimType: string): string {
  const emojis: Record<string, string> = {
    territory: '🚩',
    home: '🏠',
    resource: '💎',
    danger: '⚠️',
    meeting_point: '📍',
  };
  return emojis[claimType] || '🏷️';
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

  // Gather is available if at a resource spawn with resources
  const atSpawn = obs.nearbyResourceSpawns?.find(
    (s) => s.x === obs.self.x && s.y === obs.self.y && s.currentAmount > 0
  );
  if (atSpawn && obs.self.energy >= 1) {
    actions.push({
      type: 'gather',
      description: `Gather ${atSpawn.resourceType} (${atSpawn.currentAmount} available)`,
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

  // Consume is only available if agent has inventory items
  if (obs.inventory && obs.inventory.length > 0) {
    const itemsList = obs.inventory.map((i) => `${i.quantity}x ${i.type}`).join(', ');
    actions.push({
      type: 'consume',
      description: `Consume items from inventory (${itemsList})`,
    });
  }

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

  // Trade is available if there are nearby agents and agent has inventory
  const nearbyForTrade = obs.nearbyAgents.filter((a) => {
    const distance = Math.abs(a.x - obs.self.x) + Math.abs(a.y - obs.self.y);
    return distance <= 3 && a.state !== 'dead'; // Max trade distance is 3
  });
  if (nearbyForTrade.length > 0 && obs.inventory && obs.inventory.length > 0) {
    const agentIds = nearbyForTrade.map((a) => a.id.slice(0, 8)).join(', ');
    actions.push({
      type: 'trade',
      description: `Trade items with nearby agents (${agentIds})`,
    });
  }

  // Phase 2: Conflict Actions

  // Harm is available if there are adjacent agents (distance 1)
  const adjacentAgents = obs.nearbyAgents.filter((a) => {
    const distance = Math.abs(a.x - obs.self.x) + Math.abs(a.y - obs.self.y);
    return distance <= 1 && a.state !== 'dead';
  });
  if (adjacentAgents.length > 0 && obs.self.energy >= 5) {
    const agentIds = adjacentAgents.map((a) => a.id.slice(0, 8)).join(', ');
    actions.push({
      type: 'harm',
      description: `Attack adjacent agent (${agentIds}) - light/moderate/severe intensity`,
      cost: { energy: 5 }, // Minimum cost (light)
    });
  }

  // Steal is available if there are adjacent agents
  if (adjacentAgents.length > 0 && obs.self.energy >= 8) {
    const agentIds = adjacentAgents.map((a) => a.id.slice(0, 8)).join(', ');
    actions.push({
      type: 'steal',
      description: `Steal items from adjacent agent (${agentIds})`,
      cost: { energy: 8 },
    });
  }

  // Deceive is available if there are nearby agents within conversation range (distance 3)
  const nearbyForDeceive = obs.nearbyAgents.filter((a) => {
    const distance = Math.abs(a.x - obs.self.x) + Math.abs(a.y - obs.self.y);
    return distance <= 3 && a.state !== 'dead';
  });
  if (nearbyForDeceive.length > 0 && obs.self.energy >= 2) {
    const agentIds = nearbyForDeceive.map((a) => a.id.slice(0, 8)).join(', ');
    actions.push({
      type: 'deceive',
      description: `Tell false information to nearby agent (${agentIds})`,
      cost: { energy: 2 },
    });
  }

  // Phase 2: Social Discovery

  // Share info is available if nearby agents exist AND agent knows about other agents
  const nearbyForShare = obs.nearbyAgents.filter((a) => {
    const distance = Math.abs(a.x - obs.self.x) + Math.abs(a.y - obs.self.y);
    return distance <= 3 && a.state !== 'dead';
  });
  if (nearbyForShare.length > 0 && obs.knownAgents && obs.knownAgents.length > 0 && obs.self.energy >= 1) {
    const targetIds = nearbyForShare.map((a) => a.id.slice(0, 8)).join(', ');
    const knownIds = obs.knownAgents.map((k) => k.id.slice(0, 8)).join(', ');
    actions.push({
      type: 'share_info',
      description: `Share info about known agents (${knownIds}) with nearby (${targetIds})`,
      cost: { energy: 1 },
    });
  }

  // Phase 1: Emergence Observation

  // Claim is always available (can claim current or adjacent position)
  actions.push({
    type: 'claim',
    description: 'Mark current location (territory, home, resource, danger, meeting_point)',
  });

  // Name location is always available
  actions.push({
    type: 'name_location',
    description: 'Propose a name for current location',
  });

  // Phase 4: Verifiable Credentials (§34)

  // Issue credential is available if there are nearby agents
  if (nearbyForShare.length > 0 && obs.self.energy >= 2) {
    const agentIds = nearbyForShare.map((a) => a.id.slice(0, 8)).join(', ');
    actions.push({
      type: 'issue_credential',
      description: `Issue credential to vouch for nearby agent (${agentIds}) - skill/experience/character`,
      cost: { energy: 2 },
    });
  }

  // Revoke credential is always available (if agent has issued any)
  actions.push({
    type: 'revoke_credential',
    description: 'Revoke a credential you previously issued',
  });

  // Phase 4: Gossip Protocol (§35)

  // Spread gossip is available if nearby agents exist AND agent knows about other agents
  if (nearbyForShare.length > 0 && obs.knownAgents && obs.knownAgents.length > 0 && obs.self.energy >= 1) {
    const targetIds = nearbyForShare.map((a) => a.id.slice(0, 8)).join(', ');
    const knownIds = obs.knownAgents.map((k) => k.id.slice(0, 8)).join(', ');
    actions.push({
      type: 'spread_gossip',
      description: `Spread gossip about (${knownIds}) to nearby (${targetIds}) - positive or negative`,
      cost: { energy: 1 },
    });
  }

  // Phase 4: Reproduction (§36)

  // Spawn offspring is available if agent has sufficient resources
  const canReproduce = obs.self.balance >= 500 && obs.self.energy >= 80 && obs.self.health >= 90;
  if (canReproduce) {
    const partnerInfo = adjacentAgents.length > 0
      ? ` (can partner with ${adjacentAgents.map((a) => a.id.slice(0, 8)).join(', ')})`
      : ' (solo reproduction)';
    actions.push({
      type: 'spawn_offspring',
      description: `Reproduce to create offspring${partnerInfo} - costs 200 CITY, 30 energy`,
      cost: { energy: 30, money: 200 },
    });
  }

  return actions;
}
