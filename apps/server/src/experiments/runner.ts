/**
 * Experiment Batch Runner
 *
 * Headless CLI for running reproducible experiments.
 * Supports YAML/JSON configuration files and multiple runs.
 *
 * Usage:
 *   bun run src/experiments/runner.ts --config experiment.yaml --runs 10
 *   bun run src/experiments/runner.ts --config experiment.json --output results/
 *
 * Features:
 * - Reproducible runs with seeded RNG
 * - Parallel variant execution
 * - Progress reporting
 * - Results export (JSON/CSV)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, basename, extname } from 'path';
import {
  parseYAML,
  parseJSON,
  schemaToSpawnConfig,
  validateSchema,
  type ExperimentSchema,
} from './schema';
import {
  createExperiment,
  createVariant,
  updateVariantStatus,
  captureVariantSnapshot,
  getVariantSnapshots,
  compareVariants,
} from '../db/queries/experiments';
import { resetTickCounter, getCurrentTick, incrementTick, regenerateResources } from '../db/queries/world';
import { getAliveAgents } from '../db/queries/agents';
import { clearWorld, spawnWorldWithConfig } from '../agents/spawner';
import { clearCache } from '../cache/projections';
import { initializeRNG } from '../utils/random';
import { processAgentsTick } from '../agents/orchestrator';
import { applyNeedsDecay } from '../simulation/needs-decay';
import { generateExperimentReport, reportToJSON, reportToCSV } from '../analysis/experiment-analysis';

// =============================================================================
// Types
// =============================================================================

export interface RunnerOptions {
  /** Path to config file (YAML or JSON) */
  configPath: string;

  /** Number of runs per variant */
  runs?: number;

  /** Output directory for results */
  outputDir?: string;

  /** Verbose logging */
  verbose?: boolean;

  /** Tick interval in ms (0 for fastest) */
  tickIntervalMs?: number;

  /** Only validate config, don't run */
  dryRun?: boolean;

  /** Export format */
  format?: 'json' | 'csv' | 'both';
}

export interface RunResult {
  experimentId: string;
  variantId: string;
  variantName: string;
  runNumber: number;
  seed: number;
  ticksCompleted: number;
  duration: {
    startTime: number;
    endTime: number;
    elapsedMs: number;
  };
  finalMetrics: {
    aliveAgents: number;
    survivalRate: number;
    avgWealth: number;
    avgHealth: number;
    giniCoefficient: number;
    tradeCount: number;
    conflictCount: number;
  };
}

// =============================================================================
// Runner Implementation
// =============================================================================

/**
 * Load and parse experiment configuration
 */
export async function loadConfig(configPath: string): Promise<ExperimentSchema> {
  const ext = extname(configPath).toLowerCase();
  const content = readFileSync(configPath, 'utf-8');

  if (ext === '.yaml' || ext === '.yml') {
    return parseYAML(content);
  } else if (ext === '.json') {
    return parseJSON(content);
  } else {
    throw new Error(`Unsupported config format: ${ext}. Use .yaml, .yml, or .json`);
  }
}

/**
 * Run a single experiment variant
 */
async function runVariant(
  schema: ExperimentSchema,
  variantName: string,
  seed: number,
  verbose: boolean
): Promise<{ snapshots: unknown[]; finalTick: number }> {
  // Initialize RNG
  initializeRNG(String(seed));

  // Generate spawn config from schema
  const spawnConfig = schemaToSpawnConfig({ ...schema, seed });

  // Clear and spawn world
  await clearWorld();
  await resetTickCounter();
  await clearCache();
  await spawnWorldWithConfig(spawnConfig);

  if (verbose) {
    console.log(`  [Runner] World spawned: ${spawnConfig.agents.length} agents, ${spawnConfig.resourceSpawns.length} resources`);
  }

  // Run simulation
  const snapshots: unknown[] = [];
  let currentTick = await getCurrentTick();
  const targetTick = currentTick + schema.duration;
  const snapshotInterval = Math.max(1, Math.floor(schema.duration / 10)); // 10 snapshots per run

  while (currentTick < targetTick) {
    // Phase 1: Process agent decisions
    await processAgentsTick(currentTick);

    // Phase 2: Regenerate resources
    await regenerateResources();

    // Phase 3: Apply needs decay and handle deaths
    const agents = await getAliveAgents();
    for (const agent of agents) {
      await applyNeedsDecay(agent, currentTick);
    }

    // Increment tick
    await incrementTick();
    currentTick++;

    // Capture snapshot at intervals
    if (currentTick % snapshotInterval === 0 || currentTick === targetTick) {
      const aliveAgents = await getAliveAgents();
      snapshots.push({
        tick: currentTick,
        timestamp: Date.now(),
        aliveAgents: aliveAgents.length,
      });
    }

    // Progress indicator
    if (verbose && currentTick % 10 === 0) {
      const progress = ((currentTick - (targetTick - schema.duration)) / schema.duration * 100).toFixed(0);
      process.stdout.write(`\r  [Runner] ${variantName}: ${progress}% (tick ${currentTick}/${targetTick})`);
    }
  }

  if (verbose) {
    console.log(''); // New line after progress
  }

  return { snapshots, finalTick: currentTick };
}

