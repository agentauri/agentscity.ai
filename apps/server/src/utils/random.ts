/**
 * Seeded Random Number Generator
 *
 * Provides deterministic random number generation for reproducible experiments.
 * Uses seedrandom library for cryptographically secure PRNG with seed support.
 *
 * Usage:
 * - Call initializeRNG(seed) at experiment/simulation start
 * - Use random() instead of Math.random() everywhere
 * - Use randomInt(min, max) for integer ranges
 * - Use randomChoice(array) for random selection
 */

import seedrandom from 'seedrandom';

// Global RNG instance
let rng: ReturnType<typeof seedrandom> | null = null;

// Current seed for debugging/logging
let currentSeed: string | null = null;

/**
 * Initialize the RNG with a specific seed.
 * Call this at the start of each experiment or simulation run.
 *
 * @param seed - The seed string for reproducibility
 */
export function initializeRNG(seed: string): void {
  currentSeed = seed;
  rng = seedrandom(seed);
  console.log(`[SeededRNG] Initialized with seed: ${seed}`);
}

/**
 * Set the RNG seed (alias for initializeRNG for convenience).
 * Accepts either a string or number seed.
 *
 * @param seed - The seed for reproducibility (string or number)
 */
export function setSeed(seed: string | number): void {
  initializeRNG(String(seed));
}

/**
 * Reset RNG to unseeded mode (uses Math.random behavior).
 * Useful for tests or when reproducibility is not needed.
 */
export function resetRNG(): void {
  rng = null;
  currentSeed = null;
  console.log('[SeededRNG] Reset to unseeded mode');
}

/**
 * Get the current seed (if any).
 */
export function getCurrentSeed(): string | null {
  return currentSeed;
}

/**
 * Check if RNG is seeded.
 */
export function isSeeded(): boolean {
  return rng !== null;
}

/**
 * Generate a random number between 0 (inclusive) and 1 (exclusive).
 * Drop-in replacement for Math.random().
 */
export function random(): number {
  return rng ? rng() : Math.random();
}

/**
 * Generate a random integer between min (inclusive) and max (exclusive).
 *
 * @param min - Minimum value (inclusive)
 * @param max - Maximum value (exclusive)
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(random() * (max - min)) + min;
}

/**
 * Generate a random integer between 0 (inclusive) and max (exclusive).
 *
 * @param max - Maximum value (exclusive)
 */
export function randomBelow(max: number): number {
  return Math.floor(random() * max);
}

/**
 * Select a random element from an array.
 *
 * @param array - The array to select from
 * @returns A random element, or undefined if array is empty
 */
export function randomChoice<T>(array: T[]): T | undefined {
  if (array.length === 0) return undefined;
  return array[randomBelow(array.length)];
}

/**
 * Generate a random boolean with optional probability.
 *
 * @param probability - Probability of returning true (default 0.5)
 */
export function randomBool(probability = 0.5): boolean {
  return random() < probability;
}

/**
 * Generate a random hex color.
 */
export function randomColor(): string {
  return `#${Math.floor(random() * 16777215)
    .toString(16)
    .padStart(6, '0')}`;
}

/**
 * Shuffle an array in place using Fisher-Yates algorithm.
 *
 * @param array - The array to shuffle
 * @returns The shuffled array (same reference)
 */
export function shuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = randomBelow(i + 1);
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Generate a random value following a normal (Gaussian) distribution.
 * Uses Box-Muller transform.
 *
 * @param mean - Mean of the distribution (default 0)
 * @param stddev - Standard deviation (default 1)
 */
export function randomNormal(mean = 0, stddev = 1): number {
  const u1 = random();
  const u2 = random();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return z0 * stddev + mean;
}
