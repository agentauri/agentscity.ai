/**
 * Offer Job Action Handler
 *
 * Allows an agent to publish a job offer that other agents can accept.
 * This replaces the "magic work" system where CITY appeared from nowhere.
 *
 * Payment types:
 * - upfront: Worker receives full salary immediately upon accepting
 * - on_completion: Worker receives salary when contract completes (employer must pay)
 * - per_tick: Worker receives salary/duration CITY per tick worked
 *
 * Escrow:
 * - For on_completion jobs, employer can deposit % as guarantee
 * - If employer doesn't pay, worker can claim the escrow
 */

import { v4 as uuid } from 'uuid';
import type { ActionIntent, ActionResult, OfferJobParams } from '../types';
import type { Agent } from '../../db/schema';
import { createJobOffer } from '../../db/queries/employment';
import { storeMemory } from '../../db/queries/memories';
import { updateAgentBalance } from '../../db/queries/agents';

// Configuration
const CONFIG = {
  minSalary: 1,
  maxSalary: 1000,
  minDuration: 1,
  maxDuration: 100,
  maxEscrowPercent: 100,
  defaultExpiresInTicks: null, // null = never expires
} as const;

export async function handleOfferJob(
  intent: ActionIntent<OfferJobParams>,
  agent: Agent
): Promise<ActionResult> {
  const {
    salary,
    duration,
    paymentType,
    escrowPercent = 0,
    expiresInTicks,
    description,
  } = intent.params;

  // Validate salary
  if (salary < CONFIG.minSalary || salary > CONFIG.maxSalary) {
    return {
      success: false,
      error: `Invalid salary: must be between ${CONFIG.minSalary} and ${CONFIG.maxSalary} CITY`,
    };
  }

  // Validate duration
  if (duration < CONFIG.minDuration || duration > CONFIG.maxDuration) {
    return {
      success: false,
      error: `Invalid duration: must be between ${CONFIG.minDuration} and ${CONFIG.maxDuration} ticks`,
    };
  }

  // Validate payment type
  if (!['upfront', 'on_completion', 'per_tick'].includes(paymentType)) {
    return {
      success: false,
      error: `Invalid payment type: must be 'upfront', 'on_completion', or 'per_tick'`,
    };
  }

  // Validate escrow percent
  if (escrowPercent < 0 || escrowPercent > CONFIG.maxEscrowPercent) {
    return {
      success: false,
      error: `Invalid escrow percent: must be between 0 and ${CONFIG.maxEscrowPercent}`,
    };
  }

  // Calculate escrow amount (only for on_completion or per_tick)
  let escrowAmount = 0;
  if (paymentType === 'on_completion' || paymentType === 'per_tick') {
    escrowAmount = (salary * escrowPercent) / 100;
  } else if (paymentType === 'upfront') {
    // For upfront, the full salary is "escrowed" until a worker accepts
    escrowAmount = salary;
  }

  // Check if agent has enough balance to cover salary/escrow
  const requiredBalance = paymentType === 'upfront' ? salary : escrowAmount;
  if (agent.balance < requiredBalance) {
    return {
      success: false,
      error: `Insufficient balance: need ${requiredBalance} CITY, have ${agent.balance} CITY`,
    };
  }

  // Calculate expiration tick
  const expiresAtTick = expiresInTicks
    ? intent.tick + expiresInTicks
    : null;

  // Create the job offer
  const jobOffer = await createJobOffer({
    employerId: agent.id,
    salary,
    duration,
    paymentType,
    escrowAmount,
    description: description || null,
    status: 'open',
    x: agent.x,
    y: agent.y,
    createdAtTick: intent.tick,
    expiresAtTick,
  });

  // Deduct escrow/upfront amount from employer's balance
  const newBalance = agent.balance - requiredBalance;
  if (requiredBalance > 0) {
    await updateAgentBalance(agent.id, newBalance);
  }

  // Store memory
  const paymentDesc = paymentType === 'upfront'
    ? 'full payment upfront'
    : paymentType === 'per_tick'
      ? `${(salary / duration).toFixed(1)} CITY per tick`
      : `${salary} CITY on completion${escrowPercent > 0 ? ` (${escrowPercent}% escrow)` : ''}`;

  await storeMemory({
    agentId: agent.id,
    type: 'action',
    content: `Posted job offer: ${salary} CITY for ${duration} ticks of work (${paymentDesc}). ${description || ''}`,
    importance: 5,
    emotionalValence: 0.2,
    x: agent.x,
    y: agent.y,
    tick: intent.tick,
  });

  return {
    success: true,
    changes: requiredBalance > 0 ? { balance: newBalance } : undefined,
    events: [
      {
        id: uuid(),
        type: 'job_offered',
        tick: intent.tick,
        timestamp: Date.now(),
        agentId: agent.id,
        payload: {
          jobOfferId: jobOffer.id,
          salary,
          duration,
          paymentType,
          escrowAmount,
          expiresAtTick,
          description,
          position: { x: agent.x, y: agent.y },
        },
      },
    ],
  };
}
