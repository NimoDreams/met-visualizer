# Project Context

## Current State — 2026-09-07

Phase 0 planning and Phase 1 MVP delivery are complete. Phase 1 was verified,
independently reviewed, accepted by the user, and promoted through PR #35 on
2026-09-07.

- Local: /Users/nimo/Documents/Development/met-visualizer
- GitHub: NimoDreams/met-visualizer
- `main` and `dev` share promoted Phase 1 baseline
  `19046d1f0dfae069a5847b2fb57bd662aa89aacd`.
- Phase 0 [epic #1](https://github.com/NimoDreams/met-visualizer/issues/1) and
  milestone are closed; the [roadmap](roadmap.md) records Phase 1 delivery.
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

## Current Delivery State

[Issues #16–#23 and #31](https://github.com/NimoDreams/met-visualizer/issues/15)
delivered the Phase 1 MVP. The [completion review](reviews/phase-1-completion.md)
and [promotion record](reviews/phase-1-promotion-preparation.md) preserve exact
candidate, review, verification, and branch evidence. Promotion PR #35 used a
regular merge commit, and exact stable SHA
`19046d1f0dfae069a5847b2fb57bd662aa89aacd` passed the post-merge checks.

GitHub Pages activation remains separate and is not yet authorized. No later
product phase, scope, or branch plan has been accepted; future work should begin
with PM planning and GitHub Issues.

## Read Next

[Vision](vision.md), [roadmap](roadmap.md), [architecture](architecture.md),
[decisions](decisions.md), and [MVP spec](specs/mvp.md).

Never commit human scratch notes, RPC credentials, local env files, raw provider
dumps, or sensitive logs. Docs preserve durable knowledge; GitHub tracks work.
