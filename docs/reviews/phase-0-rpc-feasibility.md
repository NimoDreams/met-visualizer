# Phase 0 RPC Feasibility — Meteora DLMM

Date: 2026-09-06

Issue: [#4](https://github.com/NimoDreams/met-visualizer/issues/4)

Status: account-model path established; authorized live-provider measurements pending

## Result So Far

The official Meteora account model supports the required all-owner view, but
the public convenience methods do not expose that product query directly.
The feasible path is a read-only sequence of filtered Solana program scans,
chunked account hydration, dynamic-position decoding, deduplicated bin-array
reads, and integer share calculations.

This is not yet the final feasibility result. No compatible RPC is configured
in the repository, so position counts, response bytes, latency, provider limits,
large-pool behavior, and numerical reconciliation remain unmeasured. The public
Solana mainnet endpoint rejected the filtered position scan with HTTP 403. The
2026-09-06 15:13:12 UTC probe used
`https://api.mainnet-beta.solana.com`, the PositionV2 discriminator and
`C8Gr6AUuq9hEdSYJzoEpNcdjpojPZwqG5MtQbeouNNwg` pool filters, zero-length
`dataSlice`, `base64`, `confirmed`, `withContext`, and
`Origin: https://nimodreams.github.io`. The response allowed cross-origin
access but returned JSON-RPC error `403: Access forbidden`. A compatible user
RPC must permit browser-origin POST requests and filtered
`getProgramAccounts` calls.

## Source Baseline

The source review pinned official `@meteora-ag/dlmm` version 1.9.14 at commit
[`576919e`](https://github.com/MeteoraAg/dlmm-sdk/tree/576919e3e4368e542c402f000b4264724f7f23ec).
Its runtime uses Anchor 0.31.0 and `@solana/web3.js` 1.x. Recheck these findings
against the selected implementation version because the SDK and account model
can change.

The mainnet DLMM program is
`LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo`.

## Required Read Path

### 1. Discover pools containing the entered mint

Run two filtered `getProgramAccounts` requests against the DLMM program: one
for the entered mint in `tokenXMint`, and one for it in `tokenYMint`. Include
the LB-pair discriminator at offset 0 and deduplicate account keys. The pinned
IDL implies serialized mint offsets 88 and 120; the live check must validate
these offsets against decoded results before they become an implementation
contract.

The SDK's `DLMM.getLbPairs()` calls `program.account.lbPair.all()` without a
mint filter, so it would download every LB-pair account. That is unsuitable for
a lightweight browser query. Discovery must use the lower-level filtered RPC
path or an equally complete, measured source.

### 2. Discover every position in each pool

For each pool, scan the DLMM program with both filters below and
`dataSlice: { offset: 0, length: 0 }`:

- PositionV2 discriminator `LgkNAEYaVX3` at offset 0.
- Pool public key at offset 8.

Both filters matter. The pool key occupies the same offset in other DLMM
account types, including limit orders, so a pool-only scan can misclassify
accounts. The SDK's `getPositionsByUserAndLbPair()` and
`getAllLbPairPositionsByUser()` add owner filters and therefore cannot return
all owners. `getLbPairLockInfo()` scans by pool but intentionally returns only
locked positions and does not establish the required result.

The pinned SDK's `chunkedGetProgramAccounts()` uses this key-only scan followed
by `getMultipleAccountsInfo()` batches of 100. Preserve that pattern: PositionV2
starts at 8,112 bytes before its discriminator and adds 112 bytes for every bin
beyond the first 70. A position can expand to 1,400 bins, making an unbounded
full-data program scan inappropriate for the browser.

### 3. Hydrate positions and bin arrays

Fetch position accounts in batches of at most 100. Decode their full account
bytes so dynamically extended positions are included; fixed-size-only decoding
would silently truncate liquidity shares above 70 bins. Derive every bin-array
key covered by the decoded ranges, deduplicate the keys across positions, then
hydrate those accounts in batches of at most 100.

The standard Solana methods expose `minContextSlot`; responses with context can
record the slot used. They do not provide an atomic snapshot across the full
multi-request sequence. Track the minimum and maximum observed context slots,
reject responses older than the initial floor, and present the result as a
slot-range snapshot. A position closed between discovery and hydration may
return `null`; record that as churn rather than silently calling the load
complete.

### 4. Calculate each position's current contribution

For a bin with total liquidity-token supply `S`, token amounts `X` and `Y`, and
a position share `s`, the SDK calculates with integer division:

```text
positionX = S == 0 ? 0 : floor(s * X / S)
positionY = S == 0 ? 0 : floor(s * Y / S)
```

Calculate this once for each position/bin pair, then sum selected position
contributions. Never assign the full bin balance to each position. Preserve raw
integer amounts until display conversion; apply token decimals only at the
presentation boundary.

DLMM bin price is token Y per token X after decimal normalization. If the
entered token is Y, invert the price and swap displayed token roles. Alignment
to the USD candle axis also needs a timestamped USD conversion for the pool's
other token. That conversion is external market data, not an RPC fact, and its
source/freshness must be shown. Pools with no supported conversion remain
viewable in native quote units and cannot be silently overlaid on a USD axis.

Limit-order liquidity is a separate DLMM mechanism. The MVP profile represents
decoded LP PositionV2 accounts and must not claim to show all executable pool
liquidity.

## Expected Request Cost

For `N` discovered pools, `P` total positions, and `B` unique bin arrays, the
baseline full load is approximately:

```text
2 pool-discovery program scans
+ N position-key program scans
+ ceil(P / 100) position hydration calls
+ ceil(B / 100) bin-array hydration calls
+ a small bounded set of mint, clock, and supporting account reads
```

The live run must replace this formula with observed requests, compressed and
uncompressed response bytes, latency, account counts, nulls, retries, and slot
ranges for ordinary, large, and dynamically extended samples. Helius currently
documents `getProgramAccounts` as 10 credits, a 5-per-second free-plan method
limit, and a paginated `getProgramAccountsV2` option. Provider-specific V2 and
incremental features may optimize supported RPCs later; the MVP compatibility
contract must continue to describe the standard methods it requires.

## Progressive Loading And Coverage

- Show pools after pool discovery, before position hydration finishes.
- Within each pool, expose `positions discovered`, `positions decoded`,
  `bin arrays required`, `bin arrays loaded`, failures, and snapshot slot range.
- Treat every discovered position as logically selected by default, but add its
  profile only after that position and its bin arrays are loaded. Label the
  aggregate partial until all required accounts succeed.
- Bound concurrency and prioritize the expanded pool. Continue other pools in
  the background so a large pool cannot hide smaller usable results.
- Keep the last complete snapshot during a transient refresh failure and mark
  it stale. Cancel obsolete work when the CA or RPC changes.
- Do not run the full program-scan sequence on a short polling interval. Start
  with explicit refresh; approve an automatic cadence only after live cost and
  churn measurements.

## Compatible RPC Contract

An MVP-compatible endpoint must:

- accept browser CORS POSTs without exposing the credential beyond the user's
  in-memory session;
- support `getProgramAccounts` with multiple `memcmp` filters, zero-length
  `dataSlice`, `base64` encoding, `withContext`, and `minContextSlot`;
- support `getMultipleAccounts` for batches up to 100 and return context slots;
- return complete filtered results for the measured large pool without silent
  truncation, or provide a detectable error the app can explain;
- tolerate the measured bounded concurrency and document actionable 403, 413,
  429, timeout, and 5xx behavior.

The app should run a cheap capability check before a token load and report an
incompatible endpoint separately from an empty token or pool result.

## Live Validation Still Required

Use a locally ignored `MET_VISUALIZER_RPC_URL` value without printing, storing,
or committing it. Record only redacted provider identity and aggregate metrics.
The live matrix must cover:

- a normal PositionV2 pool and an inverted token orientation;
- at least one dynamically extended position over 70 bins;
- a high-position-count pool and a thin pool;
- per-bin share reconciliation, decimal conversion, and a cross-quote USD
  conversion with explicit source time;
- CORS, filtered-scan completeness, response sizes, latency, rate-limit/error
  behavior, null-account churn, and context-slot spread;
- full-load and refresh cost, followed by a recommendation for concurrency,
  retry bounds, and any automatic refresh interval.

Sources: [Meteora TypeScript SDK reference](https://docs.meteora.ag/developer-guides/dlmm/typescript-sdk/reference),
[Meteora SDK source](https://github.com/MeteoraAg/dlmm-sdk),
[Solana `getProgramAccounts`](https://solana.com/docs/rpc/http/getprogramaccounts),
[Solana `getMultipleAccounts`](https://solana.com/docs/rpc/http/getmultipleaccounts),
[Helius `getProgramAccounts`](https://www.helius.dev/docs/api-reference/rpc/http/getprogramaccounts),
[Helius rate limits](https://www.helius.dev/docs/billing/rate-limits), and
[Helius credits](https://www.helius.dev/docs/billing/credits).
