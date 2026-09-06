# Phase 0 Candle Feasibility — GeckoTerminal

Date: 2026-09-06

Issue: [#3](https://github.com/NimoDreams/met-visualizer/issues/3)

Status: evidence complete; independently reviewed on PR #7

## Result

GeckoTerminal is feasible as the MVP's primary candle source. Its public API
worked without a key, allowed cross-origin browser reads, covered established,
new, thin, Meteora, and Orca Solana pools, and returned the documented price
orientations and history pagination. Treat it as cached near-real-time data,
not a tick stream.

Exact GitHub Pages-origin verification remains a deployment smoke test. The
successful browser test used a localhost static origin with the same direct
cross-origin fetch architecture.

## Evidence

Tests sent `Accept: application/json;version=20230203` and
`Origin: https://nimodreams.github.io`. Requests stayed below ten per minute;
this was not a load test. Times below come from the response `Date` header.
Raw responses stayed in temporary storage and were not committed.

The common URL prefix was
`https://api.geckoterminal.com/api/v2/networks/solana`. OHLCV paths used
`/pools/{pool}/ohlcv/minute`. These are the exact samples and parameters:

| Case | Request/sample | Observed UTC | Result |
| --- | --- | --- | --- |
| CORS | `GET /../networks?page=1`; browser fetched pool `C8Gr6AUuq9hEdSYJzoEpNcdjpojPZwqG5MtQbeouNNwg` with `aggregate=15&limit=2&currency=usd&token=base` | 15:09:54; browser 15:26:34 | HTTP 200 with `Access-Control-Allow-Origin: *` and GET allowed. The browser request from a localhost static page returned response type `cors`, HTTP 200, and two candles. Exact Pages-origin testing remains a release smoke test. |
| Pool discovery | `GET /tokens/JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN/pools?page=1` | 15:10:21 | Twenty pools across Meteora, Orca, Raydium CLMM, and other DEXes. |
| Meteora history | Pool `C8Gr6AUuq9hEdSYJzoEpNcdjpojPZwqG5MtQbeouNNwg`; `aggregate=15&limit=1000&currency=usd&token=base` | 15:10:53 | 1,000 bars; newest timestamp `1788706800`, oldest `1787472900` (2026-08-23 08:15). |
| Orca history | Pool `C1MgLojNLWBKADvu9BHdtgzz1oZX4dZ5zGdGcgvvW8Wz`; `aggregate=15&limit=1000&currency=usd&token=base` | 15:10:53 | 1,000 bars; newest timestamp `1788706800`, oldest `1787807700` (2026-08-27 05:55). These samples show pagination-sized history, not a retention guarantee. |
| Backfill | Meteora pool above; `aggregate=15&limit=20&currency=usd&token=base&before_timestamp=1787472900` | 15:11:24 | Twenty older bars. Timestamp `1787472900` repeated at the page boundary, requiring timestamp deduplication. |
| New pool | SLOWLANA mint `2BCG9Jga3uxyhxZUq7KGRjZzxWtNdwfGU5B1KXUePwpX`; pool `FA4xkBarMqYQak86pF56zY4iWbrEYmCBHPu1G7qoxeai`; `aggregate=1&limit=100&currency=usd&token=base` | 15:10:53 | Two bars after pool creation at 15:09:09, without a CoinGecko coin ID. |
| Thin pool | STFU mint `3ioZhB54Qm2rHprafT3w7BNuoBk9roAUvvL7gY56moon`; pool `HdhjkfbjpV313eE4Ns54C1gt3iHP8S6AGGKyGanfcBp6`; same one-minute parameters | 15:10:53 | One traded bar; no older history. |
| Empty intervals | JUP/USDC pool `AUgbdzNob9S8MiVHm4Qruqz3VsZGoqtMZnSzv45juDbL`; `aggregate=1&limit=100&currency=usd&token=base&include_empty_intervals=true` | 15:14:34 | One hundred bars, including 94 carry-forward bars with zero volume. |
| Orientation | JUP/SOL pool `C8Gr6AUuq9hEdSYJzoEpNcdjpojPZwqG5MtQbeouNNwg`; `aggregate=15&limit=2` | 15:11:25–15:14:33 | `currency=usd&token=base` was JUP/USD near $0.26; `token=quote` was SOL/USD near $105; `currency=token&token=base` was JUP/SOL near 0.0025. Volume denomination changed too. |
| Active-pool freshness | Same JUP/SOL pool; pool details plus `aggregate=1&limit=5&currency=usd&token=base` | 15:23:34–15:27:06 | Pool details reported 23 trades and $19,706 volume in five minutes. The first OHLCV request returned a traded 15:23 candle; the next returned a newer traded candle at timestamp `1788708300`. This active sample advanced across requests. |
| Cache behavior | Same JUP/SOL OHLCV request | 15:14:34, 15:15:28, 15:16:04 | All three returned a latest 15:11 bar. The middle response was a CDN hit at age 53; the last was a miss with a new ETag but unchanged data. The later active-pool sample shows that inactivity and indexing/cache delay must be treated separately. |

The token-address form of the `token` parameter returned an empty result when
requesting the quote token in one test, while the documented `token=quote`
selector worked. Use `base`/`quote` after verifying pool membership rather than
depending on the address form.

## Meteora Comparison Finding

The Meteora Data API allowed cross-origin unauthenticated reads for the sampled
pool, but the default 5-minute response returned only ten quote-denominated
JUP/SOL bars. A requested 24-hour 5-minute range returned HTTP 400 `time range
too large`. The response does not document the price/volume units in-band.

Meteora OHLCV is not an approved fallback. Its undocumented units and narrow
range response make it useful only as a diagnostic comparison until a separate
validation establishes a safe contract.

## Recommended Contract

- Discover pools by mint address and verify that the entered mint is explicitly
  the base or quote token. Rank candidates by USD liquidity and then recent USD
  volume, but select the first candidate that also returns non-empty candles,
  enough completed history for the default viewport, and a newest traded bar
  inside the documented freshness threshold. Define that history minimum and
  threshold at the technical gate after the longer freshness observation.
- Keep the chosen reference stable for the token session. Show DEX, pool, pair,
  currency, and provider. A later change requires a visible series reload.
- Request the entered token with `token=base` or `token=quote` and use USD
  candles for chart/profile alignment. Never select by symbol.
- Default to 15-minute candles. Fetch up to 1,000 initial bars and backfill on
  pan, deduplicating by timestamp. Keep completed bars in memory for the session.
- Poll the newest candles no faster than once per 60 seconds while the page is
  visible; stop for hidden tabs, back off on 429/5xx, and show the last successful
  fetch time. Budget against approximately ten calls/minute despite older docs
  also stating thirty.
- Preserve sparse bars as returned. The chart may visually carry a last price,
  but synthetic empty bars must be distinguishable from traded bars and must
  keep zero volume.
- A missing or stale candle result must not block RPC-loaded position data.
  Explain that source indexing and inactivity can both delay the newest candle.

## Remaining Validation

- Smoke-test the exact deployed GitHub Pages origin before release.
- Measure a longer freshness window during implementation and set the stale
  threshold from evidence; the short observation did not establish a maximum lag.
- Confirm provider terms/attribution in the in-app Docs before release.
- Recheck the API version, limits, and response schema during implementation;
  the public API is beta.

Sources: [live API reference](https://api.geckoterminal.com/docs/index.html),
[authentication](https://apiguide.geckoterminal.com/authentication),
[FAQ](https://apiguide.geckoterminal.com/faq), and
[Meteora OHLCV](https://docs.meteora.ag/api-reference/dlmm/pools/ohlcv).
