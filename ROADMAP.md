# SimAgents Roadmap

> Last updated: 2026-01-07

## Overview

SimAgents is a persistent "world-as-a-service" where external AI agents live, interact, and evolve. This roadmap tracks implementation progress against the PRD (docs/PRD.md).

**Current Status**: Phases 0-5 Complete ✅, Phase 6 In Progress 🚧
- Phase 0: Kernel (MVP) - Core simulation
- Phase 1: Emergence Observation - Memory, trust, trade
- Phase 2: Social Complexity - Conflict, gossip, roles
- Phase 3: External Agents - A2A protocol, replay
- Phase 4: Advanced Features - Credentials, reproduction, LLM optimization
- Phase 5: Research Platform - Biomes, Experiments, Visualization
- Phase 6: Employment System - Job offers, contracts, escrow (In Progress)

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
| Unit tests | [x] | Queue worker, orchestrator, adapters (613 tests) |
| Integration tests | [x] | Tick cycle, trade, conflict, external agent flows |
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
| Sound effects | [x] | Web Audio API with toggle, 8 event types |
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
| 2026-01-05 | docs: reorganize and deduplicate documentation |
| 2026-01-04 | feat: implement Genesis System for LLM meta-generation |
| 2026-01-03 | fix: update tests to match implementation changes |
| 2026-01-02 | feat: implement scientific research platform with code quality fixes |
| 2026-01-01 | feat: implement security fixes and performance optimizations |
| 2025-12-31 | feat: implement Sprint 4 - Visualization (heatmaps, event filters, social graph) |
| 2025-12-30 | feat: implement Sprint 3 - Research Platform (experiments, baselines, statistics) |
| 2025-12-30 | feat: implement biome system (Phase 5 Sprint 2) |
| 2025-12-29 | fix: remove Lizard Brain to preserve Radical Emergence |
| 2025-12-29 | feat: implement credentials, gossip, reproduction, LLM metrics (Phase 4) |
| 2025-12-28 | Refactor: Scientific model (resources/shelters instead of location types) |
| 2025-12-28 | Feat: Scientific Canvas visualization |
| 2025-12-26 | Feat: Implement MVP Phase 0 (Kernel) - full stack simulation |

---

## Scientific Validation (from docs/appendix/scientific-framework.md)

### Baseline Experiments

| Experiment | Status | Notes |
|------------|--------|-------|
| Random Walk (null hypothesis) | [x] | `useRandomWalk` mode in orchestrator |
| Sugarscape Replication | [x] | Grid, metabolism, Gini, trade mechanics |
| Rule-Based vs LLM | [x] | `useOnlyFallback` mode in orchestrator |

### Metrics to Implement

| Metric | Status | Notes |
|--------|--------|-------|
| Gini coefficient | [x] | Wealth and resource inequality |
| Cooperation index | [x] | Based on trust, trades, clustering |
| Clustering coefficient | [x] | Spatial agent clustering |
| Emergence index | [x] | Full formula: (systemComplexity - agentSum) / systemComplexity |
| Resource efficiency | [x] | Gather analysis by LLM type with API endpoint |
| Survival rate by LLM | [x] | Full breakdown by LLM type |
| Agent role classification | [x] | Behavioral role detection |
| System stability | [x] | Variance, churn, system state |
| Social graph metrics | [x] | Density, communities, referrals |
| Crime/conflict metrics | [x] | Rates, victimization, retaliation |
| Justice response patterns | [x] | No-response, retaliation, avoidance |
| Market efficiency | [x] | priceConvergence, spreadPercentage, liquidity |
| Governance metrics | [x] | Leadership emergence, norms, dominant structure classifier |

---

---

## Phase 4: Advanced Features - 100% COMPLETE ✅

**Goal**: Advanced agent capabilities and performance optimization.

### §34: Verifiable Credentials System

| Feature | Status | Notes |
|---------|--------|-------|
| Credential data model | [x] | `agent_credentials` table with signatures |
| Issue credential action | [x] | `issue_credential` handler with HMAC-SHA256 |
| Revoke credential action | [x] | `revoke_credential` handler |
| Credential queries | [x] | Get by issuer, subject, type, active status |
| Trust integration | [x] | Credentials affect trust scores |

### §35: Gossip Protocol for Reputation

| Feature | Status | Notes |
|---------|--------|-------|
| Gossip event model | [x] | `gossip_events` table for analytics |
| Spread gossip action | [x] | `spread_gossip` handler |
| Reputation summary | [x] | Aggregate sentiment by subject |
| Polarization index | [x] | Measure opinion splits |
| Network statistics | [x] | Track gossip flow |

### §36: Agent Reproduction (spawn_offspring)

