/**
 * Experiments API Routes
 *
 * Additional endpoints for scientific baseline experiments.
 * These complement the existing experiment routes in index.ts.
 *
 * New endpoints:
 * - POST /api/experiments/seed/:type - Seed an experiment
 * - POST /api/experiments/:id/start - Start an experiment
 * - GET /api/experiments/:id/results - Get comparison results
 * - POST /api/experiments/:id/export - Export results to JSON/CSV
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  getExperimentWithVariants,
  getExperimentSummary,
  compareVariants,
  getVariantSnapshots,
  updateExperimentStatus,
  updateVariantStatus,
  getNextPendingVariant,
  getCurrentRunningVariant,
} from '../db/queries/experiments';
import { getCurrentTick, resetTickCounter } from '../db/queries/world';
import { clearCache } from '../cache/projections';
import { tickEngine } from '../simulation/tick-engine';
import { resetWorldWithConfig, clearWorld, getDefaultConfigurations, type SpawnConfiguration, type AgentConfig } from '../agents/spawner';
import {
  seedRandomWalkExperiment,
  seedRuleBasedExperiment,
  seedLLMComparisonExperiment,
  seedAllExperiments,
  getExperimentDefinition,
  type ExperimentType,
} from '../scripts/seed-experiments';
import {
  generateExperimentReport,
  reportToCSV,
  reportToJSON,
  analyzeSurvival,
  analyzeEconomics,
} from '../analysis/experiment-analysis';

// =============================================================================
// Types
// =============================================================================

interface SeedParams {
  type: string;
}

interface ExperimentParams {
  id: string;
}

interface ExportQuery {
  format?: 'json' | 'csv';
}

interface StartExperimentBody {
  tickIntervalMs?: number;
}

// =============================================================================
// Route Registration
// =============================================================================

/**
 * Register additional experiment API routes
 */
