/**
 * Employment System Queries
 *
 * CRUD operations for job_offers and employments tables.
 * Supports the employer/worker economic system.
 */

import { eq, and, or, lte, gte, isNull, sql } from 'drizzle-orm';
import { db } from '../index';
import {
  jobOffers,
  employments,
  agents,
  type JobOffer,
  type NewJobOffer,
  type Employment,
  type NewEmployment,
} from '../schema';

// =============================================================================
// JOB OFFERS
// =============================================================================

/**
 * Create a new job offer
 */
export async function createJobOffer(offer: NewJobOffer): Promise<JobOffer> {
  const [created] = await db.insert(jobOffers).values(offer).returning();
  return created;
}

/**
 * Get job offer by ID
 */
export async function getJobOfferById(id: string): Promise<JobOffer | undefined> {
  const [offer] = await db.select().from(jobOffers).where(eq(jobOffers.id, id));
  return offer;
}

/**
 * Get all open job offers near a position (within visibility radius)
 */
export async function getOpenJobOffersNearPosition(
  x: number,
  y: number,
  radius: number,
  currentTick: number
): Promise<JobOffer[]> {
  // Get all open offers, then filter by distance in JS (simpler than SQL distance calc)
  const offers = await db
    .select()
    .from(jobOffers)
    .where(
      and(
        eq(jobOffers.status, 'open'),
        or(
          isNull(jobOffers.expiresAtTick),
          gte(jobOffers.expiresAtTick, currentTick)
        )
      )
    );

  // Filter by Manhattan distance
  return offers.filter((offer) => {
    const distance = Math.abs(offer.x - x) + Math.abs(offer.y - y);
    return distance <= radius;
  });
}

/**
 * Get all open job offers by employer
 */
export async function getOpenJobOffersByEmployer(employerId: string): Promise<JobOffer[]> {
  return db
    .select()
    .from(jobOffers)
    .where(and(eq(jobOffers.employerId, employerId), eq(jobOffers.status, 'open')));
}

/**
 * Update job offer status
 */
export async function updateJobOfferStatus(
  id: string,
  status: 'open' | 'accepted' | 'cancelled' | 'expired'
): Promise<void> {
  await db
    .update(jobOffers)
    .set({ status, updatedAt: new Date() })
    .where(eq(jobOffers.id, id));
}

/**
 * Expire all offers past their expiration tick
 */
export async function expireJobOffers(currentTick: number): Promise<number> {
  // Find offers to expire first, then update them
  const offersToExpire = await db
    .select({ id: jobOffers.id })
    .from(jobOffers)
    .where(
      and(
        eq(jobOffers.status, 'open'),
        lte(jobOffers.expiresAtTick, currentTick)
      )
    );

  if (offersToExpire.length === 0) {
    return 0;
  }

  // Update each expired offer
  for (const offer of offersToExpire) {
    await db
      .update(jobOffers)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(eq(jobOffers.id, offer.id));
  }

  return offersToExpire.length;
}

// =============================================================================
// EMPLOYMENTS
// =============================================================================

/**
 * Create a new employment contract
 */
export async function createEmployment(employment: NewEmployment): Promise<Employment> {
  const [created] = await db.insert(employments).values(employment).returning();
  return created;
}

/**
 * Get employment by ID
 */
export async function getEmploymentById(id: string): Promise<Employment | undefined> {
  const [employment] = await db.select().from(employments).where(eq(employments.id, id));
  return employment;
}

/**
 * Get active employments for a worker
 */
export async function getActiveEmploymentsForWorker(workerId: string): Promise<Employment[]> {
  return db
    .select()
    .from(employments)
    .where(and(eq(employments.workerId, workerId), eq(employments.status, 'active')));
}

/**
 * Get active employments for an employer
 */
export async function getActiveEmploymentsForEmployer(employerId: string): Promise<Employment[]> {
  return db
    .select()
    .from(employments)
    .where(and(eq(employments.employerId, employerId), eq(employments.status, 'active')));
}

/**
 * Get the oldest active employment for a worker (for work tick attribution)
 */
export async function getOldestActiveEmployment(workerId: string): Promise<Employment | undefined> {
  const [employment] = await db
    .select()
    .from(employments)
    .where(and(eq(employments.workerId, workerId), eq(employments.status, 'active')))
    .orderBy(employments.startedAtTick)
    .limit(1);
  return employment;
}

