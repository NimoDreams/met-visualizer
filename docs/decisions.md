# Decision Log

This file records important product and architecture decisions. New decisions
should be added with a date, context, decision, and consequence.

## 2026-09-05: Start From Codex Application Template

Context: The user wants `met-visualizer` to begin with the agent workflow,
documentation structure, safety posture, and branch/promotion lessons learned
from recent Codex-assisted application work.

Decision: Bootstrap the repository from the Codex application template before
planning or implementation.

Consequence: The project starts with PM/Developer/Code Reviewer role guidance,
GitHub Issues as the source of truth, durable docs, safety/privacy defaults,
worktree guidance, and a reusable dev-to-main promotion workflow. Product and
technical choices remain open until Phase 0 planning.

## 2026-09-06: Establish The MVP Experience

Context: Phase 0 discussions clarified the first user and valuable workflow.

Decision: Token CA entry leads to reference candles and expandable Meteora DLMM
pools/positions, with checkboxes and size filters controlling a current
price-aligned bin-liquidity profile. Include a concise in-app Docs tab and
visible source, freshness, and coverage context.

Consequence: No wallet identity is needed. Snapshot liquidity and historical
candles have distinct semantics; reference selection does not follow LP selection.

## 2026-09-06: One RPC Credential And Free Public Data

Context: The user prefers an open-source GitHub Pages SPA without maintaining
a shared market-data key.

Decision: Users provide a memory-only RPC endpoint; free public data APIs are
allowed. Start with GeckoTerminal for candles. No additional market-data
credential is required for the MVP.

Consequence: Browser access, coverage, rate limits, and price normalization must
be validated. A static build must never contain a developer RPC credential.

## 2026-09-06: Authorize Planning, Keep Implementation Gated

Context: The user approved the Phase 0 documentation and GitHub planning pass.

Decision: Create a reviewable documentation PR and Phase 0 planning issues.
Stack, refresh defaults, and detailed selection policies remain proposals.
Implementation, dev creation, and Phase 0 completion await explicit user approval.

Consequence: Use a documentation branch from main for this bootstrap pass;
no application code, deployment, or promotion is authorized by this decision.

## 2026-09-06: Use GeckoTerminal As The Initial Candle Provider

Context: Phase 0 browser and API samples verified keyless cross-origin access,
Solana pool discovery, deep and sparse histories, price orientation, and
pagination. The public API is beta and its documentation disagrees on limits.

Decision: Use GeckoTerminal as the initial MVP candle provider. Default to USD
15-minute candles, a stable explicitly identified reference pool, timestamp
deduplication, and polling no faster than once per 60 seconds while visible.

Consequence: Budget for approximately ten calls/minute, present freshness and
missing data honestly, and recheck the deployed GitHub Pages origin and provider
terms before release. Meteora OHLCV remains an unapproved comparison source
until its units and usable range are validated.

## 2026-09-06: Prioritize Large Positions During Progressive Loading

Context: Some tokens have hundreds of DLMM pools and individual pools can have
thousands of positions. Loading every full account before showing useful data
would spend excessive user RPC bandwidth and delay the visualization.

Decision: Load small enabled pools completely. For a large enabled pool, inspect
all positions through a compact ranking pass, calculate current normalized
position value from shares and bin balances, and render the largest positions
first. Start with targets of at least 25 positions, about 80% of decoded value,
and a cap near 100 positions, then tune from implementation evidence. Provide
load-next, load-all, cancellation, and explicit count/value coverage.

Consequence: The initial chart becomes useful before full hydration while still
describing partial coverage honestly. Raw share totals cannot determine size;
dynamic positions need extension data. A provider that cannot support compact
ranking falls back to bounded ordinary batches labeled as unordered partial
coverage. Manual selection stops later batches from being auto-selected.
The 80% target applies only when the complete valuation denominator is known;
otherwise value coverage is unknown and cannot trigger that stopping rule.

## 2026-09-06: Select A Client-Only TypeScript Foundation

Context: The approved product is one static read-only SPA with no backend or
database. It needs responsive charting, exact account arithmetic, cancellable
browser RPC reads, and a build that works below a GitHub project-site path.

