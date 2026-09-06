# Architecture

Status: Phase 1 foundation and reference-market flow are implemented on `dev`;
DLMM discovery is implemented for review, while position hydration remains queued.

## Agreed Boundaries

The intended deployment is a static SPA on GitHub Pages. Runtime reads originate
in the browser. No backend, database, account, or project-maintained market-data
credential is part of the planned MVP.

| Boundary | Responsibility |
| --- | --- |
| User RPC | On-chain DLMM pools, positions, bin arrays, mint data |
| GeckoTerminal public API | Reference-market discovery, candles, verified market cap, and enabled-pool quote-token USD prices |
| Meteora public Data API | Current DLMM pool TVL/volume metadata used only to rank the initially enabled pool |
| Application | Normalize prices/amounts, calculate selected liquidity, render chart/profile |
| In-app Docs and status | Explain provider roles, reference market, refresh and coverage |

Keep the RPC endpoint only in memory, out of storage, URLs, logs, analytics,
source control, and builds. Do not forward it to market-data services. Developer
environment variables must not become published browser credentials.

## Selected Technical Foundation

- Single root package using Node.js 24 LTS, npm, strict TypeScript, React 19.2,
  Vite 8, and Lightweight Charts 5.2.
- Native Node/Vite local workflow without Docker Compose because the MVP has no
  server, database, validator, or supporting service.
- In-memory application state with no persistent user configuration and Vite
  environment-file loading disabled.
- Separate read-provider boundaries for Solana RPC, GeckoTerminal, and Meteora
  metadata. The initial RPC transport is a project-owned native `fetch` client
  with an explicit read-method allowlist; keep the full Meteora SDK out of the
  production bundle and use it as a pinned decoding oracle.
- Hash navigation and a `/met-visualizer/` Vite base for GitHub Pages.
- CI for `dev` and `main`; Pages deployment only from reviewed `main` builds.
- Periodic candle refresh and explicit RPC snapshot refresh; no tick stream.

See the [technical foundation spec](specs/technical-foundation.md) for runtime,
source, security, testing, branching, and deployment details.

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

Meteora's [pool-list endpoint](https://docs.meteora.ag/api-reference/dlmm/pools/pools)
supports exact mint filters, TVL sorting, volume, and blacklist metadata. A live
request from the intended Pages origin returned permissive CORS. Use this keyless
endpoint for initial DLMM-pool ranking, then reconcile addresses and orientation
with RPC discovery. Do not use its pool metadata as a substitute for on-chain
position or bin data. An independent non-browser client received HTTP 403, so a
real browser fetch is an implementation gate before relying on automatic
selection. See the
[ranking feasibility report](reviews/phase-0-pool-ranking-feasibility.md).

[DexPaprika](https://docs.dexpaprika.com/knowledge-base/response-headers)
documents missing browser CORS headers. Birdeye and GMGN require additional API
credentials. [DEX Screener](https://docs.dexscreener.com/api/reference) has no
documented public historical candle endpoint. None is required for the MVP.

Direct HTTP and localhost browser-origin checks succeeded after using the
documented version header and normal browser request shape. Exact GitHub Pages
origin behavior remains a pre-release smoke test.

Issue #16 repeated the two keyless provider checks from the production-shaped
local SPA in Playwright Chromium. GeckoTerminal token-pool discovery and Meteora
TVL-sorted pool metadata both returned CORS-visible HTTP 200 JSON. This resolves
the earlier Meteora non-browser request-shape uncertainty for local browser use.
See the [scaffold browser proof](reviews/phase-1-scaffold-browser-proof.md).

Issue #17 establishes one GeckoTerminal adapter for token metadata, ranked pool
discovery, USD OHLCV, and cached USD quote prices. Live response validation found
numeric values encoded as strings, pool identity in base/quote relationship IDs,
and OHLCV as newest-first six-value tuples; the adapter validates and normalizes
these at its boundary. All calls share a priority-aware rolling budget of ten
dispatches per minute, concurrent reads are deduplicated, and `Retry-After` is
honored after HTTP 429. Deduplicated work owns its transport cancellation signal;
each consumer can cancel independently, and the transport is aborted only when
no consumers remain. Deterministic browser routing proved that the user RPC
marker never entered GeckoTerminal request URLs, page content, or browser storage.
See the
[reference-market browser proof](reviews/phase-1-reference-market-browser-proof.md).

Issue #18 adds RPC-authoritative DLMM discovery with two discriminator-and-mint
key scans, context-slot-aware account hydration, and a minimum project-owned LB
pair decoder. The decoder reads only the identity and pool-state fields needed by
the current UI and is checked against `@meteora-ag/dlmm` 1.9.14 at commit
`576919e3e4368e542c402f000b4264724f7f23ec`; the SDK is not a production
dependency. Position qualification uses only a zero-byte PositionV2 key/count
scan. Full position accounts and bins remain issue #19 scope.

The Meteora metadata boundary accepts the live browser response envelope
`current_page`, `pages`, `page_size`, `total`, and `data`, then validates address,
mint orientation, pagination, and descending TVL order before ranking. A live
Chromium request with the production page size returned CORS-visible HTTP 200 and
the expected shape. Metadata never supplies pool identity: each result must
reconcile with the decoded RPC pool before it can rank or qualify. See the
[DLMM pool-selection browser proof](reviews/phase-1-dlmm-pool-selection-proof.md).

Pagination proof checks final-page row counts against `total`, `pages`, and
`page_size`, and requires TVL to remain descending across page boundaries. Any
inconsistency leaves selection manual. PositionV2 qualification responses must
meet their requested minimum context slot, and successful probe slots extend the
session's reported RPC slot range.

## Data Semantics

- Match mint addresses, not tickers; discover pools with the CA on either side.
- Enumerate all owners' positions using the pool relationship and account type.
  Wallet-scoped helpers are insufficient. Validate against the
  [official SDK](https://github.com/MeteoraAg/dlmm-sdk), including dynamic positions.
- Compute per-position bin contributions from shares and bin state; do not
  attribute the entire pool balance to every position.
- Normalize decimals, orientation, and quote currency before aggregation.
  Current quote conversions apply to snapshots, not historical candles.
- Use a verified provider market cap when available; otherwise multiply USD
  prices by current RPC mint supply and label the result FDV. Apply the same
  fixed session supply to candle and overlay y-coordinates; quote conversion
  applies only when normalizing a DLMM pool's bins to USD.
- Track snapshot consistency and discovered/loaded/selected coverage separately.
  Define compatible RPC capabilities rather than promising every endpoint can
  serve large account scans.
- Calculate position size from current per-bin principal valued in USD. Apply one
  filter across the known valued positions in enabled pools, while keeping
  incomplete and unavailable data outside its denominator and visibly accounted
  for.
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

Only report total value coverage or use the 80% stop when all discovered
positions contributed to the valuation denominator. Missing valuations or the
unordered fallback make total value coverage unknown. A subset percentage must
identify its denominator and cannot stand in for pool-wide coverage.

See the [MVP spec](specs/mvp.md), the
[reference-market contract](specs/reference-market.md), and
[position-control contract](specs/position-controls.md).
