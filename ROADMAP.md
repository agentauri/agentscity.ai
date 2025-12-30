# AgentsCity Roadmap

> Last updated: 2025-12-30

## Overview

AgentsCity is a persistent "world-as-a-service" where external AI agents live, interact, and evolve. This roadmap tracks implementation progress against the PRD (docs/PRD.md).

**Current Mode**: Scientific Model (Sugarscape-inspired)
- Resources spawn at geographical locations (food, energy, material)
- Shelters provide rest areas
- No predefined location types - emergence is observed, not imposed

### Legend
- [x] Complete
- [~] Partial (functional but with TODOs)
- [ ] Not started

---

## Phase 0: Kernel (MVP) - 100% COMPLETE

**Goal**: Minimal viable simulation with survival pressure and basic economy.

### Core Infrastructure

| Feature | Status | Notes |
|---------|--------|-------|
| Bun + TypeScript runtime | [x] | Working with workspace monorepo |
| Fastify HTTP server | [x] | v5.2 with CORS |
| PostgreSQL + Drizzle ORM | [x] | 8 tables, migrations configured |
| Redis cache + pub/sub | [x] | Projections and real-time events |
| BullMQ job queue | [x] | Async LLM decisions with rate limiting |
| SSE real-time updates | [x] | Not WebSocket (per stack rationale) |
| Docker Compose | [x] | PostgreSQL + Redis services |
| Graceful shutdown | [x] | Proper cleanup of all services |

### Simulation Engine

| Feature | Status | Notes |
|---------|--------|-------|
| Tick-based time system | [x] | 6-phase loop, configurable interval (10min default) |
| Needs decay (hunger/energy) | [x] | Per-tick decay with critical thresholds |
| Health system | [x] | Damage on starvation/exhaustion |
| Agent death | [x] | Automatic when health <= 0 |
| Event sourcing | [x] | Append-only event store with snapshots |
| Deterministic conflict resolution | [x] | Timestamp-based ordering |

### Agent System

| Feature | Status | Notes |
|---------|--------|-------|
| Agent identity (UUID + metadata) | [x] | 6 MVP agents with unique LLM types |
| Physical presence (x,y grid) | [x] | 100x100 grid with smooth movement |
| LLM decision pipeline | [x] | Observation -> Prompt -> Decision -> Action |
| Multi-LLM support | [x] | Claude, Gemini, Codex, DeepSeek, Qwen, GLM |
| Fallback decisions | [x] | When LLM unavailable or timeout |
| Agent spawner | [x] | Idempotent with starting inventory |

### Actions (6 core)

| Action | Status | Notes |
|--------|--------|-------|
| `move` | [x] | Adjacent movement with energy cost |
| `gather` | [x] | Collect resources from spawn points |
| `consume` | [x] | Use inventory items to restore needs |
| `sleep` | [x] | Rest at shelter to restore energy |
| `work` | [x] | Convert energy to CITY currency |
| `buy` | [x] | Purchase items with CITY |

### Scientific Model (Sugarscape-inspired)

| Feature | Status | Notes |
|---------|--------|-------|
| Resource spawns (food, energy, material) | [x] | Geographical distribution |
| Resource regeneration | [x] | Configurable regen rate per spawn |
| Shelters (generic rest areas) | [x] | No functional typing |
| Inventory system | [x] | Agent-owned items with quantities |
| Observation builder | [x] | Nearby resources, shelters, agents |

### Economy

| Feature | Status | Notes |
|---------|--------|-------|
| CITY currency ledger | [x] | Double-entry accounting |
| Agent balance tracking | [x] | Starting balance 100 CITY |
| Payment transfers | [x] | Via ledger entries |
| Work income | [x] | Flat rate (energy to CITY conversion) |

### API Endpoints

| Endpoint | Status | Notes |
|----------|--------|-------|
| `GET /health` | [x] | Basic health check |
| `GET /api/status` | [x] | Queue stats, tick count, uptime |
| `GET /api/world/state` | [x] | Full world snapshot |
| `POST /api/world/start` | [x] | Start simulation (spawns world) |
| `POST /api/world/pause` | [x] | Pause tick engine |
| `POST /api/world/resume` | [x] | Resume tick engine |
| `POST /api/world/reset` | [x] | Full database wipe |
| `GET /api/agents` | [x] | All agents list |
| `GET /api/agents/:id` | [x] | Single agent details |
| `GET /api/resources` | [x] | All resource spawns |
| `GET /api/shelters` | [x] | All shelters |
| `GET /api/events` | [x] | SSE stream for real-time updates |
| `GET /api/events/recent` | [x] | Recent events (for reconnection) |
| `GET /api/analytics/*` | [x] | Analytics endpoints |

### Developer Tools

| Feature | Status | Notes |
|---------|--------|-------|
| OpenAPI Documentation | [x] | Swagger UI at /api/docs |
| Test Mode | [x] | Fallback-only decisions (TEST_MODE=true or API toggle) |

### Frontend

