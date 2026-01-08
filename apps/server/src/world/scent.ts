import { redis } from '../cache';
import { CONFIG } from '../config';

interface ScentData {
  agentId: string;
  tick: number;
  strength: number; // 0-100? Or just generic strength
}

const SCENT_PREFIX = 'world:scent:';

/**
 * Leave a scent at a specific location
 */
export async function leaveScent(x: number, y: number, agentId: string, currentTick: number): Promise<void> {
  const scentDuration = CONFIG.actions.move.scentDurationTicks;

  // Guard: if scent duration is 0 or negative, don't leave scents
  if (scentDuration <= 0) {
    return;
  }

  const key = `${SCENT_PREFIX}${x}:${y}`;

  // Calculate TTL in seconds based on tick interval and duration
  // Duration in ticks * ms per tick / 1000 = seconds
  // Ensure minimum TTL of 1 second to avoid immediate expiration
  const ttlSeconds = Math.max(1, Math.ceil((scentDuration * CONFIG.simulation.tickIntervalMs) / 1000));

  const data: ScentData = {
    agentId,
    tick: currentTick,
    strength: 100, // Starts at max strength
  };

  // Use setex to set value with expiration
  await redis.setex(key, ttlSeconds, JSON.stringify(data));
}

/**
 * Get scents at specific locations
 */
export async function getScentsAt(locations: { x: number; y: number }[]): Promise<Array<ScentData & { x: number; y: number }>> {
  if (locations.length === 0) return [];

  const keys = locations.map(loc => `${SCENT_PREFIX}${loc.x}:${loc.y}`);
  const values = await redis.mget(...keys);

  const results: Array<ScentData & { x: number; y: number }> = [];

  values.forEach((val, index) => {
    if (val) {
      try {
        const data = JSON.parse(val) as ScentData;
        results.push({
          ...data,
          x: locations[index].x,
          y: locations[index].y
        });
      } catch (e) {
        console.error('Error parsing scent data', e);
      }
    }
  });

  return results;
}

/**
 * Calculate scent strength based on age (ticks elapsed)
 */
export function calculateScentStrength(scentTick: number, currentTick: number): 'strong' | 'weak' | 'faint' {
  const age = currentTick - scentTick;
  const maxAge = CONFIG.actions.move.scentDurationTicks;

  // Guard: handle invalid maxAge (0 or negative)
  if (maxAge <= 0) {
    // If scents aren't supposed to last, consider any existing scent as faint
    return 'faint';
  }

  // Guard: handle negative age (tick went backwards, e.g., simulation reset)
  if (age < 0) {
    return 'faint';
  }

  if (age < maxAge * 0.3) return 'strong';
  if (age < maxAge * 0.7) return 'weak';
  return 'faint';
}
