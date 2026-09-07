# Phase 1 Experience Completion Proof

Status: implementation evidence for issue #21; independent review pending.

## Contract Exercised

- Chart candles, pool discovery, and enabled-pool positions retain their
  independent loading, current, incomplete, unavailable, stale, cancelled, and
  retry states. Initial chart and pool errors have local retries. A failed
  refresh keeps last-good data visible, and a failure in one pane does not
  prevent the other pane from completing.
- Wide screens keep the accepted 70/30 chart and positions layout. Constrained
  screens stack the panes. Portrait and rotated narrow-phone viewports show one
  state-preserving Chart/Positions mode at a time with a compact reference,
  denomination, selection, coverage, loading, and stale summary.
- Phone mode changes and Docs navigation keep the visualization mounted, so the
  RPC session, token, chart range, pool/position selections, active filter,
  progressive extent, and in-flight provider ownership remain in memory.
- Keyboard users receive a visible skip link, route focus, visible focus rings,
  native labeled controls, and the existing chart liquidity-row inspection.
  Live status and error regions name async progress without relying on color.
  Touch controls meet a 44-pixel target in phone layouts, text colors preserve
  at least a 4.5:1 representative rendered contrast ratio, and reduced-motion
  preferences suppress CSS animation and transition duration.
- The in-app Docs disclose onboarding, session-only RPC privacy, read-only
  scope, reference selection, Market Cap/FDV/Price semantics, current-supply
  history, data sources and cadence, pool selection, progressive loading,
  current-principal valuation, overlay/filter denominators, snapshot recovery,
  attribution, and provider/RPC limits. Navigation contains no token or RPC
  value.

## Provider And Attribution Check

The 2026-09-06 implementation check found that GeckoTerminal still describes
its keyless Public API as beta with minute-cached results and a fluctuating
public limit. The app enforces the more conservative current Swagger allowance
of ten dispatched calls per rolling minute. GeckoTerminal receives visible
source attribution. TradingView's upstream NOTICE currently names TradingView
Lightweight Charts and Copyright 2025 TradingView, Inc.; that notice and link
are shown in Docs, while the chart retains its built-in attribution logo.

## Representative Evidence

The deterministic Chromium proof covers the project base and hash reload,
session-only RPC clearing, keyboard skip and route focus, reduced motion,
provider-independent recovery, last-good chart staleness, the complete
1,800-position overlay workflow, and privacy assertions. The 1,800-position
case pans the chart, changes a filter and selection, switches at 390×844 and
844×390, enters and exits Docs, and verifies that its active mode, contributor
filter, selection, known-value summary, and viewport survive. It also asserts
no horizontal page overflow. Role- and label-based browser interaction exercises
the primary workflow through the rendered accessibility names.

Current automated browser coverage uses the repository's installed Chromium
project. No additional browser engine is installed in the project, so broader
engine coverage remains a release-environment check rather than an unstated
claim.

## Verification

Run with Node.js 24.20.0 and npm 11.19.0:

```text
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run test:browser
npm run test:browser:providers
npm run build
npm run verify:artifact
git diff --check
```

The unit suite contains 20 files and 102 tests. The deterministic browser suite
contains seven Chromium tests, and both live provider proofs pass. The
production build contains 47 modules. Its JavaScript bundle is 453.73 kB
(142.43 kB gzip), CSS is 14.04 kB (3.85 kB gzip), and the position worker is
5.28 kB. The artifact verifier checks four files for the project base, source
maps, credentials, and prohibited package markers.

## Remaining Gates

Issue #22 owns integrated release-candidate verification and Phase 1 signoff.
GitHub Pages activation and `dev`-to-`main` promotion remain separate
user-approved gates.
