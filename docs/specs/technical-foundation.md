# Technical Foundation

Status: approved Phase 0 direction. Implementation, dependency installation,
`dev` creation, GitHub Pages activation, and deployment remain unauthorized.

## Selected Stack

| Layer | Choice |
| --- | --- |
| Local runtime | Node.js 24 LTS through nvm; npm with a committed lockfile |
| Language | TypeScript with strict checking |
| UI | React 19.2 client-rendered SPA |
| Build | Vite 8 |
| Chart | Lightweight Charts 5.2 |
| RPC | Narrow read-only Solana RPC modules, initially `@solana/rpc` |
| Exact arithmetic | Native `bigint`; decimal conversion only at presentation boundaries |
| Tests | Vitest, React Testing Library, and focused Playwright browser tests |
| Styling | Plain CSS or CSS Modules; no general UI framework initially |

Pin exact dependency versions in `package-lock.json` when the scaffold issue is
authorized. Use Vite's modern default production target and test current Chrome,
Firefox, and Safari. Do not add legacy-browser polyfills without evidence.

## Application Shape

Use one package at the repository root. The product has one browser application
and no current shared-package or server need. Organize source by responsibility:

```text
src/
  app/          application shell, hash navigation, session state
  chart/        Lightweight Charts adapter and liquidity primitive
  domain/       exact amounts, prices, bins, positions, coverage
  providers/    GeckoTerminal and Solana RPC boundaries
  meteora/      read-only account layouts and decoding
  workers/      large-pool decoding, valuation, and aggregation
  ui/           reusable presentational controls
```

Use React state and reducers for the session and explicit data-loading state
machines. Do not introduce a general state-management or query-cache dependency
until repeated behavior justifies it. Provider jobs own an `AbortController` so
changing the CA or RPC cancels obsolete work.

Use Lightweight Charts for candles and volume. Implement the current DLMM bin
profile as a project-owned series primitive on the candle price scale, informed
by the library's volume-profile example. Keep TradingView attribution visible
and repeat the attribution in the in-app Docs. Heavy decoding and aggregation
move to a Web Worker before large-pool support; transfer compact data and return
render-ready summaries so the chart thread stays responsive.

Use hash navigation for the visualization and Docs views, such as `#/` and
`#/docs`. This preserves direct links and reload behavior without a static-host
rewrite rule or a routing framework dependency.

## Read-Only Data Boundary

The session RPC URL creates a typed browser HTTP client. Initially use the
modular Solana RPC packages for:

- `getProgramAccounts` pool and position discovery;
- `getMultipleAccounts` bounded hydration;
- context-slot reads and `minContextSlot` consistency;
- request abort, timeout, retry, and error normalization; and
- a separately typed, feature-detected Helius `getProgramAccountsV2` method.

Constrain the application-facing interface to approved read methods. Do not add
wallet, signer, transaction, instruction, subscription, or send packages. Keep
the provider wrapper transport-independent; the first implementation slice may
replace the library transport with native JSON-RPC `fetch` if a measured bundle
comparison shows the library adds material weight without enough value.

Do not include the complete `@meteora-ag/dlmm` runtime in the published app. Its
public surface includes transaction construction that this product does not
need. Pin the official SDK and deployed IDL as development references and test
oracles. Production code owns the minimum LB-pair, PositionV2, extension, and
bin-array decoders required for the approved reads. Reconcile projected slices,
ordinary accounts, dynamic accounts, orientation, decimals, and per-bin amounts
against the pinned SDK before relying on them.

GeckoTerminal stays behind a separate browser `fetch` adapter. Never send the
RPC URL to it or combine candle-provider and RPC errors.

## Local Workflow And Secrets

Add `.nvmrc` for Node 24 and use npm scripts for `dev`, `format`, `format:check`,
`lint`, `typecheck`, `test`, `build`, `preview`, and focused browser tests. The
standard workflow is native Node plus Vite. Docker Compose is intentionally not
part of the MVP because there is no backend, database, validator, or supporting
service to orchestrate. Revisit containers only if that architecture changes.

Set Vite `envDir: false`. The app build must not load `.env`, `.env.local`, or
mode-specific env files. Never define an RPC value with a client-exposed prefix.
The user enters the RPC in the app, where it remains only in memory. Separate
local research scripts or local browser-test runners may explicitly read the
ignored `MET_VISUALIZER_RPC_URL`, but they must not forward, print, record, or
compile it into application assets.

Do not add local storage, session storage, IndexedDB persistence, a service
worker, analytics, or remote error telemetry in the MVP. Reloading or closing
the page clears the RPC and all fetched data.

## GitHub Pages

The default project-site URL is
`https://nimodreams.github.io/met-visualizer/`. Configure Vite with
`base: "/met-visualizer/"` and use `import.meta.env.BASE_URL` for any dynamic
asset paths. GitHub Pages is currently disabled; enable it only when a reviewed
build is ready for its first approved deployment.

Use two GitHub Actions concerns:

1. CI runs install, formatting, linting, type checking, tests, and production
   build for PRs into `dev` or `main` and pushes to those branches.
2. Pages deployment runs only for `main` after CI succeeds, with a manual
   dispatch option, the `github-pages` environment, and the minimum
   `contents: read`, `pages: write`, and `id-token: write` permissions.

Use `npm ci`, upload only `dist/`, pin third-party actions to full commit SHAs,
and do not provide the workflow with an RPC or market-data secret. Do not deploy
`dev` or PR previews to the repository's sole Pages site.

Create `dev` from the Phase 0-approved `main` immediately before implementation.
Issue branches target `dev`; reviewed release promotions target `main` with a
merge commit. A merge to `main` becomes the deployable source of truth. The
first actual Pages activation/deployment remains a separate user-approved step.

The deployed app accepts HTTPS RPC endpoints only because Pages is HTTPS.
Compatibility still depends on provider CORS and filtered-account support; a
static app cannot proxy an incompatible endpoint. Before the first release,
smoke-test the exact Pages origin for assets, hash navigation, GeckoTerminal,
and a user-entered RPC, then verify that reload clears the credential.

## Scaffold Verification Gates

The first implementation handoff should prove:

- the production bundle works under `/met-visualizer/` with no root-path asset
  assumptions;
- the chart renders candles, volume, and a small price-aligned liquidity
  primitive using only public chart APIs;
- the chosen RPC transport can express the required standard and optional
  provider methods, abort requests, and remain within an accepted bundle budget;
- production assets contain no RPC endpoint, env value, Meteora transaction
  surface, wallet code, signer code, or source map;
- read decoders match pinned SDK results for ordinary and dynamic fixtures; and
- local preview and browser tests prove hash reload behavior and memory-only RPC
  clearing.

Sources: [React from-scratch guidance](https://react.dev/learn/build-a-react-app-from-scratch),
[Vite 8](https://vite.dev/blog/announcing-vite8),
[Vite static deployment](https://vite.dev/guide/static-deploy),
[Vite environment variables](https://vite.dev/guide/env-and-mode),
[GitHub Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages),
[Solana Kit RPC](https://github.com/anza-xyz/kit#rpc),
[Lightweight Charts primitives](https://tradingview.github.io/lightweight-charts/docs/plugins/series-primitives),
and [Meteora's SDK reference](https://github.com/MeteoraAg/docs/blob/main/developer-guides/dlmm/typescript-sdk/reference.mdx).
