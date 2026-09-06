# Position Controls And Responsive Layout

Status: approved Phase 0 direction. Implementation details remain subject to
usability and representative-pool verification.

## Goal

Help traders remove insignificant positions and isolate the largest liquidity
contributors without obscuring which pools and positions have actually been
loaded. Preserve the chart/position workflow across desktop, tablet, and phone
layouts.

## Position Value

Use current estimated USD value as the primary position-size measure. Calculate
the principal represented by the position's current per-bin token shares, then
value both token amounts with the conversion snapshot used for that pool:

```text
position value USD = token X amount * token X USD price
                   + token Y amount * token Y USD price
```

Keep share and token-amount arithmetic exact until the presentation boundary.
Include in-range and out-of-range principal. Exclude unclaimed fees, rewards,
wallet balances, and speculative future value. Describe the number as an
estimate tied to the pool and conversion observation times; it is a measure of
current principal value, not a promise of executable depth or withdrawal value.

Show each position's USD value as its main size and its percentage of the known
valued universe as secondary context.

## Global Filter Scope

One position filter applies across all enabled pools. Its universe contains the
positions whose values are currently known in those pools. Discovered pools that
have not been enabled or ranked, incomplete pool loads, and positions with
unavailable values are outside that denominator.

State the scope beside the controls, for example:

```text
42 shown of 173 valued positions across 3 enabled pools
Unopened pools and 6 unavailable values excluded
```

Never call this token-wide coverage unless every discovered position-bearing
pool has been valued. Adding or refreshing an enabled pool recomputes the global
ordering and result against the new observed universe.

## Controls And Defaults

- Sort positions by current estimated USD value, largest first, with stable pool
  and position-address tie-breaking.
- Start with no additional size filter: all positions completed by the approved
  progressive-loading pass remain shown and selected.
- Provide a global minimum-USD input with no hard-coded dust threshold. Token and
  pool scales vary too widely for one default dollar cutoff.
- Provide a `Largest contributors` action that includes positions from largest
  downward until they represent about 80% of the complete known valued universe.
  Disable that action when the denominator is incomplete; do not substitute a
  percentage of only the successful subset.
- Provide `Show all valued` and a clear-filter action. Keep the current threshold,
  contributor mode, result count, and covered value visible.
- Apply the active filter to both the position list and liquidity overlay. Treat
  it as an inclusion mask: filtering a position out does not erase its checkbox
  selection, and it returns to its prior selected state when the filter clears.
- Keep pool collapse state independent from selection and filtering.

The existing per-pool progressive-loading budget still controls initial network
work. A global filter can avoid later full hydration or rendering after the
compact ranking pass, but it cannot eliminate discovery, ranking, conversion,
or coverage work needed to know a position's value. Lowering the threshold may
queue more position hydration; raising it may cancel no-longer-needed queued
batches.

## Unavailable Values

Keep discovered positions with unavailable values visible in a separate group
after valued positions. Show the reason, such as incomplete account data,
missing bin data, or unsupported USD conversion. Exclude them from minimum-USD
comparisons, sorting by value, cumulative-value targets, and value-coverage
denominators.

Disable a position's common-axis overlay control until its bin contribution and
y-axis conversion are available. Preserve its identifier, pool, native amounts
when known, loading/error state, and retry path. A later successful valuation
places it into the global ordering without selecting it automatically after the
user has already changed selection.

## Responsive Behavior

- **Desktop:** use the approved approximately 70/30 chart and position-pane
  split. Both panes remain visible and independently scroll where appropriate.
- **Tablet or constrained width:** stack a substantial chart above the full-width
  position pane. Do not compress the position controls into an unusable sidebar.
- **Narrow phone:** use a Chart/Positions switch with one primary pane visible at
  a time. Preserve all chart, expansion, filter, loading, and selection state
  while switching.

Keep a compact token and selection summary visible in both phone modes. It shows
the active reference/denomination, selected-and-included position count, known
value coverage, and loading/stale status. The Positions mode contains the global
filter and pool controls; changes are reflected when the user returns to Chart.
Provide an obvious switch back to the chart.

Treat these as behavior breakpoints rather than fixed device classes. Tune the
CSS thresholds with browser tests around the widths where the 70/30 layout and
stacked chart cease to be readable. Use touch-sized controls, preserve keyboard
operation, avoid page-level horizontal scrolling, and verify both orientations.

## Verification Expectations

- Reconcile sampled position USD values with decoded bin principal and the
  recorded token-price snapshot.
- Test global ordering and filters across pools with different quote tokens.
- Prove that incomplete and unavailable values never inflate coverage claims.
- Verify filter-mask and checkbox state across loading, refresh, pool collapse,
  CA changes, and phone-mode switches.
- Test representative desktop, tablet, narrow-phone, and rotated-phone viewports.
