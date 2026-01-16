/**
 * Backpressure Controller
 *
 * Phase 3: Async Architecture Scale
 *
 * Controls queue depth and applies backpressure when the system
 * is overwhelmed. This prevents memory exhaustion and ensures
 * stable operation under heavy load.
 *
 * Key Features:
 * - Queue depth tracking
 * - Adaptive backpressure (wait when queue is full)
 * - Graceful degradation under load
 * - Metrics for monitoring
 */

import { CONFIG } from '../config';

// =============================================================================
// Types
// =============================================================================

interface BackpressureStats {
  queueDepth: number;
  maxDepth: number;
  isUnderPressure: boolean;
  waitCount: number;
  totalWaitTimeMs: number;
  avgWaitTimeMs: number;
}

// =============================================================================
// Backpressure Controller
// =============================================================================

export class BackpressureController {
  private queueDepth = 0;
  private readonly maxDepth: number;
  private readonly delayMs: number;
  private readonly enabled: boolean;

  // Stats
  private waitCount = 0;
  private totalWaitTimeMs = 0;

  constructor(config?: {
    maxDepth?: number;
    delayMs?: number;
    enabled?: boolean;
  }) {
    this.maxDepth = config?.maxDepth ?? CONFIG.queue.maxQueueDepth;
    this.delayMs = config?.delayMs ?? CONFIG.queue.backpressureDelayMs;
    this.enabled = config?.enabled ?? CONFIG.queue.backpressureEnabled;
  }

  /**
   * Wait until there is capacity in the queue.
   * Returns immediately if queue is below capacity.
   */
  async waitForCapacity(): Promise<void> {
    if (!this.enabled) {
      return;
    }

    const startTime = Date.now();
    let waited = false;

    while (this.queueDepth >= this.maxDepth) {
      waited = true;
      await this.sleep(this.delayMs);
    }

    if (waited) {
      const waitTime = Date.now() - startTime;
      this.waitCount++;
      this.totalWaitTimeMs += waitTime;
    }
  }

  /**
   * Check if the queue has capacity without waiting.
   */
  hasCapacity(): boolean {
    if (!this.enabled) {
      return true;
    }
    return this.queueDepth < this.maxDepth;
  }

  /**
   * Record a job being added to the queue.
   */
  onJobAdded(): void {
    this.queueDepth++;
  }

  /**
   * Record a job being completed.
   */
  onJobCompleted(): void {
    this.queueDepth = Math.max(0, this.queueDepth - 1);
  }

  /**
   * Record a batch of jobs being added.
   */
  onBatchAdded(count: number): void {
    this.queueDepth += count;
  }

  /**
   * Record a batch of jobs being completed.
   */
  onBatchCompleted(count: number): void {
    this.queueDepth = Math.max(0, this.queueDepth - count);
  }

  /**
   * Get current queue depth.
   */
  getCurrentDepth(): number {
    return this.queueDepth;
  }

  /**
   * Check if backpressure is currently active.
   */
  isUnderPressure(): boolean {
    return this.enabled && this.queueDepth >= this.maxDepth;
  }

  /**
   * Get backpressure statistics.
   */
  getStats(): BackpressureStats {
    return {
      queueDepth: this.queueDepth,
      maxDepth: this.maxDepth,
      isUnderPressure: this.isUnderPressure(),
      waitCount: this.waitCount,
      totalWaitTimeMs: this.totalWaitTimeMs,
      avgWaitTimeMs: this.waitCount > 0 ? this.totalWaitTimeMs / this.waitCount : 0,
    };
  }

  /**
   * Reset statistics (useful for testing).
   */
  resetStats(): void {
    this.waitCount = 0;
    this.totalWaitTimeMs = 0;
  }

  /**
   * Reset queue depth (use carefully, mainly for testing).
   */
  reset(): void {
    this.queueDepth = 0;
    this.resetStats();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

let instance: BackpressureController | null = null;

/**
 * Get the global backpressure controller instance.
 */
export function getBackpressureController(): BackpressureController {
  if (!instance) {
    instance = new BackpressureController();
  }
  return instance;
}

/**
 * Create a new backpressure controller with custom config.
 * Replaces the global instance.
 */
export function createBackpressureController(config?: {
  maxDepth?: number;
  delayMs?: number;
  enabled?: boolean;
}): BackpressureController {
  instance = new BackpressureController(config);
  return instance;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Wait for queue capacity (convenience function).
 */
export async function waitForQueueCapacity(): Promise<void> {
  return getBackpressureController().waitForCapacity();
}

/**
 * Check if queue has capacity (convenience function).
 */
export function hasQueueCapacity(): boolean {
  return getBackpressureController().hasCapacity();
}

/**
 * Record job added (convenience function).
 */
export function recordJobAdded(): void {
  getBackpressureController().onJobAdded();
}

/**
 * Record job completed (convenience function).
 */
export function recordJobCompleted(): void {
  getBackpressureController().onJobCompleted();
}

/**
 * Get backpressure stats (convenience function).
 */
export function getBackpressureStats(): BackpressureStats {
  return getBackpressureController().getStats();
}
