# Privacy And Public-Release Policy

Met Visualizer is a public, MIT-licensed, open-source, read-only research
application. Privacy is an architectural constraint and a release gate, not an
optional feature.

## Data-Minimizing Product Boundary

The browser needs a Solana token mint and a user-selected HTTPS RPC endpoint to
perform the approved workflow. The token mint, pool addresses, and on-chain
accounts are public Solana data. The RPC endpoint may contain a private provider
key and must be treated as a credential even when the URL itself is functional.

The RPC endpoint:

- exists only in page-session memory;
- is cleared on disconnect, replacement, reload, or page close;
- is never stored in local storage, session storage, IndexedDB, Cache API, a
  service worker, the URL, source control, build output, analytics, or telemetry;
- is never sent to GeckoTerminal, Meteora, GitHub, or another market-data
  provider; and
- is used directly by the visitor's browser for allowlisted read-only JSON-RPC
  methods with cache disabled, ambient credentials omitted, no referrer, and
  redirects rejected.

Met Visualizer has no backend, database, account system, wallet connection,
signer, transaction builder, swap, liquidity mutation, or fund-movement path.
Do not add one without an explicit product decision, threat review, spec,
implementation issue, and independent review.

## External Services

GeckoTerminal supplies public reference-market, candle, and quote-price data.
Meteora's public Data API supplies advisory pool-ranking metadata. The user's RPC
supplies authoritative on-chain pool, position, bin, and mint state. Each
provider receives the public identifiers needed for its request and ordinary
network metadata such as the visitor's IP address and browser headers. The
in-app Docs must explain these roles, freshness limits, and failure modes.

The project ships no analytics or remote error telemetry. GitHub exposes build,
deployment, and repository-traffic information to maintainers, but the app does
not collect visits, token searches, RPC endpoints, position selections, errors,
or session behavior. Any future telemetry requires an explicit scope decision,
data inventory, retention and disclosure plan, CSP review, and user approval.

## Untrusted Data And Error Redaction

Treat public APIs and user-selected RPCs as untrusted inputs. Bound transport
bytes, queue/cache growth, row counts, numeric domains, account counts, encoded
data, and decoded dimensions before expensive parsing or allocation. Validate
JSON-RPC envelopes before property access. UI, logs, tests, and artifacts may use
only project-owned error messages; never copy an endpoint, request body, response
body, nested provider error, or arbitrary exception text into visible output.

Cancellation, last-good snapshots, explicit retry, and honest partial/unavailable
states are preferred to hidden retry loops or fabricated completeness.

## Public Repository Hygiene

Never commit or publish secrets, RPC endpoints, private keys, seed phrases,
personal environment files, raw provider dumps, sensitive logs, local databases,
backups, exports, human scratch notes, or absolute workstation paths. Keep
`docs/human-notes/` and `.env*` ignored. Use repository-relative references and
the approved GitHub noreply identity for commits unless the user explicitly
approves another public identity.

The Tip Jar values `nimodreams.sol` and
`DxYUGfMtgHmuo1VGRAEUjzcpuCwWCA5xggbgJUZuaFwF` are intentionally public. They
are static, copy-only identifiers and do not authorize wallet, resolution,
payment, or transaction behavior.

## Release And Hosting Controls

The public site is `https://nimodreams.github.io/met-visualizer/#/`. GitHub Pages
serves a verified static `dist/` artifact from reviewed `main` only. HTTPS is
enforced. The `github-pages` environment accepts only `main` and contains no
deployment secrets. The workflow uses least-privilege job permissions, pinned
GitHub-owned Actions, and repeats formatting, linting, type checking, tests,
browser checks, build, artifact inspection, and Pages-policy verification before
deployment.

Normal changes start from `dev`, use issue-scoped branches or worktrees, return
to `dev` through reviewed PRs, and reach `main` only through an explicitly
approved promotion. Reviewers must leave a GitHub-visible readiness signal.

## Accepted And Planned Limits

Issues #51 and #52 add aggregate per-pool, cross-pool, and Worker availability
bounds. Until they ship, a pathological workload may slow, freeze, or crash one
visitor's tab and consume that visitor's network or user-provided RPC quota. It
cannot affect a shared backend, persisted user state, wallet, transaction, or
funds surface because none exists.

Issue #66 tracks quote-aware behavior for newer non-native markets. It is a
product-correctness limitation, not permission to weaken privacy or read-only
boundaries. GitHub Issues and milestones remain the source of truth for active
work and accepted follow-ups.
