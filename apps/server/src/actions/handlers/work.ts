/**
 * Work Action Handler
 *
 * EMPLOYMENT SYSTEM: Work now requires an active employment contract.
 * No more "magic work" that creates CITY from nowhere!
 *
 * Flow:
 * 1. Check agent has active employment
 * 2. Deduct energy/hunger costs
 * 3. Increment ticks_worked on employment
 * 4. Handle payment based on payment_type:
 *    - per_tick: Pay worker salary/duration each tick
 *    - on_completion: No payment until complete
 *    - upfront: Already paid at acceptance
 * 5. Check if contract is completed
 * 6. Update trust on completion
 */

import { v4 as uuid } from 'uuid';
import type { ActionIntent, ActionResult, WorkParams } from '../types';
import type { Agent } from '../../db/schema';
import { storeMemory, updateRelationshipTrust } from '../../db/queries/memories';
import {
  getOldestActiveEmployment,
  updateEmploymentStatus,
} from '../../db/queries/employment';
import { getAgentById, updateAgentBalance } from '../../db/queries/agents';
import { db } from '../../db';
import { sql } from 'drizzle-orm';

// Work configuration
const CONFIG = {
  energyCostPerTick: 2,
  hungerCostPerTick: 0.5, // Working makes you hungry
} as const;

