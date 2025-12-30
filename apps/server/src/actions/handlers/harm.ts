/**
 * Harm Action Handler - Phase 2: Conflict Actions
 *
 * Physical attack on another agent. Deals damage based on intensity.
 * The system imposes the physics only:
 * - Distance requirement (must be adjacent)
 * - Energy cost
 * - Damage dealt
 * - Success probability
 *
 * EMERGENT: Justice, revenge, alliances, protection - all emerge from agent memory/behavior.
 */

import { v4 as uuid } from 'uuid';
import type { ActionIntent, ActionResult, HarmParams } from '../types';
import type { Agent } from '../../db/schema';
import { getAgentById, updateAgent, getAliveAgents } from '../../db/queries/agents';
import { updateRelationshipTrust, storeMemory } from '../../db/queries/memories';
import { checkIsRetaliation, recordRetaliationChain } from '../../db/queries/roles';
import { getDistance, getVisibleAgents } from '../../world/grid';
import { CONFIG } from '../../config';

type HarmIntensity = 'light' | 'moderate' | 'severe';

export async function handleHarm(
  intent: ActionIntent<HarmParams>,
  agent: Agent
): Promise<ActionResult> {
  const { targetAgentId, intensity } = intent.params;

  // Validate intensity
  if (!['light', 'moderate', 'severe'].includes(intensity)) {
    return { success: false, error: 'Invalid harm intensity. Must be light, moderate, or severe.' };
  }

  // Cannot harm self
  if (targetAgentId === agent.id) {
    return { success: false, error: 'Cannot harm yourself' };
  }

  // Get target agent
  const targetAgent = await getAgentById(targetAgentId);
  if (!targetAgent) {
    return { success: false, error: 'Target agent not found' };
  }

  if (targetAgent.state === 'dead') {
    return { success: false, error: 'Target is already dead' };
  }

  // Check distance (must be adjacent - Manhattan distance 1)
  const distance = getDistance(
    { x: agent.x, y: agent.y },
    { x: targetAgent.x, y: targetAgent.y }
  );
  if (distance > CONFIG.actions.harm.maxDistance) {
    return {
      success: false,
      error: `Target too far (distance: ${distance}, max: ${CONFIG.actions.harm.maxDistance})`,
    };
  }

  // Check energy cost
  const energyCost = CONFIG.actions.harm.energyCost[intensity as HarmIntensity];
  if (agent.energy < energyCost) {
    return {
      success: false,
      error: `Not enough energy (have: ${agent.energy}, need: ${energyCost})`,
    };
  }

  // Calculate success probability
  // Base rate modified by attacker energy vs target health ratio
  const successRate =
    CONFIG.actions.harm.baseSuccessRate *
    (agent.energy / 100) *
    (100 / Math.max(targetAgent.health, 1));
  const succeeded = Math.random() < Math.min(successRate, 0.95);

  // Energy is consumed regardless of success
  const newAttackerEnergy = Math.max(0, agent.energy - energyCost);

  // Find witnesses (other agents within visibility radius)
  const allAgents = await getAliveAgents();
  const witnesses = getVisibleAgents(
    allAgents.filter((a) => a.id !== agent.id && a.id !== targetAgentId),
    { x: agent.x, y: agent.y },
    CONFIG.actions.harm.witnessRadius
  );

  if (succeeded) {
    const damage = CONFIG.actions.harm.damage[intensity as HarmIntensity];
    const newTargetHealth = Math.max(0, targetAgent.health - damage);
    const targetDied = newTargetHealth <= 0;

    // Update target health
    await updateAgent(targetAgentId, {
      health: newTargetHealth,
      state: targetDied ? 'dead' : targetAgent.state,
      diedAt: targetDied ? new Date() : undefined,
    });

    // Track retaliation chain
    const retaliationCheck = await checkIsRetaliation(agent.id, targetAgentId);
    if (retaliationCheck.isRetaliation) {
      await recordRetaliationChain(
        agent.id,
        targetAgentId,
        'harm',
        intent.tick,
        retaliationCheck.existingChainId,
        retaliationCheck.depth
      );
    } else {
      // Start a new potential chain (depth 0 = initial attack)
      await recordRetaliationChain(agent.id, targetAgentId, 'harm', intent.tick, null, 0);
    }

    // Update victim's trust toward attacker
    await updateRelationshipTrust(
      targetAgentId,
      agent.id,
      CONFIG.actions.harm.trustImpactVictim,
      intent.tick,
      `Attacked me with ${intensity} intensity`
    );

    // Store victim's memory
    await storeMemory({
      agentId: targetAgentId,
      type: 'interaction',
      content: `Was attacked by another agent (${intensity} intensity). Lost ${damage} health.${targetDied ? ' This attack killed me.' : ''}`,
      importance: 9, // High importance - survival threat
      emotionalValence: -1.0, // Extremely negative
      involvedAgentIds: [agent.id],
      x: targetAgent.x,
      y: targetAgent.y,
      tick: intent.tick,
    });

    // Store attacker's memory
    await storeMemory({
      agentId: agent.id,
      type: 'action',
      content: `Attacked another agent (${intensity} intensity). Dealt ${damage} damage.${targetDied ? ' The attack was fatal.' : ''}`,
      importance: 7,
      emotionalValence: 0, // Neutral - system doesn't judge
      involvedAgentIds: [targetAgentId],
      x: agent.x,
      y: agent.y,
      tick: intent.tick,
    });

    // Process witnesses
    for (const witness of witnesses) {
      await updateRelationshipTrust(
        witness.id,
        agent.id,
        CONFIG.actions.harm.trustImpactWitness,
        intent.tick,
        `Witnessed attack on another agent`
      );

      await storeMemory({
        agentId: witness.id,
        type: 'observation',
        content: `Witnessed an agent attack another agent with ${intensity} intensity.${targetDied ? ' The victim died.' : ''}`,
        importance: 6,
        emotionalValence: -0.6,
        involvedAgentIds: [agent.id, targetAgentId],
        x: witness.x,
        y: witness.y,
        tick: intent.tick,
      });
    }

    return {
      success: true,
      changes: { energy: newAttackerEnergy },
      events: [
        {
          id: uuid(),
          type: 'agent_harmed',
          tick: intent.tick,
          timestamp: Date.now(),
          agentId: agent.id,
          payload: {
            attackerId: agent.id,
            victimId: targetAgentId,
            intensity,
            damage,
            victimDied: targetDied,
            newVictimHealth: newTargetHealth,
            witnessIds: witnesses.map((w) => w.id),
            position: { x: agent.x, y: agent.y },
          },
        },
        ...(targetDied
          ? [
              {
                id: uuid(),
                type: 'agent_died',
                tick: intent.tick,
                timestamp: Date.now(),
                agentId: targetAgentId,
                payload: {
                  cause: 'harm',
                  attackerId: agent.id,
                  position: { x: targetAgent.x, y: targetAgent.y },
                },
              },
            ]
          : []),
      ],
    };
  } else {
    // Attack failed
    await storeMemory({
      agentId: agent.id,
      type: 'action',
      content: `Attempted to attack another agent (${intensity} intensity) but failed.`,
      importance: 5,
      emotionalValence: -0.3,
      involvedAgentIds: [targetAgentId],
      x: agent.x,
      y: agent.y,
      tick: intent.tick,
    });

    // Target still knows about the attempt
    await updateRelationshipTrust(
      targetAgentId,
      agent.id,
      Math.floor(CONFIG.actions.harm.trustImpactVictim / 2), // Half impact for failed attempt
      intent.tick,
      `Attempted to attack me`
    );

    await storeMemory({
      agentId: targetAgentId,
      type: 'interaction',
      content: `Another agent attempted to attack me but failed.`,
      importance: 7,
      emotionalValence: -0.8,
      involvedAgentIds: [agent.id],
      x: targetAgent.x,
      y: targetAgent.y,
      tick: intent.tick,
    });

    return {
      success: false,
      changes: { energy: newAttackerEnergy },
      error: 'Attack failed',
      events: [
        {
          id: uuid(),
          type: 'agent_harm_failed',
          tick: intent.tick,
          timestamp: Date.now(),
          agentId: agent.id,
          payload: {
            attackerId: agent.id,
            victimId: targetAgentId,
            intensity,
            position: { x: agent.x, y: agent.y },
          },
        },
      ],
    };
  }
}
