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
   Raydium or Orca while positions remain DLMM-only. Selection never changes
   candles. Default to verified Market Cap (USD), fall back to explicitly labeled
   FDV (USD), and use Price (USD) only when neither supply basis is available.
4. Expandable pools and positions with checkboxes, identifiers, and size/range
   context. Collapsing a pool does not deselect positions.
5. Combined selected liquidity appears as horizontal bars aligned to price.
   Hover highlights a position's contribution. Deselection subtracts it; size
   filters affect the overlay as well as the list.
6. Explain that the profile is a current snapshot, not the distribution at a
   historical candle. Show update status and coverage beside it.
7. A small Docs tab explains onboarding, session-only RPC, sources, refresh,
   reference markets, normalization, selection/filter semantics, and limitations.
   It must explain the Market Cap/FDV distinction and that historical valuation
   candles use the current session supply. Link to it from the visualization.

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
- Keep the reference market fixed for the token session. A refresh failure keeps
  last-good candles visibly stale and never silently switches pools.

## Agreed Progressive Loading

Load the chart and pool discovery in parallel. After the initial meaningful
DLMM pool is selected, first discover its position keys and count. Small pools
may load in full. Large pools use a staged path so the first visualization
represents the positions with the greatest current value rather than an
arbitrary account batch.

A large-pool ranking pass must inspect every position at least compactly. The
standard RPC does not sort positions by size, and raw liquidity shares are not
comparable across bins. Rank by current normalized position value calculated
from position shares and current bin balances. Dynamically extended positions
must include their extension data before ranking so they are not understated.

The provisional initial target follows these guardrails:

- load at least 25 positions when available;
- after that minimum, stop when about 80% of current decoded LP position value
  is represented; and
- stop at roughly 100 positions even when value coverage is lower.

Implementation evidence may tune these thresholds and add a decoded-byte
budget. The interface must state the achieved position-count and value coverage,
for example, `87 of 1,800 positions · 81.4% of current LP value`. It must offer
load-next, load-all, and cancel controls without implying that partial coverage
is complete.

The 80% stopping target applies only when every discovered position has a
current value and the full denominator is known. If valuation is missing or the
RPC falls back to ordinary batches, show total value coverage as unknown. A
percentage calculated for a valued subset must name that subset and cannot
satisfy the total-value target.

Initially loaded positions are selected automatically. Once the user manually
changes position selection, later batches remain unselected so loading does not
change the visualization unexpectedly. If a compatible RPC cannot support the
ranking pass, load ordinary bounded batches and state that the partial result is
not guaranteed to contain the largest positions.

## Proposed Defaults — Awaiting Approval

- Enable one meaningful DLMM pool initially; its exact ranking and tie-breaking
  policy remain open. Do not hydrate every pool's positions eagerly.
- Size filters use the same labeled valuation basis as loading priority; settle
  filter thresholds and missing-valuation behavior.

## Approved Reference And Denomination Defaults

- Use GeckoTerminal's liquidity-and-volume-ranked token pools. Check up to three
  candidates and choose the highest-ranked usable pool with enough history for
  the approximately 24-hour viewport, treating a new pool's available lifetime
  as enough. If none qualifies, use the highest-ranked candidate with any usable
  candles and label its history limited. Do not prefer a DEX by name.
- Keep the selected reference stable. Manual changes reload the series; refresh
  failures retain stale last-good data without automatic switching.
- Use Market Cap (USD) only when the keyless public GeckoTerminal response
  supplies a non-null verified value, without an FDV fallback. Otherwise use the
  current RPC mint supply and label the result FDV (USD). A supply failure
  degrades to Price (USD). No market-data credential is introduced.
- Use 15-minute initial candles and poll no faster than once per 60 seconds while
  visible. RPC liquidity, mint supply, and enabled-pool quote conversions refresh
  explicitly. All GeckoTerminal metadata, pool, candle, and quote-conversion
  reads share one approximately ten-request-per-minute budget.
- Convert enabled DLMM bins to the entered token's USD price with current public
  quote-token prices, then apply the chart's supply basis. Unsupported conversion
  disables that pool's common-axis overlay without hiding its positions.

See [reference market and valuation axis](reference-market.md) for the complete
contract and required in-app disclosure.

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
