# Phase 1 Liquidity Overlay Proof

Status: implementation evidence for issue #20; independent review pending.

## Contract Exercised

- A project-owned Lightweight Charts series primitive renders horizontal
  current-liquidity bars against the candle series price scale. Exact normalized
  levels are aggregated once, then visually bucketed when several levels occupy
  the same screen pixel.
- Pool direction, token and quote decimals, exact public quote price, and the
  reference session's fixed Market Cap, FDV, or Price basis are normalized before
  aggregation. Bin prices choose vertical coordinates; the reviewed current
  active-bin valuation controls bar weight. Exact apportionment makes every
  position's rendered contributions sum to its position value.
- Hover reports the contributing pool, position, bin, and current USD principal.
  Keyboard focus with up/down arrows inspects the same rows and Escape clears the
  highlight.
- One global exact minimum-USD mask and one complete-denominator 80% mask apply
  across enabled pools. Masks preserve checkbox state. Pool collapse, pool
  disable/re-enable, explicit position refresh, and progressive reveal preserve
  selection and visible extent.
- Unknown values remain in a separate labeled group. Unopened pools, incomplete
  enabled pools, stale snapshots, missing values, and unsupported common-axis
  conversions are excluded and disclosed. `Largest contributors` remains
  disabled until every enabled pool has a complete current denominator.

## Representative Evidence

The domain gates cover both token orientations, different quote prices, exact
minimum and 80% comparisons, incomplete-mask retention, unknown values, and an
exact rounding-boundary reconciliation. A 37-position quote-X fixture represents
a smaller newer-token session. A JUP-scale fixture aggregates 1,800 positions and
7,200 unique price levels under the two-second test budget on the implementation
host.

The deterministic Chromium proof sends 1,800 PositionV2 accounts through the
production-built worker, renders the initial 100-position selection, applies and
clears a USD filter, changes a position checkbox, inspects a contribution by
keyboard, collapses a pool without changing the overlay, disables and re-enables
the pool, verifies the manual selection survives the refreshed snapshot, and
applies the complete 80% mask. The test also checks that the session RPC marker
never reaches a public-provider request, page content, URL, or browser storage.

## Verification

Run with Node.js 24.20.0 and npm 11.19.0:

```text
npm run format:check
npm run lint
npm run typecheck
npm run test                  # 19 files, 92 tests
npm run test:browser          # 5 Chromium tests
npm run test:browser:providers # 2 live public-provider Chromium tests
npm run build
npm run verify:artifact       # 4 files, no credential/prohibited markers
git diff --check
```

The production build contains 47 modules. Its JavaScript bundle is 442.58 kB
(139.43 kB gzip), CSS is 12.48 kB (3.46 kB gzip), and the position worker is
5.28 kB.

## Remaining Gates

Issue #21 owns final responsive Chart/Positions mode behavior, complete in-app
Docs/recovery copy, and end-to-end release acceptance. GitHub Pages activation
and `dev`-to-`main` promotion remain separate user-approved gates.
