# Phase 0 Initial DLMM Pool Ranking Feasibility

Date: 2026-09-06

Issue: [#5](https://github.com/NimoDreams/met-visualizer/issues/5)

Status: live evidence complete with a browser-validation gate; independent
documentation review pending

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

Between approximately 2026-09-06 18:07 and 18:10 UTC, curl 7.71.1 requests used
`GET https://dlmm.datapi.meteora.ag/pools`, `sort_by=tvl:desc`, and these exact
decoded query strings:

- JUP as token X:
  `filter_by=token_x=JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN&sort_by=tvl:desc&page_size=5`;
- JUP as token Y:
  `filter_by=token_y=JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN&sort_by=tvl:desc&page_size=5`;
- ANSEM as token X:
  `filter_by=token_x=9cRCn9rGT8V2imeM2BaKs13yhMEais3ruM3rPvTGpump&sort_by=tvl:desc&page_size=5`;
  and
- CORS header check: the JUP token-X query with `page_size=1` and request header
  `Origin: https://nimodreams.github.io`.

No credential or user RPC was sent to Meteora. The `curl` CORS check returned
HTTP 200 and `Access-Control-Allow-Origin: *`. During independent review, a
Python `urllib` request received HTTP 403. Treat the endpoint as sensitive to
client/request shape until an implementation browser fetch succeeds. The exact
deployed application remains a release smoke test; failure leaves pools available
for manual selection rather than adding a credential or proxy.

The JUP stress sample's provider `total` fields returned 327 token-X pools and
299 token-Y pools. Their sum equaled the 626 on-chain pools from the earlier RPC
feasibility pass. These observations were not atomic and individual pools can
change, so implementation must still reconcile addresses and orientation. The
leading token-X pool was `C8Gr6AUuq9hEdSYJzoEpNcdjpojPZwqG5MtQbeouNNwg`,
with approximately $1.82 million reported TVL and $5.94 million reported 24-hour
volume at observation. This is evidence for scale and the proposed reconciliation
path, not proof of permanent equality or the expected average user path.

An active memecoin-oriented sample, ANSEM mint
`9cRCn9rGT8V2imeM2BaKs13yhMEais3ruM3rPvTGpump`, returned 104 token-X DLMM pools.
Its first five TVL-ranked results included multiple SOL and USDC pairs; reported
TVL ranged from approximately $2.21 million for the first pool to $75 thousand
for the fifth. This demonstrates why one deterministic first pool and explicit
user enablement are useful even outside the JUP stress case. It does not yet
validate ANSEM position decoding or establish a permanent fixture.

Provider amounts are volatile snapshots and should not be copied into product
tests as expected constants. No raw response was committed.

## Approved Selection Contract

1. Discover all matching DLMM pool accounts through the user RPC in both token
   orientations.
2. Request Meteora pool metadata separately for the exact mint as token X and
   token Y, sorted by TVL descending. Request the first 20 results for each
   orientation, merge them, deduplicate by address, and sort locally by the
   contract below. Because each provider response is already TVL-descending,
   these two pages contain the global leading candidates across orientations.
   No later page can outrank a first-page item with lower TVL. If the automatic
   three-candidate boundary has exactly equal TVL and 24-hour volume with the
   last item on either page, fetch the next relevant page until the tie ends;
   if the boundary cannot be resolved within the request budget, do not
   automatically enable a pool.
3. Retain only metadata addresses that match a decoded RPC-discovered pool with
   the entered mint in the expected orientation. Exclude provider-blacklisted,
   non-finite, and non-positive-TVL entries from automatic enablement.
4. Rank eligible candidates by current reported USD TVL descending, then
   24-hour USD volume descending, then pool address ascending.
5. Probe candidates in order with bounded RPC position-key scans and keyless
   GeckoTerminal quote-price checks. Automatically enable the first pool with at
   least one PositionV2 account and a supported common-axis USD conversion.
   Cache and reuse the candidate conversion as the enabled-pool conversion, then
   begin the approved progressive-loading path.
6. Stop after three automatic candidate probes. If none qualifies or either
   provider boundary fails, leave every pool disabled and prompt the user to
   choose from the RPC-discovered list.

Treat an HTTP/CORS failure, invalid schema, missing orientation page, truncated
page, non-monotonic TVL order, or unresolved boundary tie as incomplete ranking.
Allow at most one bounded retry after provider-directed or exponential backoff;
then use manual selection. Never fill a missing orientation with the other side
or use partial metadata as a complete ranking.

The chosen pool remains stable for the token session. Refresh updates its
metadata without replacing it. Users may enable or disable other pools at any
time. A manually selected pool may lack ranking metadata or USD conversion, but
the interface must disclose the resulting limitations.

A later metadata refresh failure keeps the chosen pool and last-good ranking
metadata visibly stale. A later quote-conversion failure keeps the pool selected
and the last-good overlay visibly stale; if no prior conversion exists, preserve
the selection and disable only its common-axis overlay. Neither failure clears
checkboxes or selects a replacement pool.

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
