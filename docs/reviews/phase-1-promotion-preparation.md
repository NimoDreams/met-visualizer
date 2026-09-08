# Phase 1 Promotion Record

Historical record: this promotion predates public-launch hardening and Pages
activation. See the [public-launch completion review](public-launch-completion.md)
for the current released baseline.

Status: issue #23 promotion completed on 2026-09-07. GitHub Pages activation was
not part of the promotion and remains unapproved.

## Accepted Baseline

- Accepted `dev` candidate:
  `8471b0367e34ee02c47a6b9148201a8e32067dbb`.
- This commit is the merge of independently reviewed PR #33. It contains the
  verified application candidate plus its Phase 1 release report; it passed CI.
- The user explicitly accepted this candidate and authorized promotion on
  2026-09-07.
- `main` remains at Phase 0 baseline
  `7371054409ea6a6ddadb595a54ebde775213b15d`. No promotion or Pages activation
  occurs in this checklist PR.

Stage 1 PR #34 added only the reviewed promotion documentation and produced
final `dev` candidate `487801c8b8d36ffec4d2b4d076e34b030dc9b8e7`.

## Reviewed Readiness

- Issues #16–#22 and focused blocker #31 were closed before promotion. Only
  Phase 1 epic #15 and promotion issue #23 remained open in the milestone.
- No competing PR targeted `dev` or `main`.
- PR #33 has an independent `ready to merge` signal covering correctness,
  providers, privacy, safety, accessibility, scope, evidence, and tests.
- The [Phase 1 release review](phase-1-completion.md) records the application
  candidate, all-engine browser matrix, provider checks, nonlogging user-RPC
  smoke, dependency and artifact inspection, known limitations, and deferred
  deployed-Pages check.
- The product remains read-only. The verified artifact has no embedded RPC,
  credential, local env, source map, wallet, signer, transaction, trading, swap,
  liquidity-write, persistence, analytics, backend, service worker, or Pages
  deployment surface.

## Promotion Result

- PR #35 promoted exact final `dev` candidate
  `487801c8b8d36ffec4d2b4d076e34b030dc9b8e7` to `main` with `Closes #23` and the
  Phase 1 milestone.
- An independent reviewer posted `ready to merge` at that exact head after
  reviewing the runbook, branch identity, user authorization, verification,
  privacy, safety, scope, and regular-merge requirement.
- PR #35 merged with the required regular merge commit
  `19046d1f0dfae069a5847b2fb57bd662aa89aacd`. Issue #23 closed, and `dev` was
  fast-forwarded so `main` and `dev` share that commit.
- Exact stable-main format, lint, typecheck, 21-file/107-test, build, artifact,
  diff, and local `/met-visualizer/` HTTP 200 checks passed after promotion.
- No product behavior, dependency, privacy boundary, or read-only scope changed
  during promotion.

Phase 1 is complete. Future phases are unplanned. GitHub Pages activation
remains a separate explicit user gate.
