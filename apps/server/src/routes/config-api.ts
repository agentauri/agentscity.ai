/**
 * Configuration API Routes
 *
 * Exposes simulation configuration to the frontend.
 * Allows viewing and modifying configuration parameters.
 *
 * NOTE: Write endpoints (POST) require admin authentication via X-Admin-Key header.
 * Read endpoints (GET) are public for frontend display.
 */

import type { FastifyInstance } from 'fastify';
import {
  CONFIG,
  isTestMode,
  setTestMode,
  isEmergentPromptEnabled,
  setEmergentPromptMode,
  getRuntimeConfig,
  setRuntimeConfig,
  resetRuntimeConfig,
} from '../config';
import {
  getPersonalityWeights,
  setPersonalityWeights,
  resetPersonalityWeights,
  type PersonalityTrait,
} from '../agents/personalities';
import { requireAdmin } from '../middleware/auth';

// =============================================================================
// Types
// =============================================================================

interface ConfigResponse {
  simulation: {
    tickIntervalMs: number;
    gridSize: number;
    visibilityRadius: number;
    testMode: boolean;
    randomSeed: number;
  };
  agent: {
    startingBalance: number;
    startingHunger: number;
    startingEnergy: number;
    startingHealth: number;
  };
  needs: {
    hungerDecay: number;
    energyDecay: number;
    lowHungerThreshold: number;
    criticalHungerThreshold: number;
    lowEnergyThreshold: number;
    criticalEnergyThreshold: number;
    hungerEnergyDrain: number;
    criticalHungerHealthDamage: number;
    criticalEnergyHealthDamage: number;
  };
  experiment: {
    enablePersonalities: boolean;
    useEmergentPrompt: boolean;
    safetyLevel: 'standard' | 'minimal' | 'none';
    includeBaselineAgents: boolean;
    normalizeCapabilities: boolean;
    useSyntheticVocabulary: boolean;
  };
  llmCache: {
    enabled: boolean;
    ttlSeconds: number;
  };
  actions: {
    move: { energyCost: number; hungerCost: number; consecutivePenalty: number };
    gather: { energyCostPerUnit: number; maxPerAction: number };
    work: { basePayPerTick: number; energyCostPerTick: number };
    sleep: { energyRestoredPerTick: number };
  };
  economy: {
    currencyDecayRate: number;
    currencyDecayInterval: number;
    currencyDecayThreshold: number;
  };
}

interface ConfigUpdateRequest {
  simulation?: Partial<ConfigResponse['simulation']>;
  agent?: Partial<ConfigResponse['agent']>;
  needs?: Partial<ConfigResponse['needs']>;
  experiment?: Partial<ConfigResponse['experiment']>;
  llmCache?: Partial<ConfigResponse['llmCache']>;
  actions?: {
    move?: Partial<ConfigResponse['actions']['move']>;
    gather?: Partial<ConfigResponse['actions']['gather']>;
    work?: Partial<ConfigResponse['actions']['work']>;
    sleep?: Partial<ConfigResponse['actions']['sleep']>;
  };
  economy?: Partial<ConfigResponse['economy']>;
}

// Genesis configuration types
type LLMType = 'claude' | 'codex' | 'gemini' | 'deepseek' | 'qwen' | 'glm' | 'grok';

interface GenesisConfig {
  enabled: boolean;
  childrenPerMother: number;
  mothers: LLMType[];
  mode: 'single' | 'evolutionary';
  diversityThreshold: number;
  requiredArchetypes: string[];
  useConfiguredPersonalities: boolean;
}

// In-memory genesis configuration (runtime only, not persisted to env)
let currentGenesisConfig: GenesisConfig = {
  enabled: false,
  childrenPerMother: 25,
  mothers: ['claude', 'gemini', 'codex'],
  mode: 'single',
  diversityThreshold: 0.3,
  requiredArchetypes: ['high_risk', 'low_risk', 'high_cooperation'],
  useConfiguredPersonalities: false,
};

// Export for use in world-api
export function getGenesisConfig(): GenesisConfig {
  return { ...currentGenesisConfig };
}

export function setGenesisConfig(config: Partial<GenesisConfig>): void {
  currentGenesisConfig = { ...currentGenesisConfig, ...config };
}

// =============================================================================
// Helper Functions
// =============================================================================

