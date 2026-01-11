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
Hardcoded heuristics: eat when hungry, sleep when tired, gather when near resources. Tests if LLMs outperform simple rules.

### Q-Learning (Reinforcement Learning)
```yaml
agents:
  - type: baseline_qlearning
    count: 10
```
Tabular Q-learning with survival reward. Tests LLM vs traditional RL.

### Sugarscape Replication
Classic ABM comparison. Configure world to match Sugarscape parameters and compare agent behavior.

---

## Metrics

### Economic Metrics

| Metric | Formula | Interpretation |
|--------|---------|----------------|
| **Gini Coefficient** | Standard Gini on agent balances | 0 = perfect equality, 1 = one agent has everything |
| **Wealth Variance** | σ² of agent balances | Higher = more inequality |
| **Trade Volume** | Successful trades per tick | Higher = more economic activity |
| **Market Efficiency** | Price convergence over time | Lower spread = more efficient |

### Social Metrics

| Metric | Formula | Interpretation |
|--------|---------|----------------|
| **Cooperation Index** | f(trades, trust, clustering) | 0-1, higher = more cooperation |
| **Clustering Coefficient** | Spatial agent grouping | Higher = agents form groups |
| **Trust Network Density** | Edges / possible edges | Higher = more relationships |
| **Conflict Rate** | Harm/steal actions per tick | Higher = more conflict |

### Emergence Metrics

| Metric | Formula | Interpretation |
|--------|---------|----------------|
| **Emergence Index** | (systemComplexity - Σ agentComplexity) / systemComplexity | Higher = more emergent behavior |
| **Role Crystallization** | Consistency of agent roles over time | Higher = stable social roles |
| **Norm Emergence** | Consistency of agent responses to scenarios | Higher = shared behavioral norms |

### Survival Metrics

| Metric | Formula | Interpretation |
|--------|---------|----------------|
| **Survival Rate** | Alive agents / initial agents | By LLM type |
| **Mean Lifetime** | Average ticks survived | Longer = better strategies |
| **Death Causes** | Starvation vs exhaustion vs harm | Strategy failure mode |

---

## Reproducibility

### Seed Management

Every random operation uses a seeded PRNG:

```typescript
// In experiment config
seed: 12345

// Affects:
// - Resource spawn placement
// - Initial agent positions
// - Action timing variations
// - Biome generation
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

Snapshots stored in `results/{experiment}/snapshots/tick_{N}.json`.

### Event Sourcing

All state changes recorded:

```sql
SELECT * FROM events
WHERE tick BETWEEN 100 AND 200
ORDER BY timestamp;
```

Replay any moment:
```bash
curl http://localhost:3000/api/replay/tick/150
```

---

## Statistical Analysis

### Recommended Approach

1. **Multiple Seeds**: Run 10+ seeds per condition
2. **Burn-in Period**: Discard first 100 ticks (initialization effects)
3. **Steady-State Analysis**: Focus on ticks 100-900
4. **Final State Comparison**: Compare end states across conditions

### Example R Analysis

```r
library(tidyverse)

# Load results
results <- read_csv("results/experiment/metrics.csv")

# Compare Gini by LLM type
results %>%
  filter(tick > 100) %>%
  group_by(llm_type) %>%
  summarise(
    mean_gini = mean(gini),
    sd_gini = sd(gini),
    n = n()
  ) %>%
  mutate(se = sd_gini / sqrt(n))

# Statistical test
t.test(gini ~ llm_type, data = results %>% filter(llm_type %in% c("claude", "gemini")))
```

### Example Python Analysis

```python
import pandas as pd
from scipy import stats

# Load results
results = pd.read_csv("results/experiment/metrics.csv")

# Compare cooperation by condition
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
      currencyChange: -0.5      # Destroy 50% of currency
      # OR
      inflationRate: 0.1        # 10% inflation per tick
```

### Natural Disasters

```yaml
shocks:
  - tick: 500
    type: disaster
    params:
      type: drought             # Reduces food regen
      severity: 0.7             # 70% reduction
      duration: 100             # For 100 ticks
      region: [40, 40, 60, 60]  # Affected area
```

### Rule Modifications

```yaml
shocks:
  - tick: 500
    type: rule
    params:
      modify: gather_rate
      factor: 0.5               # Half gathering efficiency
```

---

## Publishing Research

### Required Disclosures

When publishing SimAgents research, include:

1. **Experiment Configuration**: Full YAML or JSON config
2. **Seeds Used**: All random seeds
3. **Software Version**: SimAgents commit hash or version
4. **LLM Versions**: Specific model versions (e.g., "claude-3-haiku-20240307")
5. **Metrics Definitions**: Any custom metrics

### Data Sharing

Export complete experiment data:

```bash
# Export all events
curl http://localhost:3000/api/replay/events?from=0&to=1000 > events.json

# Export snapshots
cp results/experiment/snapshots/*.json ./data/

# Export metrics
cp results/experiment/metrics.csv ./data/
```

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

## Scientific Assumptions

SimAgents makes explicit assumptions that should be acknowledged:

1. **Discrete Time**: World updates in ticks, not continuous time
2. **Grid Space**: 2D discrete grid, not continuous space
3. **Perfect Observation**: Agents see all entities within visibility radius
4. **Synchronous Decisions**: All agents decide simultaneously per tick
5. **No Physical Embodiment**: Agents are points, not physical bodies

See [Scientific Framework](https://github.com/agentauri/simagents.io/blob/main/docs/appendix/scientific-framework.md) for detailed assumption analysis and limitations.

---

## Known Limitations

1. **LLM Stochasticity**: Even with seeds, LLM responses vary
2. **API Latency**: External LLM calls add timing variability
3. **Scale Limits**: Currently tested up to 50 agents
4. **No Long-term Memory**: Agent memory is per-session

Acknowledge these limitations in research publications.

---

## Further Reading

- [Scientific Framework](https://github.com/agentauri/simagents.io/blob/main/docs/appendix/scientific-framework.md) - Detailed validation methodology
- [Experiment Design Guide](https://github.com/agentauri/simagents.io/blob/main/docs/experiment-design-guide.md) - Technical experiment guide
- [PRD Section 30](https://github.com/agentauri/simagents.io/blob/main/docs/PRD.md) - Scientific validation framework
