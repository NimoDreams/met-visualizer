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

## 2026-09-06: Start The RPC Boundary With Native Fetch

Context: The first SPA scaffold needs three account-read shapes, request
cancellation, timeouts, and separated errors. Adding a Solana RPC runtime package
would increase the initial public bundle before the application needs its wider
surface.

Decision: Implement a transport-independent read-provider interface backed by
native JSON-RPC `fetch`. Allow only `getProgramAccounts`, `getMultipleAccounts`,
and separately typed `getProgramAccountsV2`. Keep the endpoint private to the
session client and accept HTTPS only.

Consequence: The first production JavaScript is roughly 116 kB gzip including
React and Lightweight Charts, with no Solana RPC runtime package. Replacement
remains possible behind the interface if later type or transport evidence
justifies it. Replacing or disconnecting the RPC aborts the prior session.

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

## 2026-09-06: Use Exact Project-Owned Position Decoders And Bounded RPC Batches

Context: PositionV2 stores 70 shares in its fixed body and appends one 112-byte
`positionBinData` record for every additional bin, up to a width of 1,400. A
single standard-RPC `dataSlice` cannot include the fixed shares, trailing range
bounds, and variable extension together. Omitting an extension would understate
the largest-position ranking.

Decision: Discover every PositionV2 key for each enabled pool, hydrate full
accounts in batches of 100, scan that pool's BinArrays once, and move exact
bigint share/bin valuation plus sorting into an abortable Web Worker. Validate
the minimal decoders against the pinned official SDK/IDL oracle and reject any
account whose exact extension length, discriminator, owner, or pool relationship
does not match. Keep the full transaction-capable SDK outside production.
Aggregate the position's token-X and token-Y principal from those bin shares,
then value it with one current active-bin conversion price. Preserve the public
USD quote as an exact decimal rational until display rounding. Refreshing
positions obtains a fresh quote with its own observation timestamp and preserves
same-pool selection and continuation state.

Consequence: Large portable sessions pay the measured full-account bandwidth
cost before largest-first presentation, but remain compatible with ordinary
RPCs and never claim an incomplete value denominator. Provider-specific compact
indexes can be evaluated later behind the same boundary.

## 2026-09-06: Enable The Largest Eligible Meteora Pool First

Context: Pool discovery can return hundreds of DLMM pools, many without
PositionV2 accounts. Enabling every pool would trigger excessive RPC work. The
primary audience is expected to be memecoin traders, while JUP serves as a useful
scale/stress sample rather than the typical session.

Decision: Rank RPC-reconciled pools with Meteora's keyless public metadata by
current USD TVL, 24-hour volume, then address. Probe no more than three in order
and automatically enable exactly one only when it has PositionV2 accounts and a
supported USD conversion. Keep it stable for the session. If ranking or
qualification fails, require an explicit user pool choice.

Consequence: Candle and initial-LP selection stay independent. The app obtains an
immediately meaningful overlay without eagerly hydrating every pool or trusting
provider metadata over on-chain identity. Representative implementation evidence
must include newer memecoin cases with short history and FDV fallback as well as
the JUP stress case.

## 2026-09-06: Render Exact Current Liquidity On The Reference Axis

Context: Positions from different DLMM pools may put the entered token on either
side, use different quote-token decimals, and distribute principal across many
bins. Traders need one comparable view without treating future bin prices as
current position value.

Decision: Normalize each selected bin to the reference session's Market Cap,
FDV, or Price axis using its pool orientation, decimal scale, current public
quote-token USD price, and the reference session's fixed display supply. Use bin
prices only for vertical placement. Apportion each position's reviewed current
principal value exactly across its bins according to current active-bin value.
Apply minimum-USD and complete-denominator 80% masks globally across enabled
pools while preserving underlying checkbox selection.

Consequence: Contributions reconcile with the position-value denominator, and
different pools share one visible scale. Unsupported conversions remain in the
position list with their overlay disabled. Existing contributor masks remain
stable while refresh makes the denominator incomplete; users cannot recompute
the 80% set until every enabled pool is complete again. Adding an enabled pool
or requesting a position refresh advances one coordinator generation and
refreshes every enabled pool into it; independently observed generations cannot
claim one complete denominator.

## 2026-09-06: Complete Phase 0 And Begin Phase 1

Context: The completion review assembled the independently reviewed product,
provider, UX, loading, technical, branch, privacy, and safety decisions. The user
reviewed PR #14 and was satisfied with the direction.

Decision: Accept Phase 0 as complete and authorize the PM to establish `dev`, a
Phase 1 milestone and dependency-ordered implementation issues, and Developer
handoffs. Start only the unblocked foundation issue; later work follows its issue
dependencies and remains independently reviewed.

Consequence: `main` remains the accepted stable baseline while Phase 1 issue PRs
target `dev`. GitHub Pages activation and `dev` to `main` promotion remain
separate explicit user decisions.

## 2026-09-07: Publish A Passive Docs Tip Jar Identity

Context: The maintainer wants an unobtrusive way for users who value the project
to copy a public Solana support address without changing the research workflow.

Decision: Publish SNS identity `nimodreams.sol` and canonical Solana address
`DxYUGfMtgHmuo1VGRAEUjzcpuCwWCA5xggbgJUZuaFwF` as intentional public source
values in Docs. Treat the full address as authoritative. Provide static display
and an explicit copy control with accessible success or failure feedback.

Consequence: Security and privacy scans should recognize these two identifiers
as approved public data rather than credentials. Do not resolve SNS at runtime
or add a wallet, payment URI, QR flow, transaction construction, external
provider, analytics, persistence, backend, or navigation behavior.

