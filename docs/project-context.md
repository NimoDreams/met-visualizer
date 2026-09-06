# Project Context

## Current State — 2026-09-06

This is a documentation-only Phase 0 repository. Product, feasibility, loading,
and technical-foundation planning are approved; application implementation is
not yet authorized.

- Local: /Users/nimo/Documents/Development/met-visualizer
- GitHub: NimoDreams/met-visualizer
- main holds the reviewed Phase 0 documentation; dev has not been introduced.
- [Phase 0 epic #1](https://github.com/NimoDreams/met-visualizer/issues/1) and
  its milestone track active work; [roadmap](roadmap.md) links the child issues.
- PM, Developer, and Code Reviewer remain separate roles. Reviewers must post
  GitHub-visible readiness; implementation remains gated on explicit approval.

## Agreed Direction

Token CA → reference candles → expandable Meteora DLMM pools and all owners'
positions → selectable current liquidity distribution across bins.

The open-source SPA targets GitHub Pages. Users supply a session-only RPC.
Public free APIs may supply data without additional credentials; GeckoTerminal
is the agreed starting candle source. Include an in-app Docs tab and visible
source, freshness, and coverage context. All functionality remains read-only.

GeckoTerminal candle feasibility and the portable/indexed RPC paths are
independently reviewed. Large pools use approved progressive loading that
prioritizes current position value and reports honest count/value coverage.

The selected technical foundation is Node.js 24, npm, strict TypeScript, React,
Vite, Lightweight Charts, RPC-only Solana modules, minimum Meteora read decoders,
and a main-only GitHub Pages workflow. The local runtime intentionally excludes
Docker Compose. See the [technical foundation](specs/technical-foundation.md).

## Outstanding Gates

1. Approve exact reference-market ranking, denomination/conversion, refresh,
   and fallback behavior.
2. Approve size-filter units and thresholds, missing valuations, and responsive
   behavior.
3. Obtain explicit user approval to end Phase 0 and begin implementation.

Create dev from the accepted Phase 0 main immediately before implementation;
use issue-scoped developer branches/worktrees and independent review thereafter.

## Read Next

[Vision](vision.md), [roadmap](roadmap.md), [architecture](architecture.md),
[decisions](decisions.md), and [MVP spec](specs/mvp.md).

Never commit human scratch notes, RPC credentials, local env files, raw provider
dumps, or sensitive logs. Docs preserve durable knowledge; GitHub tracks work.
