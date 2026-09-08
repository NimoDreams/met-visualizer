# Public Launch Completion Review

Status: completed on 2026-09-08. The independently audited read-only MVP is live
at `https://nimodreams.github.io/met-visualizer/#/`.

## Released Baseline

- Final audited `dev` candidate:
  `f75321ce9352cee61bb148dd75d14f38f7896261`.
- Audited and deployed tree:
  `8a3abfc8ac4ce69ebb5dcd1a965082348ca86c0e`.
- Promotion PR #69 used the required regular merge commit and produced stable
  `main` commit `72420a81a8e1b9240d4ed56df31cffe35847fd59`.
- Protected-branch synchronization PR #70 returned the same tree to `dev` as
  commit `c89b56473d3f0ca700efb94f158db508e2020030`.
- Pages workflow run `34179309665` built and deployed the exact promoted `main`
  commit successfully.

`main` and `dev` have different history commits because protected `dev` required
a PR for the synchronization, but both contain the audited tree above.

## Release Scope

The release contains the Phase 1 CA-to-chart-to-DLMM workflow, the passive Docs
Tip Jar, bounded provider and RPC inputs, session-only RPC privacy, JSON-RPC
envelope validation and error redaction, CSP and no-referrer policy, repository
protections, private vulnerability reporting, and the reviewed main-only Pages
workflow. It contains no wallet, signing, transaction, trading, swap, liquidity
write, backend, persistence, analytics, telemetry, or service-worker surface.

## Review And Verification

Issue #39 records the final independent `ready to merge` signal for the exact
candidate. The auditor and focused reviewers verified:

- 213 unit tests and 27 Chromium, Firefox, and WebKit scenarios;
- 26 independent production-browser redaction probes across pool and position
  RPC paths;
- formatting, linting, strict type checking, build, four-file artifact privacy,
  Pages workflow policy, CI, and CodeQL;
- dependency advisories and signatures, public branch history and identity,
  tracked-file hygiene, branch protections, environment policy, and Pages state;
  and
- absence of RPC endpoints, credentials, source maps, workstation paths,
  unintended personal data, wallet/transaction code, and prohibited persistence
  or telemetry in the production artifact.

The public origin returned HTTP 200 for the document, JavaScript, CSS, and Worker
assets. Both `#/` and `#/docs` rendered from GitHub Pages. HTTPS is enforced;
GitHub Actions is the Pages source; the `github-pages` environment is restricted
to `main` and has no secrets.

The first promotion-triggered Pages run completed all build and artifact gates
but reached the configuration step seconds before activation became visible and
received a 404. A clean manual dispatch on the same `main` SHA then completed
both build and deployment. No code or policy was weakened to recover.

## Accepted Follow-Ups

- #51 and #52 remain the first public update's aggregate browser-availability
  work. Their single-tab/network/RPC-quota residual was explicitly accepted for
  launch and has no cross-user, persistence, wallet, transaction, or funds
  consequence.
- #66 tracks quote-aware reference selection and conversion for newer
  non-native markets under the unscheduled meta-phase milestone.
- #71 records this launch state in durable docs and is the first post-launch
  documentation update.

Public launch epic #37, audit #39, activation #41, and milestone 3 are closed.
Milestone 4 and epic #56 own the first reviewed update and deployment repeat.
