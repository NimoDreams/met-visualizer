# Project Context

## Current State — 2026-09-08

Phase 0 planning, Phase 1 MVP delivery, public-launch hardening, independent
security review, promotion, and the first GitHub Pages deployment are complete.
The live application is `https://nimodreams.github.io/met-visualizer/#/`.

- GitHub repository: `NimoDreams/met-visualizer`.
- Final audited candidate: `f75321ce9352cee61bb148dd75d14f38f7896261`.
- Audited and deployed tree: `8a3abfc8ac4ce69ebb5dcd1a965082348ca86c0e`.
- Stable `main`: promotion commit
  `72420a81a8e1b9240d4ed56df31cffe35847fd59` from PR #69.
- Integration `dev`: protected-branch sync commit
  `c89b56473d3f0ca700efb94f158db508e2020030` from PR #70. It has the same tree
  as `main`; the SHA differs because synchronization required a reviewed PR.
- Successful first deployment: workflow run `34179309665`.
- Public launch epic #37, audit #39, activation #41, and milestone 3 are closed.

PM, Developer, and Code Reviewer remain separate roles. GitHub Issues and
milestones are the source of truth for current work, and reviewers must post a
GitHub-visible readiness signal before merge.

## Product Direction

Token CA → reference candles → expandable Meteora DLMM pools and all owners'
positions → selectable current liquidity distribution across bins.

The primary audience is Solana memecoin traders. Representative validation
should emphasize newer tokens with short histories, unverified market cap, SOL,
stablecoin, or emerging quote markets, and one or several meaningful DLMM pools.
JUP is a scale/stress fixture and does not define ordinary latency or payloads.

The chart defaults to provider Market Cap (USD). When that value is unavailable,
it uses current RPC mint supply and explicitly says FDV (USD); if no supply basis
exists, it degrades to Price (USD). A validated GeckoTerminal reference pool
stays fixed for the token session, and enabled Meteora bins use current public
quote-token prices on the same valuation axis. Issue #66 tracks the newer case
where active pools use non-native quote assets and selection or USD conversion
needs additional rules.

Position size means current estimated USD principal value. One global filter
spans known valued positions in enabled pools while disclosing incomplete loads
and unavailable values outside its denominator. Desktop keeps the chart and
positions side by side; constrained layouts stack them; narrow phones use a
state-preserving Chart/Positions switch.

The app initially enables the highest trustworthy TVL-ranked eligible Meteora
pool after reconciling advisory metadata with authoritative RPC discovery. It
probes at most three candidates for PositionV2 accounts and USD conversion. The
choice remains stable; uncertainty leaves pools disabled for user selection.

See the [MVP](specs/mvp.md), [reference-market](specs/reference-market.md), and
[position-control](specs/position-controls.md) specs for detailed behavior.

## Privacy, Safety, And Open Source

Met Visualizer is a public, MIT-licensed, open-source static SPA. Users provide
an HTTPS RPC that exists only in page-session memory. It is never persisted,
logged, compiled into assets, placed in the URL, or sent to GeckoTerminal or
Meteora. Public free APIs may supply data without a project-maintained or
additional user credential.

The application has no backend, database, accounts, analytics, telemetry,
service worker, wallet, signing, transaction, swap, liquidity mutation, private
key, seed phrase, or fund-movement behavior. Any change to those boundaries
requires an explicit product decision, spec, threat review, user approval, and
independent review. See the
[privacy and public-release policy](privacy-and-public-release.md).

The Tip Jar intentionally publishes SNS identity `nimodreams.sol` and canonical
Solana address `DxYUGfMtgHmuo1VGRAEUjzcpuCwWCA5xggbgJUZuaFwF`. It is static and
copy-only and does not add resolution, wallet, payment, or transaction behavior.

Published branch history uses the approved GitHub noreply identity and portable
paths. The authorized rewrite removed the former personal email and workstation
path from published branch histories without changing reviewed trees. The user
accepted that GitHub-owned protected PR refs or caches may retain old metadata
and declined a GitHub Support request.

## Hosting And Release Operations

GitHub Pages serves a verified static `dist/` artifact from reviewed `main`
commits. HTTPS is enforced. The `github-pages` environment accepts only `main`
and contains no secrets. The workflow uses least-privilege job permissions,
full-SHA-pinned GitHub-owned Actions, and repeats the repository's deterministic
and browser gates before deployment.

Normal work branches from protected `dev` and returns there through issue-scoped,
reviewed PRs. Public changes use a reviewed `dev`-to-`main` promotion with a
regular merge commit. If branch protection rejects the post-promotion direct
`dev` fast-forward, synchronize the unchanged tree through a reviewed PR as PR
#70 did. See the [promotion workflow](workflows/dev-to-main-promotion.md).

## Active Planning

Milestone 4 and epic #56 own the first post-launch update: aggregate browser
resource protections in #51/#52, repeat deployment proof in #55, and early user
feedback. Until #51/#52 ship, a pathological workload may slow, freeze, or crash
one visitor tab and consume that visitor's network or RPC quota. No shared
backend, persisted user data, wallet, transaction, or funds surface exists.

Milestone 5 is the meta-phase intake for unscheduled observations, bugs, and
ideas. Items there are not implementation-ready commitments; the PM should
research and move selected work into a delivery milestone before implementation.

## Read Next

[Vision](vision.md), [roadmap](roadmap.md), [architecture](architecture.md),
[decisions](decisions.md), [privacy policy](privacy-and-public-release.md), and
the [public-launch review](reviews/public-launch-completion.md).

Never commit human scratch notes, RPC credentials, local env files, raw provider
dumps, sensitive logs, or workstation-specific paths. Docs preserve durable
knowledge; GitHub tracks active work.
