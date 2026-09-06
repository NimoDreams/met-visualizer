# Phase 0 RPC Feasibility — Meteora DLMM

Date: 2026-09-06

Issue: [#4](https://github.com/NimoDreams/met-visualizer/issues/4)

Status: live evidence complete; independent review pending

## Result

The official Meteora account model and a user-provided Helius RPC support the
required all-owner view. The feasible path uses filtered pool discovery,
PositionV2 indexing, chunked dynamic-position hydration, deduplicated bin-array
reads, and integer share calculations. Ordinary and extended positions both
reconciled exactly with the official SDK.

The evidence rejects eager hydration of every position in every discovered
pool. JUP currently maps to 626 DLMM pools and 14,202 PositionV2 accounts. A
lightweight browser should discover all pools, progressively load all owners'
positions within user-enabled pools, and select those loaded positions by
default. The most relevant pool can be enabled initially after the technical
gate defines its ranking. Do not promise a continuously refreshed token-wide
snapshot in the MVP.

## Safety And Reproducibility

The live checks read `MET_VISUALIZER_RPC_URL` from the repository's ignored
`.env.local` file. The full endpoint and key were never printed, committed,
included in requests to another provider, or copied into this report. Results
record only the provider hostname `mainnet.helius-rpc.com`, public on-chain
identifiers, aggregate counts, and timings. Disposable probe code and package
installs remained under `/private/tmp`.

`git check-ignore` resolved `.env.local` to the repository's `.env.*` rule at
`.gitignore` line 21, `git ls-files` confirmed it is untracked, and the `main`
working tree remained clean.

The source review pinned official `@meteora-ag/dlmm` version 1.9.14 at commit
[`576919e`](https://github.com/MeteoraAg/dlmm-sdk/tree/576919e3e4368e542c402f000b4264724f7f23ec).
Its lockfile resolves Anchor 0.31.0 and `@solana/web3.js` 1.95.3. The mainnet
DLMM program is `LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo`.

Recheck account layouts against the implementation's pinned SDK version. The
probes sent `Origin: https://nimodreams.github.io`; all successful Helius
responses advertised `Access-Control-Allow-Origin: *`. An exact deployed-page
browser check remains a release smoke test.

## Account Path

### Pool discovery

Two `getProgramAccounts` requests locate the entered mint in either side of an
LB pair. Each request includes the LB-pair discriminator `6XZoLajBWVJ` at
offset 0 and the mint at serialized offset 88 (`tokenXMint`) or 120
(`tokenYMint`). The 2026-09-06 16:01 UTC run found 327 JUP-as-X pools and 299
JUP-as-Y pools. Hydrating all 626 pool accounts took seven
`getMultipleAccounts` calls, 857,093 decoded JSON bytes, and 448 ms cumulative
request latency. Decoding produced zero filter/orientation mismatches.

The SDK's `DLMM.getLbPairs()` fetches every LB-pair account without a mint
filter. Use the lower-level filtered path instead.

### Position discovery

Position scans must combine:

- PositionV2 discriminator `LgkNAEYaVX3` at offset 0.
- Pool public key at offset 8.

The discriminator prevents limit orders and other DLMM account types with the
same pool offset from being counted as LP positions. The SDK's
`getPositionsByUserAndLbPair()` and `getAllLbPairPositionsByUser()` are
wallet-scoped. `getLbPairLockInfo()` returns only locked positions. None is the
product's all-owner query.

There are two viable discovery modes:

1. Standard RPC can scan one enabled pool with both filters and a zero-length
   data slice. This is the portable MVP path.
2. A provider extension can index all PositionV2 accounts using a 32-byte data
   slice at offset 8, group their public keys by pool, and discard unrelated
   entries page by page. Helius `getProgramAccountsV2` provides bounded pages.

A standard global index succeeded at 16:02 UTC: 186,577 accounts, 51,129,404
decoded JSON bytes, and 2,473 ms. The Helius V2 run at 16:04 UTC completed in 19
pages with 186,581 accounts, 51,134,013 total decoded bytes, 6,537 ms cumulative
latency, and a maximum page size of 2,741,106 bytes. Pages returned gzip content
encoding but no content length, so compressed transfer bytes were unavailable.
Context slots advanced from 444833679 to 444833698 during pagination.

Filtering that index against the 626 JUP pools found 14,202 positions in 142
pools; 484 pools had none. The largest observed pool counts were:

| Pool | Positions |
| --- | ---: |
| `2QrWsSWrGvoAqkDC5XSGqjS752RWLaopqAaGrbugSxBL` | 1,866 |
| `C8Gr6AUuq9hEdSYJzoEpNcdjpojPZwqG5MtQbeouNNwg` | 1,800 |
| `8ZBbyDGErfqvY65fRZnm6dtQBe3REuAPqzRN7819fzeW` | 1,324 |
| `6cDtJkcJKFEsGDhptmgvy3XtbwyRqnW3GoGcmnwVzJ7U` | 1,067 |
| `BrMYU1XWCqMAtBURD8yp3d9gni3uHxomoj5JG9LWr7Mj` | 1,019 |

Helius V2 is an optional optimization. Feature-detect it; do not make a
provider-specific method part of the generic RPC contract.

### Position and bin hydration

The SDK's `chunkedGetProgramAccounts()` first requests keys with a zero-length
slice, then hydrates full accounts in batches of 100. PositionV2 uses 8,112
bytes before its discriminator and adds 112 bytes for each bin beyond the
first 70. Its current maximum is 1,400 bins. A fixed-size decoder would silently
lose extended liquidity shares.

The JUP/SOL pool
`C8Gr6AUuq9hEdSYJzoEpNcdjpojPZwqG5MtQbeouNNwg` was the large sample. At 16:01
UTC it produced:

| Measurement | Result |
| --- | ---: |
| Positions discovered and decoded | 1,800 |
| Ordinary / dynamically extended | 1,770 / 30 |
| Width range | 1–376 bins |
| Position hydration | 18 calls; 20,009,689 decoded bytes |
| Position hydration latency | 1,716 ms total; 95 ms p50; 117 ms max |
| Unique bin arrays required and decoded | 12 |
| Bin-array hydration | 1 call; 164,252 decoded bytes; 59 ms |
| Null accounts / decode failures | 0 / 0 |

The complete instrumented sequence included pool discovery, pool hydration,
the large-pool load, one comparison pool, one inverted sample, and slot reads.
It used 33 measured RPC calls, returned 21,749,687 decoded JSON bytes, and took
2,824 ms cumulative request latency. SDK processing and three parallel candle
comparison requests brought wall time to approximately nine seconds.

Position counts changed from 1,800 to 1,799 and back to 1,800 across nearby
runs, while each individual hydration had no nulls. This is expected on-chain
churn and proves that the app must identify the observation window rather than
claim an atomic snapshot.

### Contribution correctness

For bin supply `S`, bin amounts `X` and `Y`, and position share `s`, the SDK
uses integer division:

```text
positionX = S == 0 ? 0 : floor(s * X / S)
positionY = S == 0 ? 0 : floor(s * Y / S)
```

Independent calculations matched the SDK's X amount, Y amount, and normalized
price for both reproducible samples:

| Position | Width | Serialized bytes | Checked bin | Result |
| --- | ---: | ---: | ---: | --- |
| `13xLNCSj43QiQdndY2N8u7euQyX5fy6uoiEYyHVfkmE2` | 69 | 8,120 | 142 | X, Y, and price matched |
| `3DVybVuMGAf6jmjAXH7pFYKLfwyiCWcrt99iHC91A5NR` | 376 | 42,392 | -174 | X, Y, and price matched |

The pool used 6-decimal JUP as token X and 9-decimal SOL as token Y. Raw
integers remained exact through share calculation; decimals were applied to
the price only at presentation.

Pool `5YUW4n7MKdQTwvXavYjwxzaK6YvajWKCaQFpL6hmvKk` verified the inverted case:
JUP was token Y and the pool had one PositionV2 account. Displaying JUP requires
inverting the normalized Y-per-X bin price and swapping amount roles.

At candle timestamp `1788710400`, GeckoTerminal returned direct JUP/USD,
JUP/SOL, and SOL/USD closes for the same reference pool. Multiplying JUP/SOL by
SOL/USD reproduced direct JUP/USD within approximately
`1.8e-11` basis points. Cross-quote conversion is therefore numerically sound,
but it remains external market data whose provider and timestamp must be shown.
Unsupported conversions stay in native quote units and cannot be silently
overlaid on a USD chart.

Limit-order liquidity is a separate DLMM mechanism. The MVP profile represents
decoded LP PositionV2 accounts and must not claim to show all executable pool
liquidity.

## Product And Loading Contract

- List every discovered pool, but group or de-emphasize pools with zero
  PositionV2 accounts and virtualize the 626-row sample.
- Enable the selected reference or highest-ranked meaningful DLMM pool first.
  The technical gate must settle ranking and manual pool enablement.
- Load every owner's position within an enabled pool. Treat those positions as
  selected by default and add contributions progressively as their bin arrays
  arrive. Never label the overlay complete early.
- Expose `positions discovered`, `positions decoded`, `bin arrays required`,
  `bin arrays loaded`, failures, and observation slot range per enabled pool.
- Prioritize the expanded pool and bound concurrent account batches. A 100-key
  batch worked reliably; begin there.
- Keep the last complete snapshot during transient failure and label it stale.
  Cancel obsolete work when the CA or RPC changes.
- Use explicit refresh for the MVP. A large-pool refresh is approximately 20 MB
  before SDK overhead; a token-wide global index is approximately 51 MB before
  any relevant position hydration. Do not poll either path automatically.
- A candle-thin market is not necessarily position-thin: JUP/USDC pool
  `AUgbdzNob9S8MiVHm4Qruqz3VsZGoqtMZnSzv45juDbL` had 701 positions. Base
  loading policy on measured account counts, not trading activity alone.

## Snapshot And Failure Contract

Use `withContext` and `minContextSlot` where supported. Record the minimum and
maximum context slots because Solana RPC does not make the multi-request load
atomic. A position closed between discovery and hydration can return `null`;
mark churn and keep coverage incomplete until the next deliberate refresh.

Handle failures explicitly:

- Browser CORS failure or filtered-scan HTTP/JSON-RPC 403: incompatible RPC.
- 413, timeout, or provider result cap: retry with smaller provider-supported
  pages; otherwise offer per-pool lazy loading and explain the limitation.
- 429 or transient 5xx: bounded exponential backoff with jitter and visible
  last-good data. The probe did not intentionally induce rate limiting.
- Decode mismatch: stop that account type and report an SDK/layout mismatch;
  do not render partial bytes as liquidity.
- Missing account during hydration: record a null/churn count, continue other
  accounts, and keep the snapshot incomplete.

The public Solana endpoint was also probed at 15:13 UTC with the PositionV2 and
large-pool filters, zero-length slice, `base64`, `confirmed`, `withContext`, and
the GitHub Pages origin. It returned HTTP/JSON-RPC 403 while advertising CORS.
This confirms that public endpoints cannot be assumed compatible.

## Compatible RPC Contract

Every MVP-compatible endpoint must accept browser-origin POSTs and support:

- `getProgramAccounts` with multiple `memcmp` filters, `dataSlice`, `base64`,
  `withContext`, and `minContextSlot`;
- `getMultipleAccounts` for batches of 100 with context slots;
- complete filtered results for a measured 1,800-position pool, or a detectable
  error the app can explain;
- the measured bounded sequential workload without silent truncation.

Capability levels should be visible:

- **Portable:** pool discovery plus complete on-demand per-pool position scans.
- **Indexed:** paginated global PositionV2 discovery, such as Helius
  `getProgramAccountsV2`, enabling counts for all pools with bounded page memory.

No RPC refresh should use transaction-history, signing, subscriptions, or write
methods in the MVP. Re-evaluate the SDK, provider limits, CORS, and response
sizes before release because all are external contracts.

Sources: [Meteora TypeScript SDK reference](https://docs.meteora.ag/developer-guides/dlmm/typescript-sdk/reference),
[Meteora SDK source](https://github.com/MeteoraAg/dlmm-sdk),
[Solana `getProgramAccounts`](https://solana.com/docs/rpc/http/getprogramaccounts),
[Solana `getMultipleAccounts`](https://solana.com/docs/rpc/http/getmultipleaccounts),
[Helius `getProgramAccounts`](https://www.helius.dev/docs/api-reference/rpc/http/getprogramaccounts),
[Helius `getProgramAccountsV2`](https://www.helius.dev/docs/api-reference/rpc/http/getprogramaccountsv2),
[Helius rate limits](https://www.helius.dev/docs/billing/rate-limits), and
[Helius credits](https://www.helius.dev/docs/billing/credits).
