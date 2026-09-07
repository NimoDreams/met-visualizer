# Phase 1 DLMM Pool-Selection Proof

Date: 2026-09-06

Issue: [#18](https://github.com/NimoDreams/met-visualizer/issues/18)

Status: implementation evidence ready for independent review

## Result

The SPA discovers Meteora DLMM pool keys from the user's RPC with the entered
mint in either token orientation, hydrates and decodes each account at a bounded
context, and keeps failed or disappeared accounts visible as unavailable. The
Meteora Data API supplies only current ranking metadata. Addresses and mint
orientation must reconcile with decoded RPC identity before a candidate can rank.

Eligible pools sort by current USD TVL, 24-hour volume, then address. The page
crawler completes the TVL frontier and boundary ties across both orientations,
or requires manual selection when pagination, ordering, schema, reconciliation,
or the five-page-per-orientation bound cannot prove the result. Final-page counts
must agree with the provider's total/page values, and TVL cannot increase across
page boundaries. At most three
candidates receive zero-byte PositionV2 count probes and shared GeckoTerminal
quote checks. Exactly the first qualified pool starts enabled; every RPC-
discovered pool remains expandable and manually selectable.

Refresh keeps the user's latest enabled addresses stable, including toggles made
while a refresh is pending. A later RPC failure leaves
last-good pool data visibly stale. A later metadata or conversion failure keeps
last-good metadata or quote context visibly stale rather than choosing a new
pool. Position probes below the requested minimum context slot fail closed;
successful probe slots extend the snapshot's published RPC slot range.

## Decoder Oracle

The committed public fixture records a full on-chain LB pair account and the
decoded result from `@meteora-ag/dlmm` 1.9.14 at commit
`576919e3e4368e542c402f000b4264724f7f23ec`. The production decoder validates the
LB pair discriminator and minimum byte length, then reads token mints, reserves,
active bin, bin step, and status. The full transaction-capable SDK remains out of
the dependency tree and production artifact.

## Reproducible Checks

Using Node.js 24.20.0, npm 11.19.0, Playwright 1.63.0, and its Chromium 153
runtime:

- 56 unit and component tests cover decoder oracle parity, malformed accounts,
  both RPC mint filters, shared context slots, missing accounts, PositionV2
  probes, final-page and cross-page provider failures, frontier ties,
  deterministic ranking, unsupported memecoin conversions, stale refresh
  retention, and a manual toggle during deferred refresh;
- five deterministic Chromium tests cover project routing, session-only RPC,
  reference charts, expandable DLMM pool state, automatic enablement, and a
  unique RPC marker absent from public requests, page content, URLs, and storage;
- two explicit live Chromium checks confirm current GeckoTerminal and Meteora
  request shapes; Meteora returned CORS-visible HTTP 200 with page 1, page size
  20, and a nonempty `data` list for the JUP token-X sample; and
- the production artifact passes the project-base, source-map, credential-marker,
  and prohibited-package scan.

The ignored local `.env.local` was not opened, read, copied, or used. It remains
ignored, untracked, and outside the change set.

## Remaining Gates

- The exact GitHub Pages origin remains a release smoke test because Pages is
  not activated or deployed.
- Provider schema, CORS behavior, and availability remain release-time checks;
  deterministic CI does not depend on live APIs.
- Issue #19 owns full PositionV2 hydration, bin-array decoding, valuation,
  progressive loading, coverage, and overlays.
