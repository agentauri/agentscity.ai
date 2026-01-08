/**
 * Fire Worker Action Handler
 *
 * Allows an employer to fire a worker from an active employment contract.
 * This incurs a trust penalty since the contract is broken.
 *
 * Flow:
 * 1. Validate employment exists and caller is the employer
 * 2. Mark employment as fired
 * 3. Pay worker for work already done (pro-rated)
 * 4. Apply trust penalty to employer
 */

import { v4 as uuid } from 'uuid';
import type { ActionIntent, ActionResult, FireWorkerParams } from '../types';
import type { Agent } from '../../db/schema';
import { getEmploymentById, updateEmploymentStatus } from '../../db/queries/employment';
import { getAgentById, updateAgentBalance } from '../../db/queries/agents';
import { storeMemory, updateRelationshipTrust } from '../../db/queries/memories';
import { db } from '../../db';
import { sql } from 'drizzle-orm';

export async function handleFireWorker(
  intent: ActionIntent<FireWorkerParams>,
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

  // Verify caller is the employer
  if (employment.employerId !== agent.id) {
    return {
      success: false,
      error: 'Only the employer can fire from this contract',
    };
  }

  // Check if employment is still active
  if (employment.status !== 'active') {
    return {
      success: false,
      error: `Cannot fire - contract status is: ${employment.status}`,
    };
  }

  // Get worker for payments and trust updates
  const worker = await getAgentById(employment.workerId);
  if (!worker) {
    // Worker doesn't exist anymore, just close the contract
    await updateEmploymentStatus(employment.id, 'fired', intent.tick);
    return {
      success: true,
      events: [
        {
          id: uuid(),
          type: 'worker_fired',
          tick: intent.tick,
          timestamp: Date.now(),
          agentId: agent.id,
          payload: {
            employmentId,
            workerId: employment.workerId,
            employerId: agent.id,
            reason: 'Worker no longer exists',
          },
        },
      ],
    };
  }

  // Calculate severance pay (pay for work already done if on_completion)
  let severancePay = 0;
  if (employment.paymentType === 'on_completion' && employment.ticksWorked > 0) {
    // Pro-rate the salary for work completed
    severancePay = (employment.salary * employment.ticksWorked) / employment.ticksRequired;
    severancePay = Math.min(severancePay, agent.balance); // Can't pay more than we have
  }

  // Transfer severance to worker
  let newEmployerBalance = agent.balance;
  if (severancePay > 0) {
    newEmployerBalance = agent.balance - severancePay;
    await updateAgentBalance(agent.id, newEmployerBalance);
    await updateAgentBalance(worker.id, worker.balance + severancePay);
  }

  // Return escrow to employer (minus severance already paid)
  const escrowReturn = employment.escrowAmount;
  if (escrowReturn > 0) {
    newEmployerBalance += escrowReturn;
    await updateAgentBalance(agent.id, newEmployerBalance);
  }

  // Mark employment as fired
  await db.execute(sql`
    UPDATE employments
    SET status = 'fired',
        amount_paid = ${employment.amountPaid + severancePay},
        ended_at_tick = ${intent.tick},
        updated_at = NOW()
    WHERE id = ${employmentId}
  `);

  // Apply trust penalty - firing is bad for employer reputation
  await updateRelationshipTrust(agent.id, worker.id, -20, intent.tick, 'Fired worker before contract complete');
  await updateRelationshipTrust(worker.id, agent.id, -15, intent.tick, 'Was fired from job');

  // Store memories
  const progressPercent = Math.round((employment.ticksWorked / employment.ticksRequired) * 100);

  await storeMemory({
    agentId: agent.id,
    type: 'action',
    content: `Fired ${worker.id.slice(0, 8)} at ${progressPercent}% complete.${severancePay > 0 ? ` Paid ${severancePay.toFixed(1)} CITY severance.` : ''}`,
    importance: 6,
    emotionalValence: -0.2,
    involvedAgentIds: [worker.id],
    x: agent.x,
    y: agent.y,
    tick: intent.tick,
  });

  await storeMemory({
    agentId: worker.id,
    type: 'interaction',
    content: `Was fired by ${agent.id.slice(0, 8)} at ${progressPercent}% complete.${severancePay > 0 ? ` Received ${severancePay.toFixed(1)} CITY severance.` : ''}`,
    importance: 7,
    emotionalValence: -0.5,
    involvedAgentIds: [agent.id],
    x: worker.x,
    y: worker.y,
    tick: intent.tick,
  });

  return {
    success: true,
    changes: newEmployerBalance !== agent.balance ? { balance: newEmployerBalance } : undefined,
    events: [
      {
        id: uuid(),
        type: 'worker_fired',
        tick: intent.tick,
        timestamp: Date.now(),
        agentId: agent.id,
        payload: {
          employmentId,
          workerId: worker.id,
          employerId: agent.id,
          ticksWorked: employment.ticksWorked,
          ticksRequired: employment.ticksRequired,
          severancePaid: severancePay,
          escrowReturned: escrowReturn,
        },
      },
      ...(severancePay > 0
        ? [
            {
              id: uuid(),
              type: 'balance_changed',
              tick: intent.tick,
              timestamp: Date.now(),
              agentId: worker.id,
              payload: {
                previousBalance: worker.balance,
                newBalance: worker.balance + severancePay,
                change: severancePay,
                reason: `Severance from ${agent.id.slice(0, 8)}`,
              },
            },
          ]
        : []),
    ],
  };
}
