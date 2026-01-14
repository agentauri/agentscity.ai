# SimAgents Roadmap

> Last updated: 2026-01-13

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
| 7 | Cooperative Puzzle Game | ✅ Complete | 2026-01-13 |
| 8 | User Authentication | ✅ Complete | 2026-01-13 |

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
- **New Survival Actions**: `forage` (anywhere, low yield), `public_work` (shelters, bootstrap economy)

#### Cooperation Incentives (Sugarscape-inspired)
Comprehensive system to encourage emergent group behavior:
- **Gather Cooperation**: +25% per agent at same location (max +75%), solo penalty -50%
- **Group Gather (Rich Spawns)**: Spawns with 12+ resources require 2+ agents; solo limited to 2 units; group bonus +50%
- **Forage Cooperation**: +15% success per nearby agent (max +45%), solo penalty -40%
- **Public Work Cooperation**: +20% pay per nearby worker (max +60%), solo penalty -50%
- **Trade Bonuses**: +20% items received with trusted partners (trust >20), +5% per prior interaction (max +25%)
- **Trust-Based Pricing**: Shelter prices -10% at +100 trust, +10% at -100 trust
- **Inventory Visibility**: Agents see nearby agents' inventories to enable informed trades

#### Item Spoilage (Creates Trade Urgency)
Perishable items decay each tick, encouraging consumption and trade:
- Food/Water: -1%/tick | Medicine: -0.5%/tick | Battery: -0.2%/tick
- Materials and tools do not decay

> See: [PRD Section 41-42](docs/PRD.md)

### Phase 7: Cooperative Puzzle Game (Fragment Chase)
Collaborative puzzle system inspired by Babylon research:
- **6 Puzzle Actions**: `join_puzzle`, `leave_puzzle`, `share_fragment`, `form_team`, `join_team`, `submit_solution`
- **Puzzle Types**: coordinates (find x,y), password (reconstruct string), logic (combine constraints)
- **Focus Lock**: Agents in puzzles can only perform puzzle-related actions
- **Staking Mechanism**: Entry requires CITY stake; prize pool distributed to winners
- **Team Formation**: Agents can form teams to share fragments and solve together
- **Anti Free-Riding**: Contribution scoring ensures active participants get rewards

#### Fragment Chase Mechanics
- Automatic puzzle generation (10% chance per tick when <2 active games, ≥3 agents alive)
- Fragments distributed to participants; no single agent has complete solution
- Teams share fragments to reconstruct the puzzle solution
- Winner takes prize pool (sum of all stakes + base prize)

> See: [PRD Section 43](docs/PRD.md)

### Phase 8: User Authentication (OAuth)
Secure authentication system for web platform:
- **OAuth Providers**: Google and GitHub sign-in
- **JWT Tokens**: Access tokens (15m) + refresh tokens (30d)
- **Encrypted API Keys**: AES-256-GCM encryption for user LLM API keys
- **Session Management**: Secure httpOnly cookies for refresh tokens
- **Conditional Auth**: Optional in development, required in production

> See: [PRD Section 44](docs/PRD.md)

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