/**
 * Run complete experiment with all variants
 */
export async function runExperiment(options: RunnerOptions): Promise<RunResult[]> {
  const {
    configPath,
    runs = 1,
    outputDir,
    verbose = false,
    dryRun = false,
    format = 'json',
  } = options;

  // Load config
  console.log(`[Runner] Loading config: ${configPath}`);
  const schema = await loadConfig(configPath);

  // Validate
  const validation = validateSchema(schema);
  if (!validation.valid) {
    console.error('[Runner] Validation errors:');
    validation.errors.forEach(e => console.error(`  - ${e.path}: ${e.message}`));
    throw new Error('Invalid experiment configuration');
  }

  console.log(`[Runner] Experiment: ${schema.name}`);
  console.log(`[Runner] Duration: ${schema.duration} ticks`);
  console.log(`[Runner] Runs per variant: ${runs}`);

  if (dryRun) {
    console.log('[Runner] Dry run - configuration is valid');
    console.log('[Runner] Agent configs:', JSON.stringify(schemaToSpawnConfig(schema).agents, null, 2));
    return [];
  }

  // Create output directory
  if (outputDir) {
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }
  }

  // Create experiment in database
  const experiment = await createExperiment({
    name: schema.name,
    description: schema.description,
    hypothesis: schema.hypothesis,
    metrics: schema.metrics,
  });

  console.log(`[Runner] Created experiment: ${experiment.id}`);

  // Collect results
  const results: RunResult[] = [];

  // Run variants
  const variants = schema.variants?.length
    ? schema.variants
    : [{ name: 'Default', description: 'Default configuration', overrides: {} }];

  for (const variantDef of variants) {
    const mergedSchema = {
      ...schema,
      ...variantDef.overrides,
    };

    const variant = await createVariant(experiment.id, {
      name: variantDef.name,
      description: variantDef.description,
      configOverrides: {
        useRandomWalk: mergedSchema.mode === 'random_walk',
        useOnlyFallback: mergedSchema.mode === 'fallback',
      },
      durationTicks: mergedSchema.duration,
      worldSeed: mergedSchema.seed,
    });

    console.log(`\n[Runner] Variant: ${variantDef.name} (${runs} run${runs > 1 ? 's' : ''})`);

    for (let run = 1; run <= runs; run++) {
      const runSeed = (mergedSchema.seed ?? Date.now()) + run;
      const startTime = Date.now();

      if (verbose) {
        console.log(`  [Runner] Run ${run}/${runs} (seed: ${runSeed})`);
      }

      await updateVariantStatus(variant.id, 'running', { startTick: 0 });

      const { finalTick } = await runVariant(mergedSchema, variantDef.name, runSeed, verbose);

      await updateVariantStatus(variant.id, 'completed', { endTick: finalTick });

      // Capture final snapshot
      await captureVariantSnapshot(variant.id, finalTick);

      const endTime = Date.now();

      // Get final metrics from last snapshot
      const snapshots = await getVariantSnapshots(variant.id);
      const lastSnapshot = snapshots[snapshots.length - 1];
      const metrics = lastSnapshot?.metricsSnapshot as Record<string, number> | null;

      results.push({
        experimentId: experiment.id,
        variantId: variant.id,
        variantName: variantDef.name,
        runNumber: run,
        seed: runSeed,
        ticksCompleted: finalTick,
        duration: {
          startTime,
          endTime,
          elapsedMs: endTime - startTime,
        },
        finalMetrics: {
          aliveAgents: metrics?.aliveAgents ?? 0,
          survivalRate: metrics?.aliveAgents ? metrics.aliveAgents / 7 : 0,
          avgWealth: metrics?.avgWealth ?? 0,
          avgHealth: metrics?.avgHealth ?? 0,
          giniCoefficient: metrics?.giniCoefficient ?? 0,
          tradeCount: metrics?.tradeCount ?? 0,
          conflictCount: metrics?.conflictCount ?? 0,
        },
      });

      if (!verbose) {
        process.stdout.write('.');
      }
    }
  }

  console.log('\n');

  // Generate report
  const comparison = await compareVariants(results.map(r => r.variantId));
  const report = generateExperimentReport(
    experiment.id,
    experiment.name,
    schema.hypothesis,
    [], // variants will be fetched by report
    comparison
  );

  // Export results
  if (outputDir) {
    const baseName = basename(configPath, extname(configPath));
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    if (format === 'json' || format === 'both') {
      const jsonPath = join(outputDir, `${baseName}-${timestamp}.json`);
      writeFileSync(jsonPath, reportToJSON(report));
      console.log(`[Runner] Results saved: ${jsonPath}`);
    }

    if (format === 'csv' || format === 'both') {
      const csvPath = join(outputDir, `${baseName}-${timestamp}.csv`);
      writeFileSync(csvPath, reportToCSV(report));
      console.log(`[Runner] Results saved: ${csvPath}`);
    }

    // Also save raw run data
    const runsPath = join(outputDir, `${baseName}-${timestamp}-runs.json`);
    writeFileSync(runsPath, JSON.stringify(results, null, 2));
    console.log(`[Runner] Run data saved: ${runsPath}`);
  }

  // Print summary
  console.log('\n========================================');
  console.log('  EXPERIMENT SUMMARY');
  console.log('========================================');
  console.log(`Experiment: ${schema.name}`);
  console.log(`Total runs: ${results.length}`);
  console.log(`Total time: ${(results.reduce((sum, r) => sum + r.duration.elapsedMs, 0) / 1000).toFixed(1)}s`);
  console.log('');

  // Per-variant summary
  const byVariant = new Map<string, RunResult[]>();
  for (const result of results) {
    const existing = byVariant.get(result.variantName) ?? [];
    existing.push(result);
    byVariant.set(result.variantName, existing);
  }

  for (const [variantName, variantResults] of byVariant) {
    const avgSurvival = variantResults.reduce((sum, r) => sum + r.finalMetrics.survivalRate, 0) / variantResults.length;
    const avgWealth = variantResults.reduce((sum, r) => sum + r.finalMetrics.avgWealth, 0) / variantResults.length;
    const avgGini = variantResults.reduce((sum, r) => sum + r.finalMetrics.giniCoefficient, 0) / variantResults.length;

    console.log(`${variantName}:`);
    console.log(`  Avg Survival Rate: ${(avgSurvival * 100).toFixed(1)}%`);
    console.log(`  Avg Wealth: ${avgWealth.toFixed(1)}`);
    console.log(`  Avg Gini: ${avgGini.toFixed(3)}`);
    console.log('');
  }

  return results;
}

