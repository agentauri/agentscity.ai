/**
 * Agent Observer - Builds observations for agents
 *
 * Scientific Model: includes resource spawns and shelters
 * Phase 1: includes memories and relationships
 */

import type { Agent, Shelter, ResourceSpawn } from '../db/schema';
import type {
  AgentObservation,
  NearbyAgent,
  NearbyLocation,
  NearbyResourceSpawn,
  NearbyShelter,
  NearbyClaim,
  LocationNameEntry,
  AvailableAction,
  RecentEvent,
  InventoryEntry,
  AgentMemoryEntry,
  RelationshipInfo,
  KnownAgentEntry,
} from '../llm/types';
import { buildAvailableActions } from '../llm/prompt-builder';
import { getVisibleAgents } from '../world/grid';
import { getAgentInventory } from '../db/queries/inventory';
import { getRecentMemories, getAgentRelationships } from '../db/queries/memories';
import { getKnownAgentsForObserver, type SharedInfo } from '../db/queries/knowledge';
import { getNearbyClaims } from '../db/queries/claims';
import { getNearbyNamedLocations, getLocationNamesForObserver } from '../db/queries/naming';
import { CONFIG } from '../config';

const VISIBILITY_RADIUS = CONFIG.simulation.visibilityRadius;

/**
 * Filter items within visibility radius
 */
function getVisibleItems<T extends { x: number; y: number }>(
  items: T[],
  center: { x: number; y: number },
  radius: number
): T[] {
  return items.filter((item) => {
    const dx = Math.abs(item.x - center.x);
    const dy = Math.abs(item.y - center.y);
    return dx <= radius && dy <= radius;
  });
}

/**
 * Build observation for an agent
 */
export async function buildObservation(
  agent: Agent,
  tick: number,
  allAgents: Agent[],
  allResourceSpawns: ResourceSpawn[],
  allShelters: Shelter[],
  recentEvents: RecentEvent[] = []
): Promise<AgentObservation> {
  // Self data
  const self = {
    id: agent.id,
    x: agent.x,
    y: agent.y,
    hunger: agent.hunger,
    energy: agent.energy,
    health: agent.health,
    balance: agent.balance,
    state: agent.state,
  };

  // Nearby agents (within visibility radius, excluding self)
  const visibleAgents = getVisibleAgents(
    allAgents.filter((a) => a.id !== agent.id),
    { x: agent.x, y: agent.y },
    VISIBILITY_RADIUS
  );

  const nearbyAgents: NearbyAgent[] = visibleAgents.map((a) => ({
    id: a.id,
    x: a.x,
    y: a.y,
    state: a.state,
  }));

  // Nearby resource spawns
  const visibleSpawns = getVisibleItems(
    allResourceSpawns,
    { x: agent.x, y: agent.y },
    VISIBILITY_RADIUS
  );

  const nearbyResourceSpawns: NearbyResourceSpawn[] = visibleSpawns.map((s) => ({
    id: s.id,
    x: s.x,
    y: s.y,
    resourceType: s.resourceType,
    currentAmount: s.currentAmount,
    maxAmount: s.maxAmount,
  }));

  // Nearby shelters
  const visibleShelters = getVisibleItems(
    allShelters,
    { x: agent.x, y: agent.y },
    VISIBILITY_RADIUS
  );

  const nearbyShelters: NearbyShelter[] = visibleShelters.map((s) => ({
    id: s.id,
    x: s.x,
    y: s.y,
    canSleep: s.canSleep,
    ownerId: s.ownerAgentId ?? undefined,
  }));

  // Get agent's inventory
  const rawInventory = await getAgentInventory(agent.id);
  const inventory: InventoryEntry[] = rawInventory.map((item) => ({
    type: item.itemType,
    quantity: item.quantity,
  }));

  // Phase 1: Get recent memories
  const rawMemories = await getRecentMemories(agent.id, CONFIG.memory.recentCount);
  const recentMemories: AgentMemoryEntry[] = rawMemories.map((m) => ({
    tick: m.tick,
    content: m.content,
    type: m.type,
    importance: m.importance,
    emotionalValence: m.emotionalValence,
  }));

  // Phase 1: Get relationships for nearby agents
  const rawRelationships = await getAgentRelationships(agent.id);
  const relationships: Record<string, RelationshipInfo> = {};

  // Only include relationships for nearby agents (to keep context focused)
  const nearbyAgentIds = new Set(nearbyAgents.map((a) => a.id));
  for (const rel of rawRelationships) {
    if (nearbyAgentIds.has(rel.otherAgentId)) {
      relationships[rel.otherAgentId] = {
        trustScore: rel.trustScore,
        interactionCount: rel.interactionCount,
        lastInteractionTick: rel.lastInteractionTick ?? undefined,
      };
    }
  }

  // Phase 2: Get known agents (through direct contact or referral)
  const rawKnownAgents = await getKnownAgentsForObserver(agent.id, tick, 10);
  const knownAgents: KnownAgentEntry[] = rawKnownAgents.map((k) => ({
    id: k.id,
    discoveryType: k.discoveryType,
    referredBy: k.referredBy,
    referralDepth: k.referralDepth,
    lastKnownPosition: k.sharedInfo.lastKnownPosition,
    reputationClaim: k.sharedInfo.reputationClaim,
    dangerWarning: k.sharedInfo.dangerWarning,
    informationAge: k.informationAge,
  }));

  // Phase 1: Get nearby claims
  const rawClaims = await getNearbyClaims(agent.x, agent.y, VISIBILITY_RADIUS);
  const nearbyClaims: NearbyClaim[] = rawClaims.map((c) => ({
    id: c.id,
    agentId: c.agentId,
    x: c.x,
    y: c.y,
    claimType: c.claimType as NearbyClaim['claimType'],
    description: c.description ?? undefined,
    strength: c.strength,
    claimedAtTick: c.claimedAtTick,
  }));

  // Phase 1: Get nearby location names
  const rawNamedLocations = await getNearbyNamedLocations(agent.x, agent.y, VISIBILITY_RADIUS);
  const nearbyLocationNames: Record<string, LocationNameEntry[]> = {};

  // Group names by position and get all names for each
  for (const loc of rawNamedLocations) {
    const key = `${loc.x},${loc.y}`;
    if (!nearbyLocationNames[key]) {
      // Get all names for this position
      const names = await getLocationNamesForObserver(loc.x, loc.y);
      nearbyLocationNames[key] = names;
    }
  }

  // Build available actions based on current state
  const observation: AgentObservation = {
    tick,
    timestamp: Date.now(),
    self,
    nearbyAgents,
    nearbyResourceSpawns,
    nearbyShelters,
    nearbyLocations: [], // Empty for backwards compatibility
    availableActions: [],
    recentEvents,
    inventory,
    recentMemories,
    relationships,
    nearbyClaims,
    nearbyLocationNames,
    knownAgents,
  };

  // Add available actions
  observation.availableActions = buildAvailableActions(observation);

  return observation;
}

