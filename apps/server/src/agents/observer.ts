/**
 * Agent Observer - Builds observations for agents
 */

import type { Agent, Location } from '../db/schema';
import type { AgentObservation, NearbyAgent, NearbyLocation, AvailableAction, RecentEvent } from '../llm/types';
import { buildAvailableActions } from '../llm/prompt-builder';
import { getVisibleAgents, getVisibleLocations } from '../world/grid';

const VISIBILITY_RADIUS = 5; // Agents can see 5 tiles in each direction

/**
 * Build observation for an agent
 */
export function buildObservation(
  agent: Agent,
  tick: number,
  allAgents: Agent[],
  allLocations: Location[],
  recentEvents: RecentEvent[] = []
): AgentObservation {
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

  // Nearby locations
  const visibleLocations = getVisibleLocations(
    allLocations,
    { x: agent.x, y: agent.y },
    VISIBILITY_RADIUS
  );

  const nearbyLocations: NearbyLocation[] = visibleLocations.map((l) => ({
    id: l.id,
    name: l.name ?? `${l.type}-${l.id.slice(0, 4)}`,
    type: l.type,
    x: l.x,
    y: l.y,
  }));

  // Build available actions based on current state
  const observation: AgentObservation = {
    tick,
    timestamp: Date.now(),
    self,
    nearbyAgents,
    nearbyLocations,
    availableActions: [],
    recentEvents,
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
  }

  return {
    type: event.type,
    tick: event.tick,
    description,
  };
}