/**
 * Increment ticks worked and handle per-tick payment
 */
export async function incrementTicksWorked(
  employmentId: string,
  paymentAmount: number = 0
): Promise<Employment> {
  const [updated] = await db
    .update(employments)
    .set({
      ticksWorked: employments.ticksWorked,
      amountPaid: employments.amountPaid,
      updatedAt: new Date(),
    })
    .where(eq(employments.id, employmentId))
    .returning();

  // Use raw SQL for increment since Drizzle doesn't support it directly
  const [result] = await db
    .update(employments)
    .set({ updatedAt: new Date() })
    .where(eq(employments.id, employmentId))
    .returning();

  // Manually increment (Drizzle workaround)
  await db.execute(sql`
    UPDATE employments
    SET ticks_worked = ticks_worked + 1,
        amount_paid = amount_paid + ${paymentAmount},
        updated_at = NOW()
    WHERE id = ${employmentId}
  `);

  // Fetch updated record
  const [employment] = await db
    .select()
    .from(employments)
    .where(eq(employments.id, employmentId));
  return employment;
}

/**
 * Update employment status
 */
export async function updateEmploymentStatus(
  id: string,
  status: 'active' | 'completed' | 'abandoned' | 'unpaid' | 'fired',
  endedAtTick?: number
): Promise<void> {
  await db
    .update(employments)
    .set({
      status,
      endedAtTick: endedAtTick ?? null,
      updatedAt: new Date(),
    })
    .where(eq(employments.id, id));
}

/**
 * Mark employment as completed and update final payment
 */
export async function completeEmployment(
  id: string,
  finalPayment: number,
  endedAtTick: number
): Promise<void> {
  await db.execute(sql`
    UPDATE employments
    SET status = 'completed',
        amount_paid = amount_paid + ${finalPayment},
        ended_at_tick = ${endedAtTick},
        updated_at = NOW()
    WHERE id = ${id}
  `);
}

/**
 * Get all employments that need payment (completed but unpaid for on_completion)
 */
export async function getCompletedUnpaidEmployments(employerId: string): Promise<Employment[]> {
  const active = await db
    .select()
    .from(employments)
    .where(
      and(
        eq(employments.employerId, employerId),
        eq(employments.status, 'active'),
        eq(employments.paymentType, 'on_completion')
      )
    );

  // Filter to those where work is complete
  return active.filter((e) => e.ticksWorked >= e.ticksRequired);
}

/**
 * Get employment statistics for an agent
 */
export async function getEmploymentStats(agentId: string): Promise<{
  asWorker: { active: number; completed: number; abandoned: number; totalEarned: number };
  asEmployer: { active: number; completed: number; unpaid: number; totalPaid: number };
}> {
  // Worker stats
  const workerEmployments = await db
    .select()
    .from(employments)
    .where(eq(employments.workerId, agentId));

  const workerStats = {
    active: workerEmployments.filter((e) => e.status === 'active').length,
    completed: workerEmployments.filter((e) => e.status === 'completed').length,
    abandoned: workerEmployments.filter((e) => e.status === 'abandoned').length,
    totalEarned: workerEmployments.reduce((sum, e) => sum + e.amountPaid, 0),
  };

  // Employer stats
  const employerEmployments = await db
    .select()
    .from(employments)
    .where(eq(employments.employerId, agentId));

  const employerStats = {
    active: employerEmployments.filter((e) => e.status === 'active').length,
    completed: employerEmployments.filter((e) => e.status === 'completed').length,
    unpaid: employerEmployments.filter((e) => e.status === 'unpaid').length,
    totalPaid: employerEmployments.reduce((sum, e) => sum + e.amountPaid, 0),
  };

  return { asWorker: workerStats, asEmployer: employerStats };
}

// =============================================================================
// COMBINED QUERIES
// =============================================================================

/**
 * Get full employment context for an agent (for LLM prompt)
 */
export async function getAgentEmploymentContext(agentId: string): Promise<{
  activeEmployments: Employment[];
  pendingPayments: Employment[];
  openOffers: JobOffer[];
}> {
  const [activeEmployments, pendingPayments, openOffers] = await Promise.all([
    getActiveEmploymentsForWorker(agentId),
    getCompletedUnpaidEmployments(agentId),
    getOpenJobOffersByEmployer(agentId),
  ]);

  return { activeEmployments, pendingPayments, openOffers };
}
