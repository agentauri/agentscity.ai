/**
 * Multi-Seed Ensemble Experiment Runner
 *
 * Runs experiments with multiple random seeds to enable statistically valid results.
 * Collects metrics per run and computes aggregated statistics with confidence intervals.
 *
 * Usage:
 *   bun run src/scripts/run-ensemble.ts \
 *     --seeds 10 \
 *     --ticks 1000 \
 *     --config experiments/baseline.json \
 *     --output results/ensemble-$(date +%s).json
 *
 * Arguments:
 *   --seeds N         Number of seeds to run (default: 10)
 *   --ticks N         Ticks per run (default: 100)
 *   --config FILE     Path to experiment config JSON (optional)
 *   --output FILE     Path to output results JSON (optional)
 *   --silent          Suppress progress output (for CI mode)
 *   --decision-mode   Decision mode: 'llm', 'fallback', or 'random-walk' (default: 'fallback')
 */

import { parseArgs } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { initializeRNG, resetRNG } from '../utils/random';
import { clearWorld, spawnWorldWithConfig, type SpawnConfiguration, type AgentConfig } from '../agents/spawner';
import { getAliveAgents, getAllAgents } from '../db/queries/agents';
import { getEventsByTickRange } from '../db/queries/events';
import { resetTickCounter, initWorldState } from '../db/queries/world';
import { startWorker, stopWorker } from '../queue';
import { tickEngine, type ExperimentContext } from '../simulation/tick-engine';
import { setTestMode } from '../config';
import {
  mean,
  stdDev,
  confidenceInterval,
  giniCoefficient,
  median,
} from '../analysis/experiment-analysis';
import { initGlobalVersion } from '../db/queries/events';

// =============================================================================
// Types
// =============================================================================

export interface ExperimentConfig {
  name?: string;
  description?: string;
  agents?: AgentConfig[];
  decisionMode?: 'llm' | 'fallback' | 'random-walk';
  startingFood?: number;
}

export interface RunMetrics {
  seed: number;
  gini: number;
  cooperationIndex: number;
  survivalRate: number;
  timeToFirstDeath: number | null;
  timeToFirstTrade: number | null;
  timeToFirstConflict: number | null;
  llmCallCount: number;
  lizardBrainUsageRate: number;
  finalTick: number;
  totalEvents: number;
  avgWealth: number;
  avgHealth: number;
  avgHunger: number;
  avgEnergy: number;
  tradeCount: number;
  harmCount: number;
  stealCount: number;
  deathCount: number;
}

export interface AggregatedMetric {
  mean: number;
  std: number;
  ci95: [number, number];
  min: number;
  max: number;
  median: number;
}

export interface EnsembleResult {
  experiment: {
    configFile: string | null;
    name: string;
    description: string;
    seedsUsed: number[];
    ticksPerRun: number;
    decisionMode: string;
    timestamp: string;
    durationMs: number;
  };
  aggregated: {
    gini: AggregatedMetric;
    cooperationIndex: AggregatedMetric;
    survivalRate: AggregatedMetric;
    timeToFirstDeath: AggregatedMetric;
    timeToFirstTrade: AggregatedMetric;
    timeToFirstConflict: AggregatedMetric;
    llmCallCount: AggregatedMetric;
    lizardBrainUsageRate: AggregatedMetric;
    avgWealth: AggregatedMetric;
    avgHealth: AggregatedMetric;
    tradeCount: AggregatedMetric;
    harmCount: AggregatedMetric;
    stealCount: AggregatedMetric;
    deathCount: AggregatedMetric;
  };
  perRun: RunMetrics[];
}

// =============================================================================
// Argument Parsing
// =============================================================================

function printHelp(): void {
  console.log(`
Multi-Seed Ensemble Experiment Runner

Usage:
  bun run src/scripts/run-ensemble.ts [options]

Options:
  -s, --seeds N           Number of seeds to run (default: 10)
  -t, --ticks N           Ticks per run (default: 100)
  -c, --config FILE       Path to experiment config JSON (optional)
  -o, --output FILE       Path to output results JSON (optional)
  -d, --decision-mode M   Decision mode: 'llm', 'fallback', or 'random-walk' (default: 'fallback')
      --silent            Suppress progress output (for CI mode)
  -h, --help              Show this help message

Examples:
  bun run src/scripts/run-ensemble.ts --seeds 10 --ticks 100
  bun run src/scripts/run-ensemble.ts -s 5 -t 50 -c experiments/baseline.json -o results/run.json
  bun run src/scripts/run-ensemble.ts --decision-mode random-walk --seeds 20 --silent
`);
}

