# Phase 1 Promotion Preparation

Status: Stage 1 checklist for issue #23. This record must merge into `dev`
before the actual `dev` to `main` promotion PR is opened.

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

Merging this documentation will create a later `dev` SHA. Before opening the
promotion PR, record that exact SHA and confirm its change from the accepted
baseline is limited to the reviewed promotion-preparation documentation.

## Readiness At Preparation

- Issues #16–#22 and focused blocker #31 are closed. Only Phase 1 epic #15 and
  promotion issue #23 remain open in the milestone.
- No open PR targets `dev` or `main` before this checklist PR.
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

## Promotion Gates After This PR Merges

1. Confirm the checklist PR is reviewed and merged into `dev` and record the
   resulting exact `dev` SHA.
2. Confirm the only open Phase 1 items are epic #15 and promotion issue #23,
   with no other PR open against `dev` or `main`.
3. Re-run the documented format, lint, typecheck, unit, browser, build, artifact,
   privacy, safety, and static-preview gates against that exact `dev` SHA.
4. Open the actual PR from `dev` to `main` with the Phase 1 milestone,
   `Closes #23`, the exact SHA, evidence, and the requirement to use a regular
   merge commit.
5. Obtain an independent GitHub-visible readiness signal on the promotion PR.
   The user's promotion authorization applies to the accepted application
   baseline; any intervening product change requires renewed review and
   acceptance.
6. After merge, fast-forward `dev` to the resulting `main` merge commit, push
   the synchronization, verify the stable state, close epic #15, and then close
   the Phase 1 milestone.

GitHub Pages activation remains a separate explicit user gate after promotion.
