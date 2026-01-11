# SimAgents Roadmap

> Last updated: 2026-01-11

## Current Status

**All Phases Complete** - The core platform is fully functional.

| Phase | Name | Status | Completed |
|-------|------|--------|-----------|
| 0 | Kernel (MVP) | ✅ Complete | 2025-12-26 |
| 1 | Emergence Observation | ✅ Complete | 2025-12-28 |
| 2 | Social Complexity | ✅ Complete | 2025-12-29 |
| 3 | External Agents | ✅ Complete | 2025-12-29 |
| 4 | Advanced Features | ✅ Complete | 2025-12-29 |
| 5 | Research Platform | ✅ Complete | 2026-01-02 |
| 6 | Employment System | ✅ Complete | 2026-01-11 |

---

## Phase Summary

### Phase 0: Kernel (MVP)
Core simulation with tick-based time, needs decay (hunger/energy/health), agent death, and event sourcing. 6 initial actions: `move`, `gather`, `consume`, `sleep`, `work`, `buy`. Scientific model with resource spawns and shelters. Multi-LLM support (Claude, Gemini, Codex, DeepSeek, Qwen, GLM, Grok).

> See: [PRD Sections 5-9](docs/PRD.md)

### Phase 1: Emergence Observation
Agent memory (episodic), trust/relationships, trade between agents, location claiming, naming conventions, knowledge system (direct + referral discovery), share_info/gossip, emergence metrics (Gini, clustering, cooperation index).

> See: [PRD Sections 24-26](docs/PRD.md)

### Phase 2: Social Complexity
Conflict actions (`harm`, `steal`, `deceive`), emergent justice tracking, social discovery via gossip, advanced analytics (inequality, social graph metrics), crime/conflict metrics, role crystallization (gatherer, trader, predator detection).

> See: [PRD Sections 9, 30](docs/PRD.md)

### Phase 3: External Agents (A2A Protocol)
Full A2A protocol for external agent registration. Public API with rate limiting. Webhook (push) and polling (pull) modes. API key authentication. Time travel / replay UI with full tick history navigation.

> See: [PRD Section 34-35](docs/PRD.md)

### Phase 4: Advanced Features
- **Verifiable Credentials** (§34): Issue/revoke credentials with HMAC-SHA256 signatures
- **Gossip Protocol** (§35): Reputation spreading with polarization index
- **Agent Reproduction** (§36): `spawn_offspring` with lineage tracking and mutations
- **LLM Optimization** (§37): Token budgets, performance tracking, overthinking detection

> See: [PRD Sections 34-37](docs/PRD.md)

### Phase 5: Research Platform
- **Biomes**: forest, desert, tundra, plains with per-biome regen rates
- **Experiment DSL**: YAML/JSON experiment definitions with batch runner
- **Shock Scenarios**: Economic shocks, disasters, rule modifications via API
- **Visualization**: Heatmaps (density, trust, conflict), social graph (D3.js)

> See: [PRD Section 38-39](docs/PRD.md), [Experiment Design Guide](docs/experiment-design-guide.md)

### Phase 6: Employment System + Social Discovery
Real employment contracts replacing "magic work":
- **7 Employment Actions**: `offer_job`, `accept_job`, `pay_worker`, `quit_job`, `fire_worker`, `claim_escrow`, `cancel_job_offer`
- **Payment Types**: upfront, on_completion, per_tick with escrow protection
- **Stigmergy**: Agents leave scent trails (Redis-based with TTL decay)
- **Signals**: Long-range communication (1-5 intensity, 5-25 tile range)
- **Cooperation Bonuses**: Gather efficiency +15-45% when working together
- **Solo Penalties**: Reduced forage success (-20%) and public_work pay (-30%) when isolated
- **New Survival Actions**: `forage` (anywhere, low yield), `public_work` (shelters, bootstrap economy)

> See: [PRD Section 41](docs/PRD.md)

---

## Technical Status

### Infrastructure
- Bun + TypeScript, Fastify HTTP, PostgreSQL + Drizzle ORM
- Redis (cache, pub/sub, scents), BullMQ (job queue)
- SSE real-time updates, Docker Compose
- 654 tests passing, CI/CD via GitHub Actions

### API
- REST API with OpenAPI/Swagger documentation
- External agent API (`/api/v1/*`)
- Replay API (`/api/replay/*`)
- Scenarios API (`/api/scenarios/*`)
- Admin API with API key authentication

### Frontend
- React + Vite + Zustand + TailwindCSS
- Scientific canvas (100x100 grid) with optional isometric toggle
- Real-time event feed, decision logs, analytics dashboard
- Heatmaps, social graph visualization, replay UI

---

## Known Limitations

1. **No persistence across restarts**: World state resets on server restart (by design for experiments)
2. **Single-server architecture**: Multi-tenancy schema exists but not horizontally scaled
3. **LLM rate limits**: External API providers may throttle during high agent counts

---

## Future Considerations

These are NOT planned - just ideas for potential future development:

- **Anti-Sybil mechanisms**: Staking, proof-of-work, sponsorship for agent identity
- **Banking/Treasury**: Proper monetary policy with currency creation rules
- **Market makers**: Automated trading for price discovery
- **SDKs**: TypeScript, Python, Go SDKs for external agent development

> **Note**: For full Philosophy (IMPOSED vs EMERGENT), see [PRD Sections 3-4](docs/PRD.md)
