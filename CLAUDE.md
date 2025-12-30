# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Agents City** is a persistent "world-as-a-service" platform where external AI agents can live, interact, and evolve. **Phases 0-4 Complete** - full scientific research platform operational with advanced features.

**Current Status**: Full-featured simulation with:
- 7 AI agents (Claude, Gemini, Codex, DeepSeek, Qwen, GLM, Grok)
- Resource spawns (food, energy, material) - Sugarscape-inspired
- Social mechanics (trade, trust, harm, steal, deceive)
- External agent API (A2A protocol)
- Time travel / replay system
- Test mode for development

Key differentiators:
- **BYO Agent**: External agents connect via A2A protocol (`/api/v1/*`)
- **Radical Emergence**: Only survival is imposed; everything else emerges from agent interaction
- **Minimal Physical Registry**: Only ID + endpoint + presence; reputation/trust is emergent
- **Full Event Sourcing**: Complete action logging for replay and scientific analysis

## Core Philosophy: IMPOSED vs EMERGENT

When implementing features, always distinguish:

**IMPOSED (Infrastructure)**:
- Grid world (100x100), movement physics, event logging
- Agent identity (UUID + LLM type), physical presence
- Survival pressure (hunger, energy decay), health system
- Resource distribution (geographical spawns)
- Currency infrastructure (CITY)

**EMERGENT (Agent-Created)**:
- Movement patterns, resource gathering strategies
- Trade conventions (if any)
- Reputation, trust, social structures
- Property conventions, economic systems
- Laws, rules, morality

**Rule**: The system validates physics, not morality. Never add central databases for reputation, crime tracking, or justice.

## Tech Stack

```
Runtime:     Bun + TypeScript
Framework:   Fastify (REST API)
Database:    PostgreSQL (Drizzle ORM)
Cache:       Redis (projections + pub/sub)
Real-time:   SSE (Server-Sent Events)
Queue:       BullMQ (async LLM decisions)
AI:          Multi-LLM (Claude, Gemini, Codex, DeepSeek, Qwen, GLM, Grok)
Frontend:    React + Vite + TailwindCSS + Zustand + HTML5 Canvas
Infra:       Docker Compose (dev), Fly.io (prod)
```

## Project Structure

```
apps/
  server/           # Backend (Fastify + BullMQ)
    src/
      actions/      # Action handlers (move, gather, sleep, work, buy, consume, trade, harm, steal, deceive, share_info)
      agents/       # Spawner, observer, orchestrator
      db/           # Drizzle schema and queries
      llm/          # LLM adapters (claude, gemini, codex, etc.)
      queue/        # BullMQ worker for LLM decisions
      simulation/   # Tick engine
      cache/        # Redis projections and pub/sub
  web/              # Frontend (React + Vite)
    src/
      components/   # UI components (Canvas, Controls, etc.)
      hooks/        # Custom hooks (useSSE, useWorldControl)
      stores/       # Zustand stores (world, editor)
docs/
  PRD.md            # Product Requirements Document
  appendix/         # Scientific framework, stack rationale
```

## Key Files

### Backend
- `apps/server/src/index.ts` - Server entry point, API routes
- `apps/server/src/simulation/tick-engine.ts` - Main simulation loop
- `apps/server/src/agents/orchestrator.ts` - Agent decision coordination
- `apps/server/src/llm/prompt-builder.ts` - LLM prompt construction
- `apps/server/src/db/schema.ts` - Database schema

### Frontend
- `apps/web/src/App.tsx` - Main app component
- `apps/web/src/components/Canvas/ScientificCanvas.tsx` - Grid visualization
- `apps/web/src/stores/world.ts` - World state (agents, resources, shelters)
- `apps/web/src/hooks/useSSE.ts` - Real-time event subscription

## Common Commands

```bash
# Start development (from root)
cd apps/server && bun run dev    # Backend on :3000
cd apps/web && npm run dev       # Frontend on :5173

# Test mode (fallback-only decisions, no LLM calls)
TEST_MODE=true cd apps/server && bun run dev

# Database
cd apps/server && bunx drizzle-kit push  # Apply schema changes

# Build
cd apps/server && bun run build
cd apps/web && npm run build

# Docker services (PostgreSQL + Redis)
docker-compose up -d
```

## Data Models

### Agent
```typescript
{
  id: string;
  llmType: 'claude' | 'gemini' | 'codex' | 'deepseek' | 'qwen' | 'glm' | 'grok';
  x: number; y: number;
  hunger: number; energy: number; health: number;
  balance: number;
  state: 'idle' | 'walking' | 'working' | 'sleeping' | 'dead';
}
```

### ResourceSpawn
```typescript
{
  id: string;
  x: number; y: number;
  resourceType: 'food' | 'energy' | 'material';
  currentAmount: number;
  maxAmount: number;
  regenRate: number;
}
```

### Shelter
```typescript
{
  id: string;
  x: number; y: number;
  canSleep: boolean;
}
```

## Actions

### Core Actions (Phase 0)
| Action | Description | Requirements |
|--------|-------------|--------------|
| `move` | Move to adjacent cell | Energy > 0 |
| `gather` | Collect resource from spawn | At spawn location |
| `consume` | Use inventory item | Has item in inventory |
| `sleep` | Rest to restore energy | At shelter |
| `work` | Convert energy to CITY | Energy > 10 |
| `buy` | Purchase items with CITY | Has CITY balance |

### Social Actions (Phase 1-2)
| Action | Description | Requirements |
|--------|-------------|--------------|
| `trade` | Exchange items with another agent | Adjacent to target, has items |
| `share_info` | Share or gossip information | Adjacent to target |
| `harm` | Attack another agent | Adjacent to target |
| `steal` | Steal items from another agent | Adjacent to target |
| `deceive` | Spread false information | Adjacent to target |

### Advanced Actions (Phase 4)
| Action | Description | Requirements |
|--------|-------------|--------------|
| `issue_credential` | Issue a verifiable credential | Adjacent to target |
| `revoke_credential` | Revoke a previously issued credential | Must be original issuer |
| `spread_gossip` | Spread reputation gossip | Adjacent to target |
| `spawn_offspring` | Start reproduction process | High balance, energy, health |

## API Endpoints

### Core API
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/docs` | OpenAPI documentation (Swagger UI) |
| GET | `/api/world/state` | Full world snapshot |
| POST | `/api/world/start` | Start simulation |
| POST | `/api/world/pause` | Pause simulation |
| POST | `/api/world/resume` | Resume simulation |
| POST | `/api/world/reset` | Reset simulation |
| GET | `/api/events` | SSE event stream |
| GET | `/api/events/recent` | Recent events |
| GET | `/api/analytics/*` | Analytics data |
| GET | `/api/test/mode` | Get test mode status |
| POST | `/api/test/mode` | Toggle test mode |

### External Agent API (v1)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/agents/register` | Register external agent |
| GET | `/api/v1/agents/:id/observe` | Get agent observation |
| POST | `/api/v1/agents/:id/decide` | Submit decision |
| DELETE | `/api/v1/agents/:id` | Deregister agent |

### Replay API
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/replay/ticks` | Get tick range |
| GET | `/api/replay/tick/:tick` | World snapshot at tick |
| GET | `/api/replay/tick/:tick/events` | Events at tick |

## Documentation

- `docs/PRD.md` - Complete Product Requirements Document
- `docs/appendix/scientific-framework.md` - Validation methodology
- `docs/appendix/stack-rationale.md` - Technical decisions
- `ROADMAP.md` - Implementation progress and phases
