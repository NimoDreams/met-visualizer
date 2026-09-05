# Project Context

This document preserves durable context for future sessions and future agents.
Update it when the project direction changes in a way future work needs to
remember.

## Current State

This project currently contains a management and documentation skeleton copied
from the Codex application template.

The product seed is `met-visualizer`: a way to view Meteora LP positions on
arbitrary Solana tokens. The user has not yet completed Phase 0 planning, so
future agents should not assume the app architecture, provider strategy,
storage model, or UX shape is settled.

## Product Intent

The app should help the user understand Meteora LP position context around
Solana tokens. The exact target workflows, first valuable screen, data sources,
and interaction model still need PM planning.

## Operating Model

This repo uses a PM, Developer, and Code Reviewer workflow:

- GitHub Issues are the source of truth for active work.
- Milestones group issues into phases or batches.
- Local docs preserve durable context and decisions.
- PRs should be small and linked to issues.
- Code reviewers leave explicit GitHub-visible readiness signals.
- Once the project has a usable baseline, keep `main` stable and use `dev` as
  the integration branch for active work.
- During active multi-agent work, issue branches normally start from `dev` and
  PR back into `dev`.

All agents should update durable context as they learn lasting information.

## Current Priorities

1. Establish the project roadmap.
2. Create initial milestones and issues.
3. Decide initial technical architecture.
4. Keep safety/privacy rules current as the project domain becomes clearer.
5. Decide when to introduce a `dev` integration branch and promotion workflow.
6. Define the read-only Meteora/Solana data boundary before implementation.

## Open Questions

- What is the product goal?
- Who is the app for?
- What is the initial technical stack?
- What data needs to be protected?
- What should Phase 0 accomplish?
- Which Meteora position and pool data should the app visualize first?
- Should the first workflow start from a token address, wallet address, pool
  address, or saved watchlist?
- Which external providers are needed, and what API keys/rate limits/terms
  apply?
