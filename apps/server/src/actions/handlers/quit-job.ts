/**
 * Quit Job Action Handler
 *
 * Allows a worker to quit an active employment contract.
 * This incurs a trust penalty since the contract is broken.
 *
 * Flow:
 * 1. Validate employment exists and caller is the worker
 * 2. Mark employment as abandoned
 * 3. Apply trust penalty to worker
 * 4. Return any worker-held escrow to employer (if applicable)
 */

import { v4 as uuid } from 'uuid';
import type { ActionIntent, ActionResult, QuitJobParams } from '../types';
import type { Agent } from '../../db/schema';
import { getEmploymentById, updateEmploymentStatus } from '../../db/queries/employment';
import { getAgentById, updateAgentBalance } from '../../db/queries/agents';
import { storeMemory, updateRelationshipTrust } from '../../db/queries/memories';

export async function handleQuitJob(
  intent: ActionIntent<QuitJobParams>,
  agent: Agent
): Promise<ActionResult> {
  const { employmentId } = intent.params;

  // Get the employment record
  const employment = await getEmploymentById(employmentId);
  if (!employment) {
    return {
      success: false,
      error: `Employment not found: ${employmentId}`,
    };
  }

  // Verify caller is the worker
  if (employment.workerId !== agent.id) {
    return {
      success: false,
      error: 'Only the worker can quit this contract',
    };
  }

  // Check if employment is still active
  if (employment.status !== 'active') {
    return {
      success: false,
      error: `Cannot quit - contract status is: ${employment.status}`,
    };
  }

  // Get employer for trust updates
  const employer = await getAgentById(employment.employerId);

  // Mark employment as abandoned
  await updateEmploymentStatus(employment.id, 'abandoned', intent.tick);

  // Apply trust penalty - quitting is bad for reputation
  if (employer) {
    await updateRelationshipTrust(agent.id, employer.id, -15, intent.tick, 'Quit job early');
    await updateRelationshipTrust(employer.id, agent.id, -20, intent.tick, 'Worker abandoned contract');
  }

  // Store memories
  const progressPercent = Math.round((employment.ticksWorked / employment.ticksRequired) * 100);

  await storeMemory({
    agentId: agent.id,
    type: 'action',
    content: `Quit job with ${employer?.id.slice(0, 8) || 'unknown'} at ${progressPercent}% complete. Earned ${employment.amountPaid.toFixed(1)} of ${employment.salary} CITY.`,
    importance: 6,
    emotionalValence: -0.2,
    involvedAgentIds: employer ? [employer.id] : [],
    x: agent.x,
    y: agent.y,
    tick: intent.tick,
  });

  if (employer) {
    await storeMemory({
      agentId: employer.id,
      type: 'interaction',
      content: `${agent.id.slice(0, 8)} quit the job at ${progressPercent}% complete. Contract abandoned.`,
      importance: 7,
      emotionalValence: -0.4,
      involvedAgentIds: [agent.id],
      x: employer.x,
      y: employer.y,
      tick: intent.tick,
    });
  }

  return {
    success: true,
    events: [
      {
        id: uuid(),
        type: 'worker_quit',
        tick: intent.tick,
        timestamp: Date.now(),
        agentId: agent.id,
        payload: {
          employmentId,
          workerId: agent.id,
          employerId: employment.employerId,
          ticksWorked: employment.ticksWorked,
          ticksRequired: employment.ticksRequired,
          amountPaid: employment.amountPaid,
          salary: employment.salary,
        },
      },
    ],
  };
}