// =============================================================================
// CLI Entry Point
// =============================================================================

async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  let configPath = '';
  let runs = 1;
  let outputDir = '';
  let verbose = false;
  let dryRun = false;
  let format: 'json' | 'csv' | 'both' = 'json';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--config':
      case '-c':
        configPath = args[++i];
        break;
      case '--runs':
      case '-r':
        runs = parseInt(args[++i], 10);
        break;
      case '--output':
      case '-o':
        outputDir = args[++i];
        break;
      case '--verbose':
      case '-v':
        verbose = true;
        break;
      case '--dry-run':
        dryRun = true;
        break;
      case '--format':
      case '-f':
        format = args[++i] as 'json' | 'csv' | 'both';
        break;
      case '--help':
      case '-h':
        console.log(`
Agents City Experiment Runner

Usage:
  bun run src/experiments/runner.ts --config <file> [options]

Options:
  -c, --config <file>   Path to experiment config (YAML or JSON)
  -r, --runs <n>        Number of runs per variant (default: 1)
  -o, --output <dir>    Output directory for results
  -v, --verbose         Verbose logging
  --dry-run             Validate config without running
  -f, --format <type>   Export format: json, csv, or both (default: json)
  -h, --help            Show this help

Example:
  bun run src/experiments/runner.ts -c experiments/scarcity.yaml -r 5 -o results/
`);
        process.exit(0);
    }
  }

  if (!configPath) {
    console.error('Error: --config is required');
    console.error('Run with --help for usage information');
    process.exit(1);
  }

  try {
    await runExperiment({
      configPath,
      runs,
      outputDir,
      verbose,
      dryRun,
      format,
    });
    process.exit(0);
  } catch (error) {
    console.error('[Runner] Fatal error:', error);
    process.exit(1);
  }
}

// Only run main if this is the entry point
if (import.meta.main) {
  main();
}
