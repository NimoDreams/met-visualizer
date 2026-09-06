# Project Context

## Current State — 2026-09-06

Phase 0 is complete. Its product, feasibility, loading, provider, UX, technical,
branch, privacy, and safety direction was independently reviewed and accepted by
the user on 2026-09-06. Phase 1 implementation is authorized and tracked in
[milestone 2](https://github.com/NimoDreams/met-visualizer/milestone/2) and
[epic #15](https://github.com/NimoDreams/met-visualizer/issues/15).

- Local: met-visualizer repository root
- GitHub: NimoDreams/met-visualizer
- `main` holds the accepted Phase 0 baseline. `dev` is the Phase 1 integration
  branch; issue branches start from and target `dev`.
- Phase 0 [epic #1](https://github.com/NimoDreams/met-visualizer/issues/1) and
  milestone are closed; the [roadmap](roadmap.md) links active Phase 1 work.
- PM, Developer, and Code Reviewer remain separate roles. Reviewers must post
  GitHub-visible readiness before merge.

## Agreed Direction

Token CA → reference candles → expandable Meteora DLMM pools and all owners'
positions → selectable current liquidity distribution across bins.

The expected primary audience is Solana memecoin traders. Representative MVP
validation should emphasize newer tokens with short histories, unverified market
cap, SOL/stablecoin quotes, and one or several meaningful DLMM pools. JUP remains
a scale/stress fixture and should not define expected average latency or payloads.

The open-source SPA targets GitHub Pages. Users supply a session-only RPC.
Public free APIs may supply data without additional credentials; GeckoTerminal
is the agreed starting candle source. Include an in-app Docs tab and visible
source, freshness, and coverage context. All functionality remains read-only.

The chart defaults to verified Market Cap (USD). When circulating supply is not
verified, it uses current RPC mint supply and explicitly says FDV (USD); if no
supply basis is available, it degrades to Price (USD). A GeckoTerminal-ranked,
validated reference pool stays fixed for the token session, and enabled Meteora
bins use current public quote-token prices on the same valuation axis. See the
[reference-market spec](specs/reference-market.md).

Position size means current estimated USD principal value. One global filter
spans known valued positions in enabled pools and must disclose pools, incomplete
loads, and unavailable values outside its denominator. Desktop keeps the chart
and positions side by side; constrained layouts stack them; narrow phones use a
state-preserving Chart/Positions switch. See the
[position-control spec](specs/position-controls.md).

The app initially enables the largest eligible Meteora pool by provider-reported
USD TVL after reconciling it with RPC discovery, then 24-hour volume and address
for ties. It probes at most three candidates for PositionV2 accounts and USD
conversion. The choice is stable; failure leaves pools disabled for explicit user
selection. See the
[pool-ranking evidence](reviews/phase-0-pool-ranking-feasibility.md).

GeckoTerminal candle feasibility and the portable/indexed RPC paths are
independently reviewed. Large pools use approved progressive loading that
prioritizes current position value and reports honest count/value coverage.

The selected technical foundation is Node.js 24, npm, strict TypeScript, React,
Vite, Lightweight Charts, RPC-only Solana modules, minimum Meteora read decoders,
and a main-only GitHub Pages workflow. The local runtime intentionally excludes
Docker Compose. See the [technical foundation](specs/technical-foundation.md).

## Active Delivery Gate

Start with [issue #16](https://github.com/NimoDreams/met-visualizer/issues/16).
Keep later issues queued behind their documented dependencies. GitHub Pages
activation and eventual `dev` to `main` promotion require separate user approval.

## Read Next

[Vision](vision.md), [roadmap](roadmap.md), [architecture](architecture.md),
[decisions](decisions.md), and [MVP spec](specs/mvp.md).

Never commit human scratch notes, RPC credentials, local env files, raw provider
dumps, or sensitive logs. Docs preserve durable knowledge; GitHub tracks work.
