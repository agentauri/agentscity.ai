/**
 * BullMQ Queue Setup
 * Handles async LLM decision jobs
 * Includes OpenTelemetry tracing for job processing
 */

import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import Redis from 'ioredis';
import { getAdapter, type AgentObservation, type AgentDecision, type LLMType } from '../llm';
import { getFallbackDecision } from '../llm/response-parser';
import { getCachedDecision, cacheDecision, getCacheStats } from '../llm/decision-cache';
import { isTestMode } from '../config';
import {
  startJobSpan,
  markSpanSuccess,
  markSpanError,
  createTracedLogger,
} from '../telemetry';

// Traced logger for queue operations
const logger = createTracedLogger('Queue');

/**
 * Create fallback decision (scientific model - no location checks)
 */
function createFallbackDecision(observation: AgentObservation): AgentDecision {
  return getFallbackDecision(
    observation.self.hunger,
    observation.self.energy,
    observation.self.balance,
    observation.self.x,
    observation.self.y,
    observation.inventory,
    observation.nearbyResourceSpawns,
    observation.nearbyShelters
  );
}

// BullMQ requires maxRetriesPerRequest: null for blocking operations
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

// =============================================================================
// Job Types
// =============================================================================

export interface DecisionJobData {
  agentId: string;
  llmType: LLMType;
  tick: number;
  observation: AgentObservation;
}

export interface DecisionJobResult {
  agentId: string;
  tick: number;
  decision: AgentDecision;
  processingTimeMs: number;
  usedFallback: boolean;
}

// =============================================================================
// Queue Configuration
// =============================================================================

const QUEUE_NAME = 'agent-decisions';

const queueOptions = {
  connection: redis,
  defaultJobOptions: {
    attempts: 2,
    backoff: {
      type: 'exponential' as const,
      delay: 1000,
    },
    removeOnComplete: 100, // Keep last 100 completed jobs
    removeOnFail: 50,      // Keep last 50 failed jobs
  },
};

// =============================================================================
// Queue Instance
// =============================================================================

export const decisionQueue = new Queue<DecisionJobData, DecisionJobResult>(
  QUEUE_NAME,
  queueOptions
);

// Queue events for tracking job completion
const queueEvents = new QueueEvents(QUEUE_NAME, { connection: redis });

// =============================================================================
// Worker
// =============================================================================

let worker: Worker<DecisionJobData, DecisionJobResult> | null = null;

export function startWorker(): void {
  if (worker) return;

  worker = new Worker<DecisionJobData, DecisionJobResult>(
    QUEUE_NAME,
    async (job: Job<DecisionJobData>): Promise<DecisionJobResult> => {
      const startTime = Date.now();
      const { agentId, llmType, tick, observation } = job.data;

      // Start tracing span for this job
      const span = startJobSpan('decision', job.id ?? 'unknown', {
        attributes: {
          'job.agent_id': agentId,
          'job.llm_type': llmType,
          'job.tick': tick,
        },
      });

      try {
        // TEST MODE: Skip LLM call, use fallback immediately
        if (isTestMode()) {
          logger.info(`TEST MODE: fallback for ${agentId}`);
          span.setAttribute('job.test_mode', true);
          span.setAttribute('job.used_fallback', true);
          markSpanSuccess(span);
          span.end();
          return {
            agentId,
            tick,
            decision: createFallbackDecision(observation),
            processingTimeMs: Date.now() - startTime,
            usedFallback: true,
          };
        }

        // CACHE CHECK: Try to get cached decision
        const cachedDecision = await getCachedDecision(observation);
        if (cachedDecision) {
          logger.info(`CACHE HIT: ${agentId} (${llmType})`);
          span.setAttribute('job.cache_hit', true);
          span.setAttribute('job.used_fallback', false);
          span.setAttribute('job.decision_action', cachedDecision.action);
          markSpanSuccess(span);
          span.end();
          return {
            agentId,
            tick,
            decision: cachedDecision,
            processingTimeMs: Date.now() - startTime,
            usedFallback: false,
          };
        }

        // Get adapter
        const adapter = getAdapter(llmType);
        if (!adapter) {
          const error = new Error(`Unknown LLM type: ${llmType}`);
          markSpanError(span, error);
          span.end();
          throw error;
        }

        // Check availability
        const available = await adapter.isAvailable();
        if (!available) {
          logger.warn(`Adapter ${llmType} not available, using fallback`);
          span.setAttribute('job.adapter_unavailable', true);
          span.setAttribute('job.used_fallback', true);
          markSpanSuccess(span);
          span.end();
          return {
            agentId,
            tick,
            decision: createFallbackDecision(observation),
            processingTimeMs: Date.now() - startTime,
            usedFallback: true,
          };
        }

        // Get decision from LLM
        const decision = await adapter.decide(observation);

        // Cache the decision for future similar observations
        await cacheDecision(observation, decision);

        const processingTimeMs = Date.now() - startTime;
        span.setAttribute('job.processing_time_ms', processingTimeMs);
        span.setAttribute('job.decision_action', decision.action);
        span.setAttribute('job.used_fallback', false);
        span.setAttribute('job.cache_hit', false);
        markSpanSuccess(span);
        span.end();

        return {
          agentId,
          tick,
          decision,
          processingTimeMs,
          usedFallback: false,
        };
      } catch (error) {
        markSpanError(span, error instanceof Error ? error : String(error));
        span.end();
        throw error;
      }
    },
    {
      connection: redis,
      concurrency: 6, // Process up to 6 agents in parallel
    }
  );

  worker.on('failed', (job, err) => {
    logger.error(`Job ${job?.id} failed`, err);
  });

  logger.info('Decision worker started');
}

