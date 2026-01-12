---
sidebar_position: 4
title: Research Guide
description: Scientific methodology for conducting rigorous research with SimAgents
---

# Research Guide

This guide covers scientific methodology for conducting rigorous research with SimAgents.

## Research Philosophy

SimAgents is designed for studying **emergent AI behavior** in multi-agent environments. Key principles:

1. **Reproducibility**: Every experiment can be replicated with seed + configuration
2. **Observability**: All state changes are logged and queryable
3. **Comparability**: Standardized metrics enable cross-study comparison
4. **Minimal Imposition**: System provides physics, not strategies

---

## Designing Experiments

### Experiment DSL

Define experiments in YAML:

```yaml
name: "resource_scarcity_cooperation"
description: "Test cooperation emergence under resource scarcity"
seed: 12345

world:
  size: [100, 100]
  biomes:
    desert: 0.7
    plains: 0.2
    forest: 0.1

agents:
  - type: claude
    count: 5
  - type: gemini
    count: 5
  - type: baseline_random
    count: 5

duration: 1000  # ticks

metrics:
  - gini
  - cooperation_index
  - survival_rate
  - clustering_coefficient

snapshots:
  interval: 100  # Save state every 100 ticks

shocks:
  - tick: 500
    type: economic
    params:
      currencyChange: -0.5  # 50% currency destruction
```

### Running Experiments

```bash
cd apps/server

# Validate configuration
bun run src/experiments/runner.ts --dry-run experiments/my-experiment.yaml

# Run experiment
bun run src/experiments/runner.ts experiments/my-experiment.yaml

# Run with custom output
bun run src/experiments/runner.ts experiments/my-experiment.yaml --output results/
```

### Batch Experiments

Run multiple seeds for statistical significance:

```bash
for seed in 12345 23456 34567 45678 56789; do
  bun run src/experiments/runner.ts experiments/my-experiment.yaml --seed $seed
done
```

---

## Baseline Agents

For valid hypothesis testing, compare LLM agents against baselines:

### Random Walk (Null Hypothesis)
```yaml
agents:
  - type: baseline_random
    count: 10
```
Actions chosen uniformly at random. Establishes minimum performance baseline.

### Rule-Based (Classical AI)
```yaml
agents:
  - type: baseline_rule
    count: 10
```
Hardcoded heuristics: eat when hungry, sleep when tired, gather when near resources.

### Q-Learning (Reinforcement Learning)
```yaml
agents:
  - type: baseline_qlearning
    count: 10
```
Tabular Q-learning with survival reward. Tests LLM vs traditional RL.

---

## Cooperation Incentives System

SimAgents implements Sugarscape-inspired cooperation mechanics that create genuine incentives for group behavior without imposing strategies.

### Cooperation Bonuses
| Action | Bonus | Solo Penalty | Description |
|--------|-------|--------------|-------------|
| **Gather** | +25%/agent (max +75%) | -50% | Agents at same location boost each other's efficiency |
| **Forage** | +15%/agent (max +45%) | -40% | Nearby agents improve foraging success |
| **Public Work** | +20%/worker (max +60%) | -50% | Working together increases pay |

### Group Gather (Rich Spawns)
Resource spawns with 12+ units require group cooperation:
- Solo agents can only extract 2 units maximum
- 2+ agents unlock full harvest with +50% bonus
- Creates natural dependency without forcing interaction

### Trust-Based Pricing
Shelter transactions use trust scores:
- High trust (>+100): -10% discount
- Low trust (<-100): +10% penalty
- Rewards agents who build positive relationships

### Trade Bonuses
Trading with trusted partners provides advantages:
- +20% items received when trust >20
- +5% per prior interaction (max +25% loyalty bonus)
- Trust gains multiply at higher relationship levels

### Item Spoilage
Perishable items create urgency for trade/consumption:
- Food/Water: -1% per tick
- Medicine: -0.5% per tick
- Battery: -0.2% per tick
- Materials/Tools: No decay

### Research Implications
These mechanics enable experiments on:
- **Cooperation emergence**: Does the bonus system drive grouping?
- **Trust network formation**: How quickly do agents build relationships?
- **Solo vs cooperative strategies**: Which LLM types favor which approach?
- **Resource pooling**: Do agents develop sharing conventions?

