# Phase 0 Completion Review

Date: 2026-09-06

Epic: [#1](https://github.com/NimoDreams/met-visualizer/issues/1)

Gate: [#5](https://github.com/NimoDreams/met-visualizer/issues/5)

Status: ready for independent review and explicit user acceptance. Application
implementation is not authorized by this document.

## Outcome

Phase 0 has a documented product direction, provider/data boundaries, feasible
read paths, loading and interaction contracts, technical foundation, branch
strategy, and safety scope. Issues #2–#4 are closed with reviewed evidence. All
listed planning decisions in #5 are resolved. No application code, dependency
tree, `dev` branch, Pages deployment, or implementation issue has been created.

## Accepted Product Direction

The primary expected user is a Solana memecoin trader. The read-only static SPA
starts with a token CA and session-only user RPC, then presents a stable reference
candle chart, expandable Meteora DLMM pools and all owners' positions, and a
selectable current bin-liquidity profile. A Docs view explains sources, units,
refresh, coverage, and limitations.

The chart occupies approximately 70% of desktop space. The position pane uses
the remainder. Constrained layouts stack the panes; narrow phones switch between
state-preserving Chart and Positions modes.

## Data And Valuation Decisions

- GeckoTerminal is the keyless initial candle and public USD-price source.
- Reference candles default to 15 minutes, poll no faster than every 60 seconds
  while visible, and keep one identified pool stable for the token session.
- Use verified Market Cap (USD) when supplied. Otherwise use RPC mint supply and
  label the axis FDV (USD); degrade to Price (USD) when no supply basis exists.
- Historical valuation candles use one current session supply and do not claim
  historical circulating supply.
- The user's RPC is authoritative for DLMM pool accounts, PositionV2 accounts,
  bin arrays, mint supply, and context slots.
- Meteora's keyless Data API supplies only initial-pool TVL/volume ranking
  metadata. Every candidate is reconciled with RPC discovery.
- Initially enable the highest-ranked qualifying Meteora pool within three
  bounded probes. Rank by USD TVL, 24-hour volume, then address; failure requires
  explicit user selection.
- Position size is current estimated USD principal. One filter spans the complete
  known valued universe in enabled pools, with incomplete and unavailable data
  excluded and visibly accounted for.

## Scale And Loading Decisions

Discover all pools, but load positions only for enabled pools. Small pools may
load completely. Large pools use a compact all-position valuation pass followed
by largest-first hydration. The starting target is at least 25 positions, about
80% of completely valued pool principal, and a cap near 100, with load-next,
load-all, and cancel controls.

JUP is the stress sample: the feasibility pass found 626 pools, 14,202 positions
across 142 pools, and approximately 20 MB of decoded position JSON for one
1,800-position pool. Representative validation must also cover newer memecoins
with short histories, FDV fallback, fewer meaningful pools, SOL/stablecoin quote
assets, sparse trading, and pool/position churn.

## Technical And Operational Decisions

- Node.js 24 LTS, npm lockfile, strict TypeScript, React 19.2, Vite 8, and
  Lightweight Charts 5.2 in one root package.
- Narrow read-only Solana RPC modules behind a provider interface; no full
  Meteora transaction-capable runtime in the browser.
- Exact `bigint` domain arithmetic and a Web Worker for large-pool work.
- Native Node/Vite workflow without Docker Compose, backend, or database.
- Hash navigation and `/met-visualizer/` base for GitHub Pages.
- CI on `dev` and `main`; Pages deployment only from reviewed `main` after a
  separate approved activation.
- Create `dev` from the accepted Phase 0 baseline immediately before
  implementation. Developers use issue branches/worktrees into `dev`; independent
  reviewers leave GitHub-visible readiness; promotion to `main` requires user
  approval.

## Safety And Privacy Gate

The MVP remains research and visualization only. It excludes wallets, signing,
private keys, seed phrases, swaps, trading, liquidity mutation, transaction
submission, and fund movement.

The RPC endpoint remains in page memory only. It cannot enter storage, URLs,
logs, analytics, another provider request, source control, or the production
bundle. Vite environment-file loading stays disabled. The existing local
`.env.local` remains ignored and untracked.

## Implementation Verification Still Required

These are scoped implementation/release gates rather than unresolved product
direction:

- exact browser and deployed-Pages CORS checks for GeckoTerminal, Meteora pool
  metadata, and the user-entered RPC;
- browser handling for Meteora's request-shape sensitivity after an independent
  non-browser request received HTTP 403;
- longer candle-freshness measurement and a numeric stale threshold;
- current provider terms, attribution, schemas, and rate limits;
- measured Solana RPC-library bundle comparison and abort behavior;
- Meteora decoder/data-slice reconciliation against a pinned SDK and IDL;
- representative memecoin fixtures plus the JUP scale case;
- global value/coverage correctness across pools and missing data;
- responsive, keyboard, cancellation, race, and memory-only credential tests;
  and
- exact Pages base, hash reload, artifact, and no-secret verification before the
  separately approved first deployment.

Any failed gate produces a focused follow-up or an explicitly accepted scope
change. It does not justify silently weakening labels, coverage, safety, or
provider boundaries.

## Proposed Post-Approval Sequence

After explicit implementation authorization:

1. Create a Phase 1 implementation milestone and issue breakdown from the
   approved specs.
2. Create `dev` from the accepted Phase 0 merge commit.
3. Begin with the application scaffold, CI, static-host path, session-only RPC
   boundary, and provider/browser proof points.
4. Add the CA-to-reference-chart path, followed by RPC pool discovery and one
   progressively loaded DLMM profile.
5. Expand to multiple enabled pools, global filters, failure/refresh behavior,
   responsive modes, in-app Docs, and release verification.

Each implementation issue receives a developer worktree/branch and independent
review. GitHub Pages remains disabled until a separately approved deployment.

## Acceptance Requested

The user decides separately whether to:

1. accept this documented direction as completion of Phase 0; and
2. authorize the PM to create `dev`, the Phase 1 milestone/issues, and developer
   handoffs for implementation.

Until both decisions are explicit, issues #1 and #5 and the Phase 0 milestone
remain open, and implementation does not begin.

## Evidence

- [MVP specification](../specs/mvp.md)
- [Technical foundation](../specs/technical-foundation.md)
- [Reference market and valuation axis](../specs/reference-market.md)
- [Position controls and responsive layout](../specs/position-controls.md)
- [Candle feasibility](phase-0-candle-feasibility.md)
- [RPC feasibility](phase-0-rpc-feasibility.md)
- [Initial DLMM pool ranking feasibility](phase-0-pool-ranking-feasibility.md)
- Planning PRs [#6](https://github.com/NimoDreams/met-visualizer/pull/6),
  [#7](https://github.com/NimoDreams/met-visualizer/pull/7),
  [#8](https://github.com/NimoDreams/met-visualizer/pull/8),
  [#9](https://github.com/NimoDreams/met-visualizer/pull/9),
  [#10](https://github.com/NimoDreams/met-visualizer/pull/10),
  [#11](https://github.com/NimoDreams/met-visualizer/pull/11),
  [#12](https://github.com/NimoDreams/met-visualizer/pull/12), and
  [#13](https://github.com/NimoDreams/met-visualizer/pull/13).
