/**
 * Accept Job Action Handler
 *
 * Allows an agent to accept an open job offer and create an employment contract.
 *
 * Flow:
 * 1. Validate job offer exists and is open
 * 2. Create employment record
 * 3. Update job offer status to 'accepted'
 * 4. If upfront payment, transfer salary to worker immediately
 * 5. Store memories for both parties
 * 6. Update trust relationships
 */

import { v4 as uuid } from 'uuid';
import type { ActionIntent, ActionResult, AcceptJobParams } from '../types';
import type { Agent } from '../../db/schema';
import {
  getJobOfferById,
  updateJobOfferStatus,
  createEmployment,
} from '../../db/queries/employment';
import { getAgentById, updateAgentBalance } from '../../db/queries/agents';
import { storeMemory, updateRelationshipTrust } from '../../db/queries/memories';

export async function handleAcceptJob(
  intent: ActionIntent<AcceptJobParams>,
  agent: Agent
): Promise<ActionResult> {
  const { jobOfferId } = intent.params;

  // Get the job offer
  const jobOffer = await getJobOfferById(jobOfferId);
  if (!jobOffer) {
    return {
      success: false,
      error: `Job offer not found: ${jobOfferId}`,
    };
  }

  // Check if offer is still open
  if (jobOffer.status !== 'open') {
    return {
      success: false,
      error: `Job offer is no longer available (status: ${jobOffer.status})`,
    };
  }

  // Check if offer has expired
  if (jobOffer.expiresAtTick && intent.tick > jobOffer.expiresAtTick) {
    await updateJobOfferStatus(jobOfferId, 'expired');
    return {
      success: false,
      error: `Job offer has expired`,
    };
  }

  // Can't accept your own job offer
  if (jobOffer.employerId === agent.id) {
    return {
      success: false,
      error: `Cannot accept your own job offer`,
    };
  }

  // Get employer for balance updates
  const employer = await getAgentById(jobOffer.employerId);
  if (!employer || employer.state === 'dead') {
    await updateJobOfferStatus(jobOfferId, 'cancelled');
    return {
      success: false,
      error: `Employer is no longer available`,
    };
  }

  // Create the employment contract
  const employment = await createEmployment({
    jobOfferId: jobOffer.id,
    employerId: jobOffer.employerId,
    workerId: agent.id,
    salary: jobOffer.salary,
    paymentType: jobOffer.paymentType,
    escrowAmount: jobOffer.escrowAmount,
    ticksRequired: jobOffer.duration,
    ticksWorked: 0,
    amountPaid: 0,
    status: 'active',
    startedAtTick: intent.tick,
  });

  // Update job offer status
  await updateJobOfferStatus(jobOfferId, 'accepted');

  // Handle payment based on type
  let workerBalanceChange = 0;
  if (jobOffer.paymentType === 'upfront') {
    // Transfer full salary to worker immediately
    // The escrow (full salary) was already deducted from employer when offer was created
    workerBalanceChange = jobOffer.salary;
    await updateAgentBalance(agent.id, agent.balance + workerBalanceChange);
  }

  // Store memories for both parties
  const paymentDesc = jobOffer.paymentType === 'upfront'
    ? 'received payment upfront'
    : jobOffer.paymentType === 'per_tick'
      ? 'will be paid per tick'
      : 'will be paid on completion';

  await storeMemory({
    agentId: agent.id,
    type: 'interaction',
    content: `Accepted job from ${employer.id.slice(0, 8)}: ${jobOffer.salary} CITY for ${jobOffer.duration} ticks (${paymentDesc}). ${jobOffer.description || ''}`,
    importance: 6,
    emotionalValence: 0.4,
    involvedAgentIds: [employer.id],
    x: agent.x,
    y: agent.y,
    tick: intent.tick,
  });

  await storeMemory({
    agentId: employer.id,
    type: 'interaction',
    content: `${agent.id.slice(0, 8)} accepted job offer: ${jobOffer.salary} CITY for ${jobOffer.duration} ticks. Contract started.`,
    importance: 6,
    emotionalValence: 0.4,
    involvedAgentIds: [agent.id],
    x: jobOffer.x,
    y: jobOffer.y,
    tick: intent.tick,
  });

  // Update trust - accepting a job shows initial trust
  await updateRelationshipTrust(agent.id, employer.id, 5, intent.tick);
  await updateRelationshipTrust(employer.id, agent.id, 5, intent.tick);

  return {
    success: true,
    changes: workerBalanceChange > 0 ? { balance: agent.balance + workerBalanceChange } : undefined,
    events: [
      {
        id: uuid(),
        type: 'job_accepted',
        tick: intent.tick,
        timestamp: Date.now(),
        agentId: agent.id,
        payload: {
          employmentId: employment.id,
          jobOfferId: jobOffer.id,
          employerId: employer.id,
          workerId: agent.id,
          salary: jobOffer.salary,
          duration: jobOffer.duration,
          paymentType: jobOffer.paymentType,
          escrowAmount: jobOffer.escrowAmount,
          upfrontPayment: workerBalanceChange > 0 ? workerBalanceChange : undefined,
        },
      },
    ],
  };
}