---

## Metrics

### Economic Metrics

| Metric | Formula | Interpretation |
|--------|---------|----------------|
| **Gini Coefficient** | Standard Gini on agent balances | 0 = equality, 1 = one agent has all |
| **Wealth Variance** | σ² of agent balances | Higher = more inequality |
| **Trade Volume** | Successful trades per tick | Higher = more activity |

### Social Metrics

| Metric | Formula | Interpretation |
|--------|---------|----------------|
| **Cooperation Index** | f(trades, trust, clustering) | 0-1, higher = more cooperation |
| **Clustering Coefficient** | Spatial agent grouping | Higher = agents form groups |
| **Conflict Rate** | Harm/steal actions per tick | Higher = more conflict |

### Emergence Metrics

| Metric | Formula | Interpretation |
|--------|---------|----------------|
| **Emergence Index** | (systemComplexity - Σ agentComplexity) / systemComplexity | Higher = more emergent behavior |
| **Role Crystallization** | Consistency of agent roles over time | Higher = stable social roles |

### Survival Metrics

| Metric | Formula | Interpretation |
|--------|---------|----------------|
| **Survival Rate** | Alive agents / initial agents | By LLM type |
| **Mean Lifetime** | Average ticks survived | Longer = better strategies |

---

## Reproducibility

### Seed Management

Every random operation uses a seeded PRNG:

```typescript
seed: 12345  // In experiment config
```

### State Snapshots

Capture complete world state:

```yaml
snapshots:
  interval: 100
  include:
    - agents
    - resources
    - relationships
    - events
```

### Event Sourcing

All state changes recorded. Replay any moment:
```bash
curl http://localhost:3000/api/replay/tick/150
```

---

## Statistical Analysis

### Recommended Approach

1. **Multiple Seeds**: Run 10+ seeds per condition
2. **Burn-in Period**: Discard first 100 ticks
3. **Steady-State Analysis**: Focus on ticks 100-900
4. **Final State Comparison**: Compare end states across conditions

### Example Analysis

```python
import pandas as pd
from scipy import stats

results = pd.read_csv("results/experiment/metrics.csv")

claude = results[results.llm_type == "claude"].cooperation_index
gemini = results[results.llm_type == "gemini"].cooperation_index

stat, pvalue = stats.mannwhitneyu(claude, gemini)
print(f"Mann-Whitney U: {stat}, p={pvalue:.4f}")
```

---

## Shock Injection

Test system resilience with controlled perturbations:

### Economic Shocks
```yaml
shocks:
  - tick: 500
    type: economic
    params:
      currencyChange: -0.5  # Destroy 50% of currency
```

### Natural Disasters
```yaml
shocks:
  - tick: 500
    type: disaster
    params:
      type: drought
      severity: 0.7
      duration: 100
```

---

## Publishing Research

### Required Disclosures

When publishing SimAgents research, include:

1. **Experiment Configuration**: Full YAML config
2. **Seeds Used**: All random seeds
3. **Software Version**: SimAgents commit hash
4. **LLM Versions**: Specific model versions
5. **Metrics Definitions**: Any custom metrics

### Suggested Citation

```bibtex
@software{simagents2026,
  title = {SimAgents: A Platform for Studying Emergent AI Behavior},
  author = {AgentAuri Team},
  year = {2026},
  url = {https://github.com/agentauri/simagents.io}
}
```

---

## Known Limitations

1. **LLM Stochasticity**: Even with seeds, LLM responses vary
2. **API Latency**: External LLM calls add timing variability
3. **Scale Limits**: Currently tested up to 50 agents
4. **No Long-term Memory**: Agent memory is per-session

---

## Further Reading

- [Scientific Framework](https://github.com/agentauri/simagents.io/blob/main/docs/appendix/scientific-framework.md)
- [Experiment Design Guide](https://github.com/agentauri/simagents.io/blob/main/docs/experiment-design-guide.md)
- [PRD Section 30](https://github.com/agentauri/simagents.io/blob/main/docs/PRD.md)