export async function handleWork(
  intent: ActionIntent<WorkParams>,
  agent: Agent
): Promise<ActionResult> {
  // Check if agent is sleeping (can't work while asleep)
  if (agent.state === 'sleeping') {
    return {
      success: false,
      error: 'Agent is sleeping and cannot work',
    };
  }

  // Check if agent has enough energy
  if (agent.energy < CONFIG.energyCostPerTick) {
    return {
      success: false,
      error: `Not enough energy: need ${CONFIG.energyCostPerTick}, have ${agent.energy}`,
    };
  }

  // CRITICAL: Check if agent has active employment
  const employment = await getOldestActiveEmployment(agent.id);
  if (!employment) {
    return {
      success: false,
      error: 'No active employment. Accept a job offer first (use accept_job action).',
    };
  }

  // Get employer for payment handling
  const employer = await getAgentById(employment.employerId);
  if (!employer || employer.state === 'dead') {
    // Employer died - contract abandoned, worker keeps any escrow
    await updateEmploymentStatus(employment.id, 'abandoned', intent.tick);
    return {
      success: false,
      error: 'Employer is no longer available. Contract abandoned.',
    };
  }

  // Calculate costs
  const energyCost = CONFIG.energyCostPerTick;
  const hungerCost = CONFIG.hungerCostPerTick;
  const newEnergy = agent.energy - energyCost;
  const newHunger = Math.max(0, agent.hunger - hungerCost);

  // Calculate payment for this tick (if per_tick)
  let paymentThisTick = 0;
  if (employment.paymentType === 'per_tick') {
    paymentThisTick = employment.salary / employment.ticksRequired;

    // Check if employer has funds for per_tick payment
    if (employer.balance < paymentThisTick) {
      // Employer can't pay - terminate contract with penalty
      await updateEmploymentStatus(employment.id, 'unpaid', intent.tick);
      await updateRelationshipTrust(agent.id, employer.id, -20, intent.tick, 'Employer failed to pay');
      await updateRelationshipTrust(employer.id, agent.id, -10, intent.tick, 'Could not pay worker');
      return {
        success: false,
        error: `Employer cannot afford payment (${paymentThisTick.toFixed(1)} CITY). Contract terminated.`,
      };
    }

    // Deduct from employer, add to worker
    await updateAgentBalance(employer.id, employer.balance - paymentThisTick);
  }

  // Increment ticks_worked on employment
  const newTicksWorked = employment.ticksWorked + 1;
  const newAmountPaid = employment.amountPaid + paymentThisTick;

  await db.execute(sql`
    UPDATE employments
    SET ticks_worked = ${newTicksWorked},
        amount_paid = ${newAmountPaid},
        updated_at = NOW()
    WHERE id = ${employment.id}
  `);

  // Check if contract is now complete
  const isComplete = newTicksWorked >= employment.ticksRequired;
  let newWorkerBalance = agent.balance + paymentThisTick;

  if (isComplete) {
    // Mark contract as completed
    await updateEmploymentStatus(employment.id, 'completed', intent.tick);

    // Update trust - successful completion is good for both parties
    await updateRelationshipTrust(agent.id, employment.employerId, 10, intent.tick, 'Completed job successfully');
    await updateRelationshipTrust(employment.employerId, agent.id, 10, intent.tick, 'Worker completed job');

    // Return escrow to employer (minus any owed payment)
    if (employment.paymentType !== 'upfront' && employment.escrowAmount > 0) {
      const escrowReturn = employment.escrowAmount;
      await updateAgentBalance(employer.id, employer.balance - paymentThisTick + escrowReturn);
    }
  }

  // Update worker balance (for per_tick payments)
  if (paymentThisTick > 0) {
    await updateAgentBalance(agent.id, newWorkerBalance);
  }

  // Store memory
  const statusMsg = isComplete
    ? `Completed contract with ${employer.id.slice(0, 8)}!`
    : `Worked tick ${newTicksWorked}/${employment.ticksRequired} for ${employer.id.slice(0, 8)}.`;

  await storeMemory({
    agentId: agent.id,
    type: 'action',
    content: `${statusMsg}${paymentThisTick > 0 ? ` Earned ${paymentThisTick.toFixed(1)} CITY.` : ''}`,
    importance: isComplete ? 6 : 3,
    emotionalValence: isComplete ? 0.5 : 0.2,
    involvedAgentIds: [employer.id],
    x: agent.x,
    y: agent.y,
    tick: intent.tick,
  });

  // Employer memory
  await storeMemory({
    agentId: employer.id,
    type: 'interaction',
    content: `${agent.id.slice(0, 8)} worked: ${newTicksWorked}/${employment.ticksRequired} ticks.${isComplete ? ' Contract completed!' : ''}`,
    importance: isComplete ? 5 : 2,
    emotionalValence: isComplete ? 0.4 : 0.1,
    involvedAgentIds: [agent.id],
    x: agent.x,
    y: agent.y,
    tick: intent.tick,
  });

  return {
    success: true,
    changes: {
      energy: newEnergy,
      hunger: newHunger,
      balance: paymentThisTick > 0 ? newWorkerBalance : undefined,
    },
    events: [
      {
        id: uuid(),
        type: 'agent_worked',
        tick: intent.tick,
        timestamp: Date.now(),
        agentId: agent.id,
        payload: {
          employmentId: employment.id,
          employerId: employer.id,
          ticksWorked: newTicksWorked,
          ticksRequired: employment.ticksRequired,
          paymentThisTick,
          paymentType: employment.paymentType,
          isComplete,
          energyCost,
          hungerCost,
          newEnergy,
          newHunger,
        },
      },
      // Emit balance_changed if there was payment
      ...(paymentThisTick > 0
        ? [
            {
              id: uuid(),
              type: 'balance_changed',
              tick: intent.tick,
              timestamp: Date.now(),
              agentId: agent.id,
              payload: {
                previousBalance: agent.balance,
                newBalance: newWorkerBalance,
                change: paymentThisTick,
                reason: `Work payment from ${employer.id.slice(0, 8)}`,
              },
            },
          ]
        : []),
      // Emit completion event
      ...(isComplete
        ? [
            {
              id: uuid(),
              type: 'employment_completed',
              tick: intent.tick,
              timestamp: Date.now(),
              agentId: agent.id,
              payload: {
                employmentId: employment.id,
                employerId: employer.id,
                workerId: agent.id,
                totalPaid: newAmountPaid,
                salary: employment.salary,
                paymentType: employment.paymentType,
              },
            },
          ]
        : []),
    ],
  };
}