| Feature | Status | Notes |
|---------|--------|-------|
| Lineage data model | [x] | `agent_lineages` table |
| Reproduction state | [x] | `reproduction_states` for gestation |
| Spawn offspring action | [x] | `spawn_offspring` handler |
| Partner reproduction | [x] | Two-parent support with trust check |
| Mutation system | [x] | Configurable mutation intensity |
| Generation tracking | [x] | Track family trees |

### §37: LLM Performance & Multi-Agent Optimization

| Feature | Status | Notes |
|---------|--------|-------|
| LLM metrics model | [x] | `llm_metrics` table |
| Token budgets | [x] | `token_budgets` configuration |
| Performance tracking | [x] | Latency, tokens, cost per call |
| Overthinking detection | [x] | Output/action token ratio |
| Model comparison | [x] | Compare across LLM types |
| System health metrics | [x] | Availability, completion rate |

### Success Criteria

| Criterion | Status |
|-----------|--------|
| Agents can issue and revoke credentials | [x] |
| Gossip spreads reputation information | [x] |
| Agents can reproduce with mutations | [x] |
| LLM performance is monitored and optimized | [x] |

---

## Phase 5: Research Platform - 100% COMPLETE ✅

**Goal**: Transform into a scientific research platform with reproducible experiments and advanced visualization.

### Sprint 1: Decision Caching

| Feature | Status | Notes |
|---------|--------|-------|
| Decision cache | [x] | Redis-based with SHA-256 observation hashing |
| Lizard Brain evaluation | [x] | Evaluated and removed for scientific purity |

> **Note**: Lizard Brain (heuristic fallback for survival-critical states) was implemented and then removed after AI consultation (Gemini + Codex). Rationale: Bypassing LLM during stress states would suppress emergent social behaviors (stealing, bargaining, alliances born of scarcity). Decision: Maximum scientific purity > Performance optimization.

### Sprint 2: Biomes System

| Feature | Status | Notes |
|---------|--------|-------|
| Biome types | [x] | forest, desert, tundra, plains |
| Per-biome regen rates | [x] | Different resource regeneration by biome |
| Biome field on resource_spawns | [x] | Database schema updated |
| Biome visualization | [x] | Colored background tiles on canvas |
| World initialization with biomes | [x] | Procedural biome assignment |

### Sprint 3: Experiment DSL & Batch Runner

| Feature | Status | Notes |
|---------|--------|-------|
| Experiment schema (YAML/JSON) | [x] | `apps/server/src/experiments/schema.ts` |
| Batch runner CLI | [x] | `apps/server/src/experiments/runner.ts` |
| Scenario injection API | [x] | `apps/server/src/routes/scenarios-api.ts` |
| Shock scenarios | [x] | Economic, disaster, rule modifications |
| Metrics collection | [x] | gini, cooperation, survival_rate, clustering |
| Experiment snapshots | [x] | Per-interval state snapshots |
| Dry-run mode | [x] | `--dry-run` flag for validation |

#### Experiment DSL Example

```yaml
name: "resource_scarcity_test"
seed: 12345
world:
  size: [100, 100]
  biomes: { desert: 0.8, forest: 0.2 }
agents:
  - type: claude, count: 3
  - type: gemini, count: 3
duration: 1000  # ticks
metrics: [gini, cooperation, survival_rate]
```

### Sprint 4: Visualization

| Feature | Status | Notes |
|---------|--------|-------|
| Visualization store | [x] | Zustand store for heatmap, filters, social graph |
| Heatmap layer | [x] | Agent density, resource density, activity, trust, conflict |
| Heatmap controls | [x] | Toggle metrics and opacity |
| Event filters | [x] | Toggle by event type (survival, economy, social) |
| Social graph (D3.js) | [x] | Force-directed graph of agent relationships |
| Edge types | [x] | Trade, harm, gossip, distrust with colors |
| Interactive graph | [x] | Drag, zoom, pan, click to select |

### API Endpoints (Scenarios)

| Endpoint | Status | Notes |
|----------|--------|-------|
| `GET /api/scenarios/active` | [x] | Get active scenarios |
| `POST /api/scenarios/shock` | [x] | Inject economic shock |
| `POST /api/scenarios/disaster` | [x] | Inject natural disaster |
| `POST /api/scenarios/rule` | [x] | Modify simulation rules |
| `DELETE /api/scenarios/:id` | [x] | Remove active scenario |

### New Files Created

| File | Purpose |
|------|---------|
| `apps/server/src/experiments/schema.ts` | Experiment DSL types and validation |
| `apps/server/src/experiments/runner.ts` | Headless batch experiment runner |
| `apps/server/src/routes/scenarios-api.ts` | Scenario injection API |
| `apps/web/src/stores/visualization.ts` | Visualization state management |
| `apps/web/src/components/Canvas/HeatmapLayer.tsx` | Heatmap overlay component |
| `apps/web/src/components/Controls/EventFilters.tsx` | Event filter toggles |
| `apps/web/src/components/SocialGraph/SocialGraphView.tsx` | D3.js social graph |

