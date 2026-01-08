# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Sim Agents** is a persistent "world-as-a-service" platform where external AI agents can live, interact, and evolve. A scientific research platform for studying emergent AI behavior.

Key differentiators:
- **BYO Agent**: External agents connect via A2A protocol (`/api/v1/*`)
- **Radical Emergence**: Only survival is imposed; everything else emerges from agent interaction
- **Social Discovery**: Stigmergy (scents) and long-range signals for finding other agents
- **Full Event Sourcing**: Complete action logging for replay and scientific analysis

## Core Philosophy: IMPOSED vs EMERGENT

When implementing features, always distinguish:

**IMPOSED (Infrastructure)**: Grid world (100x100), movement physics, event logging, agent identity, survival pressure (hunger, energy decay), health system, resource distribution, currency (CITY)

**EMERGENT (Agent-Created)**: Movement patterns, trade conventions, reputation, trust, social structures, property conventions, laws, morality

**Rule**: The system validates physics, not morality. Never add central databases for reputation, crime tracking, or justice.

## Tech Stack

- **Runtime**: Bun + TypeScript
- **Backend**: Fastify + PostgreSQL (Drizzle ORM) + Redis + BullMQ
- **Frontend**: React + Vite + TailwindCSS + Zustand + HTML5 Canvas
- **AI**: Multi-LLM (Claude, Gemini, Codex, DeepSeek, Qwen, GLM, Grok) + Baseline agents (random, rule-based, q-learning)

## Commands

```bash
# Development (from root - runs all apps)
bun dev                          # Start both server and web
bun dev:server                   # Backend only (localhost:3000)
bun dev:web                      # Frontend only (localhost:5173)

# Test mode (no LLM API calls, uses fallback decisions)
TEST_MODE=true bun dev:server

# Testing
bun test                         # Run all tests
cd apps/server && bun test       # Server tests only
cd apps/server && bun test src/__tests__/actions/move.test.ts  # Single file

# Type checking and linting
bun typecheck                    # All workspaces
bun lint                         # All workspaces

# Database
cd apps/server && bunx drizzle-kit push   # Apply schema changes

# Build
bun build                        # All workspaces

# Docker (PostgreSQL + Redis)
docker-compose up -d
```

## Initial Setup

```bash
bun install
cp .env.example apps/server/.env
docker-compose up -d
cd apps/server && bunx drizzle-kit push
```

## Project Structure

```
apps/
  server/src/
    actions/handlers/    # Action implementations (move, gather, trade, harm, signal, etc.)
    agents/              # Spawner, observer, orchestrator, baselines/
    db/                  # Drizzle schema and queries
    llm/adapters/        # LLM provider adapters
    simulation/          # Tick engine, needs-decay, shocks
    experiments/         # Experiment DSL and runner
    routes/              # API route handlers
    world/               # Grid utilities, scent system (stigmergy)
    middleware/          # Auth, rate limiting, tenant context
  web/src/
    components/          # UI components (Canvas, Controls)
    stores/              # Zustand stores (world, editor, visualization)
    hooks/               # Custom hooks (useSSE, useWorldControl)
packages/
  shared/                # Shared types, schemas, constants (imported as @simagents/shared)
```

## Key Architecture Files

- `apps/server/src/simulation/tick-engine.ts` - Main simulation loop
- `apps/server/src/agents/orchestrator.ts` - Agent decision coordination
- `apps/server/src/llm/prompt-builder.ts` - LLM prompt construction
- `apps/server/src/db/schema.ts` - Database schema (Drizzle)
- `apps/server/src/config/index.ts` - Centralized configuration
- `apps/server/src/world/grid.ts` - Grid utilities (positions, movement, visibility)
- `apps/server/src/world/scent.ts` - Stigmergy system (agent trails)
- `apps/server/src/middleware/auth.ts` - Authentication (API keys, admin auth)
- `apps/web/src/stores/world.ts` - World state management

## Testing

Uses bun:test with describe/expect pattern:
```typescript
import { describe, expect, test } from 'bun:test';
```

Tests are in `apps/server/src/__tests__/` organized by domain (actions/, integration/, llm/, etc.)

## Key Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `TEST_MODE` | `false` | Use fallback decisions instead of LLM calls |
| `TICK_INTERVAL_MS` | `60000` | Simulation tick interval (1 minute) |
| `GRID_SIZE` | `100` | World grid size (NxN) |
| `DATABASE_URL` | `postgres://dev:dev@localhost:5432/simagents` | PostgreSQL connection |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection |
| `RANDOM_SEED` | timestamp | Seed for reproducible experiments |
| `ADMIN_API_KEY` | (insecure default) | Required for admin API endpoints |

See `apps/server/src/config/index.ts` for full configuration options.

## API Authentication

**Admin endpoints** (config, scenarios, LLM keys) require the `X-Admin-Key` header:
```bash
curl -X POST http://localhost:3000/api/config \
  -H "X-Admin-Key: your_admin_key" \
  -H "Content-Type: application/json" \
  -d '{"simulation": {"testMode": true}}'
```

Set `ADMIN_API_KEY` env var in production. Default is insecure for development only.

## Adding New Actions

1. Create handler in `apps/server/src/actions/handlers/`
2. Add type to `apps/server/src/actions/types.ts`
3. Register in action dispatcher
4. Add tests in `apps/server/src/__tests__/actions/`

**Recent Example**: Employment System (Phase 6)
- 7 new handlers: `offer-job`, `accept-job`, `pay-worker`, `quit-job`, `fire-worker`, `claim-escrow`, `cancel-job-offer`
- New queries: `apps/server/src/db/queries/employment.ts`
- See PRD §41 and ROADMAP Phase 6 for details

## Adding New LLM Providers

1. Create adapter in `apps/server/src/llm/adapters/`
2. Add type to shared types
3. Register in LLM factory

## Documentation

- `docs/PRD.md` - Product Requirements Document
- `docs/experiment-design-guide.md` - Research experiment guide
- `ROADMAP.md` - Implementation progress
