# Phase 1 Scaffold And Browser Proof

Date: 2026-09-06

Issue: [#16](https://github.com/NimoDreams/met-visualizer/issues/16)

Status: implementation evidence ready for independent review

## Result

The first production-shaped SPA runs below `/met-visualizer/`, preserves its
hash route after reload, renders Lightweight Charts candles, volume, and a small
price-aligned liquidity primitive, and clears the session RPC on reload. The
scaffold contains no feature data flow or deployment workflow.

The RPC client uses native JSON-RPC `fetch` behind a narrow, read-only interface.
It allows `getProgramAccounts`, `getMultipleAccounts`, and the optional Helius
`getProgramAccountsV2` shape, accepts an `AbortSignal`, and aborts the old session
when an endpoint is replaced or disconnected. This adds no Solana RPC runtime
package to the public build.

## Reproducible Checks

Using Node.js 24.20.0, npm 11.19.0, Playwright 1.63.0, and its Chromium 153
runtime:

- `npm run format:check`, `lint`, `typecheck`, `test`, `build`, and
  `verify:artifact` passed;
- 9 unit tests passed;
- the production build emitted about 365 kB raw / 116 kB gzip JavaScript;
- artifact inspection found the `/met-visualizer/` asset base, no source maps,
  and no credential or prohibited-package markers; and
- two deterministic Chromium tests proved project-base/hash reload behavior,
  chart canvas rendering, empty browser storage, and RPC clearing on reload.

The ignored local `.env.local` was not read or copied. It remains ignored,
untracked, and absent from repository history.

## Browser Provider Proofs

The explicit `npm run test:browser:providers` check ran from the local production
preview origin. It made two bounded, unauthenticated public requests and did not
use or forward a user RPC:

1. GeckoTerminal token-pool discovery for the JUP mint with
   `Accept: application/json;version=20230203` returned CORS response type
   `cors`, HTTP 200, and JSON content.
2. Meteora `GET /pools` with exact token-X filtering, `tvl:desc`, page size 1,
   and `Accept: application/json` returned response type `cors`, HTTP 200, and
   JSON content.

The Meteora result resolves the earlier HTTP 403 uncertainty for the intended
local browser request shape. Live provider checks remain outside deterministic
CI to avoid coupling builds to rate limits or provider uptime.

## Remaining Gates

- A compatible user RPC still needs a local browser smoke test when feature reads
  are implemented; its endpoint must never enter test output or artifacts.
- The exact GitHub Pages origin remains a release smoke test because Pages is not
  activated or deployed.
- Provider schema, terms, attribution, and rate-limit checks remain release work.
- Meteora account decoders and large-pool worker behavior belong to later Phase 1
  issues.