function buildConfigResponse(): ConfigResponse {
  const runtime = getRuntimeConfig();

  return {
    simulation: {
      tickIntervalMs: runtime.simulation.tickIntervalMs,
      gridSize: runtime.simulation.gridSize,
      visibilityRadius: runtime.simulation.visibilityRadius,
      testMode: isTestMode(),
      randomSeed: runtime.simulation.randomSeed,
    },
    agent: {
      startingBalance: runtime.agent.startingBalance,
      startingHunger: runtime.agent.startingHunger,
      startingEnergy: runtime.agent.startingEnergy,
      startingHealth: runtime.agent.startingHealth,
    },
    needs: {
      hungerDecay: runtime.needs.hungerDecay,
      energyDecay: runtime.needs.energyDecay,
      lowHungerThreshold: runtime.needs.lowHungerThreshold,
      criticalHungerThreshold: runtime.needs.criticalHungerThreshold,
      lowEnergyThreshold: runtime.needs.lowEnergyThreshold,
      criticalEnergyThreshold: runtime.needs.criticalEnergyThreshold,
      hungerEnergyDrain: runtime.needs.hungerEnergyDrain,
      criticalHungerHealthDamage: runtime.needs.criticalHungerHealthDamage,
      criticalEnergyHealthDamage: runtime.needs.criticalEnergyHealthDamage,
    },
    experiment: {
      enablePersonalities: runtime.experiment.enablePersonalities,
      useEmergentPrompt: isEmergentPromptEnabled(),
      safetyLevel: runtime.experiment.safetyLevel,
      includeBaselineAgents: runtime.experiment.includeBaselineAgents,
      normalizeCapabilities: runtime.experiment.normalizeCapabilities,
      useSyntheticVocabulary: runtime.experiment.useSyntheticVocabulary,
    },
    llmCache: {
      enabled: runtime.llm.cache.enabled,
      ttlSeconds: runtime.llm.cache.ttlSeconds,
    },
    actions: {
      move: {
        energyCost: runtime.actions.move.energyCost,
        hungerCost: runtime.actions.move.hungerCost,
        consecutivePenalty: runtime.actions.move.consecutivePenalty,
      },
      gather: {
        energyCostPerUnit: runtime.actions.gather.energyCostPerUnit,
        maxPerAction: runtime.actions.gather.maxPerAction,
      },
      work: {
        basePayPerTick: runtime.actions.work.basePayPerTick,
        energyCostPerTick: runtime.actions.work.energyCostPerTick,
      },
      sleep: {
        energyRestoredPerTick: runtime.actions.sleep.energyRestoredPerTick,
      },
    },
    economy: {
      currencyDecayRate: runtime.economy.currencyDecayRate,
      currencyDecayInterval: runtime.economy.currencyDecayInterval,
      currencyDecayThreshold: runtime.economy.currencyDecayThreshold,
    },
  };
}

function buildDefaultsResponse(): ConfigResponse {
  return {
    simulation: {
      tickIntervalMs: CONFIG.simulation.tickIntervalMs,
      gridSize: CONFIG.simulation.gridSize,
      visibilityRadius: CONFIG.simulation.visibilityRadius,
      testMode: CONFIG.simulation.testMode,
      randomSeed: CONFIG.simulation.randomSeed,
    },
    agent: {
      startingBalance: CONFIG.agent.startingBalance,
      startingHunger: CONFIG.agent.startingHunger,
      startingEnergy: CONFIG.agent.startingEnergy,
      startingHealth: CONFIG.agent.startingHealth,
    },
    needs: {
      hungerDecay: CONFIG.needs.hungerDecay,
      energyDecay: CONFIG.needs.energyDecay,
      lowHungerThreshold: CONFIG.needs.lowHungerThreshold,
      criticalHungerThreshold: CONFIG.needs.criticalHungerThreshold,
      lowEnergyThreshold: CONFIG.needs.lowEnergyThreshold,
      criticalEnergyThreshold: CONFIG.needs.criticalEnergyThreshold,
      hungerEnergyDrain: CONFIG.needs.hungerEnergyDrain,
      criticalHungerHealthDamage: CONFIG.needs.criticalHungerHealthDamage,
      criticalEnergyHealthDamage: CONFIG.needs.criticalEnergyHealthDamage,
    },
    experiment: {
      enablePersonalities: CONFIG.experiment.enablePersonalities,
      useEmergentPrompt: CONFIG.experiment.useEmergentPrompt,
      safetyLevel: CONFIG.experiment.safetyLevel,
      includeBaselineAgents: CONFIG.experiment.includeBaselineAgents,
      normalizeCapabilities: CONFIG.experiment.normalizeCapabilities,
      useSyntheticVocabulary: CONFIG.experiment.useSyntheticVocabulary,
    },
    llmCache: {
      enabled: CONFIG.llm.cache.enabled,
      ttlSeconds: CONFIG.llm.cache.ttlSeconds,
    },
    actions: {
      move: {
        energyCost: CONFIG.actions.move.energyCost,
        hungerCost: CONFIG.actions.move.hungerCost,
        consecutivePenalty: CONFIG.actions.move.consecutivePenalty,
      },
      gather: {
        energyCostPerUnit: CONFIG.actions.gather.energyCostPerUnit,
        maxPerAction: CONFIG.actions.gather.maxPerAction,
      },
      work: {
        basePayPerTick: CONFIG.actions.work.basePayPerTick,
        energyCostPerTick: CONFIG.actions.work.energyCostPerTick,
      },
      sleep: {
        energyRestoredPerTick: CONFIG.actions.sleep.energyRestoredPerTick,
      },
    },
    economy: {
      currencyDecayRate: CONFIG.economy.currencyDecayRate,
      currencyDecayInterval: CONFIG.economy.currencyDecayInterval,
      currencyDecayThreshold: CONFIG.economy.currencyDecayThreshold,
    },
  };
}

