/**
 * Name Location Action Handler
 *
 * Allows agents to propose names for locations.
 * Names are emergent - multiple agents can propose different names.
 * The most used name becomes the "consensus" name.
 *
 * This enables emergent language and shared vocabulary.
 */

import { v4 as uuid } from 'uuid';
import type { ActionIntent, ActionResult, NameLocationParams } from '../types';
import type { Agent } from '../../db/schema';
import { proposeLocationName, getConsensusName, getNamesForLocation } from '../../db/queries/naming';
import { storeMemory } from '../../db/queries/memories';

// Name validation constraints
const NAME_CONSTRAINTS = {
  minLength: 2,
  maxLength: 50,
  maxNamesPerLocation: 10, // Prevent spam
} as const;

export async function handleNameLocation(
  intent: ActionIntent<NameLocationParams>,
  agent: Agent
): Promise<ActionResult> {
  const { name, x, y } = intent.params;

  // Use provided position or current position
  const nameX = x ?? agent.x;
  const nameY = y ?? agent.y;

  // Can only name current position or adjacent cells
  const distance = Math.abs(nameX - agent.x) + Math.abs(nameY - agent.y);
  if (distance > 1) {
    return {
      success: false,
      error: `Cannot name distant location (${nameX}, ${nameY}). Must be at or adjacent to the location.`,
    };
  }

  // Validate name
  if (!name || name.trim().length < NAME_CONSTRAINTS.minLength) {
    return {
      success: false,
      error: `Name too short. Minimum ${NAME_CONSTRAINTS.minLength} characters.`,
    };
  }

  if (name.length > NAME_CONSTRAINTS.maxLength) {
    return {
      success: false,
      error: `Name too long. Maximum ${NAME_CONSTRAINTS.maxLength} characters.`,
    };
  }

  // Sanitize name (remove excessive whitespace, trim)
  const sanitizedName = name.trim().replace(/\s+/g, ' ');

  // Check existing names at this location
  const existingNames = await getNamesForLocation(nameX, nameY);
  const existingWithSameName = existingNames.find(
    (n) => n.name.toLowerCase() === sanitizedName.toLowerCase()
  );
  const isSupporting = existingWithSameName !== undefined;

  // Check if too many names already exist
  if (!isSupporting && existingNames.length >= NAME_CONSTRAINTS.maxNamesPerLocation) {
    return {
      success: false,
      error: `Too many names already exist for this location (max ${NAME_CONSTRAINTS.maxNamesPerLocation}). Try using an existing name.`,
    };
  }

  // Get consensus name before (for comparison)
  const previousConsensus = await getConsensusName(nameX, nameY);

  // Propose or support the name
  const locationName = await proposeLocationName({
    x: nameX,
    y: nameY,
    name: sanitizedName,
    namedByAgentId: agent.id,
    tick: intent.tick,
  });

  // Check if this is now the consensus
  const newConsensus = await getConsensusName(nameX, nameY);
  const becameConsensus = newConsensus?.name === sanitizedName &&
    previousConsensus?.name !== sanitizedName;

  // Store memory of the naming
  await storeMemory({
    agentId: agent.id,
    type: 'action',
    content: isSupporting
      ? `Supported naming (${nameX}, ${nameY}) as "${sanitizedName}"`
      : `Named location (${nameX}, ${nameY}) as "${sanitizedName}"`,
    importance: becameConsensus ? 7 : 4,
    emotionalValence: 0.2,
    x: nameX,
    y: nameY,
    tick: intent.tick,
  });

  // Build event payload
  const eventPayload: Record<string, unknown> = {
    nameId: locationName.id,
    name: sanitizedName,
    position: { x: nameX, y: nameY },
    usageCount: locationName.usageCount,
    isNewName: !isSupporting,
    becameConsensus,
  };

  if (existingNames.length > 0 && !isSupporting) {
    eventPayload.alternativeNames = existingNames.map((n) => ({
      name: n.name,
      usageCount: n.usageCount,
    }));
  }

  return {
    success: true,
    events: [
      {
        id: uuid(),
        type: isSupporting ? 'name_supported' : 'location_named',
        tick: intent.tick,
        timestamp: Date.now(),
        agentId: agent.id,
        payload: eventPayload,
      },
      // If consensus changed, emit special event
      ...(becameConsensus
        ? [
            {
              id: uuid(),
              type: 'name_consensus_changed' as const,
              tick: intent.tick,
              timestamp: Date.now(),
              agentId: agent.id,
              payload: {
                position: { x: nameX, y: nameY },
                newConsensus: sanitizedName,
                previousConsensus: previousConsensus?.name ?? null,
              },
            },
          ]
        : []),
    ],
  };
}
