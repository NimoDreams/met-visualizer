# Phase 1 Position Loading Proof

Status: implementation evidence for issue #19; independent review pending.

## Contract exercised

- Project-owned PositionV2 and BinArray decoders match a synthetic oracle
  decoded with `@meteora-ag/dlmm` 1.9.14 and its IDL at commit
  `576919e3e4368e542c402f000b4264724f7f23ec`.
- The oracle includes a 72-bin position, proving that dynamic extension shares
  are included. Removing one extension record fails closed.
- Per-bin token amounts use `floor(share * bin amount / liquidity supply)` with
  bigint arithmetic. Quote-side conversion remains bigint through USD micros.
- Position keys are scanned pool-wide, accounts hydrate in batches of 100, and
  BinArrays are read once per pool. Account churn makes the value denominator
  unknown; stale context responses fail.
- A large pool starts with at least 25 positions, targets 80% of complete value,
  and caps the initial view at 100. Load-next adds 100 and load-all reveals the
  remainder. Later batches stay selected until the first manual position
  change, then remain unselected.
- RPC replacement, pool replacement, cancellation, and failed refresh paths use
  abort signals and generation guards. A failed refresh retains the last-good
  snapshot with a visible stale state.

## Representative budgets

The deterministic JUP-shaped fixture uses 1,800 PositionV2 accounts, matching
the largest pool found in Phase 0. It requires one key scan, 18 account batches,
one BinArray scan, and one quote-token supply read. The 8,344-byte extended test
shape accounts for about 15.0 MB of decoded account and bin data (about 20 MB as
base64 JSON), consistent with the Phase 0 live measurement. Browser state keeps
ranked summaries and nonzero native-bin contributions after the raw account
payload and full share vectors become collectable. The worker is terminated on
success, failure, or cancellation, bounding retained worker memory to one pool
generation.

On the implementation host, the deterministic 1,800-position decode,
extension-aware valuation, contribution preparation, and sort completed in
approximately 1.1 seconds; its automated gate allows up to 10 seconds to avoid
treating one machine's timing as a product guarantee. A 37-position
newer-memecoin-shaped fixture completed in approximately 33 ms and loaded fully.
These timings exclude network latency, which remains endpoint-dependent and is
shown in the UI with request and byte counts.

The browser proof intercepts both public providers and the user-RPC boundary,
then expands the enabled pool and verifies complete position/value coverage. It
also checks that the RPC marker never reaches a public-provider request, URL,
HTML, or browser storage.
