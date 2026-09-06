# Roadmap

## Phase 0 — Direction And Feasibility (Active)

1. Review the documented product direction and MVP acceptance criteria.
2. Validate free candle access and RPC position loading independently.
3. Resolve remaining reference-market, filter, and responsive behavior using
   the approved technical foundation and feasibility evidence.
4. Obtain user acceptance of Phase 0 and explicit implementation authorization.

Steps 1–3 are complete and independently reviewed. The
[Phase 0 completion review](reviews/phase-0-completion.md) assembles the evidence
and remaining implementation/release gates for step 4.

Exit evidence: reviewed MVP spec, candle/RPC feasibility findings or explicitly
accepted limitations, selected stack/local workflow, agreed branch strategy,
and a scoped first developer handoff. The user decides when this is satisfactory.

The [Phase 0 milestone](https://github.com/NimoDreams/met-visualizer/milestone/1)
and [epic #1](https://github.com/NimoDreams/met-visualizer/issues/1) track active work:

- [#2: Spec and documentation review](https://github.com/NimoDreams/met-visualizer/issues/2)
- [#3: Candle feasibility](https://github.com/NimoDreams/met-visualizer/issues/3)
- [#4: RPC position feasibility](https://github.com/NimoDreams/met-visualizer/issues/4)
- [#5: Technical direction and user gate](https://github.com/NimoDreams/met-visualizer/issues/5)

Current authorization covers
documentation and GitHub planning. Creating feasibility issues does not start
a product scaffold, deployment, paid service, or private-credential test.

The selected foundation is a single Node.js 24/npm TypeScript, React, and Vite
SPA with Lightweight Charts, a narrow read-only RPC layer, no Docker Compose,
and GitHub Pages deployment from `main`. See the
[technical foundation](specs/technical-foundation.md).

## Proposed MVP Delivery (Not Yet Authorized)

1. One complete path: CA → reference chart → one DLMM pool → a position's
   liquidity overlay. This is an intermediate slice, not the complete MVP.
2. Expand to discovered pools/positions, selection, aggregation, and size filters,
   with honest loading and coverage.
3. Complete refresh/recovery, in-app Docs, accessibility and small-screen behavior,
   and static hosting verification. The user evaluates the full MVP.

Create implementation issues after the Phase 0 gate. Confirm and create dev
before the first feature branch. Developers use issue-scoped branches/worktrees
and PRs into dev; reviewers post readiness directly on GitHub. Promotion to main
follows the [promotion workflow](workflows/dev-to-main-promotion.md) and requires
user approval.

No trading or fund-movement features are planned. Further phases remain open.
