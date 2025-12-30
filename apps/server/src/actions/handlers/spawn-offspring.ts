/**
 * Spawn Offspring Action Handler - Phase 4: Agent Reproduction (§36)
 *
 * Enables agents to create new agents with inherited traits and mutations,
 * creating evolutionary dynamics in the agent population.
 *
 * System imposes:
 * - High resource cost (prevents spam)
 * - Gestation period (reduced parent activity)
 * - Trait inheritance with mutations
 *
 * EMERGENT: Agent evolution, trait selection, population dynamics.
 */

import { v4 as uuid } from 'uuid';
import type { ActionIntent, ActionResult, SpawnOffspringParams } from '../types';
import type { Agent } from '../../db/schema';
import { getAgentById } from '../../db/queries/agents';
import { storeMemory, updateRelationshipTrust, getRelationship } from '../../db/queries/memories';
import { createReproductionState, createLineage, getActiveReproduction } from '../../db/queries/reproduction';
import { getDistance } from '../../world/grid';
import { CONFIG } from '../../config';

export async function handleSpawnOffspring(
  intent: ActionIntent<SpawnOffspringParams>,
  agent: Agent
): Promise<ActionResult> {
  const { partnerId, inheritSystemPrompt = true, mutationIntensity = 0.1 } = intent.params;

  // Validate mutation intensity
  if (mutationIntensity < 0 || mutationIntensity > 1) {
    return {
      success: false,
      error: 'Mutation intensity must be between 0.0 and 1.0',
    };
  }

  // Check if agent already has active reproduction
  const existingReproduction = await getActiveReproduction(agent.id);
  if (existingReproduction) {
    return {
      success: false,
      error: 'Already in reproduction process. Wait for gestation to complete.',
    };
  }

  // Check minimum requirements
  const minBalance = CONFIG.actions.spawnOffspring.minBalance;
  const minEnergy = CONFIG.actions.spawnOffspring.minEnergy;
  const minHealth = CONFIG.actions.spawnOffspring.minHealth;

  if (agent.balance < minBalance) {
    return {
      success: false,
      error: `Not enough balance for reproduction (have: ${agent.balance}, need: ${minBalance})`,
    };
  }

  if (agent.energy < minEnergy) {
    return {
      success: false,
      error: `Not enough energy for reproduction (have: ${agent.energy}, need: ${minEnergy})`,
    };
  }

  if (agent.health < minHealth) {
    return {
      success: false,
      error: `Not healthy enough for reproduction (have: ${agent.health}, need: ${minHealth})`,
    };
  }

  let partnerAgent: Agent | undefined;

  // If partner specified, validate
  if (partnerId) {
    if (partnerId === agent.id) {
      return {
        success: false,
        error: 'Cannot reproduce with yourself',
      };
    }

    partnerAgent = await getAgentById(partnerId);
    if (!partnerAgent) {
      return {
        success: false,
        error: 'Partner agent not found',
      };
    }

    if (partnerAgent.state === 'dead') {
      return {
        success: false,
        error: 'Cannot reproduce with a dead agent',
      };
    }

    // Check proximity to partner
    const distance = getDistance(
      { x: agent.x, y: agent.y },
      { x: partnerAgent.x, y: partnerAgent.y }
    );
    if (distance > CONFIG.actions.spawnOffspring.maxPartnerDistance) {
      return {
        success: false,
        error: `Partner too far (distance: ${distance}, max: ${CONFIG.actions.spawnOffspring.maxPartnerDistance})`,
      };
    }

    // Check partner's relationship/trust (must have positive trust)
    const relationship = await getRelationship(partnerAgent.id, agent.id);
    if (!relationship || relationship.trustScore < CONFIG.actions.spawnOffspring.minPartnerTrust) {
      return {
        success: false,
        error: `Partner doesn't trust you enough for reproduction (need trust >= ${CONFIG.actions.spawnOffspring.minPartnerTrust})`,
      };
    }

    // Partner must also meet minimum requirements
    if (partnerAgent.balance < minBalance / 2) {
      return {
        success: false,
        error: 'Partner does not have enough resources',
      };
    }
  }

  // Calculate costs
  const balanceCost = CONFIG.actions.spawnOffspring.balanceCost;
  const energyCost = CONFIG.actions.spawnOffspring.energyCost;
  const gestationTicks = CONFIG.actions.spawnOffspring.gestationTicks;

  const newBalance = agent.balance - balanceCost;
  const newEnergy = Math.max(0, agent.energy - energyCost);

  // Create reproduction state (gestation begins)
  const reproductionId = uuid();
  await createReproductionState({
    id: reproductionId,
    parentAgentId: agent.id,
    partnerAgentId: partnerId,
    gestationStartTick: intent.tick,
    gestationDurationTicks: gestationTicks,
    status: 'gestating',
  });

  // Store memory for parent
  const memoryContent = partnerId
    ? `Started reproduction process with a partner. Gestation will last ${gestationTicks} ticks.`
    : `Started solo reproduction process. Gestation will last ${gestationTicks} ticks.`;

  await storeMemory({
    agentId: agent.id,
    type: 'action',
    content: memoryContent,
    importance: 9,
    emotionalValence: 0.7,
    involvedAgentIds: partnerId ? [partnerId] : [],
    x: agent.x,
    y: agent.y,
    tick: intent.tick,
  });

  // If partner, store their memory too
  if (partnerId && partnerAgent) {
    await storeMemory({
      agentId: partnerId,
      type: 'interaction',
      content: 'Agreed to reproduction with another agent. Our offspring will arrive soon.',
      importance: 9,
      emotionalValence: 0.6,
      involvedAgentIds: [agent.id],
      x: partnerAgent.x,
      y: partnerAgent.y,
      tick: intent.tick,
    });

    // Increase trust between partners
    await updateRelationshipTrust(
      agent.id,
      partnerId,
      CONFIG.actions.spawnOffspring.trustGainOnReproduction,
      intent.tick,
      'Reproduction partnership'
    );
    await updateRelationshipTrust(
      partnerId,
      agent.id,
      CONFIG.actions.spawnOffspring.trustGainOnReproduction,
      intent.tick,
      'Reproduction partnership'
    );
  }

  return {
    success: true,
    changes: {
      balance: newBalance,
      energy: newEnergy,
      state: 'gestating' as Agent['state'], // Custom state during gestation
    },
    events: [
      {
        id: uuid(),
        type: 'reproduction_started',
        tick: intent.tick,
        timestamp: Date.now(),
        agentId: agent.id,
        payload: {
          reproductionId,
          parentId: agent.id,
          partnerId: partnerId ?? null,
          gestationStartTick: intent.tick,
          gestationEndTick: intent.tick + gestationTicks,
          inheritSystemPrompt,
          mutationIntensity,
          position: { x: agent.x, y: agent.y },
        },
      },
    ],
  };
}