export function stopWorker(): Promise<void> {
  if (!worker) return Promise.resolve();
  return worker.close();
}

// =============================================================================
// Queue Operations
// =============================================================================

/**
 * Add decision job to queue
 */
export async function queueDecision(data: DecisionJobData): Promise<Job<DecisionJobData, DecisionJobResult>> {
  return decisionQueue.add(`decision-${data.agentId}-${data.tick}`, data, {
    priority: getPriority(data.observation),
  });
}

/**
 * Add multiple decision jobs (for batch processing)
 */
export async function queueDecisions(jobs: DecisionJobData[]): Promise<Job<DecisionJobData, DecisionJobResult>[]> {
  return Promise.all(jobs.map((data) => queueDecision(data)));
}

/**
 * Wait for all jobs to complete (with timeout)
 * Returns all completed results even if some jobs timeout
 */
export async function waitForDecisions(
  jobs: Job<DecisionJobData, DecisionJobResult>[],
  timeoutMs = 30000
): Promise<DecisionJobResult[]> {
  // Create a promise for each job that resolves when done or on timeout
  const jobPromises = jobs.map(async (job) => {
    try {
      const result = await Promise.race([
        job.waitUntilFinished(queueEvents),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
      ]);

      if (result) {
        return result as DecisionJobResult;
      } else {
        // Timeout - use fallback decision
        const jobData = job.data;
        return {
          agentId: jobData.agentId,
          tick: jobData.tick,
          decision: createFallbackDecision(jobData.observation),
          processingTimeMs: timeoutMs,
          usedFallback: true,
        } as DecisionJobResult;
      }
    } catch {
      // Job failed - use fallback decision
      const jobData = job.data;
      return {
        agentId: jobData.agentId,
        tick: jobData.tick,
        decision: createFallbackDecision(jobData.observation),
        processingTimeMs: timeoutMs,
        usedFallback: true,
      } as DecisionJobResult;
    }
  });

  // Wait for all jobs (each has its own timeout)
  return Promise.all(jobPromises);
}

/**
 * Calculate job priority based on agent state
 * Lower number = higher priority
 * @exported for testing
 */
export function getPriority(observation: AgentObservation): number {
  // Urgent: low health or critical hunger
  if (observation.self.health < 20 || observation.self.hunger < 10) {
    return 1;
  }

  // High: low hunger or energy
  if (observation.self.hunger < 30 || observation.self.energy < 20) {
    return 2;
  }

  // Normal
  return 5;
}

// =============================================================================
// Queue Stats
// =============================================================================

export async function getQueueStats(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}> {
  const [waiting, active, completed, failed] = await Promise.all([
    decisionQueue.getWaitingCount(),
    decisionQueue.getActiveCount(),
    decisionQueue.getCompletedCount(),
    decisionQueue.getFailedCount(),
  ]);

  return { waiting, active, completed, failed };
}
