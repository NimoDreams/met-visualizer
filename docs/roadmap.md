# Roadmap

## Phase 0 — Direction And Feasibility (Complete)

1. Review the documented product direction and MVP acceptance criteria.
2. Validate free candle access and RPC position loading independently.
3. Resolve remaining reference-market, filter, and responsive behavior using
   the approved technical foundation and feasibility evidence.
4. Obtain user acceptance of Phase 0 and explicit implementation authorization.

All steps are complete. The user accepted the independently reviewed
[Phase 0 completion review](reviews/phase-0-completion.md) and authorized Phase 1
planning and implementation on 2026-09-06.

Exit evidence: reviewed MVP spec, candle/RPC/pool-ranking feasibility findings,
selected stack/local workflow, agreed branch strategy, and a scoped first
developer handoff.

The [Phase 0 milestone](https://github.com/NimoDreams/met-visualizer/milestone/1)
and [epic #1](https://github.com/NimoDreams/met-visualizer/issues/1) preserve the
completed planning record:

- [#2: Spec and documentation review](https://github.com/NimoDreams/met-visualizer/issues/2)
- [#3: Candle feasibility](https://github.com/NimoDreams/met-visualizer/issues/3)
- [#4: RPC position feasibility](https://github.com/NimoDreams/met-visualizer/issues/4)
- [#5: Technical direction and user gate](https://github.com/NimoDreams/met-visualizer/issues/5)

The selected foundation is a single Node.js 24/npm TypeScript, React, and Vite
SPA with Lightweight Charts, a narrow read-only RPC layer, no Docker Compose,
and GitHub Pages deployment from `main`. See the
[technical foundation](specs/technical-foundation.md).

## Phase 1 — Read-Only Visualization MVP (Complete)

Implementation, release verification, review, user acceptance, and promotion
are complete. PR #35 used a regular merge commit, and `main` and `dev` were
synchronized to exact stable SHA
`19046d1f0dfae069a5847b2fb57bd662aa89aacd`. Post-merge format, lint, typecheck,
107-test, build, artifact, diff, and local HTTP checks passed. This was the
pre-launch product baseline; later public-launch work is recorded separately
below.

The [Phase 1 milestone](https://github.com/NimoDreams/met-visualizer/milestone/2)
and [epic #15](https://github.com/NimoDreams/met-visualizer/issues/15) are the
source of truth. The ordered work is:

1. [#16](https://github.com/NimoDreams/met-visualizer/issues/16): SPA, CI,
   session-only RPC shell, and provider/browser proof points.
2. [#17](https://github.com/NimoDreams/met-visualizer/issues/17): shared keyless
   market data and the reference chart after #16.
3. [#18](https://github.com/NimoDreams/met-visualizer/issues/18):
   RPC-authoritative DLMM pool selection after #17 establishes shared quote
   pricing and request budgeting.
4. [#19](https://github.com/NimoDreams/met-visualizer/issues/19): PositionV2
   decoding and progressive valuation after #18.
5. [#20](https://github.com/NimoDreams/met-visualizer/issues/20): chart overlay
   and global controls after #17 and #19.
6. [#21](https://github.com/NimoDreams/met-visualizer/issues/21): refresh,
   recovery, Docs, responsive, and accessibility completion.
7. [#22](https://github.com/NimoDreams/met-visualizer/issues/22): exact integrated
   release-candidate verification.
8. [#23](https://github.com/NimoDreams/met-visualizer/issues/23): reviewed,
   user-approved promotion from `dev` to `main`.

Developers use issue-scoped branches/worktrees into `dev`; reviewers post
readiness directly on GitHub. Promotion follows the
[promotion workflow](workflows/dev-to-main-promotion.md) and requires user
approval.

No trading or fund-movement features are planned.

## Public Launch Readiness — Complete

The independently audited MVP launched on GitHub Pages on 2026-09-08. Public
launch epic #37 and milestone 3 are closed. Promotion PR #69 produced stable
`main` commit `72420a81a8e1b9240d4ed56df31cffe35847fd59` with audited tree
`8a3abfc8ac4ce69ebb5dcd1a965082348ca86c0e`; workflow run `34179309665`
deployed that commit to `https://nimodreams.github.io/met-visualizer/#/`.
Protected-branch synchronization PR #70 returned the same tree to `dev`.

The release added the passive Docs Tip Jar, portable noreply history, individual
network and decoding bounds, RPC request privacy and slot consistency, JSON-RPC
envelope redaction, CSP and repository protections, private vulnerability
reporting, and the main-only Pages workflow. Issue #39 records the final
independent audit. See the
[public-launch completion review](reviews/public-launch-completion.md).

## First Public Update — Active Planning

Milestone 4 and epic #56 contain the deliberately deferred aggregate browser
availability controls. Issue #51 caps per-pool decoded bytes, bins, secondary RPC
work, deadlines, and valuation overflow. Issue #52 caps cross-pool concurrency,
session-ready positions, Worker transfer/lifetime, and exposes honest limit
states. Issue #55 verifies that this reviewed update reaches the existing Pages
site and converts concrete early-user feedback into focused GitHub Issues.

The accepted interim risk is limited to a pathological aggregate workload
slowing, freezing, or crashing an individual visitor's tab. The first launch
still bounds individual responses, provider values, and RPC accounts and retains
the read-only, session-only, no-wallet, no-persistence architecture.

Issue #71 updates durable documentation with the verified launch baseline. The
first post-launch delivery batch should be scoped before implementation begins;
GitHub Issues remain authoritative for its exact order.

## Meta-Phase — Unscheduled Intake

Milestone 5 stores observations, bug reports, and product ideas that are worth
preserving but are not implementation-ready commitments. The PM should reproduce
or research an item, define requirements and dependencies, then move it into a
delivery milestone before assigning implementation. Issue #66 currently tracks
quote-aware reference-market selection and USD conversion for newer non-native
Solana markets.
