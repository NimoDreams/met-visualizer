# Phase 1 Reference-Market Browser Proof

Date: 2026-09-06

Issue: [#17](https://github.com/NimoDreams/met-visualizer/issues/17)

Status: implementation evidence ready for independent review

## Result

The production-shaped SPA accepts a valid token CA, resolves a stable identified
GeckoTerminal market, and renders completed USD candles and volume through
Lightweight Charts. The adjacent metadata names the token, pair, DEX, pool,
valuation basis, interval, history, observation time, last-trade/activity signal,
and freshness. Timeframe and explicit market controls reload a complete series;
refresh never silently changes the pool.

The valuation path uses provider-verified Market Cap when available, current
RPC mint supply for explicitly labeled FDV otherwise, and Price when supply is
unavailable. USD volume remains unchanged. Historical valuation disclosure says
that one current session supply is reused rather than reconstructed over time.

## Reproducible Checks

Using Node.js 24.20.0, npm 11.19.0, Playwright 1.63.0, and its Chromium 153
runtime:

- deterministic fixtures cover established, new, thin, and multi-market tokens;
- unit checks cover Market Cap, FDV, Price, completed-candle filtering,
  limited-history fallback, stable selection, backfill/deduplication, request
  priority and deduplication, rate limiting, schema failures, obsolete-request
  races, and stale last-good refresh behavior;
- four Chromium tests cover project-base/hash navigation, chart rendering,
  identified reference metadata, session-only RPC clearing, and stale last-good
  rendering; and
- a routed browser proof placed a unique marker in the session RPC, then verified
  that it appeared in no GeckoTerminal URL, rendered page content, local storage,
  or session storage.

The ignored local `.env.local` was not read or copied. It remains ignored,
untracked, and outside the change set.

## Provider Boundary Findings

GeckoTerminal's public responses encode many numeric values as strings, identify
pool token sides through `solana_<mint>` relationship IDs, and return OHLCV as
newest-first `[timestamp, open, high, low, close, volume]` tuples. The adapter
validates the entered mint's relationship, requests `currency=usd` with the
correct token side, deduplicates timestamps, and sorts candles oldest-first for
the chart.

Token metadata, pool discovery, OHLCV probes, and the shared quote-price boundary
use one rolling ten-request-per-minute scheduler. Direct actions and selected-
market refreshes precede speculative probes, concurrent keys deduplicate, queued
aborts reject without dispatch, and HTTP 429 honors `Retry-After`. Live provider
availability remains outside deterministic CI.

## Remaining Gates

- The exact GitHub Pages origin remains a release smoke test because Pages is
  not activated or deployed.
- Provider schema, terms, attribution, and published rate limits require the
  planned release recheck.
- Issue #18 consumes the shared quote-price and request-budget boundary for
  current DLMM normalization; no DLMM discovery or position behavior is part of
  this issue.