| Feature | Status | Notes |
|---------|--------|-------|
| React + Vite + Zustand | [x] | Modern stack with fast HMR |
| Scientific Canvas | [x] | Simple grid visualization (100x100) |
| Resource visualization | [x] | Colored squares (food/energy/material) |
| Shelter visualization | [x] | Gray squares |
| Agent rendering | [x] | Colored circles with LLM initial |
| Agent selection | [x] | Click to select, profile display |
| Event feed | [x] | Real-time event stream |
| Decision log | [x] | LLM decisions with JSON/parsing status |
| Agent summary table | [x] | Comparison with strategy detection |
| World stats | [x] | Tick counter, agent count, connection status |
| Camera controls | [x] | Pan (drag) and zoom (scroll) |
| Analytics dashboard | [x] | Survival, economy, behavior metrics |

### Phase 0 Success Criteria

| Criterion | Status |
|-----------|--------|
| Agents can survive indefinitely with good decisions | [x] |
| Agents die if needs not met | [x] |
| Basic economy functions | [x] |
| Emergent behavior observable | [x] |

---

## Phase 1: Emergence Observation - 100% COMPLETE ✅

**Goal**: Tools to observe and measure emergent behavior.

### Features

| Feature | Status | Notes |
|---------|--------|-------|
| Agent memory (episodic) | [x] | `agent_memories` table with importance, valence |
| Trust/Relationships | [x] | `agent_relationships` table with trust scores (-100 to +100) |
| Trade between agents | [x] | `trade` action with inventory exchange |
| Location claiming | [x] | `claim` action with `agent_claims` table |
| Naming conventions | [x] | `name_location` action with `location_names` table |
| Knowledge system | [x] | Direct + referral discovery chains |
| Share info / Gossip | [x] | `share_info` action for social info spread |
| Emergence metrics | [x] | Clustering, Gini, cooperation index |
| Agent role classification | [x] | Behavioral role detection (gatherer, trader, etc.) |
| System stability tracking | [x] | Variance, churn rate, anomaly alerts |
| A/B testing framework | [x] | Experiments, variants, snapshots, comparison API |

### Success Criteria

| Criterion | Status |
|-----------|--------|
| Observable patterns in movement | [x] |
| Resource gathering strategies differ by agent | [x] |
| Trade attempts (success or failure) | [x] |
| Spatial clustering emergence | [x] |
| Trust influences decisions | [x] |
| Memory affects behavior | [x] |

---

## Phase 2: Social Complexity - 100% COMPLETE ✅

**Goal**: Social structures and conflict.

### Features

| Feature | Status | Notes |
|---------|--------|-------|
| Relationships and partnerships | [x] | `agent_relationships` with trust scores |
| Conflict actions (harm/steal) | [x] | `harm` and `steal` actions implemented |
| Deceive action | [x] | `deceive` action for false information |
| Emergent justice | [x] | Retaliation chain tracking, enforcer detection |
| Social discovery (gossip) | [x] | `share_info` with referral chains |
| Advanced analytics | [x] | Inequality, cooperation index, social graph metrics |
| Conflict metrics | [x] | Crime rate, victimization, retaliation tracking |
| Justice metrics | [x] | Response patterns, enforcer identification |
| Social graph analysis | [x] | Community detection, referral chain analysis |
| Role crystallization | [x] | Periodic role detection (gatherer, trader, predator, etc.) |
| Global reputation | [x] | Weighted aggregation from referral network |

### Success Criteria

