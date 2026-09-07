# Phase 1 Release-Candidate Verification

Status: verification evidence for issue #22. Independent review, user
acceptance, GitHub Pages activation, and promotion to `main` remain pending.

## Candidate Identity

- Application candidate: `cf56630713155fa966536bb103cc2763bd35d089` from
  `dev`. Every application, test fixture, dependency, and production artifact
  claim below applies to this commit.
- Verification-report content:
  `d921bc1c12d640995c5276233447474a5758689d`. This later commit adds the
  release-only browser instrumentation and this report; it does not change the
  application candidate. The PR head is recorded on GitHub because a commit
  cannot contain its own SHA.

## Automated And Browser Gates

Node.js 24.20.0 and npm 11.19.0 produced a clean locked install. Formatting,
lint, strict typechecking, 21 unit files with 107 tests, production build,
artifact inspection, and `git diff --check` passed. The installed production
graph contains React 19.2.8, React DOM 19.2.8, Lightweight Charts 5.2.1, and
their two transitive runtime packages; `npm audit --omit=dev` reported no
vulnerabilities.

The production build contains 48 modules and four files: a 454.74 kB JavaScript
bundle (142.89 kB gzip), 14.33 kB CSS (3.93 kB gzip), a 5.28 kB position Worker,
and the HTML entry point. Artifact inspection passed the project-base,
source-map, credential, and prohibited-package checks.

The local Vite static preview served `/met-visualizer/` and preserved both hash
routes across reload. Playwright exercised seven release cases in each of
Chromium 153.0.8010.12, Firefox 155.0, and Playwright WebKit 26.6: all 21 passed.
It covers the session-only RPC shell, chart and pool failure independence,
stale recovery, the built 1,800-position Worker path, overlay interaction,
responsive pane and Docs transitions, keyboard focus, reduced motion, and
privacy assertions. One first-pass WebKit run reported a changed chart range
after a phone pane/Docs transition. The isolated 1,800-position case then
passed twice and the full 21-case matrix passed on rerun, so the result was not
reproducible and is retained here as an observation rather than hidden or
treated as a confirmed blocker.

The focused 390×844 and 844×390 touch matrix passed all nine engine/orientation
cases. Raw bounds were at least 44 CSS pixels. The native reference-market
select measured 306×44 in portrait and 583.10–583.27×44 when rotated across the
three engines. The assertion rounds only to 0.01 CSS pixel for engine reporting
noise. WebKit keyboard navigation used macOS's `Alt+Tab` full-keyboard-access
sequence; this is engine/platform coverage and does not claim testing in the
installed Safari application.

Commands:

```text
npm ci
npm run format:check
npm run lint
npm run typecheck
npm run test
PLAYWRIGHT_ALL_ENGINES=1 npm run test:browser
REPORT_TOUCH_TARGETS=1 npm run test:browser:touch
npm run test:browser:providers
npm run build
npm run verify:artifact
npm ls --omit=dev --all
npm audit --omit=dev --audit-level=moderate
git diff --check
```

## Representative Product Evidence

The deterministic fixtures cover a newer memecoin with its available lifetime,
short and sparse history, Market Cap from the provider, RPC-supply FDV, Price
fallback, SOL and stablecoin quotes, both DLMM token orientations, pool churn,
missing quotes/accounts/bins/prices, dynamic PositionV2 extensions, partial and
stale snapshots, and cancellation/replacement races. Project-owned decoders
match pinned official Meteora IDL/SDK oracle outputs and fail closed for
truncated or unsupported account data.

The position suite values principal at one current pool conversion, preserves
the reproduced `$0.0000004 × 100,000,000 = $40` quote precision, fetches 1,800
complete JUP PositionV2 accounts in 18 bounded hydration calls, ranks them in
the built Worker, and verifies the 25/80%/100 progressive display rules. JUP
also supplies a 626-pool discovery stress shape. It is a scale fixture rather
than an average memecoin latency claim. The overlay suite checks exact global
filters and coherent valuation generations, selection stability, 1,800-position
aggregation, 7,200 domain levels reduced to unique visible pixel rows, hover
contributions, keyboard inspection, and stable chart range during overlay-only
updates.