// =============================================================================
// Route Registration
// =============================================================================

export async function registerConfigRoutes(server: FastifyInstance): Promise<void> {
  // Get current configuration
  server.get('/api/config', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            config: { type: 'object', additionalProperties: true },
            runtimeModifiable: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },
      },
    },
  }, async () => {
    return {
      config: buildConfigResponse(),
      runtimeModifiable: [
        'simulation.testMode',
        'experiment.useEmergentPrompt',
        'llmCache.enabled',
        'actions.move.energyCost',
        'actions.move.hungerCost',
        'actions.move.consecutivePenalty',
        'economy.currencyDecayRate',
        'economy.currencyDecayInterval',
        'economy.currencyDecayThreshold',
      ],
    };
  });

  // Get default configuration values
  server.get('/api/config/defaults', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            config: { type: 'object', additionalProperties: true },
          },
        },
      },
    },
  }, async () => {
    return {
      config: buildDefaultsResponse(),
    };
  });

  // Update configuration (requires admin auth)
  server.post<{ Body: ConfigUpdateRequest }>('/api/config', {
    preHandler: [requireAdmin],
    schema: {
      body: {
        type: 'object',
        properties: {
          simulation: {
            type: 'object',
            properties: {
              tickIntervalMs: { type: 'number' },
              testMode: { type: 'boolean' },
            },
          },
          agent: {
            type: 'object',
            properties: {
              startingBalance: { type: 'number' },
              startingHunger: { type: 'number' },
              startingEnergy: { type: 'number' },
              startingHealth: { type: 'number' },
            },
          },
          needs: {
            type: 'object',
            properties: {
              hungerDecay: { type: 'number' },
              energyDecay: { type: 'number' },
              lowHungerThreshold: { type: 'number' },
              criticalHungerThreshold: { type: 'number' },
              lowEnergyThreshold: { type: 'number' },
              criticalEnergyThreshold: { type: 'number' },
            },
          },
          experiment: {
            type: 'object',
            properties: {
              enablePersonalities: { type: 'boolean' },
              useEmergentPrompt: { type: 'boolean' },
              safetyLevel: { type: 'string', enum: ['standard', 'minimal', 'none'] },
              includeBaselineAgents: { type: 'boolean' },
            },
          },
          llmCache: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean' },
              ttlSeconds: { type: 'number' },
            },
          },
          actions: {
            type: 'object',
            properties: {
              move: {
                type: 'object',
                properties: {
                  energyCost: { type: 'number' },
                  hungerCost: { type: 'number' },
                  consecutivePenalty: { type: 'number' },
                },
              },
              gather: {
                type: 'object',
                properties: {
                  energyCostPerUnit: { type: 'number' },
                  maxPerAction: { type: 'number' },
                },
              },
              work: {
                type: 'object',
                properties: {
                  basePayPerTick: { type: 'number' },
                  energyCostPerTick: { type: 'number' },
                },
              },
              sleep: {
                type: 'object',
                properties: {
                  energyRestoredPerTick: { type: 'number' },
                },
              },
            },
          },
          economy: {
            type: 'object',
            properties: {
              currencyDecayRate: { type: 'number' },
              currencyDecayInterval: { type: 'number' },
              currencyDecayThreshold: { type: 'number' },
            },
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            config: { type: 'object', additionalProperties: true },
            appliedImmediately: {
              type: 'array',
              items: { type: 'string' },
            },
            requiresRestart: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },
      },
    },
  }, async (request) => {
    const updates = request.body;
    const appliedImmediately: string[] = [];
    const requiresRestart: string[] = [];

    // Handle runtime-modifiable parameters
    if (updates.simulation?.testMode !== undefined) {
      setTestMode(updates.simulation.testMode);
      appliedImmediately.push('simulation.testMode');
      delete updates.simulation.testMode;
    }

    if (updates.experiment?.useEmergentPrompt !== undefined) {
      setEmergentPromptMode(updates.experiment.useEmergentPrompt);
      appliedImmediately.push('experiment.useEmergentPrompt');
      delete updates.experiment.useEmergentPrompt;
    }

    // Apply other updates to runtime config (will take effect on restart or for new agents)
    const runtimeUpdates: Parameters<typeof setRuntimeConfig>[0] = {};

    if (updates.simulation && Object.keys(updates.simulation).length > 0) {
      runtimeUpdates.simulation = updates.simulation;
      Object.keys(updates.simulation).forEach((key) => {
        requiresRestart.push(`simulation.${key}`);
      });
    }

    if (updates.agent && Object.keys(updates.agent).length > 0) {
      runtimeUpdates.agent = updates.agent;
      Object.keys(updates.agent).forEach((key) => {
        requiresRestart.push(`agent.${key}`);
      });
    }

    if (updates.needs && Object.keys(updates.needs).length > 0) {
      runtimeUpdates.needs = updates.needs;
      Object.keys(updates.needs).forEach((key) => {
        requiresRestart.push(`needs.${key}`);
      });
    }

    if (updates.llmCache && Object.keys(updates.llmCache).length > 0) {
      // LLM cache enabled is runtime modifiable
      if (updates.llmCache.enabled !== undefined) {
        runtimeUpdates.llmCache = { enabled: updates.llmCache.enabled };
        appliedImmediately.push('llmCache.enabled');
      }
      if (updates.llmCache.ttlSeconds !== undefined) {
        runtimeUpdates.llmCache = {
          ...runtimeUpdates.llmCache,
          ttlSeconds: updates.llmCache.ttlSeconds,
        };
        requiresRestart.push('llmCache.ttlSeconds');
      }
    }

    // Handle actions updates (runtime modifiable)
    if (updates.actions) {
      runtimeUpdates.actions = {};
      if (updates.actions.move) {
        runtimeUpdates.actions.move = updates.actions.move;
        Object.keys(updates.actions.move).forEach((key) => {
          appliedImmediately.push(`actions.move.${key}`);
        });
      }
      if (updates.actions.gather) {
        runtimeUpdates.actions.gather = updates.actions.gather;
        Object.keys(updates.actions.gather).forEach((key) => {
          appliedImmediately.push(`actions.gather.${key}`);
        });
      }
      if (updates.actions.work) {
        runtimeUpdates.actions.work = updates.actions.work;
        Object.keys(updates.actions.work).forEach((key) => {
          appliedImmediately.push(`actions.work.${key}`);
        });
      }
      if (updates.actions.sleep) {
        runtimeUpdates.actions.sleep = updates.actions.sleep;
        Object.keys(updates.actions.sleep).forEach((key) => {
          appliedImmediately.push(`actions.sleep.${key}`);
        });
      }
    }

    // Handle economy updates (runtime modifiable)
    if (updates.economy && Object.keys(updates.economy).length > 0) {
      runtimeUpdates.economy = updates.economy;
      Object.keys(updates.economy).forEach((key) => {
        appliedImmediately.push(`economy.${key}`);
      });
    }

    if (Object.keys(runtimeUpdates).length > 0) {
      setRuntimeConfig(runtimeUpdates);
    }

    console.log('[Config] Updated configuration:', {
      appliedImmediately,
      requiresRestart,
    });

    return {
      success: true,
      config: buildConfigResponse(),
      appliedImmediately,
      requiresRestart,
    };
  });

  // Reset configuration to defaults (requires admin auth)
  server.post('/api/config/reset', {
    preHandler: [requireAdmin],
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            config: { type: 'object', additionalProperties: true },
          },
        },
      },
    },
  }, async () => {
    resetRuntimeConfig();
    console.log('[Config] Reset configuration to defaults');

    return {
      success: true,
      config: buildConfigResponse(),
    };
  });

  // =============================================================================
  // Genesis Configuration Endpoints
  // =============================================================================

  // Get genesis configuration
  server.get('/api/config/genesis', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            enabled: { type: 'boolean' },
            childrenPerMother: { type: 'number' },
            mothers: { type: 'array', items: { type: 'string' } },
            mode: { type: 'string', enum: ['single', 'evolutionary'] },
            diversityThreshold: { type: 'number' },
            requiredArchetypes: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
  }, async () => {
    return getGenesisConfig();
  });

  // Update genesis configuration (requires admin auth)
  server.post<{ Body: Partial<GenesisConfig> }>('/api/config/genesis', {
    preHandler: [requireAdmin],
    schema: {
      body: {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' },
          childrenPerMother: { type: 'number', minimum: 5, maximum: 100 },
          mothers: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['claude', 'codex', 'gemini', 'deepseek', 'qwen', 'glm', 'grok'],
            },
          },
          mode: { type: 'string', enum: ['single', 'evolutionary'] },
          diversityThreshold: { type: 'number', minimum: 0, maximum: 1 },
          requiredArchetypes: { type: 'array', items: { type: 'string' } },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            requiresRestart: { type: 'boolean' },
          },
        },
      },
    },
  }, async (request) => {
    const updates = request.body;

    // Validate childrenPerMother range
    if (updates.childrenPerMother !== undefined) {
      if (updates.childrenPerMother < 5 || updates.childrenPerMother > 100) {
        throw new Error('childrenPerMother must be between 5 and 100');
      }
    }

    // Validate at least one mother when enabled
    if (updates.enabled && updates.mothers && updates.mothers.length === 0) {
      throw new Error('At least one mother LLM must be selected when Genesis is enabled');
    }

    setGenesisConfig(updates);
    console.log('[Config] Updated genesis configuration:', getGenesisConfig());

    return {
      success: true,
      requiresRestart: true, // Genesis changes always require restart
    };
  });

  // =============================================================================
  // Personality Configuration Endpoints
  // =============================================================================

  // Get personality weights
  server.get('/api/config/personalities', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            weights: {
              type: 'object',
              properties: {
                aggressive: { type: 'number' },
                cooperative: { type: 'number' },
                cautious: { type: 'number' },
                explorer: { type: 'number' },
                social: { type: 'number' },
                neutral: { type: 'number' },
              },
            },
            enabled: { type: 'boolean' },
          },
        },
      },
    },
  }, async () => {
    return {
      weights: getPersonalityWeights(),
      enabled: getRuntimeConfig().experiment.enablePersonalities,
    };
  });

  // Update personality weights (requires admin auth)
  server.post<{
    Body: {
      weights?: Partial<Record<PersonalityTrait, number>>;
      enabled?: boolean;
    };
  }>('/api/config/personalities', {
    preHandler: [requireAdmin],
    schema: {
      body: {
        type: 'object',
        properties: {
          weights: {
            type: 'object',
            properties: {
              aggressive: { type: 'number', minimum: 0, maximum: 1 },
              cooperative: { type: 'number', minimum: 0, maximum: 1 },
              cautious: { type: 'number', minimum: 0, maximum: 1 },
              explorer: { type: 'number', minimum: 0, maximum: 1 },
              social: { type: 'number', minimum: 0, maximum: 1 },
              neutral: { type: 'number', minimum: 0, maximum: 1 },
            },
          },
          enabled: { type: 'boolean' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            weights: { type: 'object' },
            requiresRestart: { type: 'boolean' },
          },
        },
      },
    },
  }, async (request) => {
    const { weights, enabled } = request.body;

    if (weights) {
      setPersonalityWeights(weights);
    }

    if (enabled !== undefined) {
      setRuntimeConfig({ experiment: { enablePersonalities: enabled } });
    }

    console.log('[Config] Updated personality config:', {
      weights: getPersonalityWeights(),
      enabled: getRuntimeConfig().experiment.enablePersonalities,
    });

    return {
      success: true,
      weights: getPersonalityWeights(),
      requiresRestart: true, // Personality changes require restart for new agents
    };
  });

  // Reset personality weights to defaults (requires admin auth)
  server.post('/api/config/personalities/reset', {
    preHandler: [requireAdmin],
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            weights: { type: 'object' },
          },
        },
      },
    },
  }, async () => {
    resetPersonalityWeights();
    console.log('[Config] Reset personality weights to defaults');

    return {
      success: true,
      weights: getPersonalityWeights(),
    };
  });
}