Decision: Use a single root package with Node.js 24 LTS, npm, strict TypeScript,
React 19.2, Vite 8, and Lightweight Charts 5.2. Use React reducers and explicit
loading state machines before adding general state libraries. Move large-pool
decoding and aggregation into a Web Worker. Use native Node/Vite development;
Docker Compose is not part of the MVP.

Consequence: The scaffold must pin exact versions, add `.nvmrc`, validate the
chart primitive and worker boundary, and provide format, lint, type-check, test,
build, preview, and focused browser-test commands.

## 2026-09-06: Keep The Published Data Client Narrow And Read-Only

Context: Solana's modular RPC packages cover typed HTTP reads and cancellation,
while the full Meteora SDK exposes transaction construction and installs much
more than the visualization requires.

Decision: Initially use Solana's RPC-only modules behind a project provider
interface. Ship project-owned minimum Meteora account decoders validated against
a pinned official SDK and IDL; do not ship the full SDK runtime. Permit a native
JSON-RPC transport substitution if the scaffold's measured bundle comparison
shows it is materially smaller without losing correctness.

Consequence: Production imports exclude wallet, signer, transaction,
instruction, subscription, and send modules. SDK/layout changes fail visibly
until decoding compatibility is re-established.

## 2026-09-06: Use Main-Only GitHub Pages Deployment

Context: GitHub Pages provides one static project site at a repository path and
cannot proxy incompatible RPC endpoints. Development needs an integration branch
without publishing partial work.

Decision: Build for `/met-visualizer/`, use hash navigation, and deploy only the
`dist/` artifact from reviewed `main` through GitHub Actions. Create `dev` from
the approved Phase 0 baseline immediately before implementation; feature PRs
target `dev`, and reviewed merge-commit promotions target `main`. Do not deploy
`dev` or PR previews to the repository Pages site.

Consequence: Pages stays disabled until the first approved deployment. CI uses
no provider secret, actions are SHA-pinned, production accepts HTTPS RPCs only,
and the exact Pages origin requires a pre-release browser smoke test.

## 2026-09-06: Use A Stable Reference Market And Honest Valuation Labels

Context: Traders commonly read token charts in USD market-cap terms, while a
generic Solana RPC exposes total mint supply rather than circulating supply.
GeckoTerminal returns verified market cap for some assets and `null` for
unverified assets.

Decision: Choose a stable session reference from the keyless public
GeckoTerminal API's ranked pools, checking a bounded three candidates for usable
correctly oriented USD candles and adequate history before using a limited-
history fallback. Use Market Cap (USD) only for a non-null verified value without
requesting an FDV fallback. Otherwise multiply USD prices by current RPC mint
supply and label the axis FDV (USD); degrade to Price (USD) if no supply basis is
available. Apply the same fixed supply basis to converted DLMM bin prices. Never
switch reference pools silently or introduce a market-data credential.

Consequence: The UI and Docs must identify the pool, DEX, provider, supply basis,
conversion source, refresh cadence, and observation times. Historical valuation
candles use the current session supply and do not claim historical supply. A
pool without a supported USD quote conversion remains browsable but cannot join
the common-axis overlay. All GeckoTerminal reads share one conservative public
request budget; missing activity metadata produces unknown freshness rather than
a false fresh-data claim.

## 2026-09-06: Filter Current Position Value Across Enabled Pools

Context: The user primarily wants to remove insignificant positions and isolate
the largest liquidity contributors. One filter across pools better represents
their relative contribution than separate pool-specific thresholds. Mobile use
does not require simultaneous chart and position panes.

Decision: Define position size as current estimated USD principal value across
its bins, excluding fees and rewards. Apply one minimum-value or largest-
contributors filter to the known valued positions in all enabled pools. Preserve
checkbox state beneath the filter, show unavailable positions separately, and
exclude unknown values from numeric filters and coverage denominators. Use a
70/30 desktop split, a stacked constrained-width layout, and state-preserving
Chart/Positions modes on narrow phones.

Consequence: The UI must name the filter's observed universe and cannot imply
token-wide coverage while pools or valuations remain incomplete. No universal
dust cutoff is appropriate. The 80% contributor action requires a value for every
discovered position in every enabled pool from the same refresh generation;
compact ranking values qualify, while unopened pools remain visibly out of scope.
Responsive tests must preserve selection, loading, and chart state while changing
modes or orientation.
