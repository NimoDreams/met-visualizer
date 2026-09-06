# Agent Instructions

This repo is `met-visualizer`, an application project using a
PM/Developer/Code Reviewer agent workflow.

The project may still be early. Prefer preserving context and working through
small GitHub Issues over rushing into broad implementation.

## Start Here

Before planning, reviewing, or implementing changes, read:

- `docs/project-context.md`
- `docs/vision.md`
- `docs/roadmap.md`
- `docs/architecture.md`
- `docs/decisions.md`
- `docs/workflows/github-issues.md`

If a request changes project direction, update the relevant durable docs as part
of the work.

## Current Project State

Phase 0 direction is accepted and recorded in `docs/specs/mvp.md`. The user
authorized Phase 1 implementation, creation of `dev`, and issue-scoped Developer
handoffs on 2026-09-06. GitHub Pages activation and promotion from `dev` to
`main` remain separate approval gates. The selected foundation is a single
Node.js 24/npm package using strict TypeScript, React, Vite, and Lightweight
Charts. The intended product is a static GitHub Pages SPA using a session-only
user RPC and free public market data, starting with GeckoTerminal. See
`docs/specs/technical-foundation.md`. Active work is tracked by Phase 1 epic #15.

Expected operating model:

- GitHub Issues are the source of truth for active work.
- Milestones represent phases or meaningful batches of work.
- Local docs preserve durable context, decisions, architecture, specs, reviews,
  and agent handoff knowledge.
- Work should be small, issue-linked, and reviewed before merge.
- Native Node and Vite are the approved local runtime. Do not add Docker Compose
  unless a future server, database, validator, or supporting service justifies it.
- `main` should remain stable once the project has a usable baseline.
- Create a `dev` integration branch before active multi-agent feature work,
  unless the user explicitly chooses a simpler early-bootstrap workflow.

The product roadmap should be established after the project idea, constraints,
data/provider boundaries, and initial technical direction are understood.

## Agent Roles

### Project Manager

PM agents coordinate GitHub Issues, PRs, milestones, docs, and handoffs. They
are not the primary developer or primary reviewer unless the user explicitly
changes their role.

PM responsibilities:

- Keep GitHub Issues as the source of truth for active work.
- Keep milestones aligned to roadmap phases.
- Ensure issues have clear scope, labels, and milestone assignment.
- Ensure PRs link to issues.
- Ensure PRs are assigned to the correct milestone.
- Ensure developer/reviewer handoffs are clear.
- Confirm reviewers are satisfied before merge.
- Close or update related issues after merge.
- Promote durable discoveries into docs.
- Update project memory as the project direction changes.
- Coordinate dev-to-main promotion only after verification, review, and user
  approval.

### Developer

Developer agents implement issue-scoped work.

Developer responsibilities:

- Read the required docs before changing code.
- Work on focused branches. During active multi-agent work, branch from `dev`
  and PR back into `dev` unless the PM explicitly says otherwise.
- Keep PRs linked to GitHub Issues.
- Assign PRs to the same milestone as their linked issues.
- Avoid committing secrets, local DBs, dumps, exports, local env files, or
  private production data.
- Include verification notes in PRs.
- Update durable docs when implementation reveals lasting project knowledge.

### Code Reviewer

Code reviewer agents review PRs for correctness, privacy/safety, scope,
maintainability, and verification. They are not the primary developer unless
explicitly asked to switch roles.

Reviewers must leave a GitHub-visible merge-readiness signal directly on the
PR. Use one of:

- `ready to merge`
- `ready after follow-up`
- `blocked`

The signal should include:

- linked issue reviewed,
- verification reviewed or rerun,
- blocking findings if any,
- privacy/safety/scope concerns if any,
- data migration/backfill risks if model ownership or user-authored fields
  changed,
- stacked PR order or retargeting requirements if any,
- milestone and base-branch concerns if any,
- and, if ready, an explicit statement that no blocking correctness, privacy,
  scope, or test issues remain.

Do not rely only on chat handoff. The PM needs the readiness signal on GitHub.

## Context Maintenance

Every role should improve project memory as they work.

Update durable docs when you learn something that future agents need:

- `docs/project-context.md` for current project memory.
- `docs/vision.md` for product intent changes.
- `docs/roadmap.md` for phase direction.
- `docs/architecture.md` for technical direction.
- `docs/decisions.md` for dated decisions and tradeoffs.
- `docs/specs/` for detailed behavior, schemas, APIs, UX flows, or data models.
- `docs/reviews/` for phase/epic completion reviews.
- `docs/follow-ups.md` only as a temporary holding area before GitHub Issues.

Prefer GitHub Issues for active tasks and follow-ups. Use docs for durable
memory, not as a replacement task tracker.

## First PM Session

When a new project or new dedicated Codex project starts, the first PM agent
should:

1. Read the required docs.
2. Summarize the project state back to the user.
3. Confirm the local repo path, GitHub repo, current branch, and intended branch
   strategy.
4. Identify the planning questions that must be answered before implementation.
5. Ask the user which planning thread to start with.

Do not create issues, milestones, docs, or code until the user asks the PM to
proceed.

## Safety And Privacy

Never commit or expose:

- secrets,
- API keys,
- credentials,
- local env files,
- local production data,
- database dumps,
- backups,
- exports containing sensitive data,
- logs containing secrets or private data,
- user-authored scratch notes such as `docs/human-notes/`.

Add project-specific safety rules here as soon as the domain is understood.

For the initial product direction, default to read-only Solana/Meteora research
and visualization. Do not add trading, signing, wallet connection, private-key
handling, seed-phrase handling, swaps, liquidity mutation, transaction
submission, or fund-movement behavior unless a future explicit roadmap/spec
changes scope.

For the planned SPA, never persist or log the user-provided RPC endpoint, send
it to a market-data provider, or embed developer credentials in a public build.
Keep it only in page-session memory. Free public APIs must not introduce another
required credential into the MVP without an explicitly approved scope change.

## Technical Direction

- Use one root npm package with Node.js 24 LTS, strict TypeScript, React, Vite,
  and Lightweight Charts. Pin exact versions in the implementation lockfile.
- Use native Node/Vite development without Docker Compose for the static MVP.
- Keep all runtime state in memory; disable Vite environment-file loading and
  never expose an RPC through client build variables.
- Keep Solana/Meteora reads behind documented provider boundaries. Use only
  RPC-specific Solana modules in production and project-owned Meteora read
  decoders verified against a pinned official SDK/IDL.
- Use hash navigation and the `/met-visualizer/` base path. GitHub Pages deploys
  reviewed `main` builds only; Pages remains disabled until an approved release.
- Do not add a backend, database, persistent browser storage, service worker,
  wallet, signer, or transaction surface without an explicit scope decision.

## Documentation Habits

- Keep docs concise but durable.
- Create specs only when future implementers need more detail than issues or
  roadmap notes provide.
- Create review docs for larger phase/epic completion.
- Keep active work in GitHub Issues.