export async function registerExperimentRoutes(server: FastifyInstance): Promise<void> {
  // ---------------------------------------------------------------------------
  // POST /api/experiments/seed/:type - Seed an experiment
  // ---------------------------------------------------------------------------
  server.post<{ Params: SeedParams }>('/api/experiments/seed/:type', {
    schema: {
      description: 'Seed a scientific baseline experiment by type',
      tags: ['Experiments'],
      params: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['random-walk', 'rule-based', 'llm-comparison', 'all'],
            description: 'Experiment type to seed',
          },
        },
        required: ['type'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            experiments: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  experimentId: { type: 'string' },
                  variantIds: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { type } = request.params;

    try {
      let experiments: Array<{ experimentId: string; variantIds: string[] }>;

      switch (type) {
        case 'random-walk':
          experiments = [await seedRandomWalkExperiment()];
          break;
        case 'rule-based':
          experiments = [await seedRuleBasedExperiment()];
          break;
        case 'llm-comparison':
          experiments = [await seedLLMComparisonExperiment()];
          break;
        case 'all':
          experiments = await seedAllExperiments();
          break;
        default:
          return reply.code(400).send({
            error: 'Bad Request',
            message: `Invalid experiment type: ${type}. Valid types: random-walk, rule-based, llm-comparison, all`,
          });
      }

      console.log(`[Experiments] Seeded ${experiments.length} experiment(s) of type: ${type}`);

      return {
        success: true,
        experiments,
      };
    } catch (error) {
      console.error('[Experiments] Seed error:', error);
      return reply.code(500).send({
        error: 'Internal Server Error',
        message: 'Failed to seed experiment',
      });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/experiments/:id/start - Start an experiment
  // ---------------------------------------------------------------------------
  server.post<{ Params: ExperimentParams; Body: StartExperimentBody }>('/api/experiments/:id/start', {
    schema: {
      description: 'Start an experiment - runs the next pending variant',
      tags: ['Experiments'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Experiment ID' },
        },
        required: ['id'],
      },
      body: {
        type: 'object',
        properties: {
          tickIntervalMs: {
            type: 'number',
            description: 'Optional tick interval override in milliseconds',
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            experiment: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
              },
            },
            variant: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                configOverrides: { type: 'object' },
              },
            },
            message: { type: 'string' },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            message: { type: 'string' },
            runningVariant: { type: 'object' },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const { tickIntervalMs } = request.body ?? {};

    // Check if there's already a running variant
    const running = await getCurrentRunningVariant();
    if (running) {
      return reply.code(400).send({
        error: 'Conflict',
        message: 'Another variant is already running',
        runningVariant: running,
      });
    }

    // Get experiment
    const experiment = await getExperimentWithVariants(id);
    if (!experiment) {
      return reply.code(404).send({ error: 'Experiment not found' });
    }

    // Get next pending variant
    const variant = await getNextPendingVariant(id);
    if (!variant) {
      return reply.code(400).send({
        error: 'No Pending Variants',
        message: 'All variants have been completed or no variants exist',
      });
    }

    // Start experiment if not already running
    if (experiment.status === 'planning') {
      await updateExperimentStatus(id, 'running');
    }

    // Stop current simulation
    tickEngine.stop();

    // Clear world and reset tick counter
    await clearWorld();
    await resetTickCounter();
    await clearCache();

    // Build spawn configuration from variant
    const defaultConfig = getDefaultConfigurations();
    const spawnConfig: SpawnConfiguration = {
      agents: (variant.agentConfigs as AgentConfig[] | undefined) ?? defaultConfig.agents,
      resourceSpawns: defaultConfig.resourceSpawns,
      shelters: defaultConfig.shelters,
      startingFood: 1,
    };

    // Spawn world with variant config
    await resetWorldWithConfig(spawnConfig);

    // Update variant status
    const currentTick = await getCurrentTick();
    await updateVariantStatus(variant.id, 'running', { startTick: currentTick });

    // Configure tick engine
    const finalTickInterval = tickIntervalMs ?? Number(process.env.TICK_INTERVAL_MS) || 60000;
    tickEngine.setTickInterval(finalTickInterval);

    // Set experiment context with variant configuration
    const configOverrides = variant.configOverrides as Record<string, unknown> | undefined;
    tickEngine.setExperimentContext({
      experimentId: id,
      variantId: variant.id,
      durationTicks: variant.durationTicks || 100,
      variantConfig: {
        useRandomWalk: configOverrides?.useRandomWalk === true,
        useOnlyFallback: configOverrides?.useOnlyFallback === true,
      },
    });

    // Start with delay to allow frontend SSE connection
    setTimeout(() => {
      console.log(`[Experiments] Starting variant: ${variant.name}`);
      tickEngine.start().catch(console.error);
    }, 1000);

    return {
      success: true,
      experiment: { id, name: experiment.name },
      variant: {
        id: variant.id,
        name: variant.name,
        configOverrides: variant.configOverrides,
      },
      message: `Starting variant "${variant.name}" with ${variant.durationTicks} ticks`,
    };
  });

  // ---------------------------------------------------------------------------
  // GET /api/experiments/:id/results - Get comparison results
  // ---------------------------------------------------------------------------
  server.get<{ Params: ExperimentParams }>('/api/experiments/:id/results', {
    schema: {
      description: 'Get detailed comparison results for an experiment',
      tags: ['Experiments'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Experiment ID' },
        },
        required: ['id'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            experiment: { type: 'object' },
            variants: { type: 'array', items: { type: 'object' } },
            comparison: { type: 'array', items: { type: 'object' } },
            report: { type: 'object' },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;

    // Get experiment summary
    const summary = await getExperimentSummary(id);
    if (!summary) {
      return reply.code(404).send({ error: 'Experiment not found' });
    }

    // Generate detailed report if we have comparison data
    let report = null;
    if (summary.comparison.length > 0) {
      // Get snapshot data for detailed analysis
      const survivalAnalyses = [];
      const economicAnalyses = [];

      for (const variant of summary.variants) {
        if (variant.status === 'completed') {
          const snapshots = await getVariantSnapshots(variant.id);

          // Survival analysis
          const survivalData = analyzeSurvival(
            variant.id,
            variant.name,
            snapshots.map((s) => ({
              tick: Number(s.tick),
              metricsSnapshot: s.metricsSnapshot as { aliveAgents?: number } | null,
              agentStates: s.agentStates as Array<{ state: string }> | null,
            }))
          );
          survivalAnalyses.push(survivalData);

          // Economic analysis
          const economicData = analyzeEconomics(
            variant.id,
            variant.name,
            snapshots.map((s) => ({
              tick: Number(s.tick),
              metricsSnapshot: s.metricsSnapshot as { giniCoefficient?: number; avgWealth?: number } | null,
              agentStates: s.agentStates as Array<{ balance: number }> | null,
            }))
          );
          economicAnalyses.push(economicData);
        }
      }

      report = generateExperimentReport(
        summary.experiment.id,
        summary.experiment.name,
        summary.experiment.hypothesis,
        summary.variants,
        summary.comparison
      );

      // Add detailed analyses
      report.survivalAnalysis = survivalAnalyses;
      report.economicAnalysis = economicAnalyses;
    }

    return {
      experiment: summary.experiment,
      variants: summary.variants,
      comparison: summary.comparison,
      report,
    };
  });

  // ---------------------------------------------------------------------------
  // POST /api/experiments/:id/export - Export results to JSON/CSV
  // ---------------------------------------------------------------------------
  server.post<{ Params: ExperimentParams; Querystring: ExportQuery }>('/api/experiments/:id/export', {
    schema: {
      description: 'Export experiment results to JSON or CSV format',
      tags: ['Experiments'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Experiment ID' },
        },
        required: ['id'],
      },
      querystring: {
        type: 'object',
        properties: {
          format: {
            type: 'string',
            enum: ['json', 'csv'],
            description: 'Export format (default: json)',
          },
        },
      },
      response: {
        200: {
          description: 'Export data in requested format',
          type: 'string',
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;
    const format = request.query.format ?? 'json';

    // Get experiment summary
    const summary = await getExperimentSummary(id);
    if (!summary) {
      return reply.code(404).send({ error: 'Experiment not found' });
    }

    // Generate report
    const report = generateExperimentReport(
      summary.experiment.id,
      summary.experiment.name,
      summary.experiment.hypothesis,
      summary.variants,
      summary.comparison
    );

    // Add detailed analyses
    for (const variant of summary.variants) {
      if (variant.status === 'completed') {
        const snapshots = await getVariantSnapshots(variant.id);

        report.survivalAnalysis.push(
          analyzeSurvival(
            variant.id,
            variant.name,
            snapshots.map((s) => ({
              tick: Number(s.tick),
              metricsSnapshot: s.metricsSnapshot as { aliveAgents?: number } | null,
              agentStates: s.agentStates as Array<{ state: string }> | null,
            }))
          )
        );

        report.economicAnalysis.push(
          analyzeEconomics(
            variant.id,
            variant.name,
            snapshots.map((s) => ({
              tick: Number(s.tick),
              metricsSnapshot: s.metricsSnapshot as { giniCoefficient?: number; avgWealth?: number } | null,
              agentStates: s.agentStates as Array<{ balance: number }> | null,
            }))
          )
        );
      }
    }

    // Export in requested format
    if (format === 'csv') {
      const csv = reportToCSV(report);
      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', `attachment; filename="experiment-${id}.csv"`);
      return csv;
    }

    // Default to JSON
    const json = reportToJSON(report);
    reply.header('Content-Type', 'application/json');
    reply.header('Content-Disposition', `attachment; filename="experiment-${id}.json"`);
    return json;
  });

  // ---------------------------------------------------------------------------
  // GET /api/experiments/:id/snapshots - Get all snapshots for an experiment
  // ---------------------------------------------------------------------------
  server.get<{ Params: ExperimentParams }>('/api/experiments/:id/snapshots', {
    schema: {
      description: 'Get all metric snapshots for all variants of an experiment',
      tags: ['Experiments'],
      params: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Experiment ID' },
        },
        required: ['id'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            experimentId: { type: 'string' },
            variantSnapshots: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  variantId: { type: 'string' },
                  variantName: { type: 'string' },
                  snapshots: { type: 'array', items: { type: 'object' } },
                },
              },
            },
          },
        },
        404: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
      },
    },
  }, async (request, reply) => {
    const { id } = request.params;

    const experiment = await getExperimentWithVariants(id);
    if (!experiment) {
      return reply.code(404).send({ error: 'Experiment not found' });
    }

    const variantSnapshots = [];
    for (const variant of experiment.variants) {
      const snapshots = await getVariantSnapshots(variant.id);
      variantSnapshots.push({
        variantId: variant.id,
        variantName: variant.name,
        snapshots: snapshots.map((s) => ({
          tick: s.tick,
          metrics: s.metricsSnapshot,
          agentCount: (s.agentStates as Array<unknown>)?.length ?? 0,
          createdAt: s.createdAt,
        })),
      });
    }

    return {
      experimentId: id,
      variantSnapshots,
    };
  });

  // ---------------------------------------------------------------------------
  // GET /api/experiments/definitions - Get available experiment definitions
  // ---------------------------------------------------------------------------
  server.get('/api/experiments/definitions', {
    schema: {
      description: 'Get definitions for all available experiment types',
      tags: ['Experiments'],
      response: {
        200: {
          type: 'object',
          properties: {
            definitions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: 'string' },
                  hypothesis: { type: 'string' },
                  metrics: { type: 'array', items: { type: 'string' } },
                  variantCount: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
  }, async () => {
    const types: ExperimentType[] = ['random-walk', 'rule-based', 'llm-comparison'];

    const definitions = types.map((type) => {
      const def = getExperimentDefinition(type);
      return {
        type: def.type,
        name: def.name,
        description: def.description,
        hypothesis: def.hypothesis,
        metrics: def.metrics,
        variantCount: def.variants.length,
      };
    });

    return { definitions };
  });

  // ---------------------------------------------------------------------------
  // GET /api/experiments/status - Get current experiment execution status
  // ---------------------------------------------------------------------------
  server.get('/api/experiments/status', {
    schema: {
      description: 'Get current experiment execution status',
      tags: ['Experiments'],
      response: {
        200: {
          type: 'object',
          properties: {
            isRunning: { type: 'boolean' },
            currentExperiment: { type: 'object', nullable: true },
            currentVariant: { type: 'object', nullable: true },
            ticksRemaining: { type: 'number', nullable: true },
          },
        },
      },
    },
  }, async () => {
    const runningVariant = await getCurrentRunningVariant();
    const experimentContext = tickEngine.getExperimentContext();
    const currentTick = await getCurrentTick();

    if (!runningVariant || !experimentContext) {
      return {
        isRunning: false,
        currentExperiment: null,
        currentVariant: null,
        ticksRemaining: null,
      };
    }

    const experiment = await getExperimentWithVariants(experimentContext.experimentId);
    const ticksElapsed = experimentContext.startTick !== undefined
      ? currentTick - experimentContext.startTick
      : 0;
    const ticksRemaining = Math.max(0, experimentContext.durationTicks - ticksElapsed);

    return {
      isRunning: true,
      currentExperiment: experiment ? {
        id: experiment.id,
        name: experiment.name,
        status: experiment.status,
      } : null,
      currentVariant: {
        id: runningVariant.id,
        name: runningVariant.name,
        configOverrides: runningVariant.configOverrides,
        durationTicks: runningVariant.durationTicks,
        ticksElapsed,
      },
      ticksRemaining,
    };
  });

  console.log('[Routes] Experiment API routes registered');
}

export default registerExperimentRoutes;
