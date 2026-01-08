/**
 * Pay Worker Action Handler
 *
 * Allows an employer to pay a worker for a completed on_completion contract.
 *
 * Flow:
 * 1. Validate employment exists and is complete
 * 2. Verify caller is the employer
 * 3. Check employer has funds
 * 4. Transfer remaining salary to worker
 * 5. Mark employment as completed
 * 6. Return escrow to employer
 * 7. Update trust relationships
 */

import { v4 as uuid } from 'uuid';
import type { ActionIntent, ActionResult, PayWorkerParams } from '../types';
import type { Agent } from '../../db/schema';
import {
  getEmploymentById,
  updateEmploymentStatus,
} from '../../db/queries/employment';
import { getAgentById, updateAgentBalance } from '../../db/queries/agents';
import { storeMemory, updateRelationshipTrust } from '../../db/queries/memories';
import { db } from '../../db';
import { sql } from 'drizzle-orm';

export async function handlePayWorker(
  intent: ActionIntent<PayWorkerParams>,
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
      error: 'Only the employer can pay for this contract',
    };
  }

  // Check if this is an on_completion contract
  if (employment.paymentType !== 'on_completion') {
    return {
      success: false,
      error: `This contract uses ${employment.paymentType} payment. Manual payment not required.`,
    };
  }

  // Check if work is complete
  if (employment.ticksWorked < employment.ticksRequired) {
    return {
      success: false,
      error: `Work not complete: ${employment.ticksWorked}/${employment.ticksRequired} ticks done`,
    };
  }

  // Check if already paid
  if (employment.status === 'completed') {
    return {
      success: false,
      error: 'This contract has already been paid',
    };
  }

  // Get worker for balance update
  const worker = await getAgentById(employment.workerId);
  if (!worker) {
    return {
      success: false,
      error: 'Worker not found',
    };
  }

  // Calculate remaining amount to pay
  const remainingPayment = employment.salary - employment.amountPaid;

  // Check if employer has funds
  if (agent.balance < remainingPayment) {
    return {
      success: false,
      error: `Insufficient funds: need ${remainingPayment.toFixed(1)} CITY, have ${agent.balance.toFixed(1)} CITY`,
    };
  }

  // Transfer payment to worker
  const newEmployerBalance = agent.balance - remainingPayment;
  const newWorkerBalance = worker.balance + remainingPayment;

  await updateAgentBalance(agent.id, newEmployerBalance);
  await updateAgentBalance(worker.id, newWorkerBalance);

  // Return escrow to employer
  const escrowReturn = employment.escrowAmount;
  if (escrowReturn > 0) {
    await updateAgentBalance(agent.id, newEmployerBalance + escrowReturn);
  }

  // Update employment record
  await db.execute(sql`
    UPDATE employments
    SET status = 'completed',
        amount_paid = ${employment.salary},
        ended_at_tick = ${intent.tick},
        updated_at = NOW()
    WHERE id = ${employmentId}
  `);

  // Update trust - successful payment is good for reputation
  await updateRelationshipTrust(agent.id, worker.id, 15, intent.tick, 'Paid worker as promised');
  await updateRelationshipTrust(worker.id, agent.id, 15, intent.tick, 'Employer paid as promised');

  // Store memories
  await storeMemory({
    agentId: agent.id,
    type: 'action',
    content: `Paid ${worker.id.slice(0, 8)} ${remainingPayment.toFixed(1)} CITY for completed work. Escrow of ${escrowReturn.toFixed(1)} returned.`,
    importance: 6,
    emotionalValence: 0.3,
    involvedAgentIds: [worker.id],
    x: agent.x,
    y: agent.y,
    tick: intent.tick,
  });

  await storeMemory({
    agentId: worker.id,
    type: 'interaction',
    content: `Received ${remainingPayment.toFixed(1)} CITY payment from ${agent.id.slice(0, 8)} for completed contract.`,
    importance: 6,
    emotionalValence: 0.5,
    involvedAgentIds: [agent.id],
    x: worker.x,
    y: worker.y,
    tick: intent.tick,
  });

  const finalEmployerBalance = escrowReturn > 0 ? newEmployerBalance + escrowReturn : newEmployerBalance;

  return {
    success: true,
    changes: { balance: finalEmployerBalance },
    events: [
      {
        id: uuid(),
        type: 'worker_paid',
        tick: intent.tick,
        timestamp: Date.now(),
        agentId: agent.id,
        payload: {
          employmentId,
          workerId: worker.id,
          employerId: agent.id,
          amountPaid: remainingPayment,
          totalPaid: employment.salary,
          escrowReturned: escrowReturn,
        },
      },
      {
        id: uuid(),
        type: 'balance_changed',
        tick: intent.tick,
        timestamp: Date.now(),
        agentId: worker.id,
        payload: {
          previousBalance: worker.balance,
          newBalance: newWorkerBalance,
          change: remainingPayment,
          reason: `Payment from ${agent.id.slice(0, 8)} for completed work`,
        },
      },
      {
        id: uuid(),
        type: 'employment_completed',
        tick: intent.tick,
        timestamp: Date.now(),
        agentId: agent.id,
        payload: {
          employmentId,
          employerId: agent.id,
          workerId: worker.id,
          totalPaid: employment.salary,
          salary: employment.salary,
          paymentType: employment.paymentType,
        },
      },
    ],
  };
}