## Live Providers And Terms

Bounded browser-origin checks passed for the intended JUP requests to both
providers: GeckoTerminal top pools returned CORS-enabled JSON, and Meteora's
token-X DLMM page returned CORS-enabled JSON with internally consistent page
metadata. Header-only checks returned HTTP 200 without exposing response bodies
or credentials. GeckoTerminal advertised public cache revalidation at 30
seconds and shared-cache freshness at 60 seconds; neither successful provider
response carried `Retry-After`. The deterministic adapter tests cover HTTP 429,
numeric/date `Retry-After`, schema failures, cancellation, deduplication, and
the rolling request window. We did not provoke throttling on a public service.

Primary sources checked on 2026-09-06 CDT:

- [GeckoTerminal Swagger](https://api.geckoterminal.com/docs/index.html) still
  describes API v2 as beta, recommends the versioned `Accept` value, documents
  roughly ten public calls per minute, and describes minute caching.
- CoinGecko's official [top-pools](https://docs.coingecko.com/reference/top-pools-contract-address),
  [OHLCV](https://docs.coingecko.com/reference/pool-ohlcv-contract-address), and
  [on-chain price](https://docs.coingecko.com/reference/onchain-simple-price)
  pages match the consumed fields and nullable market-cap behavior. The app
  preserves returned pool order and validates completed USD candles.
- CoinGecko's [API terms](https://www.coingecko.com/en/api_terms) and
  [attribution guide](https://brand.coingecko.com/resources/attribution-guide)
  require visible source attribution. The app links and names GeckoTerminal.
- Meteora's official [DLMM pools API](https://docs.meteora.ag/api-reference/dlmm/pools/pools)
  matches the consumed pagination, token filter, TVL sort, and pool fields.
  Current public docs provide no specific Data API rate or `Retry-After`
  guarantee, so provider availability remains a runtime limitation.
- Lightweight Charts [5.0 documentation](https://tradingview.github.io/lightweight-charts/docs/5.0)
  retains the NOTICE and TradingView-link requirement. The app shows the
  attribution in Docs and retains the chart library's built-in logo.

The shared GeckoTerminal scheduler remains capped at ten dispatched calls per
rolling minute, and candles poll no faster than every 60 seconds while visible.
This is conservative behavior, not an uptime or freshness guarantee.

## User RPC, Privacy, And Safety

A purpose-built nonlogging Chromium runner supplied the ignored local RPC only
through process memory, removed the environment binding before browser launch,
and loaded JUP through the built preview. It observed 13 read-only RPC calls and
six public market-data calls. It then confirmed that the endpoint was absent
from the page URL, rendered text, local/session storage, service workers, Cache
API, IndexedDB, and every non-RPC request, and that reload cleared the session.
The runner emits only a generic stage on failure and aggregate call counts on
success; it creates no trace, video, screenshot, fixture, or provider dump.

`.env.local` remains ignored and untracked and was never opened or copied.
Tracked-file scans found no local env, human-note, database, backup, dump, or
export artifact. The production artifact and dependency graph contain no full
Meteora SDK, wallet adapter, signer, transaction, trading, swap, liquidity-write,
analytics, persistence, backend, service worker, deployment workflow, embedded
credential, local path, or source map. The repository has only the read-only CI
workflow; Pages is not activated.

## Limitations And Remaining Gates

- Provider APIs are external, GeckoTerminal remains beta, caches delay market
  data, RPC servers differ in CORS/indexing/rate/slot behavior, and the one local
  RPC smoke cannot establish compatibility with every provider.
- The browser matrix uses Playwright's engines. It does not cover every browser,
  assistive technology, device, or an installed Safari release.
- The actual GitHub Pages origin, deployment workflow, and post-deploy asset
  behavior cannot be tested until the user authorizes Pages activation.
- This report does not accept the release, close Phase 1, or approve promotion.
  An independent reviewer must leave the required GitHub-visible signal. After
  issue #22 merges, issue #23 must reverify the exact final `dev` SHA, receive
  explicit user approval, and use the documented merge-commit promotion flow.
