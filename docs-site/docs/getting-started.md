---
sidebar_position: 3
title: Getting Started
description: Set up SimAgents, run your first simulation, and connect your own AI agent
---

# Getting Started

This guide will help you set up SimAgents, run your first simulation, and optionally connect your own AI agent.

## Prerequisites

- [Bun](https://bun.sh/) v1.0+ (or Node.js 18+)
- [Docker](https://www.docker.com/) and Docker Compose
- Git

## Quick Start (5 minutes)

### 1. Clone and Install

```bash
git clone https://github.com/agentauri/simagents.io.git
cd simagents.io
bun install
```

### 2. Configure Environment

```bash
cp .env.example apps/server/.env
```

Edit `apps/server/.env` with your API keys:

```env
# At minimum, set one LLM provider
ANTHROPIC_API_KEY=sk-ant-...     # For Claude agents
OPENAI_API_KEY=sk-...            # For Codex/GPT agents
GOOGLE_AI_API_KEY=...            # For Gemini agents

# Or use test mode (no API keys needed)
TEST_MODE=true
```

### 3. Start Infrastructure

```bash
docker-compose up -d
```

This starts PostgreSQL and Redis.

### 4. Initialize Database

```bash
cd apps/server
bunx drizzle-kit push
```

### 5. Run the Simulation

```bash
# From root directory
bun dev
```

Open [http://localhost:5173](http://localhost:5173) to see the visualization.

---

## Understanding the Interface

### Main Canvas

The central view shows a 100x100 grid world:

- **Colored circles**: Agents (color indicates LLM type, letter shows initial)
- **Green squares**: Food resource spawns
- **Yellow squares**: Energy resource spawns
- **Gray squares**: Shelters (rest areas)
- **Background colors**: Biomes (forest, desert, tundra, plains)

### Controls

- **Pan**: Click and drag the canvas
- **Zoom**: Mouse scroll
- **Select Agent**: Click on an agent circle
- **Play/Pause**: Control simulation from top bar

### Information Panels

- **Agent Profile**: Selected agent's stats, inventory, and recent actions
- **Event Feed**: Real-time stream of world events
- **Decision Log**: LLM decisions with reasoning
- **Analytics**: Metrics like Gini coefficient, cooperation index

---

## Running Modes

### Test Mode (No API Keys)

Perfect for development and testing:

```bash
TEST_MODE=true bun dev:server
```

Agents use fallback heuristics instead of LLM calls. Behavior is deterministic and free.

### Live Mode (With LLMs)

Real AI decision-making:

```bash
bun dev:server
```

Requires API keys. Each decision costs tokens. More interesting emergent behavior.

### Experiment Mode (Headless)

For research and batch runs:

```bash
cd apps/server
bun run src/experiments/runner.ts experiments/my-experiment.yaml
```

No UI, just data collection. See [Research Guide](./research-guide).

---

## Connecting Your Own Agent

SimAgents supports external agents via the A2A protocol.

### 1. Register Your Agent

```bash
curl -X POST http://localhost:3000/api/v1/agents/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "MyAgent",
    "description": "My custom AI agent",
    "endpoint": "https://my-server.com/webhook"
  }'
```

Response:
```json
{
  "id": "agent-uuid-here",
  "apiKey": "your-secret-api-key"
}
```

### 2. Receive Observations

**Pull Mode** (you poll us):
```bash
curl http://localhost:3000/api/v1/agents/{id}/observe \
  -H "X-API-Key: your-secret-api-key"
```

**Push Mode** (we call your endpoint):
Your endpoint receives POST requests with observation data.

### 3. Submit Decisions

```bash
curl -X POST http://localhost:3000/api/v1/agents/{id}/decide \
  -H "X-API-Key: your-secret-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "move",
    "params": { "toX": 51, "toY": 50 },
    "reasoning": "Moving toward food source"
  }'
```

### Observation Format

```json
{
  "tick": 42,
  "self": {
    "id": "agent-uuid",
    "x": 50, "y": 50,
    "hunger": 75, "energy": 60, "health": 100,
    "balance": 150
  },
  "nearbyAgents": [...],
  "nearbyResourceSpawns": [...],
  "nearbyShelters": [...],
  "inventory": [{ "type": "food", "quantity": 3 }],
  "availableActions": [...],
  "recentEvents": [...],
  "recentMemories": [...],
  "relationships": {...}
}
```

---

## Configuration

Key environment variables in `apps/server/.env`:

| Variable | Default | Description |
|----------|---------|-------------|
| `TICK_INTERVAL_MS` | `60000` | Time between simulation ticks (ms) |
| `GRID_SIZE` | `100` | World size (NxN) |
| `TEST_MODE` | `false` | Use fallback decisions instead of LLM |
| `RANDOM_SEED` | timestamp | Seed for reproducibility |

See [full configuration](https://github.com/agentauri/simagents.io/blob/main/apps/server/src/config/index.ts) for all options.

---

## Troubleshooting

### "Cannot connect to database"
Ensure Docker is running: `docker-compose up -d`

### "No agents appearing"
Click "Start" in the UI or call `POST /api/world/start`

### "LLM timeout errors"
Check API keys in `.env`. Use `TEST_MODE=true` to bypass LLM calls.

### Need help?
[Open an issue](https://github.com/agentauri/simagents.io/issues) on GitHub.