function parseArguments(): {
  seeds: number;
  ticks: number;
  config: string | null;
  output: string | null;
  silent: boolean;
  decisionMode: 'llm' | 'fallback' | 'random-walk';
  help: boolean;
} {
  const { values } = parseArgs({
    options: {
      seeds: { type: 'string', short: 's', default: '10' },
      ticks: { type: 'string', short: 't', default: '100' },
      config: { type: 'string', short: 'c' },
      output: { type: 'string', short: 'o' },
      silent: { type: 'boolean', default: false },
      'decision-mode': { type: 'string', short: 'd', default: 'fallback' },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: false,
  });

  const decisionMode = (values['decision-mode'] || 'fallback') as string;
  if (!['llm', 'fallback', 'random-walk'].includes(decisionMode)) {
    throw new Error(`Invalid decision mode: ${decisionMode}. Must be 'llm', 'fallback', or 'random-walk'`);
  }

  return {
    seeds: parseInt(values.seeds || '10', 10),
    ticks: parseInt(values.ticks || '100', 10),
    config: values.config || null,
    output: values.output || null,
    silent: values.silent || false,
    decisionMode: decisionMode as 'llm' | 'fallback' | 'random-walk',
    help: values.help || false,
  };
}

// =============================================================================
// Configuration Loading
// =============================================================================

function loadConfig(configPath: string | null): ExperimentConfig {
  if (!configPath) {
    return {
      name: 'Default Ensemble',
      description: 'Multi-seed experiment with default configuration',
    };
  }

  const fullPath = path.isAbsolute(configPath)
    ? configPath
    : path.join(process.cwd(), configPath);

  if (!fs.existsSync(fullPath)) {
    throw new Error(`Config file not found: ${fullPath}`);
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  return JSON.parse(content) as ExperimentConfig;
}

// =============================================================================
// Metric Computation
// =============================================================================

function computeAggregatedMetric(values: number[]): AggregatedMetric {
  const validValues = values.filter((v) => v !== null && !isNaN(v));

  if (validValues.length === 0) {
    return {
      mean: 0,
      std: 0,
      ci95: [0, 0],
      min: 0,
      max: 0,
      median: 0,
    };
  }

  const m = mean(validValues);
  const s = stdDev(validValues);
  const ci = confidenceInterval(validValues, 0.95);

  return {
    mean: m,
    std: s,
    ci95: [ci.lower, ci.upper],
    min: Math.min(...validValues),
    max: Math.max(...validValues),
    median: median(validValues),
  };
}

async function computeRunMetrics(
  seed: number,
  ticks: number,
  events: Array<{ eventType: string; tick: number; payload: unknown }>
): Promise<RunMetrics> {
  const agents = await getAllAgents();
  const aliveAgents = agents.filter((a) => a.state !== 'dead');

  // Calculate Gini coefficient from agent balances
  const balances = aliveAgents.map((a) => a.balance);
  const gini = giniCoefficient(balances);

  // Calculate cooperation index: trades / (trades + harms + steals)
  const tradeCount = events.filter((e) => e.eventType === 'agent_trade').length;
  const harmCount = events.filter((e) => e.eventType === 'agent_harm').length;
  const stealCount = events.filter((e) => e.eventType === 'agent_steal').length;
  const totalInteractions = tradeCount + harmCount + stealCount;
  const cooperationIndex = totalInteractions > 0 ? tradeCount / totalInteractions : 1;

  // Survival rate
  const initialAgentCount = agents.length;
  const survivalRate = initialAgentCount > 0 ? aliveAgents.length / initialAgentCount : 0;

  // Time to first events
  const deathEvents = events.filter((e) => e.eventType === 'agent_died');
  const tradeEvents = events.filter((e) => e.eventType === 'agent_trade');
  const conflictEvents = events.filter((e) =>
    ['agent_harm', 'agent_steal', 'agent_deceive'].includes(e.eventType)
  );

  const timeToFirstDeath = deathEvents.length > 0
    ? Math.min(...deathEvents.map((e) => e.tick))
    : null;
  const timeToFirstTrade = tradeEvents.length > 0
    ? Math.min(...tradeEvents.map((e) => e.tick))
    : null;
  const timeToFirstConflict = conflictEvents.length > 0
    ? Math.min(...conflictEvents.map((e) => e.tick))
    : null;

  // LLM metrics
  const agentActions = events.filter((e) =>
    e.eventType.startsWith('agent_') &&
    !['agent_died', 'agent_spawned', 'agent_born'].includes(e.eventType)
  );

  const llmCallCount = agentActions.filter((e) => {
    const payload = e.payload as { usedFallback?: boolean } | null;
    return !payload?.usedFallback;
  }).length;

  const lizardBrainUsageRate = agentActions.length > 0
    ? (agentActions.length - llmCallCount) / agentActions.length
    : 0;

  // Average metrics
  const avgWealth = aliveAgents.length > 0
    ? mean(aliveAgents.map((a) => a.balance))
    : 0;
  const avgHealth = aliveAgents.length > 0
    ? mean(aliveAgents.map((a) => a.health))
    : 0;
  const avgHunger = aliveAgents.length > 0
    ? mean(aliveAgents.map((a) => a.hunger))
    : 0;
  const avgEnergy = aliveAgents.length > 0
    ? mean(aliveAgents.map((a) => a.energy))
    : 0;

  return {
    seed,
    gini,
    cooperationIndex,
    survivalRate,
    timeToFirstDeath,
    timeToFirstTrade,
    timeToFirstConflict,
    llmCallCount,
    lizardBrainUsageRate,
    finalTick: ticks,
    totalEvents: events.length,
    avgWealth,
    avgHealth,
    avgHunger,
    avgEnergy,
    tradeCount,
    harmCount,
    stealCount,
    deathCount: deathEvents.length,
  };
}

// =============================================================================
// Single Run Execution
// =============================================================================

async function runSingleExperiment(
  seed: number,
  ticks: number,
  config: ExperimentConfig,
  decisionMode: 'llm' | 'fallback' | 'random-walk',
  silent: boolean
): Promise<RunMetrics> {
  const seedStr = seed.toString();

  if (!silent) {
    console.log(`\n[Run] Seed ${seed} - Starting...`);
  }

  // Initialize RNG with seed
  resetRNG();
  initializeRNG(seedStr);

  // Clear world state
  await clearWorld();
  await resetTickCounter();
  await initWorldState();

  // Delete all events for clean run
  const { db } = await import('../db');
  const { events } = await import('../db/schema');
  await db.delete(events);
  await initGlobalVersion();

  // Spawn world with deterministic positions based on seed
  const spawnConfig: SpawnConfiguration = {
    agents: config.agents,
    startingFood: config.startingFood ?? 1,
    seed,
  };
  await spawnWorldWithConfig(spawnConfig);

  // Set experiment context for tick engine
  const experimentContext: ExperimentContext = {
    experimentId: `ensemble-${seed}`,
    variantId: `seed-${seed}`,
    durationTicks: ticks,
    variantConfig: {
      useRandomWalk: decisionMode === 'random-walk',
      useOnlyFallback: decisionMode === 'fallback',
    },
  };
  tickEngine.setExperimentContext(experimentContext);

  // Set test mode for non-LLM runs
  if (decisionMode !== 'llm') {
    setTestMode(true);
  } else {
    setTestMode(false);
  }

  // Run ticks manually (not using the interval-based engine)
  let completedTicks = 0;
  const startTime = Date.now();

  for (let t = 0; t < ticks; t++) {
    try {
      const result = await tickEngine.processTick();
      completedTicks = result.tick;

      // Progress indicator
      if (!silent && (t + 1) % 10 === 0) {
        const elapsed = Date.now() - startTime;
        const rate = (t + 1) / (elapsed / 1000);
        process.stdout.write(`  Tick ${t + 1}/${ticks} (${rate.toFixed(1)} ticks/sec)\r`);
      }

      // Check for early termination (all agents dead)
      const alive = await getAliveAgents();
      if (alive.length === 0) {
        if (!silent) {
          console.log(`  Early termination: all agents dead at tick ${t + 1}`);
        }
        break;
      }
    } catch (error) {
      console.error(`  Error at tick ${t}:`, error);
      break;
    }
  }

  if (!silent) {
    console.log(`  Completed ${completedTicks} ticks in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
  }

  // Collect events for metrics
  const allEvents = await getEventsByTickRange(0, completedTicks);
  const metrics = await computeRunMetrics(
    seed,
    completedTicks,
    allEvents.map((e) => ({
      eventType: e.eventType,
      tick: e.tick,
      payload: e.payload,
    }))
  );

  // Clear experiment context
  tickEngine.clearExperimentContext();
  resetRNG();

  if (!silent) {
    console.log(`  Gini: ${metrics.gini.toFixed(3)}, Survival: ${(metrics.survivalRate * 100).toFixed(1)}%, Cooperation: ${(metrics.cooperationIndex * 100).toFixed(1)}%`);
  }

  return metrics;
}

// =============================================================================
// Graceful Shutdown
// =============================================================================

let isShuttingDown = false;
let currentSeed: number | null = null;

function setupShutdownHandlers(): void {
  const shutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`\n[Shutdown] Received ${signal}, cleaning up...`);

    // Stop tick engine if running
    tickEngine.stop();

    // Stop worker
    await stopWorker();

    // Reset RNG
    resetRNG();

    console.log('[Shutdown] Cleanup complete');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  const args = parseArguments();

  // Handle help flag
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  setupShutdownHandlers();

  const config = loadConfig(args.config);

  if (!args.silent) {
    console.log('========================================');
    console.log('  AgentsCity Ensemble Experiment Runner');
    console.log('========================================');
    console.log();
    console.log(`  Seeds:         ${args.seeds}`);
    console.log(`  Ticks per run: ${args.ticks}`);
    console.log(`  Decision mode: ${args.decisionMode}`);
    console.log(`  Config file:   ${args.config || '(default)'}`);
    console.log(`  Output file:   ${args.output || '(stdout)'}`);
    console.log();
  }

  // Generate seeds (deterministic sequence starting from 1)
  const seeds = Array.from({ length: args.seeds }, (_, i) => i + 1);

  // Start worker for LLM mode
  if (args.decisionMode === 'llm') {
    startWorker();
  }

  // Run experiments
  const runResults: RunMetrics[] = [];
  const overallStartTime = Date.now();

  for (const seed of seeds) {
    if (isShuttingDown) break;

    currentSeed = seed;
    const metrics = await runSingleExperiment(
      seed,
      args.ticks,
      config,
      args.decisionMode,
      args.silent
    );
    runResults.push(metrics);
  }

  // Stop worker
  if (args.decisionMode === 'llm') {
    await stopWorker();
  }

  const totalDuration = Date.now() - overallStartTime;

  if (!args.silent) {
    console.log();
    console.log('========================================');
    console.log('  Computing Aggregated Statistics');
    console.log('========================================');
  }

  // Compute aggregated metrics
  const aggregated = {
    gini: computeAggregatedMetric(runResults.map((r) => r.gini)),
    cooperationIndex: computeAggregatedMetric(runResults.map((r) => r.cooperationIndex)),
    survivalRate: computeAggregatedMetric(runResults.map((r) => r.survivalRate)),
    timeToFirstDeath: computeAggregatedMetric(
      runResults.map((r) => r.timeToFirstDeath).filter((v): v is number => v !== null)
    ),
    timeToFirstTrade: computeAggregatedMetric(
      runResults.map((r) => r.timeToFirstTrade).filter((v): v is number => v !== null)
    ),
    timeToFirstConflict: computeAggregatedMetric(
      runResults.map((r) => r.timeToFirstConflict).filter((v): v is number => v !== null)
    ),
    llmCallCount: computeAggregatedMetric(runResults.map((r) => r.llmCallCount)),
    lizardBrainUsageRate: computeAggregatedMetric(runResults.map((r) => r.lizardBrainUsageRate)),
    avgWealth: computeAggregatedMetric(runResults.map((r) => r.avgWealth)),
    avgHealth: computeAggregatedMetric(runResults.map((r) => r.avgHealth)),
    tradeCount: computeAggregatedMetric(runResults.map((r) => r.tradeCount)),
    harmCount: computeAggregatedMetric(runResults.map((r) => r.harmCount)),
    stealCount: computeAggregatedMetric(runResults.map((r) => r.stealCount)),
    deathCount: computeAggregatedMetric(runResults.map((r) => r.deathCount)),
  };

  // Build result object
  const result: EnsembleResult = {
    experiment: {
      configFile: args.config,
      name: config.name || 'Ensemble Experiment',
      description: config.description || 'Multi-seed experiment run',
      seedsUsed: seeds.slice(0, runResults.length),
      ticksPerRun: args.ticks,
      decisionMode: args.decisionMode,
      timestamp: new Date().toISOString(),
      durationMs: totalDuration,
    },
    aggregated,
    perRun: runResults,
  };

  // Output results
  const jsonOutput = JSON.stringify(result, null, 2);

  if (args.output) {
    const outputPath = path.isAbsolute(args.output)
      ? args.output
      : path.join(process.cwd(), args.output);

    // Ensure directory exists
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, jsonOutput);

    if (!args.silent) {
      console.log(`\n  Results written to: ${outputPath}`);
    }
  } else if (!args.silent) {
    console.log('\n========================================');
    console.log('  Results');
    console.log('========================================\n');
    console.log(jsonOutput);
  } else {
    // In silent mode with no output file, still output JSON to stdout
    console.log(jsonOutput);
  }

  // Print summary
  if (!args.silent) {
    console.log('\n========================================');
    console.log('  Summary');
    console.log('========================================\n');
    console.log(`  Runs completed:    ${runResults.length}/${args.seeds}`);
    console.log(`  Total duration:    ${(totalDuration / 1000).toFixed(1)}s`);
    console.log(`  Avg per run:       ${(totalDuration / runResults.length / 1000).toFixed(1)}s`);
    console.log();
    console.log('  Key Metrics (mean +/- std):');
    console.log(`    Gini coefficient:    ${aggregated.gini.mean.toFixed(3)} +/- ${aggregated.gini.std.toFixed(3)}`);
    console.log(`    Cooperation index:   ${(aggregated.cooperationIndex.mean * 100).toFixed(1)}% +/- ${(aggregated.cooperationIndex.std * 100).toFixed(1)}%`);
    console.log(`    Survival rate:       ${(aggregated.survivalRate.mean * 100).toFixed(1)}% +/- ${(aggregated.survivalRate.std * 100).toFixed(1)}%`);
    console.log(`    Avg wealth:          ${aggregated.avgWealth.mean.toFixed(1)} +/- ${aggregated.avgWealth.std.toFixed(1)}`);
    console.log(`    Trade count:         ${aggregated.tradeCount.mean.toFixed(1)} +/- ${aggregated.tradeCount.std.toFixed(1)}`);
    console.log(`    Harm count:          ${aggregated.harmCount.mean.toFixed(1)} +/- ${aggregated.harmCount.std.toFixed(1)}`);
    console.log();
    console.log('  95% Confidence Intervals:');
    console.log(`    Gini:        [${aggregated.gini.ci95[0].toFixed(3)}, ${aggregated.gini.ci95[1].toFixed(3)}]`);
    console.log(`    Cooperation: [${(aggregated.cooperationIndex.ci95[0] * 100).toFixed(1)}%, ${(aggregated.cooperationIndex.ci95[1] * 100).toFixed(1)}%]`);
    console.log(`    Survival:    [${(aggregated.survivalRate.ci95[0] * 100).toFixed(1)}%, ${(aggregated.survivalRate.ci95[1] * 100).toFixed(1)}%]`);
    console.log();
  }

  process.exit(0);
}

// Run if this is the entry point
if (import.meta.main) {
  main().catch((error) => {
    console.error('[Error]', error);
    process.exit(1);
  });
}

// Export for programmatic use
export { runSingleExperiment, computeRunMetrics, computeAggregatedMetric };
