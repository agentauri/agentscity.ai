# Experiment Design Guide

This guide covers how to design, run, and analyze scientific experiments in Agents City.

## Table of Contents

1. [Overview](#overview)
2. [Experiment DSL](#experiment-dsl)
3. [Agent Types](#agent-types)
4. [Baseline Agents](#baseline-agents)
5. [Shock System](#shock-system)
6. [Running Experiments](#running-experiments)
7. [Statistical Analysis](#statistical-analysis)
8. [Best Practices](#best-practices)

---

## Overview

Agents City provides a complete scientific research platform for studying emergent behavior in multi-agent systems. The platform supports:

- **Controlled experiments** with reproducible seeds
- **Multiple agent types** (LLM-powered and baseline algorithms)
- **Shock injection** for perturbation studies
- **Ensemble runs** with statistical aggregation
- **Comprehensive metrics** and significance testing

### Philosophy: Imposed vs Emergent

The platform distinguishes between:

**Imposed (Infrastructure)**:
- Grid world physics, movement, collision
- Survival mechanics (hunger, energy, health)
- Resource distribution and regeneration
- Currency infrastructure

**Emergent (Agent-Created)**:
- Movement strategies, resource gathering patterns
- Trade conventions, pricing
- Social structures, alliances
- Reputation, trust

Experiments should measure emergent behaviors, not imposed mechanics.

---

## Experiment DSL

Experiments are defined using a JSON/YAML schema. The schema is validated at load time.

### Basic Structure

```json
{
  "name": "My Experiment",
  "description": "Tests agent behavior under resource scarcity",
  "hypothesis": "Cooperative agents survive longer in scarce environments",
  "seed": 42,
  "duration": 1000,
  "world": {
    "size": [100, 100],
    "biomes": {
      "forest": 0.25,
      "desert": 0.25,
      "tundra": 0.25,
      "plains": 0.25
    },
    "scarcityMultiplier": 0.5
  },
  "agents": [
    { "type": "claude", "count": 3 },
    { "type": "gemini", "count": 3 }
  ],
  "resources": {
    "food": { "clusters": 7, "maxAmount": 20, "regenRate": 1.0 },
    "energy": { "clusters": 5, "maxAmount": 15, "regenRate": 0.6 },
    "material": { "clusters": 3, "maxAmount": 25, "regenRate": 0.3 }
  },
  "shelters": 10,
  "metrics": ["survivalRate", "giniCoefficient", "cooperationIndex", "tradeCount"],
  "mode": "llm"
}
```

### Schema Reference

#### Root Fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | string | Yes | - | Experiment identifier |
| `description` | string | No | - | Human-readable description |
| `hypothesis` | string | No | - | Scientific hypothesis being tested |
| `seed` | number | No | `Date.now()` | Random seed for reproducibility |
| `duration` | number | Yes | - | Simulation duration in ticks |
| `tickIntervalMs` | number | No | 1000 | Tick interval in milliseconds |
| `mode` | string | No | `"llm"` | Decision mode: `llm`, `fallback`, `random_walk` |

#### World Configuration (`world`)

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `size` | `[number, number]` | `[100, 100]` | Grid dimensions `[width, height]` |
| `biomes` | `Record<BiomeType, number>` | Equal distribution | Biome proportions (must sum to 1.0) |
| `scarcityMultiplier` | number | `1.0` | Resource scarcity (0.1 = scarce, 2.0 = abundant) |

Biome types: `forest`, `desert`, `tundra`, `plains`

#### Agent Configuration (`agents[]`)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | LLMType | Yes | Agent type (see Agent Types) |
| `count` | number | Yes | Number of agents of this type |
| `startArea` | object | No | Starting area `{ x: [min, max], y: [min, max] }` |
| `color` | string | No | Override agent color (hex) |

Special type values:
- `"mixed"` - Distributes agents across all LLM types
- `"random"` - Randomly selects an LLM type

#### Resource Configuration (`resources`)

Configure per resource type (`food`, `energy`, `material`):

| Field | Type | Description |
|-------|------|-------------|
| `clusters` | number | Number of resource spawn points |
| `maxAmount` | number | Maximum amount per spawn |
| `regenRate` | number | Regeneration rate |
| `biomePreference` | object | Biome preferences for spawn placement |

#### Metrics

Available metrics for collection:

| Metric | Description |
|--------|-------------|
| `survivalRate` | Percentage of agents alive at end |
| `giniCoefficient` | Wealth inequality (0 = equal, 1 = unequal) |
| `cooperationIndex` | trades / (trades + harms + steals) |
| `tradeCount` | Total trade events |

#### Decision Modes

| Mode | Description |
|------|-------------|
| `llm` | Full LLM decision making |
| `fallback` | Heuristic fallback decisions only |
| `random_walk` | Random movement baseline |

#### Variants (A/B Testing)

The schema supports `variants` for running multiple configurations:

```json
{
  "name": "Base Experiment",
  "duration": 1000,
  "agents": [{ "type": "claude", "count": 5 }],
  "variants": [
    {
      "name": "High Scarcity",
      "description": "Test with scarce resources",
      "overrides": {
        "world": { "scarcityMultiplier": 0.2 }
      }
    },
    {
      "name": "Abundant Resources",
      "overrides": {
        "world": { "scarcityMultiplier": 2.0 }
      }
    }
  ]
}
```

---

## Agent Types

### LLM-Powered Agents

| Type | Model | Description |
|------|-------|-------------|
| `claude` | Claude 3.5 | Anthropic's balanced reasoning model |
| `gemini` | Gemini Pro | Google's fast response model |
| `codex` | GPT-4 | OpenAI's strong planning model |
| `deepseek` | DeepSeek | Cost-effective option |
| `qwen` | Qwen | Alibaba's multilingual model |
| `glm` | GLM-4 | Chinese-optimized model |
| `grok` | Grok | xAI's unconventional model |
| `external` | - | External agent via A2A protocol |

### Example Configuration

```json
{
  "agents": [
    { "type": "claude", "count": 3 },
    { "type": "gemini", "count": 2 },
    { "type": "baseline_qlearning", "count": 2 }
  ]
}
```

---

## Baseline Agents

Baseline agents provide non-LLM comparison points for scientific validity.

### Available Baselines

| Type | Strategy | Use Case |
|------|----------|----------|
| `baseline_random` | Random action selection | Null hypothesis baseline |
| `baseline_rule` | Handcrafted heuristics | Rational actor comparison |
| `baseline_sugarscape` | Classic Sugarscape AI | Literature comparison |
| `baseline_qlearning` | Tabular Q-learning | RL comparison |

### Random Baseline

Selects actions uniformly at random from available actions.

```json
{ "type": "baseline_random", "count": 2 }
```

### Rule-Based Baseline

Follows priority-based survival heuristics:
1. If hungry and at food spawn, gather
2. If low energy and at shelter, sleep
3. If low health, consume medicine
4. Move toward nearest needed resource

Default thresholds (configurable):
- `ruleBasedHungerThreshold`: 50
- `ruleBasedEnergyThreshold`: 30
- `ruleBasedBalanceThreshold`: 50

### Sugarscape Baseline

Implements classic Sugarscape agent behavior:
- Vision-based resource detection
- Greedy movement toward richest cells
- Metabolism-based resource consumption

Default parameters:
- `sugarscapeVision`: 4 (cells in each direction)
- `sugarscapeMetabolism`: 1 (resources consumed per tick)

### Q-Learning Baseline

Tabular reinforcement learning with:
- State discretization (health/hunger/energy levels, nearby resources)
- Epsilon-greedy exploration
- Shared Q-table across agents
- Configurable hyperparameters

```json
{ "type": "baseline_qlearning", "count": 3 }
```

Default Q-learning parameters:
- `qlearningLearningRate`: 0.1 (alpha)
- `qlearningDiscountFactor`: 0.95 (gamma)
- `qlearningExplorationRate`: 0.3 (epsilon)
- `qlearningExplorationDecay`: 0.999
- `qlearningMinExplorationRate`: 0.05

---

## Shock System

Shocks perturb the simulation to study agent adaptation and resilience.

### Shock Types

| Type | Effect |
|------|--------|
| `resource_collapse` | Reduces resource spawn amounts (intensity = remaining %) |
| `resource_boom` | Increases resource amounts (intensity = % increase) |
| `plague` | Damages random agents (intensity affects count and damage) |
| `immigration` | Spawns new agents (intensity * 5 = number of agents) |
| `communication_blackout` | Agents cannot see others (requires `duration`) |
| `wealth_redistribution` | Moves balances toward average (intensity = % equalization) |

### Shock Configuration

```json
{
  "events": [
    {
      "tick": 200,
      "type": "shock",
      "params": {
        "type": "resource_collapse",
        "intensity": 0.3
      }
    }
  ]
}
```

### Composite Shocks

Combine multiple shocks for complex scenarios using predefined templates.

#### Available Templates

| Template | Components | Mode | Description |
|----------|------------|------|-------------|
| `economic_crisis` | resource_collapse + wealth_redistribution | sequence | Market crash with bailout |
| `perfect_storm` | resource_collapse + plague + communication_blackout | parallel | Multiple simultaneous shocks |
| `boom_bust_cycle` | resource_boom + resource_collapse + resource_boom | sequence | Economic cycle simulation |
| `epidemic_waves` | plague (3 waves) | cascade | Epidemic with decreasing intensity |
| `managed_growth` | immigration + resource_boom | parallel | Controlled population expansion |
| `isolation_scarcity` | communication_blackout + resource_collapse | sequence | Individual survival test |
| `rapid_change` | alternating boom/collapse | sequence | Adaptability test |

#### Composite Modes

| Mode | Behavior |
|------|----------|
| `parallel` | All shocks start simultaneously |
| `sequence` | Shocks run one after another with delay |
| `cascade` | Shocks with decreasing intensity over time |

#### Custom Composite Shocks

```json
{
  "compositeShock": {
    "name": "Custom Crisis",
    "mode": "sequence",
    "shocks": [
      { "type": "plague", "intensity": 0.6, "scheduledTick": 0 },
      { "type": "resource_collapse", "intensity": 0.4, "scheduledTick": 0 }
    ],
    "delayBetweenShocks": 10
  }
}
```

---

## Running Experiments

### Ensemble Runner CLI

The ensemble runner executes experiments with multiple seeds for statistical validity.

```bash
bun run src/scripts/run-ensemble.ts [options]
```

#### Options

| Option | Short | Default | Description |
|--------|-------|---------|-------------|
| `--seeds N` | `-s` | 10 | Number of seeds to run |
| `--ticks N` | `-t` | 100 | Ticks per run |
| `--config FILE` | `-c` | - | Path to experiment config JSON |
| `--output FILE` | `-o` | stdout | Path to output results JSON |
| `--decision-mode M` | `-d` | fallback | `llm`, `fallback`, or `random-walk` |
| `--silent` | - | false | Suppress progress output |
| `--help` | `-h` | - | Show help message |

#### Examples

```bash
# Run 10 seeds with fallback decisions
bun run src/scripts/run-ensemble.ts --seeds 10 --ticks 100

# Run with LLM decisions and custom config
bun run src/scripts/run-ensemble.ts \
  -s 5 -t 500 \
  -c experiments/baseline.json \
  -o results/my-experiment.json \
  -d llm

# Run silent for CI
bun run src/scripts/run-ensemble.ts --seeds 20 --silent
```

### Output Format

Results are saved as JSON:

```json
{
  "experiment": {
    "configFile": "experiments/baseline.json",
    "name": "My Experiment",
    "seedsUsed": [1, 2, 3, 4, 5],
    "ticksPerRun": 100,
    "decisionMode": "fallback",
    "timestamp": "2024-01-15T10:30:00Z",
    "durationMs": 45000
  },
  "aggregated": {
    "gini": { "mean": 0.35, "std": 0.08, "ci95": [0.28, 0.42], "min": 0.25, "max": 0.48, "median": 0.34 },
    "survivalRate": { ... },
    "cooperationIndex": { ... },
    ...
  },
  "perRun": [
    { "seed": 1, "gini": 0.32, "survivalRate": 0.8, ... },
    { "seed": 2, "gini": 0.38, "survivalRate": 0.7, ... },
    ...
  ]
}
```

---

## Statistical Analysis

### Comparing Ensembles

Use the comparison tool to analyze differences between experiments:

```bash
bun run src/scripts/compare-ensembles.ts [options]
```

#### Options

| Option | Default | Description |
|--------|---------|-------------|
| `--files FILE...` | - | Result files to compare (at least 2) |
| `--output FILE` | stdout | Output file path |
| `--format FORMAT` | table | `table`, `json`, `csv`, or `latex` |
| `--alpha N` | 0.05 | Significance level |
| `--correction TYPE` | holm | `none`, `bonferroni`, `holm`, or `fdr` |

#### Examples

```bash
# Compare two experiments
bun run src/scripts/compare-ensembles.ts \
  --files results/exp1.json results/exp2.json \
  --format table

# Output LaTeX with Bonferroni correction
bun run src/scripts/compare-ensembles.ts \
  --files results/llm.json results/baseline.json \
  --format latex \
  --correction bonferroni \
  --output comparison.tex
```

### Statistical Tests

The analysis includes:

| Test | Use Case |
|------|----------|
| t-test | Comparing means (normal distributions) |
| Mann-Whitney U | Non-parametric comparison |
| Cohen's d | Effect size measurement |
| Statistical power | Detection capability |

### Multiple Comparison Corrections

| Method | Description |
|--------|-------------|
| Bonferroni | Conservative, controls family-wise error rate |
| Holm-Bonferroni | Less conservative FWER control |
| FDR (Benjamini-Hochberg) | Controls false discovery rate |

### Interpreting Results

```
METRIC COMPARISON: survivalRate
-------------------------------------------
Experiment A: 0.72 +/- 0.08 (n=10)
Experiment B: 0.58 +/- 0.12 (n=10)

t-test p-value: 0.0034 **
Mann-Whitney p-value: 0.0089 **
Effect size (Cohen's d): 1.37 (large)

Significant difference detected (alpha=0.05)
```

Significance indicators:
- `*` = p < 0.05
- `**` = p < 0.01
- `***` = p < 0.001

---

## Best Practices

### Experiment Design

1. **Clear Hypothesis**: State what you expect to observe before running
2. **Single Variable**: Change one thing at a time
3. **Adequate Seeds**: Minimum 5 seeds, preferably 10+
4. **Baseline Comparison**: Always include a baseline agent type
5. **Sufficient Duration**: At least 500 ticks for behavior emergence

### Statistical Rigor

1. **Pre-registration**: Define metrics before running experiments
2. **Multiple Corrections**: Apply when testing multiple hypotheses
3. **Effect Sizes**: Report Cohen's d alongside p-values
4. **Confidence Intervals**: Include uncertainty estimates

### Reproducibility

1. **Seed Documentation**: Record all seeds used
2. **Version Control**: Tag code version with results
3. **Parameter Logging**: Auto-saved in output JSON
4. **Raw Data**: Keep per-run results

### Common Pitfalls

| Pitfall | Solution |
|---------|----------|
| Too few seeds | Run minimum 5 seeds per condition |
| Short duration | Allow 500+ ticks for emergence |
| Multiple comparisons | Apply Holm/Bonferroni correction |
| Confounded variables | Vary one factor at a time |
| Cherry-picking | Pre-register hypotheses |

### Example: LLM vs Baseline Comparison

```json
{
  "name": "LLM vs Baseline Comparison",
  "hypothesis": "LLM agents achieve higher survival rates than Q-learning baselines",
  "seed": 42,
  "duration": 1000,
  "world": {
    "size": [100, 100],
    "scarcityMultiplier": 0.5
  },
  "agents": [
    { "type": "claude", "count": 5 },
    { "type": "baseline_qlearning", "count": 5 }
  ],
  "metrics": ["survivalRate", "giniCoefficient", "cooperationIndex", "tradeCount"]
}
```

Run with:
```bash
bun run src/scripts/run-ensemble.ts \
  --seeds 10 \
  --ticks 1000 \
  --config experiments/llm-vs-baseline.json \
  --output results/llm-vs-baseline.json \
  --decision-mode llm
```

---

## Appendix: Integration Tests

Verify all features work correctly:

```bash
bun run src/scripts/integration-tests.ts
```

Tests cover:
- Baseline agent decisions
- Statistical test calculations
- Composite shock scheduling
- Ensemble result comparison