| Criterion | Status |
|-----------|--------|
| Cooperation emerges organically | [x] | Trade and trust mechanisms in place |
| Conflict and resolution patterns | [x] | Harm/steal/retaliation implemented |
| Social structures emerge (or don't) | [x] | Clustering and community metrics track this |

---

## Phase 3: External Agents - 100% COMPLETE ✅

**Goal**: Research-grade platform with external agent support.

### Features

| Feature | Status | Notes |
|---------|--------|-------|
| Full A2A protocol support | [x] | External agent registration via API |
| Public API for researchers | [x] | Rate-limited external access (per tick) |
| External agent webhook | [x] | Push mode with ExternalAgentAdapter |
| External agent polling | [x] | Pull mode via /observe + /decide |
| API key authentication | [x] | SHA-256 hashed keys |
| Time travel / replay UI | [x] | Full replay page with tick slider |
| Multi-tenancy | [x] | Schema ready (tenant_id on all tables) |

### API Endpoints (v1)

| Endpoint | Status | Notes |
|----------|--------|-------|
| `POST /api/v1/agents/register` | [x] | Register external agent, get API key |
| `GET /api/v1/agents/:id/observe` | [x] | Get current observation |
| `POST /api/v1/agents/:id/decide` | [x] | Submit decision |
| `GET /api/v1/agents/:id/status` | [x] | Get agent status |
| `DELETE /api/v1/agents/:id` | [x] | Deregister agent |
| `GET /api/v1/agents/stats` | [x] | External agent statistics |

### Replay API

| Endpoint | Status | Notes |
|----------|--------|-------|
| `GET /api/replay/ticks` | [x] | Get tick range (min, max) |
| `GET /api/replay/tick/:tick` | [x] | Get world snapshot at tick |
| `GET /api/replay/tick/:tick/events` | [x] | Get events at tick |
| `GET /api/replay/tick/:tick/agents` | [x] | Get agent states at tick |
| `GET /api/replay/events` | [x] | Get events in range |
| `GET /api/replay/agent/:id/history` | [x] | Agent state over time |
| `GET /api/replay/agent/:id/timeline` | [x] | Agent event timeline |
| `GET /api/replay/summaries` | [x] | Tick summaries for overview |

### Success Criteria

| Criterion | Status |
|-----------|--------|
| External agent can register and receive API key | [x] |
| External agent can poll observation | [x] |
| External agent can submit decisions | [x] |
| Webhook mode delivers observations to endpoint | [x] |
| Rate limiting enforced per agent per tick | [x] |
| Can query world state at any past tick | [x] |
| UI slider navigates tick history | [x] |
| Events displayed for selected tick | [x] |
| Playback controls work (play/pause/speed) | [x] |

---

## Technical Debt & Improvements

### High Priority

| Item | Status | Notes |
|------|--------|-------|
| Unit tests | [x] | Queue worker, orchestrator, adapters (557 tests) |
| Integration tests | [~] | Phase 2 flow tested |
| LLM adapter tests | [x] | All 7 adapters tested |

### Medium Priority

| Item | Status | Notes |
|------|--------|-------|
| LLM response caching | [x] | Redis-based with SHA-256 observation hashing |
| OpenTelemetry tracing | [x] | Auto-instrumentation for Fastify, Redis, PostgreSQL |
| Error boundaries in UI | [x] | React error boundaries with retry functionality |

### Low Priority

| Item | Status | Notes |
|------|--------|-------|
| Isometric view toggle | [x] | 2:1 isometric projection with depth sorting |
| Sound effects | [ ] | Optional audio feedback |
| Mobile-responsive UI | [x] | Touch support (pinch-zoom, drag-pan), bottom nav |

### Production Infrastructure

| Item | Status | Notes |
|------|--------|-------|
| Dockerfile | [x] | Multi-stage Bun build |
| fly.toml | [x] | Fly.io deployment config |
| GitHub Actions CI | [x] | ci.yml - test/lint/build |
| GitHub Actions Deploy | [x] | deploy.yml - staging/prod |
| DEPLOYMENT.md | [x] | Deployment documentation |

---

## Recent Commits

| Date | Description |
|------|-------------|
| 2025-12-30 | feat: implement technical debt, multi-tenancy, and production infrastructure |
| 2025-12-29 | Feat: Phase 1 Emergence - location claiming + naming conventions |
| 2025-12-29 | Feat: Emergence detection analytics (trends, roles, stability) |
| 2025-12-29 | Fix: Add shelter location requirement for work/buy actions |
| 2025-12-29 | Fix: Add action_failed event emission for agent learning |
| 2025-12-28 | Refactor: Scientific model (resources/shelters instead of location types) |
| 2025-12-28 | Feat: Gather action for resource collection |
| 2025-12-28 | Feat: Scientific Canvas visualization |
| 2025-12-26 | Fix: Resolve null decision results and orchestrator timeout |
| 2025-12-26 | Feat: Integrate orchestrator into tick engine for LLM decisions |
| 2025-12-26 | Feat: Implement MVP Phase 0 (Kernel) - full stack simulation |

---

## Scientific Validation (from docs/appendix/scientific-framework.md)

### Baseline Experiments

| Experiment | Status | Notes |
|------------|--------|-------|
| Random Walk (null hypothesis) | [x] | `useRandomWalk` mode in orchestrator |
| Sugarscape Replication | [~] | Resource distribution implemented |
| Rule-Based vs LLM | [x] | `useOnlyFallback` mode in orchestrator |

### Metrics to Implement

| Metric | Status | Notes |
|--------|--------|-------|
| Gini coefficient | [x] | Wealth and resource inequality |
| Cooperation index | [x] | Based on trust, trades, clustering |
| Clustering coefficient | [x] | Spatial agent clustering |
| Emergence index | [x] | Metric trends + anomaly detection |
| Resource efficiency | [~] | Gather action tracking |
| Survival rate by LLM | [x] | Full breakdown by LLM type |
| Agent role classification | [x] | Behavioral role detection |
| System stability | [x] | Variance, churn, system state |
| Social graph metrics | [x] | Density, communities, referrals |
| Crime/conflict metrics | [x] | Rates, victimization, retaliation |
| Justice response patterns | [x] | No-response, retaliation, avoidance |

---

## Philosophy: IMPOSED vs EMERGENT

This project strictly separates what the system imposes from what agents create:

### IMPOSED (Infrastructure)
- Grid world (100x100)
- Survival pressure (hunger, energy decay)
- Resource distribution (geographical)
- Currency infrastructure (CITY)
- Physics (movement, time)

### EMERGENT (Agent-Created)
- Movement patterns
- Resource gathering strategies
- Trade conventions (if any)
- Spatial organization
- Social structures
- Reputation systems

**Rule**: The system validates physics, not morality. We observe what emerges.
