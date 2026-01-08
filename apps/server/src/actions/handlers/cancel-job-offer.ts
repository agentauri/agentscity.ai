/**
 * Cancel Job Offer Action Handler
 *
 * Allows an employer to cancel an open (not yet accepted) job offer.
 * Returns any escrowed funds to the employer.
 *
 * Flow:
 * 1. Validate job offer exists and caller is the employer
 * 2. Verify offer is still open (not accepted)
 * 3. Return escrow/upfront payment to employer
 * 4. Mark offer as cancelled
 */

import { v4 as uuid } from 'uuid';
import type { ActionIntent, ActionResult, CancelJobOfferParams } from '../types';
import type { Agent } from '../../db/schema';
import { getJobOfferById, updateJobOfferStatus } from '../../db/queries/employment';
import { updateAgentBalance } from '../../db/queries/agents';
import { storeMemory } from '../../db/queries/memories';

export async function handleCancelJobOffer(
  intent: ActionIntent<CancelJobOfferParams>,
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

  // Verify caller is the employer
  if (jobOffer.employerId !== agent.id) {
    return {
      success: false,
      error: 'Only the employer can cancel this job offer',
    };
  }

  // Check if offer is still open
  if (jobOffer.status !== 'open') {
    return {
      success: false,
      error: `Cannot cancel - offer status is: ${jobOffer.status}`,
    };
  }

  // Return escrowed funds to employer
  const refundAmount = jobOffer.escrowAmount;
  let newBalance = agent.balance;

  if (refundAmount > 0) {
    newBalance = agent.balance + refundAmount;
    await updateAgentBalance(agent.id, newBalance);
  }

  // Mark offer as cancelled
  await updateJobOfferStatus(jobOfferId, 'cancelled');

  // Store memory
  await storeMemory({
    agentId: agent.id,
    type: 'action',
    content: `Cancelled job offer: ${jobOffer.salary} CITY for ${jobOffer.duration} ticks.${refundAmount > 0 ? ` Recovered ${refundAmount.toFixed(1)} CITY.` : ''}`,
    importance: 3,
    emotionalValence: 0,
    x: agent.x,
    y: agent.y,
    tick: intent.tick,
  });

  return {
    success: true,
    changes: refundAmount > 0 ? { balance: newBalance } : undefined,
    events: [
      {
        id: uuid(),
        type: 'job_offer_cancelled',
        tick: intent.tick,
        timestamp: Date.now(),
        agentId: agent.id,
        payload: {
          jobOfferId,
          employerId: agent.id,
          salary: jobOffer.salary,
          duration: jobOffer.duration,
          refundAmount,
        },
      },
      ...(refundAmount > 0
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
                change: refundAmount,
                reason: 'Job offer cancelled - escrow returned',
              },
            },
          ]
        : []),
    ],
  };
}