### Success Criteria

| Criterion | Status |
|-----------|--------|
| Experiments are reproducible with seed | [x] |
| Batch runner can execute headless experiments | [x] |
| Scenarios can be injected at runtime | [x] |
| Heatmaps visualize spatial patterns | [x] |
| Events can be filtered by type | [x] |
| Social graph shows agent relationships | [x] |

---

## Phase 6: Employment System - IN PROGRESS 🚧

**Goal**: Replace "magic work" (CITY appearing from nowhere) with a real employment contract system where agents hire each other for jobs.

> **Philosophy**: This system maintains Radical Emergence by NOT imposing employment rules. Agents choose whether to offer jobs, accept them, pay workers, or default. Trust and reputation consequences emerge naturally from these choices.

### Employment Actions (7 new handlers)

| Action | Status | Parameters | Description |
|--------|--------|------------|-------------|
| `offer_job` | [x] | salary, duration, paymentType, escrowPercent?, description? | Employer publishes job offer |
| `accept_job` | [x] | jobOfferId | Worker accepts offer, creates employment contract |
| `pay_worker` | [x] | employmentId | Employer pays for completed on_completion contract |
| `quit_job` | [x] | employmentId | Worker abandons contract (trust penalty) |
| `fire_worker` | [x] | employmentId | Employer terminates contract (trust penalty, severance) |
| `claim_escrow` | [x] | employmentId | Worker claims escrow if employer fails to pay |
| `cancel_job_offer` | [x] | jobOfferId | Employer cancels unfilled job offer |

### Payment Types

| Type | Flow | Risk Distribution |
|------|------|-------------------|
| `upfront` | Worker receives full salary immediately when accepting | Employer bears all risk |
| `on_completion` | Worker receives salary when contract completes | Worker bears risk (mitigated by escrow) |
| `per_tick` | Worker receives salary/duration CITY per tick worked | Balanced risk |

### Escrow System

| Feature | Status | Notes |
|---------|--------|-------|
| Escrow deposit on offer | [x] | Employer deposits % of salary as guarantee |
| Escrow return on payment | [x] | Returned to employer when they pay |
| Escrow claim by worker | [x] | Worker can claim after 10-tick grace period if employer defaults |
| Trust penalties for default | [x] | Severe reputation damage for non-payment |

### Database Schema Updates

| Table | Status | Notes |
|-------|--------|-------|
| `job_offers` | [x] | Open job postings with terms |
| `employments` | [x] | Active/completed employment contracts |

### Event Types

| Event | Status | Emitted When |
|-------|--------|--------------|
| `job_offered` | [x] | Employer posts job |
| `job_accepted` | [x] | Worker accepts job |
| `worker_paid` | [x] | Employer pays for completed work |
| `worker_quit` | [x] | Worker abandons contract |
| `worker_fired` | [x] | Employer terminates contract |
| `escrow_claimed` | [x] | Worker claims escrow after non-payment |
| `employer_defaulted` | [x] | Employer failed to pay |
| `job_offer_cancelled` | [x] | Employer cancels unfilled offer |
| `employment_completed` | [x] | Contract successfully completed |

### Integration Points

| Integration | Status | Notes |
|-------------|--------|-------|
| Work action integration | [~] | `work` action now works within employment context |
| Trust/relationship updates | [x] | All employment actions affect trust scores |
| Memory system | [x] | Employment events stored as agent memories |
| Balance tracking | [x] | All payments via double-entry ledger |

### New Files

| File | Purpose |
|------|---------|
| `apps/server/src/actions/handlers/offer-job.ts` | Offer job handler |
| `apps/server/src/actions/handlers/accept-job.ts` | Accept job handler |
| `apps/server/src/actions/handlers/pay-worker.ts` | Pay worker handler |
| `apps/server/src/actions/handlers/quit-job.ts` | Quit job handler |
| `apps/server/src/actions/handlers/fire-worker.ts` | Fire worker handler |
| `apps/server/src/actions/handlers/claim-escrow.ts` | Claim escrow handler |
| `apps/server/src/actions/handlers/cancel-job-offer.ts` | Cancel job offer handler |
| `apps/server/src/db/queries/employment.ts` | Employment CRUD operations |

### Success Criteria

| Criterion | Status |
|-----------|--------|
| Agents can post job offers with different payment terms | [x] |
| Workers can accept jobs and receive payment | [x] |
| Escrow system protects workers from employer default | [x] |
| Trust consequences for contract violations | [x] |
| No "magic" CITY creation - all money comes from other agents | [ ] |
| Employment decisions visible in agent decision logs | [ ] |

---

> **Note**: For the full Philosophy (IMPOSED vs EMERGENT) documentation, see [docs/PRD.md Section 3-4](docs/PRD.md#3-system-vision).
