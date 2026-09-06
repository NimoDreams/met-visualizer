# Project Context

## Current State — 2026-09-06

This is a documentation-only bootstrap repository. The user authorized a Phase 0
documentation and GitHub planning pass, not application implementation.

- Local: met-visualizer repository root
- GitHub: NimoDreams/met-visualizer
- main holds the bootstrap baseline; dev has not been introduced.
- The current documentation branch is codex/phase-0-planning, targeting main.
- [Phase 0 epic #1](https://github.com/NimoDreams/met-visualizer/issues/1) and
  its milestone track active work; [roadmap](roadmap.md) links the child issues.
- PM, Developer, and Code Reviewer remain separate roles. Reviewers must post
  GitHub-visible readiness; this planning pass does not authorize a merge.

## Agreed Direction

Token CA → reference candles → expandable Meteora DLMM pools and all owners'
positions → selectable current liquidity distribution across bins.

The open-source SPA targets GitHub Pages. Users supply a session-only RPC.
Public free APIs may supply data without additional credentials; GeckoTerminal
is the agreed starting candle source. Include an in-app Docs tab and visible
source, freshness, and coverage context. All functionality remains read-only.

## Outstanding Gates

1. Verify GeckoTerminal browser access, representative token coverage, history,
   price denomination, and freshness under realistic rate limits.
2. Verify complete pool/position discovery and per-position bin amounts through
   a compatible user RPC, including large pools and dynamic positions.
3. Approve stack, reference selection, refresh/coverage rules, and acceptance
   criteria after reviewing feasibility evidence.
4. Obtain explicit user approval to end Phase 0 and begin implementation.

TypeScript, React, Vite, and Lightweight Charts remain proposals. Confirm and
introduce dev immediately before implementation; use issue-scoped developer
branches/worktrees and independent review thereafter.

## Read Next

[Vision](vision.md), [roadmap](roadmap.md), [architecture](architecture.md),
[decisions](decisions.md), and [MVP spec](specs/mvp.md).

Never commit human scratch notes, RPC credentials, local env files, raw provider
dumps, or sensitive logs. Docs preserve durable knowledge; GitHub tracks work.
