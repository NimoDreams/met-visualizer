# Phase 0 Initial DLMM Pool Ranking Feasibility

Date: 2026-09-06

Issue: [#5](https://github.com/NimoDreams/met-visualizer/issues/5)

Status: live evidence complete; independent documentation review pending

## Result

Meteora's keyless public DLMM Data API can provide the current USD TVL metadata
needed to rank which RPC-discovered pool is enabled first. Its pool-list endpoint
supports exact token-X/token-Y filters, TVL sorting, pagination, 24-hour volume,
and blacklist status. Treat the API as ranking metadata; the user's RPC remains
the authority for the pool account, mint relationship, PositionV2 existence,
and position/bin contents.

This adds no project-managed or user market-data credential. If ranking metadata
is unavailable or cannot be reconciled with RPC results, list the discovered
pools without automatically enabling one.

## Live Checks

Requests used `GET https://dlmm.datapi.meteora.ag/pools`, exact `token_x` or
`token_y` filters, `sort_by=tvl:desc`, and bounded page sizes. No credential or
user RPC was sent to Meteora. A request with
`Origin: https://nimodreams.github.io` returned HTTP 200 and
`Access-Control-Allow-Origin: *`; the exact deployed application remains a
release smoke test.

The JUP stress sample returned 327 token-X pools and 299 token-Y pools, matching
the 626 on-chain pools from the RPC feasibility pass. The leading token-X pool
was `C8Gr6AUuq9hEdSYJzoEpNcdjpojPZwqG5MtQbeouNNwg`, with approximately $1.82
million reported TVL and $5.94 million reported 24-hour volume at observation.
This is evidence for scale and address reconciliation, not the expected average
user path.

An active memecoin-oriented sample, ANSEM mint
`9cRCn9rGT8V2imeM2BaKs13yhMEais3ruM3rPvTGpump`, returned 104 token-X DLMM pools.
Its first five TVL-ranked results included multiple SOL and USDC pairs; reported
TVL ranged from approximately $2.21 million for the first pool to $75 thousand
for the fifth. This demonstrates why one deterministic first pool and explicit
user enablement are useful even outside the JUP stress case. It does not yet
validate ANSEM position decoding or establish a permanent fixture.

Provider amounts are volatile snapshots and should not be copied into product
tests as expected constants.

## Approved Selection Contract

1. Discover all matching DLMM pool accounts through the user RPC in both token
   orientations.
2. Request Meteora pool metadata separately for the exact mint as token X and
   token Y, sorted by TVL descending. Merge and deduplicate the results.
3. Retain only metadata addresses that match a decoded RPC-discovered pool with
   the entered mint in the expected orientation. Exclude provider-blacklisted,
   non-finite, and non-positive-TVL entries from automatic enablement.
4. Rank eligible candidates by current reported USD TVL descending, then
   24-hour USD volume descending, then pool address ascending.
5. Probe candidates in order with bounded RPC position-key scans. Automatically
   enable the first pool with at least one PositionV2 account and a supported
   common-axis USD conversion. Begin the approved progressive-loading path.
6. Stop after three automatic candidate probes. If none qualifies or either
   provider boundary fails, leave every pool disabled and prompt the user to
   choose from the RPC-discovered list.

The chosen pool remains stable for the token session. Refresh updates its
metadata without replacing it. Users may enable or disable other pools at any
time. A manually selected pool may lack ranking metadata or USD conversion, but
the interface must disclose the resulting limitations.

The candle reference remains independent. The largest eligible Meteora pool is
enabled first even when candles come from Orca, Raydium, or another Meteora pool.

## Representative MVP Validation

Use JUP as a scale/stress fixture. Judge the ordinary experience with several
memecoin-oriented cases that collectively cover:

- a recent token with short candle history and unverified market cap, exercising
  the FDV label;
- one dominant Meteora pool and several minor pools;
- SOL and stablecoin quote assets;
- the entered mint on either side of the DLMM pair;
- sparse trading, absent conversion, and a pool with no PositionV2 accounts; and
- pool/position churn during discovery and hydration.

Choose reproducible fixtures during implementation because active memecoin pools
and their metrics change quickly. Do not assume JUP latency, pool count, or data
volume represents the typical user session.

Sources: [Meteora Pools endpoint](https://docs.meteora.ag/api-reference/dlmm/pools/pools)
and [Meteora Pool response](https://docs.meteora.ag/api-reference/dlmm/pools/pool).
