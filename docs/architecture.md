# Architecture

Status: Phase 0 direction and proposals; no application stack is implemented.

## Agreed Boundaries

The intended deployment is a static SPA on GitHub Pages. Runtime reads originate
in the browser. No backend, database, account, or project-maintained market-data
credential is part of the planned MVP.

| Boundary | Responsibility |
| --- | --- |
| User RPC | On-chain DLMM pools, positions, bin arrays, mint data |
| GeckoTerminal public API | Starting source for reference-market discovery and candles |
| Application | Normalize prices/amounts, calculate selected liquidity, render chart/profile |
| In-app Docs and status | Explain provider roles, reference market, refresh and coverage |

Keep the RPC endpoint only in memory, out of storage, URLs, logs, analytics,
source control, and builds. Do not forward it to market-data services. Developer
environment variables must not become published browser credentials.

## Proposals Awaiting Approval

- TypeScript, React, Vite, Lightweight Charts.
- In-memory application state with no persistent user configuration.
- Separate read-provider boundaries for RPC and candles.
- A static local development workflow; explicitly resolve whether to depart
  from the template's Docker Compose preference at the technical gate.
- Periodic candle refresh and a separate RPC snapshot cadence; no promise of
  tick-by-tick streaming before validation.

## Provider Research — 2026-09-06

GeckoTerminal is the validated starting choice for implementation, subject to
release smoke testing and beta-API monitoring. The detailed
[feasibility review](reviews/phase-0-candle-feasibility.md) records samples,
observations, and remaining limits.
Its [public reference](https://api.geckoterminal.com/docs/index.html) documents
pool OHLCV, 1m/5m/15m/1h/4h/12h/1d, up to 1,000 bars per request, pagination,
and USD or quote-token denomination. The live reference lists a one-minute
cache and approximately 10 calls/minute; the
[FAQ](https://apiguide.geckoterminal.com/faq) says 30. Budget conservatively.
[CoinGecko's guide](https://www.coingecko.com/learn/dex-data-api) describes up to
six months of free history, subject to available pool history.

[Meteora OHLCV](https://docs.meteora.ag/api-reference/dlmm/pools/ohlcv) allowed
cross-origin access in the sample, but returned ten recent, quote-denominated
bars and rejected a 24-hour 5-minute range as too large. It is an unapproved
diagnostic comparison source until its units and usable range are validated.

[DexPaprika](https://docs.dexpaprika.com/knowledge-base/response-headers)
documents missing browser CORS headers. Birdeye and GMGN require additional API
credentials. [DEX Screener](https://docs.dexscreener.com/api/reference) has no
documented public historical candle endpoint. None is required for the MVP.

Direct HTTP and localhost browser-origin checks succeeded after using the
documented version header and normal browser request shape. Exact GitHub Pages
origin behavior remains a pre-release smoke test.

## Data Semantics

- Match mint addresses, not tickers; discover pools with the CA on either side.
- Enumerate all owners' positions using the pool relationship and account type.
  Wallet-scoped helpers are insufficient. Validate against the
  [official SDK](https://github.com/MeteoraAg/dlmm-sdk), including dynamic positions.
- Compute per-position bin contributions from shares and bin state; do not
  attribute the entire pool balance to every position.
- Normalize decimals, orientation, and quote currency before aggregation.
  Current quote conversions apply to snapshots, not historical candles.
- Track snapshot consistency and discovered/loaded/selected coverage separately.
  Define compatible RPC capabilities rather than promising every endpoint can
  serve large account scans.
- Keep reference candles independent of position selection. Reload and identify
  changed sources/pools instead of silently splicing histories.
- LP liquidity is not necessarily all executable liquidity; limit orders are
  outside this MVP.

## RPC Account-Model Research — 2026-09-06

Official SDK and live Helius checks establish a feasible lower-level read path
for all-owner PositionV2 data: two mint-oriented filtered pool scans, an
on-demand discriminator-plus-pool position scan, chunked full position reads,
and deduplicated bin-array reads. Wallet-scoped SDK helpers do not satisfy the
product query. Dynamic positions require their extension bytes, and each
position's bin amounts come from its share of bin supply rather than the full
bin balance.

JUP produced 626 pools and 14,202 positions across 142 of them. Eager token-wide
hydration is outside the lightweight MVP budget. Discover all pools, load all
owners' positions within enabled pools, and select those loaded positions by
default. A provider-specific paginated global index may add counts without
changing the portable on-demand contract. Use explicit RPC refresh because the
large-pool sample returned approximately 20 MB of decoded position JSON. See
the [Phase 0 RPC feasibility report](reviews/phase-0-rpc-feasibility.md).

## Progressive Position Loading

Standard RPC cannot order PositionV2 accounts by economic size. For an enabled
pool, first retrieve position keys and count. Load small pools completely. For
large pools, perform a compact all-position ranking pass, retrieve the shared
bin arrays needed for valuation, and calculate each position's current
normalized value from its per-bin share of token balances. Raw liquidity-share
totals are not a valid ranking because their meaning depends on each bin.

The implementation must verify any projected `dataSlice` offsets against its
pinned Meteora SDK and reconcile sampled projected values with full account
decodes. Extended PositionV2 accounts need their additional share data before
ranking. If compact projection is incompatible with an RPC, use bounded ordinary
batches and expose that the result is partial and not guaranteed largest-first.

Render the largest positions first, initially targeting at least 25 positions,
about 80% of decoded position value, and a cap near 100 positions. Treat these
as measurable starting budgets rather than permanent protocol constants. Show
both position-count and value coverage, and keep loading state independent from
checkbox selection state. After a manual selection change, newly loaded
positions remain unselected. Large-pool continuation is user initiated through
load-next or load-all controls; explicit cancellation stops obsolete work.

See the [MVP spec](specs/mvp.md).
