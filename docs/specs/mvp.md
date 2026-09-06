# MVP — Token Chart And Current DLMM Liquidity

Status: Phase 0 draft for user review. Agreed direction and proposed defaults
are separated below. Implementation is not authorized.

## Purpose And Scope

A Solana trader enters a token CA, views a reference candlestick chart, expands
Meteora DLMM pools and all owners' positions, and visualizes selected positions'
current distribution across bins. Open-source static SPA for GitHub Pages;
one user-provided RPC credential only.

Exclude wallets/signing, trading, private keys, seed phrases, swaps, liquidity
mutation, transaction submission, and fund movement.

## Agreed Experience

1. Clearly invite token CA entry and explain when the RPC is required and what
   it powers. Distinguish invalid input, missing markets, and provider failures.
2. Chart occupies approximately 66–75% of desktop visual space; pools/positions
   occupy 25–33%. Specify a usable small-screen layout before implementation.
3. Familiar candles, volume, crosshair, pan/zoom, and timeframe controls. Identify
   provider, reference pool/DEX, and denomination. The reference market may be
   Raydium or Orca while positions remain DLMM-only. Selection never changes candles.
4. Expandable pools and positions with checkboxes, identifiers, and size/range
   context. Collapsing a pool does not deselect positions.
5. Combined selected liquidity appears as horizontal bars aligned to price.
   Hover highlights a position's contribution. Deselection subtracts it; size
   filters affect the overlay as well as the list.
6. Explain that the profile is a current snapshot, not the distribution at a
   historical candle. Show update status and coverage beside it.
7. A small Docs tab explains onboarding, session-only RPC, sources, refresh,
   reference markets, normalization, selection/filter semantics, and limitations.
   Link to it from the visualization.

## Data And Failure Behavior

- RPC exists only in page memory; reload/close clears it. No persisted endpoint,
  logged credential, or developer key in builds. Replacing/disconnecting the
  RPC stops obsolete requests/subscriptions.
- No additional credential for public data. Separate candle and RPC failures.
  Available positions remain useful when candles are missing; invent no history.
- Distinguish loading, complete, incomplete, unavailable, and stale states.
  Selected loaded positions do not imply full coverage while discovery or
  loading is incomplete or failed.
- Normalize decimals, price direction, and quote units before aggregation;
  unsupported conversion is visible.
- Bound retries and visibly mark last-good stale data. Results for an old CA
  must not overwrite a newer search.
- Reference-market changes are visible and reload the series. No automatic
  candle-provider fallback is approved for the MVP.

## Proposed Defaults — Awaiting Approval

- All discovered positions logically selected by default. Progressive loading
  shows loaded contributions with honest coverage; settle new-position behavior.
- USD token price, 15-minute initial candles, and candle polling no faster than
  once per 60 seconds while visible. These candle defaults are supported by
  [Phase 0 evidence](../reviews/phase-0-candle-feasibility.md); RPC refresh has
  its own budget and status.
- Stable session reference chosen using available history, recent activity,
  and liquidity. Exact ranking, tie-breaking, and manual override remain open.
- Size filters use a labeled common valuation basis; settle thresholds, sorting,
  missing valuations, and how manual selection interacts with filtering.

## First Usable Release Acceptance

- A supported CA and compatible RPC complete the workflow with no extra
  credential or wallet connection.
- Pool discovery handles both token orientations; positions are pool-wide.
  Provider limits and partial results are explicit.
- Pool and position scans identify the expected account discriminator as well
  as the mint/pool relationship. Dynamically extended position bytes are read.
- Per-position bin amounts reconcile with underlying shares/bin data in
  representative checks; aggregation does not double-count.
- Selection, collapsing, filtering, and hover produce the specified profile.
- Chart/profile prices have correct direction, decimals, and denomination.
- Source identity, freshness, coverage, and errors match in-app explanations.
- RPC credentials do not survive reload or appear in storage, logs, another
  provider's requests, or the published build.
- Static-host behavior, keyboard access, and small-screen usability are verified.
  No prohibited signing/write functionality exists.
- An independent reviewer posts GitHub readiness; the user accepts the MVP.

## Phase 0 Evidence

| Gate | Required evidence |
| --- | --- |
| Candles | Cross-origin success; established/new/thin/multi-pool samples; bar counts/history/gaps; freshness; throttling; units |
| RPC | Pool-wide discovery; large/dynamic positions; bin-share correctness; call counts/response size/latency; partial/failure states |
| Technical | Selected stack/local workflow, reference/refresh policy, RPC compatibility, responsive/filter defaults |
| User | Spec/evidence review, Phase 0 acceptance, explicit implementation authorization |

Credential use or a code-based feasibility spike needs a scoped authorized
handoff. Creating the planning issue does not start implementation.
