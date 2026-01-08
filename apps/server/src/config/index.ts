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
// Production Environment Validation
// =============================================================================

function validateProductionEnv(): void {
  if (process.env.NODE_ENV === 'production') {
    const required = ['DATABASE_URL', 'REDIS_URL'];
    const missing = required.filter((k) => !process.env[k]);
    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variables in production: ${missing.join(', ')}`
      );
    }
  }
}

// Validate on module load
validateProductionEnv();

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
    /** Random seed for reproducible experiments (default: current timestamp) */
    randomSeed: env('RANDOM_SEED', Date.now()),
  },

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------
  actions: {
    move: {
      /** Energy cost per tile moved (increased for survival pressure) */
      energyCost: env('MOVE_ENERGY_COST', 2),
      /** Hunger cost per tile moved (new: movement makes you hungry) */
      hungerCost: env('MOVE_HUNGER_COST', 0.5),
      /** Extra cost multiplier for consecutive moves (discourages spam) */
      consecutivePenalty: env('MOVE_CONSECUTIVE_PENALTY', 0.5),
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

    // Phase 4: Verifiable Credentials (§34)
    issueCredential: {
      /** Maximum distance for issuing credentials */
      maxDistance: env('ISSUE_CREDENTIAL_MAX_DISTANCE', 3),
      /** Energy cost for issuing */
      energyCost: env('ISSUE_CREDENTIAL_ENERGY_COST', 2),
      /** Trust gain when receiving credential */
      trustGainOnIssue: env('ISSUE_CREDENTIAL_TRUST_GAIN', 10),
    },

    // Phase 4: Gossip Protocol (§35)
    spreadGossip: {
      /** Maximum distance for spreading gossip */
      maxDistance: env('SPREAD_GOSSIP_MAX_DISTANCE', 3),
      /** Energy cost for gossip */
      energyCost: env('SPREAD_GOSSIP_ENERGY_COST', 1),
      /** Trust gain for positive gossip */
      trustGainPositive: env('SPREAD_GOSSIP_TRUST_POSITIVE', 2),
      /** Trust penalty for negative gossip */
      trustPenaltyNegative: env('SPREAD_GOSSIP_TRUST_NEGATIVE', -2),
    },

    // Phase 4: Reproduction (§36)
    spawnOffspring: {
      /** Minimum balance required for reproduction */
      minBalance: env('SPAWN_MIN_BALANCE', 500),
      /** Minimum energy required for reproduction */
      minEnergy: env('SPAWN_MIN_ENERGY', 80),
      /** Minimum health required for reproduction */
      minHealth: env('SPAWN_MIN_HEALTH', 90),
      /** Balance cost for reproduction */
      balanceCost: env('SPAWN_BALANCE_COST', 200),
      /** Energy cost for reproduction */
      energyCost: env('SPAWN_ENERGY_COST', 30),
      /** Gestation period in ticks */
      gestationTicks: env('SPAWN_GESTATION_TICKS', 10),
      /** Maximum partner distance */
      maxPartnerDistance: env('SPAWN_MAX_PARTNER_DISTANCE', 2),
      /** Minimum trust for partner reproduction */
      minPartnerTrust: env('SPAWN_MIN_PARTNER_TRUST', 30),
      /** Trust gain from reproduction */
      trustGainOnReproduction: env('SPAWN_TRUST_GAIN', 20),
      /** Offspring starting balance (from parent's cost) */
      offspringStartBalance: env('SPAWN_OFFSPRING_BALANCE', 100),
      /** Offspring starting energy */
      offspringStartEnergy: env('SPAWN_OFFSPRING_ENERGY', 80),
    },
  },

  // ---------------------------------------------------------------------------
  // Economy (Currency Management)
  // ---------------------------------------------------------------------------
  economy: {
    /** Currency decay rate per interval (5% = 0.05) */
    currencyDecayRate: env('CURRENCY_DECAY_RATE', 0.05),
    /** Interval in ticks for currency decay */
    currencyDecayInterval: env('CURRENCY_DECAY_INTERVAL', 10),
    /** Minimum balance exempt from decay (prevents punishing poor agents) */
    currencyDecayThreshold: env('CURRENCY_DECAY_THRESHOLD', 20),
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
  // Memory (Phase 1 + Phase 5 RAG-lite)
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

    // Phase 5: RAG-lite Memory Retrieval
    /**
     * Enable RAG-lite contextual memory retrieval.
     * When enabled, agents receive memories about:
     * - Nearby agents (reputation/vendetta tracking)
     * - Current location (spatial memory)
     * - High-importance past events
     * Default: false for backward compatibility
     */
    enableRAGRetrieval: envBool('ENABLE_RAG_MEMORY', false),
    /** Maximum memories per nearby agent in RAG retrieval */
    ragPerAgentLimit: env('RAG_PER_AGENT_LIMIT', 2),
    /** Maximum location-relevant memories in RAG retrieval */
    ragLocationLimit: env('RAG_LOCATION_LIMIT', 3),
    /** Maximum important memories in RAG retrieval */
    ragImportantLimit: env('RAG_IMPORTANT_LIMIT', 3),
    /** Total maximum memories in RAG retrieval (to prevent context overflow) */
    ragTotalLimit: env('RAG_TOTAL_LIMIT', 12),
    /** Radius for location-based memory search */
    ragLocationRadius: env('RAG_LOCATION_RADIUS', 3),
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
    connectionString: envString('DATABASE_URL', 'postgres://dev:dev@localhost:5432/simagents'),
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
  // CORS
  // ---------------------------------------------------------------------------
  cors: {
    /** Comma-separated list of allowed origins (use * for all in dev) */
    allowedOrigins: envString(
      'CORS_ALLOWED_ORIGINS',
      'http://localhost:5173,http://localhost:3000'
    )
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    /** Whether to allow credentials in CORS requests */
    credentials: envBool('CORS_CREDENTIALS', true),
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

    // -------------------------------------------------------------------------
    // Phase 5: Personality Diversification
    // -------------------------------------------------------------------------
    /**
     * Enable personality diversification for agents.
     * When enabled, agents are assigned personality traits that subtly
     * influence their decision-making (aggressive, cooperative, cautious, etc.)
     * 40% of agents are 'neutral' (control group) for scientific comparison.
     * Default: false for backward compatibility
     */
    enablePersonalities: envBool('ENABLE_PERSONALITIES', false),

    // -------------------------------------------------------------------------
    // Model Capability Normalization
    // -------------------------------------------------------------------------
    /** Enable capability normalization to reduce model differences */
    normalizeCapabilities: envBool('NORMALIZE_CAPABILITIES', false),
    /** Target max tokens when normalization is enabled */
    normalizedTokenLimit: env('NORMALIZED_TOKEN_LIMIT', 2048),
    /** Target latency in ms when normalization is enabled (adds delay to fast models) */
    normalizedLatencyMs: env('NORMALIZED_LATENCY_MS', 1000),
    /** Max context characters when normalization is enabled */
    normalizedContextChars: env('NORMALIZED_CONTEXT_CHARS', 8000),

    // -------------------------------------------------------------------------
    // Synthetic Vocabulary (Priors Limiting)
    // -------------------------------------------------------------------------
    /** Use synthetic vocabulary to reduce LLM training priors influence */
    useSyntheticVocabulary: envBool('USE_SYNTHETIC_VOCABULARY', false),

    // -------------------------------------------------------------------------
    // Safety Filter Ablation (Research)
    // -------------------------------------------------------------------------
    /**
     * Safety level for prompts: 'standard' | 'minimal' | 'none'
     * - standard: Default helpful/harmless framing
     * - minimal: Remove helpfulness, keep harm warnings
     * - none: Purely descriptive, no moral framing (RESEARCH ONLY)
     */
    safetyLevel: envString('SAFETY_LEVEL', 'standard') as 'standard' | 'minimal' | 'none',

    // -------------------------------------------------------------------------
    // Emergent Prompt System
    // -------------------------------------------------------------------------
    /**
     * Use emergent prompt system instead of prescriptive prompts.
     * Emergent prompts only provide world physics and sensory descriptions,
     * allowing agents to discover survival strategies through experience.
     * Default: true (emergent behavior is the goal)
     */
    useEmergentPrompt: envBool('USE_EMERGENT_PROMPT', true),

    // -------------------------------------------------------------------------
    // Baseline Agents (Scientific Comparison)
    // -------------------------------------------------------------------------
    /** Include baseline (non-LLM) agents for scientific comparison */
    includeBaselineAgents: envBool('INCLUDE_BASELINE_AGENTS', false),
    /** Number of each baseline agent type to include (1-3) */
    baselineAgentCount: Math.min(3, Math.max(1, env('BASELINE_AGENT_COUNT', 1))),
  },

  // ---------------------------------------------------------------------------
  // Telemetry (OpenTelemetry)
  // ---------------------------------------------------------------------------
  telemetry: {
    /** Whether telemetry is enabled */
    enabled: envString('OTEL_ENABLED', 'true') === 'true',
    /** Service name for tracing */
    serviceName: envString('OTEL_SERVICE_NAME', 'simagents-server'),
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
export type EconomyConfig = typeof CONFIG.economy;
export type NeedsConfig = typeof CONFIG.needs;
export type QueueConfig = typeof CONFIG.queue;
export type LLMConfig = typeof CONFIG.llm;
export type LLMCacheConfig = typeof CONFIG.llm.cache;
export type MemoryConfig = typeof CONFIG.memory;
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

// =============================================================================
// Runtime Emergent Prompt Mode
// =============================================================================

/** Runtime override for emergent prompt mode (null = use config value) */
let runtimeEmergentPrompt: boolean | null = null;

/**
 * Check if emergent prompt mode is enabled.
 * Emergent prompts use sensory descriptions and world physics only,
 * without prescriptive survival strategies.
 * Runtime toggle takes precedence over environment variable.
 */
export function isEmergentPromptEnabled(): boolean {
  return runtimeEmergentPrompt ?? CONFIG.experiment.useEmergentPrompt;
}

/**
 * Set emergent prompt mode at runtime (toggle without server restart).
 * Useful for A/B testing between prescriptive and emergent prompts.
 */
export function setEmergentPromptMode(enabled: boolean): void {
  runtimeEmergentPrompt = enabled;
}

// =============================================================================
// Runtime Configuration Overrides
// =============================================================================

/**
 * Runtime configuration overrides.
 * These allow modifying config values without restarting the server.
 * Values here override the corresponding CONFIG values.
 */
interface RuntimeConfigOverrides {
  simulation?: {
    tickIntervalMs?: number;
  };
  agent?: {
    startingBalance?: number;
    startingHunger?: number;
    startingEnergy?: number;
    startingHealth?: number;
  };
  needs?: {
    hungerDecay?: number;
    energyDecay?: number;
    lowHungerThreshold?: number;
    criticalHungerThreshold?: number;
    lowEnergyThreshold?: number;
    criticalEnergyThreshold?: number;
  };
  llmCache?: {
    enabled?: boolean;
    ttlSeconds?: number;
  };
  actions?: {
    move?: {
      energyCost?: number;
      hungerCost?: number;
      consecutivePenalty?: number;
    };
    gather?: {
      energyCostPerUnit?: number;
      maxPerAction?: number;
    };
    work?: {
      basePayPerTick?: number;
      energyCostPerTick?: number;
    };
    sleep?: {
      energyRestoredPerTick?: number;
    };
  };
  economy?: {
    currencyDecayRate?: number;
    currencyDecayInterval?: number;
    currencyDecayThreshold?: number;
  };
}

let runtimeOverrides: RuntimeConfigOverrides = {};

/**
 * Get merged configuration (base CONFIG + runtime overrides).
 * Use this for values that can be modified at runtime.
 */
export function getRuntimeConfig(): RuntimeConfigOverrides & typeof CONFIG {
  return {
    ...CONFIG,
    simulation: {
      ...CONFIG.simulation,
      testMode: isTestMode(),
      ...runtimeOverrides.simulation,
    },
    agent: {
      ...CONFIG.agent,
      ...runtimeOverrides.agent,
    },
    needs: {
      ...CONFIG.needs,
      ...runtimeOverrides.needs,
    },
    llm: {
      ...CONFIG.llm,
      cache: {
        ...CONFIG.llm.cache,
        ...runtimeOverrides.llmCache,
      },
    },
    experiment: {
      ...CONFIG.experiment,
      useEmergentPrompt: isEmergentPromptEnabled(),
    },
    actions: {
      ...CONFIG.actions,
      move: {
        ...CONFIG.actions.move,
        ...runtimeOverrides.actions?.move,
      },
      gather: {
        ...CONFIG.actions.gather,
        ...runtimeOverrides.actions?.gather,
      },
      work: {
        ...CONFIG.actions.work,
        ...runtimeOverrides.actions?.work,
      },
      sleep: {
        ...CONFIG.actions.sleep,
        ...runtimeOverrides.actions?.sleep,
      },
    },
    economy: {
      ...CONFIG.economy,
      ...runtimeOverrides.economy,
    },
  };
}

/**
 * Set runtime configuration overrides.
 * Deep merges with existing overrides.
 */
export function setRuntimeConfig(updates: RuntimeConfigOverrides): void {
  runtimeOverrides = {
    simulation: { ...runtimeOverrides.simulation, ...updates.simulation },
    agent: { ...runtimeOverrides.agent, ...updates.agent },
    needs: { ...runtimeOverrides.needs, ...updates.needs },
    llmCache: { ...runtimeOverrides.llmCache, ...updates.llmCache },
    actions: updates.actions ? {
      move: { ...runtimeOverrides.actions?.move, ...updates.actions.move },
      gather: { ...runtimeOverrides.actions?.gather, ...updates.actions.gather },
      work: { ...runtimeOverrides.actions?.work, ...updates.actions.work },
      sleep: { ...runtimeOverrides.actions?.sleep, ...updates.actions.sleep },
    } : runtimeOverrides.actions,
    economy: { ...runtimeOverrides.economy, ...updates.economy },
  };
}

/**
 * Reset all runtime configuration overrides to defaults.
 */
export function resetRuntimeConfig(): void {
  runtimeOverrides = {};
  runtimeTestMode = null;
  runtimeEmergentPrompt = null;
}

/**
 * Get current runtime overrides (for debugging/inspection).
 */
export function getRuntimeOverrides(): RuntimeConfigOverrides {
  return { ...runtimeOverrides };
}
