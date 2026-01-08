# Sim Agents Documentation

> Central navigation hub for all project documentation.

## Quick Links

| Document | Description |
|----------|-------------|
| [README](../README.md) | Quick start and project overview |
| [ROADMAP](../ROADMAP.md) | Implementation status and progress tracking |
| [CLAUDE.md](../CLAUDE.md) | AI development assistant context |

---

## Getting Started

- **[README](../README.md)** - Quick start guide and project overview
- **[CONTRIBUTING](../CONTRIBUTING.md)** - How to contribute to the project
- **[CODE_OF_CONDUCT](../CODE_OF_CONDUCT.md)** - Community guidelines

## Core Documentation

### Design & Architecture

- **[PRD.md](PRD.md)** - Product Requirements Document (v1.5.0)
  - Vision and philosophy (Sections 1-4)
  - System architecture (Section 5)
  - World model (Section 6)
  - Agent identity (Section 7)
  - Economy (Section 8)
  - Actions catalog (Section 9, 24)
  - Governance (Section 11)
  - Advanced features (Sections 34-40)
  - **NEW**: Employment System (Section 41) 🚧

### Technical Reference

- **[Stack Rationale](appendix/stack-rationale.md)** - Technical decisions and trade-offs
  - Why Bun over Node.js
  - Why PostgreSQL as event store
  - Why SSE over WebSocket
  - Infrastructure choices

### Scientific Research

- **[Experiment Design Guide](experiment-design-guide.md)** - How to design and run experiments
  - Experiment DSL schema
  - Baseline agents (random, rule-based, Q-learning)
  - Shock system
  - Statistical analysis

- **[Scientific Framework](appendix/scientific-framework.md)** - Validation methodology
  - Core assumptions
  - Metrics specification
  - Reproducibility requirements
  - A/B testing framework

## Operations

- **[DEPLOYMENT](../DEPLOYMENT.md)** - Production deployment guide
  - Fly.io setup
  - PostgreSQL and Redis provisioning
  - GitHub Actions CI/CD
  - Scaling and monitoring

## Development Context

- **[CLAUDE.md](../CLAUDE.md)** - For AI coding assistants
  - Key files and structure
  - Common commands
  - Data models
  - API endpoints

- **[ROADMAP](../ROADMAP.md)** - Implementation progress
  - Phases 0-5 complete
  - **Phase 6 in progress**: Employment System 🚧
  - Technical debt tracking
  - Recent commits

---

## Document Relationships

```
README.md           ─── Quick start, links to docs
    │
    ├── ROADMAP.md      ─── Implementation status (single source of truth)
    │
    ├── CONTRIBUTING.md ─── How to contribute
    │
    └── docs/
        ├── INDEX.md        ─── This file (navigation hub)
        │
        ├── PRD.md          ─── Design specifications (authoritative)
        │
        ├── experiment-design-guide.md ─── Research guide
        │
        └── appendix/
            ├── scientific-framework.md ─── Validation methodology
            └── stack-rationale.md      ─── Technical decisions
```

---

*Last updated: January 7, 2026*