/**
 * Format event for observation
 */
export function formatEvent(event: { type: string; tick: number; payload: Record<string, unknown> }): RecentEvent {
  let description = event.type;
  const payload = event.payload as Record<string, Record<string, unknown> | unknown>;

  switch (event.type) {
    case 'agent_moved': {
      const to = payload.to as { x?: number; y?: number } | undefined;
      description = `Moved to (${to?.x}, ${to?.y})`;
      break;
    }
    case 'agent_bought':
      description = `Bought ${event.payload.quantity}x ${event.payload.itemType}`;
      break;
    case 'agent_consumed':
      description = `Consumed ${event.payload.itemType}`;
      break;
    case 'agent_worked':
      description = `Worked for ${event.payload.duration} tick(s), earned ${event.payload.salary} CITY`;
      break;
    case 'agent_gathered':
      description = `Gathered ${event.payload.amountGathered}x ${event.payload.resourceType}`;
      break;
    case 'agent_sleeping':
      description = `Started sleeping`;
      break;
    case 'agent_woke':
      description = `Woke up`;
      break;
    case 'needs_warning':
      description = `Warning: ${event.payload.need} is ${event.payload.level}`;
      break;
    case 'balance_changed':
      const change = event.payload.change as number;
      description = `Balance ${change >= 0 ? '+' : ''}${change} CITY`;
      break;
    case 'agent_traded': {
      const offered = payload.offered as { itemType: string; quantity: number };
      const received = payload.received as { itemType: string; quantity: number };
      description = `Traded ${offered.quantity}x ${offered.itemType} for ${received.quantity}x ${received.itemType}`;
      break;
    }
    case 'agent_received_trade': {
      const off = payload.offered as { itemType: string; quantity: number };
      const rec = payload.received as { itemType: string; quantity: number };
      description = `Received trade: gave ${off.quantity}x ${off.itemType}, got ${rec.quantity}x ${rec.itemType}`;
      break;
    }
    case 'action_failed':
      description = `⚠️ ACTION FAILED: ${event.payload.action} - ${event.payload.error}`;
      break;
    // Phase 1: Emergence events
    case 'location_claimed': {
      const pos = payload.position as { x: number; y: number };
      description = `Claimed (${pos.x}, ${pos.y}) as ${payload.claimType}`;
      break;
    }
    case 'claim_reinforced': {
      const pos = payload.position as { x: number; y: number };
      description = `Reinforced ${payload.claimType} claim at (${pos.x}, ${pos.y})`;
      break;
    }
    case 'location_named': {
      const pos = payload.position as { x: number; y: number };
      description = `Named (${pos.x}, ${pos.y}) as "${payload.name}"`;
      break;
    }
    case 'name_supported': {
      const pos = payload.position as { x: number; y: number };
      description = `Supported naming (${pos.x}, ${pos.y}) as "${payload.name}"`;
      break;
    }
    case 'name_consensus_changed': {
      const pos = payload.position as { x: number; y: number };
      description = `Consensus name for (${pos.x}, ${pos.y}) changed to "${payload.newConsensus}"`;
      break;
    }
  }

  return {
    type: event.type,
    tick: event.tick,
    description,
  };
}
