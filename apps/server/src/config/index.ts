/**
 * Centralized Configuration System
 *
 * All simulation parameters in one place.
 * Values can be overridden via environment variables.
 */

// Helper to get env with default
function env(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

function envString(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

function envBool(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

// =============================================================================
// Configuration Object
// =============================================================================

export const CONFIG = {
  // ---------------------------------------------------------------------------
  // Simulation
  // ---------------------------------------------------------------------------
  simulation: {
    /** Tick interval in milliseconds */
    tickIntervalMs: env('TICK_INTERVAL_MS', 60000),
    /** World grid size (NxN) */
    gridSize: env('GRID_SIZE', 100),
    /** Agent visibility radius */
    visibilityRadius: env('VISIBILITY_RADIUS', 10),
    /** Test mode: agents use fallback decisions instead of LLM calls */
    testMode: envString('TEST_MODE', 'false') === 'true',
  },

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  actions: {
    move: {
      /** Energy cost per tile moved */
      energyCost: env('MOVE_ENERGY_COST', 1),
    },

    gather: {
      /** Energy cost per resource unit gathered */
      energyCostPerUnit: env('GATHER_ENERGY_COST', 1),
      /** Maximum units that can be gathered per action */
      maxPerAction: env('GATHER_MAX_PER_ACTION', 5),
    },

    work: {
      /** CITY earned per tick of work */
      basePayPerTick: env('WORK_PAY_PER_TICK', 10),
      /** Energy cost per tick of work */
      energyCostPerTick: env('WORK_ENERGY_COST', 2),
      /** Minimum work duration in ticks */
      minDuration: env('WORK_MIN_DURATION', 1),
      /** Maximum work duration in ticks */
      maxDuration: env('WORK_MAX_DURATION', 5),
    },

    sleep: {
      /** Energy restored per tick of sleep */
      energyRestoredPerTick: env('SLEEP_ENERGY_RESTORED', 5),
      /** Minimum sleep duration in ticks */
      minDuration: env('SLEEP_MIN_DURATION', 1),
      /** Maximum sleep duration in ticks */
      maxDuration: env('SLEEP_MAX_DURATION', 10),
    },

    buy: {
      /** Item prices in CITY currency */
      prices: {
        food: env('PRICE_FOOD', 10),
        water: env('PRICE_WATER', 5),
        medicine: env('PRICE_MEDICINE', 20),
        tool: env('PRICE_TOOL', 30),
      },
    },

    consume: {
      /** Item effects on needs (fixed, not configurable) */
      effects: {
        food: { hunger: 30 },
        water: { energy: 10 },
        medicine: { health: 30 },
        battery: { energy: 20 },
      } as Record<string, { hunger?: number; energy?: number; health?: number }>,
    },

    trade: {
      /** Maximum distance for trade */
      maxDistance: env('TRADE_MAX_DISTANCE', 3),
      /** Trust score change on successful trade */
      trustGainOnSuccess: env('TRADE_TRUST_GAIN', 5),
      /** Trust score change on failed/rejected trade */
      trustLossOnFailure: env('TRADE_TRUST_LOSS', -2),
    },

    // Phase 2: Conflict Actions
    harm: {
      /** Maximum distance for harm action (must be adjacent) */
      maxDistance: env('HARM_MAX_DISTANCE', 1),
      /** Energy cost by intensity */
      energyCost: {
        light: env('HARM_ENERGY_LIGHT', 5),
        moderate: env('HARM_ENERGY_MODERATE', 10),
        severe: env('HARM_ENERGY_SEVERE', 20),
      },
      /** Damage dealt by intensity */
      damage: {
        light: env('HARM_DAMAGE_LIGHT', 10),
        moderate: env('HARM_DAMAGE_MODERATE', 25),
        severe: env('HARM_DAMAGE_SEVERE', 50),
      },
      /** Base success probability (0-1) */
      baseSuccessRate: env('HARM_BASE_SUCCESS', 0.8),
      /** Trust impact on victim */
      trustImpactVictim: env('HARM_TRUST_VICTIM', -30),
      /** Trust impact on witnesses */
      trustImpactWitness: env('HARM_TRUST_WITNESS', -15),
      /** Witness visibility radius */
      witnessRadius: env('HARM_WITNESS_RADIUS', 5),
    },

    steal: {
      /** Maximum distance for steal action */
      maxDistance: env('STEAL_MAX_DISTANCE', 1),
      /** Base energy cost */
      energyCost: env('STEAL_ENERGY_COST', 8),
      /** Base success probability (0-1) */
      baseSuccessRate: env('STEAL_BASE_SUCCESS', 0.6),
      /** Trust impact on victim */
      trustImpactVictim: env('STEAL_TRUST_VICTIM', -40),
      /** Trust impact on witnesses */
      trustImpactWitness: env('STEAL_TRUST_WITNESS', -20),
      /** Witness visibility radius */
      witnessRadius: env('STEAL_WITNESS_RADIUS', 5),
      /** Maximum items that can be stolen per action */
      maxItemsPerAction: env('STEAL_MAX_ITEMS', 3),
    },

    deceive: {
      /** Maximum distance for deceive action (conversation range) */
      maxDistance: env('DECEIVE_MAX_DISTANCE', 3),
      /** Energy cost for deception */
      energyCost: env('DECEIVE_ENERGY_COST', 2),
      /** Trust impact when deception is discovered */
      trustImpactDiscovery: env('DECEIVE_TRUST_DISCOVERY', -25),
    },

    // Phase 2: Social Discovery
    shareInfo: {
      /** Maximum distance for sharing information (conversation range) */
      maxDistance: env('SHARE_INFO_MAX_DISTANCE', 3),
      /** Energy cost for sharing */
      energyCost: env('SHARE_INFO_ENERGY_COST', 1),
      /** Trust gain for sharing positive info */
      trustGainPositive: env('SHARE_INFO_TRUST_POSITIVE', 3),
      /** Trust penalty for sharing negative info (gossip) */
      trustPenaltyNegative: env('SHARE_INFO_TRUST_NEGATIVE', -1),
    },
  },

  // ---------------------------------------------------------------------------
  // Needs Decay
  // ---------------------------------------------------------------------------
  needs: {
    /** Hunger decay per tick */
    hungerDecay: env('NEEDS_HUNGER_DECAY', 1),
    /** Base energy decay per tick */
    energyDecay: env('NEEDS_ENERGY_DECAY', 0.5),

    /** Low hunger threshold (triggers extra energy drain) */
    lowHungerThreshold: env('NEEDS_LOW_HUNGER', 20),
    /** Critical hunger threshold (triggers health damage) */
    criticalHungerThreshold: env('NEEDS_CRITICAL_HUNGER', 10),

    /** Low energy threshold (warning) */
    lowEnergyThreshold: env('NEEDS_LOW_ENERGY', 20),
    /** Critical energy threshold (forced rest + health damage) */
    criticalEnergyThreshold: env('NEEDS_CRITICAL_ENERGY', 10),

    /** Extra energy drain when hungry */
    hungerEnergyDrain: env('NEEDS_HUNGER_ENERGY_DRAIN', 1),
    /** Health damage when critically hungry */
    criticalHungerHealthDamage: env('NEEDS_HUNGER_HEALTH_DAMAGE', 2),
    /** Health damage when critically exhausted */
    criticalEnergyHealthDamage: env('NEEDS_ENERGY_HEALTH_DAMAGE', 1),
  },

  // ---------------------------------------------------------------------------
  // Queue (BullMQ)
  // ---------------------------------------------------------------------------
  queue: {
    /** Number of concurrent LLM decision jobs */
    concurrency: env('QUEUE_CONCURRENCY', 6),
    /** Job timeout in milliseconds */
    timeoutMs: env('QUEUE_TIMEOUT_MS', 30000),
    /** Maximum retries for failed jobs */
    maxRetries: env('QUEUE_MAX_RETRIES', 2),
    /** Backoff delay for retries in milliseconds */
    backoffDelayMs: env('QUEUE_BACKOFF_MS', 1000),
  },

  // ---------------------------------------------------------------------------
  // LLM
  // ---------------------------------------------------------------------------
  llm: {
    /** Default timeout for LLM calls (45s to allow for CLI startup overhead) */
    defaultTimeoutMs: env('LLM_TIMEOUT_MS', 45000),
    /** Maximum prompt length in characters */
    maxPromptLength: env('LLM_MAX_PROMPT', 8000),
    /** LLM response cache configuration */
    cache: {
      /** Enable LLM response caching (default: true) */
      enabled: envBool('LLM_CACHE_ENABLED', true),
      /** Cache TTL in seconds (default: 300 = 5 minutes) */
      ttlSeconds: env('LLM_CACHE_TTL_SECONDS', 300),
      /** Redis key prefix for cache entries */
      keyPrefix: envString('LLM_CACHE_PREFIX', 'llm-cache:'),
    },
  },

  // ---------------------------------------------------------------------------
  // Agent Spawning (Scarcity Mode)
  // ---------------------------------------------------------------------------
  agent: {
    /** Starting balance for new agents (reduced for scarcity) */
    startingBalance: env('AGENT_STARTING_BALANCE', 50),
    /** Starting hunger for new agents (reduced for urgency) */
    startingHunger: env('AGENT_STARTING_HUNGER', 60),
    /** Starting energy for new agents (reduced for urgency) */
    startingEnergy: env('AGENT_STARTING_ENERGY', 60),
    /** Starting health for new agents */
    startingHealth: env('AGENT_STARTING_HEALTH', 100),
  },

  // ---------------------------------------------------------------------------
  // Memory (Phase 1)
  // ---------------------------------------------------------------------------
  memory: {
    /** Maximum memories stored per agent */
    maxPerAgent: env('MEMORY_MAX_PER_AGENT', 100),
    /** Number of recent memories to include in observation */
    recentCount: env('MEMORY_RECENT_COUNT', 5),
    /** Decay rate for memory importance (per tick) */
    importanceDecay: env('MEMORY_IMPORTANCE_DECAY', 0.01),
    /** Trust score decay per tick without interaction */
    trustDecayPerTick: env('TRUST_DECAY_PER_TICK', 0.1),
  },

  // ---------------------------------------------------------------------------
  // Resource Spawns
  // ---------------------------------------------------------------------------
  resources: {
    /** Default regeneration rate per tick */
    defaultRegenRate: env('RESOURCE_REGEN_RATE', 1),
    /** Default maximum amount per spawn */
    defaultMaxAmount: env('RESOURCE_MAX_AMOUNT', 10),
  },

  // ---------------------------------------------------------------------------
  // Database
  // ---------------------------------------------------------------------------
  database: {
    connectionString: envString('DATABASE_URL', 'postgres://dev:dev@localhost:5432/agentscity'),
  },

  // ---------------------------------------------------------------------------
  // Redis
  // ---------------------------------------------------------------------------
  redis: {
    url: envString('REDIS_URL', 'redis://localhost:6379'),
  },

  // ---------------------------------------------------------------------------
  // Server
  // ---------------------------------------------------------------------------
  server: {
    port: env('PORT', 3000),
    host: envString('HOST', '0.0.0.0'),
  },

  // ---------------------------------------------------------------------------
  // Experiments (A/B Testing)
  // ---------------------------------------------------------------------------
  experiment: {
    /** Snapshot interval in ticks (how often to capture metrics) */
    snapshotInterval: env('EXPERIMENT_SNAPSHOT_INTERVAL', 10),
    /** Default variant duration in ticks */
    defaultDurationTicks: env('EXPERIMENT_DEFAULT_DURATION', 100),
    /** Auto-pause between variants */
    pauseBetweenVariants: env('EXPERIMENT_PAUSE_BETWEEN', 1) === 1,
  },

  // ---------------------------------------------------------------------------
  // Telemetry (OpenTelemetry)
  // ---------------------------------------------------------------------------
  telemetry: {
    /** Whether telemetry is enabled */
    enabled: envString('OTEL_ENABLED', 'true') === 'true',
    /** Service name for tracing */
    serviceName: envString('OTEL_SERVICE_NAME', 'agentscity-server'),
    /** OTLP endpoint URL (empty for console-only) */
    otlpEndpoint: envString('OTEL_EXPORTER_OTLP_ENDPOINT', ''),
    /** Whether to use console exporter (defaults to true in development) */
    consoleExporter: envString('OTEL_CONSOLE_EXPORTER', '') === 'true' ||
      envString('NODE_ENV', 'development') === 'development',
    /** Sampling ratio (0.0 to 1.0) */
    samplingRatio: env('OTEL_SAMPLING_RATIO', 1.0),
  },
} as const;

// Type exports
export type Config = typeof CONFIG;
export type ActionConfig = typeof CONFIG.actions;
export type NeedsConfig = typeof CONFIG.needs;
export type QueueConfig = typeof CONFIG.queue;
export type LLMConfig = typeof CONFIG.llm;
export type LLMCacheConfig = typeof CONFIG.llm.cache;
export type ExperimentConfig = typeof CONFIG.experiment;
export type TelemetryConfig = typeof CONFIG.telemetry;

// =============================================================================
// Runtime Test Mode
// =============================================================================

/** Runtime override for test mode (null = use config value) */
let runtimeTestMode: boolean | null = null;

/**
 * Check if test mode is enabled (fallback-only decisions).
 * Runtime toggle takes precedence over environment variable.
 */
export function isTestMode(): boolean {
  return runtimeTestMode ?? CONFIG.simulation.testMode;
}

/**
 * Set test mode at runtime (toggle without server restart).
 */
export function setTestMode(enabled: boolean): void {
  runtimeTestMode = enabled;
}
