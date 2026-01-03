/**
 * Event cleanup queries for experiment resets
 */

import { db, events } from '../index';

/**
 * Delete all events (for experiment reset)
 */
export async function deleteAllEvents(): Promise<void> {
  await db.delete(events);
}