## 2026-09-07: Remove Current-Tree PII Without Rewriting Published History

Context: The public-launch audit found workstation-specific paths in the current
tracked documentation and identified commit identity as public metadata that
must be intentionally approved. The Tip Jar SNS name and canonical Solana
address remain explicitly authorized public identifiers.

Decision: Use portable repository-relative references in public docs and logs,
and require a GitHub noreply email or another explicitly approved public email
for commit authors and committers. Remove the current-tree path findings in
issue #42. Do not rewrite published Git history as part of this remediation.

Consequence: The current tracked tree and production artifact can be verified
without workstation paths or unapproved identity metadata. A history rewrite
remains a separate explicit user decision because it would replace published
commit identities and SHAs.

## 2026-09-07: Apply Public-Launch Defense-In-Depth Before Pages

Context: The browser must call fixed public providers and an arbitrary
user-provided HTTPS RPC, while a static GitHub Pages site cannot add response
headers. The repository also needs enforceable review and CI gates before public
deployment.

Decision: Enforce CSP and no-referrer policy in the production HTML document.
Allow self-hosted scripts, styles, images, and Workers, one pinned Lightweight
Charts attribution style, inline chart-layout attributes, embedded data images,
and HTTPS connections; deny other resource types and navigation bases. Require pull
requests, current CI, and resolved review conversations on `main` and `dev`,
protect both branches from force-push and deletion, require Action references at
full commit SHAs, and enable GitHub's available dependency, code, secret, and
private-reporting controls. Keep required approvals at zero because this public
repository currently has one GitHub owner; independent reviewers still leave the
project's required GitHub-visible readiness signal.

Consequence: Browser policy preserves arbitrary HTTPS RPC compatibility but does
not act as an RPC hostname allowlist. Repository controls enforce the existing
PR and verification workflow without making a second GitHub approver mandatory.
GitHub Pages remains disabled until its separate reviewed and user-approved
activation.

## 2026-09-07: Launch Before Aggregate Browser Availability Hardening

Context: The accepted Phase 1 application already provides the complete MVP
workflow. The independent audit found no critical issue, secret exposure, wallet
or transaction surface, analytics, persistence, backend, or fund risk. The
remaining resource-control plan mixed individual untrusted-input validation with
additional aggregate per-pool, cross-pool, and Worker limits, extending the time
before real users could evaluate the product.

Decision: Keep individual HTTP response limits, public-provider schema and
numeric validation, RPC account/base64 envelopes, RPC request privacy and DLMM
slot consistency, a targeted final audit, and the reviewed Pages workflow as
pre-launch gates. Move issues #51 and #52 to milestone 4 as the first public
update. Use that update to verify repeat deployment and turn concrete early-user
feedback into focused issues under #55 and epic #56.

Consequence: A pathological aggregate workload can temporarily slow, freeze, or
crash one visitor's browser tab. This accepted availability risk does not expose
funds, signing capability, keys, persisted user data, or a backend because those
surfaces do not exist. The final launch audit must verify this disposition on the
exact candidate, and #51/#52 remain committed post-launch work rather than an
indefinite backlog.

## 2026-09-07: Rewrite Published Branch History To Remove Personal Metadata

Context: The user preferred removing the former personal commit email from
published history in addition to removing workstation-specific paths from the
current tree.

Decision: Rewrite and force-update the published `main`, `dev`, and Phase 0
branch histories with the approved GitHub noreply identity and portable path
replacement while verifying that the reviewed branch trees remain unchanged.
Do not contact GitHub Support about GitHub-owned protected pull-request refs.

Consequence: Published branch histories and the local repository no longer
contain the former email or workstation path. Protected pull-request refs and
platform caches may retain old commit metadata; the user explicitly accepted
that GitHub-controlled residual. All future commits must use the approved
noreply identity.

## 2026-09-07: Bound Network Transport Before Domain Parsing

Context: Public providers and a user-selected RPC are untrusted browser inputs.
Whole-body JSON helpers, unbounded queues, and unbounded response caches could
consume memory or leave timers deferred far beyond a useful session.

Decision: Count decompressed response bytes while streaming and reject before
JSON parsing above 2 MiB for public APIs, 64 KiB for `getTokenSupply`, or 24 MiB
for allowed account RPC methods. Limit RPC endpoint input to 4,096 UTF-16 code
units with HTTPS and no embedded credentials or fragment. Cap the public queue
at 64, provider deferrals at five minutes, and the GeckoTerminal LRU cache at
256 live entries.

Consequence: Oversized or malformed transport input fails with a redacted,
provider-specific error, and response streams are cancelled at the boundary.
Paths and query keys remain usable for bring-your-own RPC providers. Higher-level
provider schemas, account data, and session/Worker limits remain tracked by the
dependent security-remediation issues.

## 2026-09-07: Bound Public-Provider Schema And Numeric Inputs

Context: A transport-sized response can still contain excessive rows, labels,
numeric text, exponents, unsafe timestamps, or values that overflow chart/FDV
normalization.

Decision: Validate public candidate, candle, quote-mint, text, decimal, SPL
supply, timestamp, pagination, and normalized-value ceilings at provider/domain
boundaries before selection, `BigInt` conversion, or chart publication. Reject
the whole affected provider result with a redacted shape or limit error.

Consequence: Supported provider ordering and normal fixtures remain unchanged,
while values outside the documented ceilings cannot enter ranking, exact quote
arithmetic, or the chart. These ceilings are security compatibility bounds; a
future provider expansion requires an explicit reviewed adjustment.
