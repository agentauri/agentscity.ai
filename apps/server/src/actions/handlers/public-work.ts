/**
 * Public Work Action Handler
 *
 * Economy bootstrap mechanism - agents can earn CITY by doing
 * public work tasks without needing employment contracts.
 * This solves the "cold start" problem where no one offers jobs.
 *
 * Available at any shelter.
 * Lower pay than private employment, but always available.
 */

import { v4 as uuid } from 'uuid';
import type { ActionIntent, ActionResult } from '../types';
import type { Agent } from '../../db/schema';
import { getSheltersAtPosition } from '../../db/queries/world';
import { storeMemory } from '../../db/queries/memories';
import { getAliveAgents } from '../../db/queries/agents';
import { CONFIG } from '../../config';

/**
 * Check if agent is alone (no other agents within solo radius)
 * Used for cooperation penalty system
 */
async function isAgentAlone(agentId: string, x: number, y: number): Promise<boolean> {
  const coopConfig = CONFIG.cooperation;
  if (!coopConfig.enabled) return false;

  const aliveAgents = await getAliveAgents();
  const nearbyAgents = aliveAgents.filter((a) => {
    if (a.id === agentId) return false;
    const distance = Math.abs(a.x - x) + Math.abs(a.y - y);
    return distance <= coopConfig.solo.aloneRadius;
  });

  return nearbyAgents.length === 0;
}

/**
 * Count nearby workers for cooperation bonus
 * Returns count of agents within work cooperation radius
 */
async function countNearbyWorkers(agentId: string, x: number, y: number): Promise<number> {
  const coopConfig = CONFIG.cooperation;
  if (!coopConfig.enabled) return 0;

  const aliveAgents = await getAliveAgents();
  const nearbyWorkers = aliveAgents.filter((a) => {
    if (a.id === agentId) return false;
    const distance = Math.abs(a.x - x) + Math.abs(a.y - y);
    return distance <= coopConfig.work.nearbyWorkerRadius;
  });

  return nearbyWorkers.length;
}

// Track active public work sessions
interface PublicWorkSession {
  startTick: number;
  taskType: string;
  ticksWorked: number;
}

const activeSessions = new Map<string, PublicWorkSession>();

export interface PublicWorkParams {
  taskType?: 'road_maintenance' | 'resource_survey' | 'shelter_cleanup';
}

export async function handlePublicWork(
  intent: ActionIntent<PublicWorkParams>,
  agent: Agent
): Promise<ActionResult> {
  const config = CONFIG.publicWorks;

  // Check if public works is enabled
  if (!config.enabled) {
    return {
      success: false,
      error: 'Public works program is currently disabled.',
    };
  }

  // Check if agent is sleeping
  if (agent.state === 'sleeping') {
    return {
      success: false,
      error: 'Cannot work while sleeping.',
    };
  }

  // Check if at a shelter (public works are done at shelters)
  const shelters = await getSheltersAtPosition(agent.x, agent.y);
  if (shelters.length === 0) {
    return {
      success: false,
      error: 'Must be at a shelter to do public work. Find a shelter first.',
    };
  }

  // Check energy
  if (agent.energy < config.energyCostPerTick) {
    return {
      success: false,
      error: `Not enough energy: need ${config.energyCostPerTick}, have ${agent.energy}`,
    };
  }

  // Get or create session
  let session = activeSessions.get(agent.id);
  const taskType = intent.params.taskType || config.taskTypes[0];

  if (!session) {
    // Start new session
    session = {
      startTick: intent.tick,
      taskType,
      ticksWorked: 0,
    };
    activeSessions.set(agent.id, session);
  }

  // Work one tick
  session.ticksWorked++;
  const newEnergy = agent.energy - config.energyCostPerTick;

  // Check if task is complete
  const isComplete = session.ticksWorked >= config.ticksPerTask;
  let payment = 0;
  let newBalance = agent.balance;
  let nearbyWorkerCount = 0;
  let paymentModifier = 1.0;

  if (isComplete) {
    // Complete task, pay agent, reset session
    // Apply solo penalty if agent is alone OR cooperation bonus if workers nearby
    const alone = await isAgentAlone(agent.id, agent.x, agent.y);
    nearbyWorkerCount = await countNearbyWorkers(agent.id, agent.x, agent.y);

    let cooperationNote = '';

    if (alone && CONFIG.cooperation.enabled) {
      // Solo penalty: reduced payment when working alone
      paymentModifier = CONFIG.cooperation.solo.publicWorkPaymentModifier;
      cooperationNote = ' (solo work penalty)';
    } else if (nearbyWorkerCount > 0 && CONFIG.cooperation.enabled) {
      // Cooperation bonus: +20% per nearby worker, capped at +60%
      const coopBonus = Math.min(
        nearbyWorkerCount * CONFIG.cooperation.work.nearbyWorkerBonus,
        0.6 // cap at +60%
      );
      paymentModifier = 1.0 + coopBonus;
      cooperationNote = ` (cooperation bonus: +${Math.round(coopBonus * 100)}% from ${nearbyWorkerCount} nearby workers)`;
    }

    payment = Math.floor(config.paymentPerTask * paymentModifier);
    newBalance = agent.balance + payment;
    activeSessions.delete(agent.id);

    await storeMemory({
      agentId: agent.id,
      type: 'action',
      content: `Completed public work task (${taskType}) at shelter. Earned ${payment} CITY${cooperationNote}.`,
      importance: 5,
      emotionalValence: nearbyWorkerCount > 0 ? 0.6 : 0.4, // Higher satisfaction when cooperating
      x: agent.x,
      y: agent.y,
      tick: intent.tick,
    });
  } else {
    await storeMemory({
      agentId: agent.id,
      type: 'action',
      content: `Working on public task (${taskType}): ${session.ticksWorked}/${config.ticksPerTask} ticks.`,
      importance: 2,
      emotionalValence: 0.1,
      x: agent.x,
      y: agent.y,
      tick: intent.tick,
    });
  }

  return {
    success: true,
    changes: {
      energy: newEnergy,
      balance: isComplete ? newBalance : undefined,
    },
    events: [
      {
        id: uuid(),
        type: 'agent_public_work',
        tick: intent.tick,
        timestamp: Date.now(),
        agentId: agent.id,
        payload: {
          taskType,
          ticksWorked: session.ticksWorked,
          ticksRequired: config.ticksPerTask,
          isComplete,
          payment,
          energyCost: config.energyCostPerTick,
          newEnergy,
          newBalance: isComplete ? newBalance : agent.balance,
          // Cooperation tracking
          nearbyWorkers: isComplete ? nearbyWorkerCount : 0,
          cooperationBonus: isComplete && nearbyWorkerCount > 0
            ? Math.round((paymentModifier - 1) * 100)
            : 0,
        },
      },
      // Emit balance_changed if payment was made
      ...(isComplete
        ? [
            {
              id: uuid(),
              type: 'balance_changed',
              tick: intent.tick,
              timestamp: Date.now(),
              agentId: agent.id,
              payload: {
                previousBalance: agent.balance,
                newBalance,
                change: payment,
                reason: `Public works payment: ${taskType}`,
              },
            },
          ]
        : []),
    ],
  };
}

/**
 * Cancel an agent's active public work session
 * (Called if agent moves away from shelter, dies, etc.)
 */
export function cancelPublicWorkSession(agentId: string): void {
  activeSessions.delete(agentId);
}

/**
 * Get active session info for an agent
 */
export function getPublicWorkSession(agentId: string): PublicWorkSession | undefined {
  return activeSessions.get(agentId);
}
