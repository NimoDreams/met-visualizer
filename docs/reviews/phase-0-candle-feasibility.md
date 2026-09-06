# Phase 0 Candle Feasibility — GeckoTerminal

Date: 2026-09-06  
Issue: [#3](https://github.com/NimoDreams/met-visualizer/issues/3)  
Status: PM evidence draft; independent review pending

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

Tests sent `Accept: application/json;version=20230203` and a GitHub Pages-style
`Origin` header. Requests were deliberately kept below a conservative ten per
minute; this was not a load test. Raw responses stayed in temporary storage and
were not committed.

| Case | Public identifiers | Observation (UTC) |
| --- | --- | --- |
| Browser/CORS | JUP; Meteora pool `C8Gr...NNwg` | Browser `fetch` from localhost returned CORS response type, HTTP 200, and two candles. Responses advertised `Access-Control-Allow-Origin: *`. |
| Established and multi-market | JUP mint `JUPyi...DvCN` | Pool discovery returned 20 pools on page one across Meteora, Orca, Raydium CLMM, and other DEXes. |
| Deep history | Meteora `C8Gr...NNwg`; Orca `C1Mg...W8Wz` | Each returned the maximum 1,000 fifteen-minute bars. The sampled oldest bars were 2026-08-23 08:15 and 2026-08-27 05:55 respectively; this proves pagination-sized history, not a universal retention floor. |
| Backfill | Meteora `C8Gr...NNwg` | A request before the oldest timestamp returned 20 older bars. The boundary timestamp repeated, so clients must merge by timestamp. |
| New pool | SLOWLANA mint `2BCG...PwpX`; pool `FA4x...xeai` | Within minutes of pool creation, one-minute OHLCV returned two bars with no CoinGecko coin ID required. |
| Thin pool | STFU mint `3ioZ...6moon`; pool `Hdhj...cBp6` | Returned its single traded bar; absence of older bars is a valid sparse result. |
| Empty intervals | JUP/USDC pool `AUgb...uDbL` | `include_empty_intervals=true` returned 100 one-minute bars; 94 were carry-forward OHLC with zero volume. |
| Orientation and units | JUP/SOL pool `C8Gr...NNwg` | `currency=usd&token=base` produced JUP/USD near $0.26; `token=quote` produced SOL/USD near $105; `currency=token&token=base` produced JUP/SOL near 0.0025. Volume changed with denomination. |
| Freshness/cache | JUP/SOL pool `C8Gr...NNwg` | 15:14:34–15:16:04 observations returned a latest 15:11 one-minute bar. The first repeat was a CDN hit at age 53 seconds; a later cache miss changed the ETag but not the candle. Do not infer a provider outage solely from an unchanged bar. |

The token-address form of the `token` parameter returned an empty result when
requesting the quote token in one test, while the documented `token=quote`
selector worked. Use `base`/`quote` after verifying pool membership rather than
depending on the address form.

## Meteora Fallback Finding

The Meteora Data API allowed cross-origin unauthenticated reads for the sampled
pool, but the default 5-minute response returned only ten quote-denominated
JUP/SOL bars. A requested 24-hour 5-minute range returned HTTP 400 `time range
too large`. The response does not document the price/volume units in-band.

This is useful as a narrow diagnostic or recent-pool fallback after unit checks,
but it is not a general historical-chart fallback for the MVP.

## Recommended Contract

- Discover pools by mint address. Consider only pools where the entered mint is
  explicitly the base or quote token and a recent OHLCV request succeeds.
- Rank eligible pools by USD liquidity first, then recent USD volume; keep the
  chosen reference stable for the token session. Show DEX, pool, pair, currency,
  and provider. A later change requires a visible series reload.
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
