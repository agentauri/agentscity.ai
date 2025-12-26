/**
 * BullMQ Queue Setup
 * Handles async LLM decision jobs
 */

import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import Redis from 'ioredis';
import { getAdapter, type AgentObservation, type AgentDecision, type LLMType } from '../llm';
import { getFallbackDecision } from '../llm/response-parser';

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

      console.log(`[Queue] Processing decision for agent ${agentId} (${llmType}) at tick ${tick}`);

      // Get adapter
      const adapter = getAdapter(llmType);
      if (!adapter) {
        throw new Error(`Unknown LLM type: ${llmType}`);
      }

      // Check availability
      const available = await adapter.isAvailable();
      if (!available) {
        console.warn(`[Queue] Adapter ${llmType} not available, using fallback`);
        return {
          agentId,
          tick,
          decision: getFallbackDecision(
            observation.self.hunger,
            observation.self.energy,
            observation.self.balance
          ),
          processingTimeMs: Date.now() - startTime,
          usedFallback: true,
        };
      }

      // Get decision
      const decision = await adapter.decide(observation);

      return {
        agentId,
        tick,
        decision,
        processingTimeMs: Date.now() - startTime,
        usedFallback: false,
      };
    },
    {
      connection: redis,
      concurrency: 6, // Process up to 6 agents in parallel
    }
  );

  worker.on('completed', (job) => {
    console.log(`[Queue] Job ${job.id} completed in ${job.returnvalue?.processingTimeMs}ms`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[Queue] Job ${job?.id} failed:`, err.message);
  });

  console.log('[Queue] Decision worker started');
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
 */
export async function waitForDecisions(
  jobs: Job<DecisionJobData, DecisionJobResult>[],
  timeoutMs = 30000
): Promise<DecisionJobResult[]> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Decision timeout')), timeoutMs);
  });

  const results = Promise.all(
    jobs.map((job) =>
      job.waitUntilFinished(queueEvents).then(() => job.returnvalue!)
    )
  );

  return Promise.race([results, timeout]);
}

/**
 * Calculate job priority based on agent state
 * Lower number = higher priority
 */
function getPriority(observation: AgentObservation): number {
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
