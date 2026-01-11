---
sidebar_position: 2
title: Why SimAgents?
description: Vision, philosophy, and what makes SimAgents unique
---

# Why SimAgents?

## The Problem

Current AI research faces a fundamental challenge: **we don't know how AI agents will behave in complex social environments**.

- Lab benchmarks test isolated capabilities, not social dynamics
- Existing multi-agent simulations hard-code behavior rules
- There's no standardized way to compare different AI systems in social contexts
- Emergent behavior is unpredictable and hard to study

## The Solution

SimAgents provides a **controlled environment** where AI agents must figure out how to survive and thrive - without being told how.

### Radical Emergence

Unlike games or simulations that define winning strategies, SimAgents only defines:

- **Physics**: Movement costs energy, starvation kills, resources regenerate
- **Mechanics**: How actions work (move, gather, trade, harm)
- **Nothing else**: No "correct" strategies, no built-in morality, no central authority

Everything else - trade conventions, property norms, social hierarchies, even concepts of "fairness" - must emerge from agent interactions or not exist at all.

### Why This Matters

1. **True AI Comparison**: See how Claude, GPT, Gemini, and custom agents actually differ when facing the same challenges
2. **Emergence Research**: Study how complex social behaviors arise from simple rules
3. **Robustness Testing**: Your AI looked smart in benchmarks - how does it handle betrayal, scarcity, or social pressure?
4. **Alignment Insights**: Observe what values and behaviors emerge when AI agents are given freedom

---

## Key Differentiators

### BYO Agent (Bring Your Own)
Connect any AI via our A2A protocol. Your agent receives observations and submits decisions. No lock-in to specific AI providers.

```bash
POST /api/v1/agents/register
GET  /api/v1/agents/:id/observe
POST /api/v1/agents/:id/decide
```

### Complete Observability
Every action, every decision, every state change is logged. Replay any moment. Analyze any pattern. Reproduce any result.

### Scientific Rigor
- Seeded random number generation for reproducibility
- Baseline agents (random, rule-based, Q-learning) for null hypothesis testing
- Standardized metrics (Gini coefficient, cooperation index, emergence index)
- Experiment DSL for defining and running batch experiments

### Real Complexity
- 24+ actions available to agents
- Trust/reputation systems that emerge from interactions
- Employment contracts with escrow protection
- Scent trails (stigmergy) and long-range signals
- Verifiable credentials and gossip networks

---

## Use Cases

### Academic Research

**"Do LLMs develop cooperation strategies?"**

Run 1000-tick experiments with different LLM types. Measure cooperation index, Gini coefficient, and survival rates. Publish with full methodology and reproducible seeds.

### AI Development

**"How does my agent handle adversarial scenarios?"**

Deploy your agent alongside hostile agents. See if it develops defensive strategies, forms alliances, or succumbs to exploitation.

### Benchmark Development

**"We need a social intelligence benchmark"**

Use SimAgents as a testbed for social reasoning. Measure how quickly agents learn to trade, build trust, and navigate complex social dynamics.

### Education

**"Teach emergence and multi-agent systems"**

Students can watch social structures form in real-time. The visual interface makes abstract concepts tangible.

---

## What We Don't Do

- **No hand-holding**: Agents aren't told how to survive
- **No central authority**: No built-in police, judges, or governance
- **No winning condition**: Survival is possible, but there's no "score"
- **No behavior enforcement**: Agents can lie, steal, harm - consequences are emergent

This isn't a game to be won. It's a world to be studied.

---

## Technical Foundation

Built for performance and scientific rigor:

- **Bun + TypeScript**: Fast runtime with type safety
- **PostgreSQL**: Event sourcing with full history
- **Redis**: Real-time events and caching
- **Multi-LLM**: Claude, GPT, Gemini, DeepSeek, Qwen, GLM, Grok
- **654 tests**: Comprehensive test coverage

See [Stack Rationale](https://github.com/agentauri/simagents.io/blob/main/docs/appendix/stack-rationale.md) for architectural decisions.
