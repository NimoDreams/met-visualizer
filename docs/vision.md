# Vision

Help Solana traders understand where liquidity is positioned around a token's
current price. The starting action is clear: enter a Solana token contract
address (CA).

The expected primary audience is Solana memecoin traders, while the product
continues to accept arbitrary Solana mints with supported market and DLMM data.
Optimize the ordinary experience for newer, fast-moving tokens that may have
short price history, unverified circulating supply, and one or several meaningful
Meteora pools. Use established tokens such as JUP as scale and stress cases rather
than treating their pool counts and payload sizes as typical sessions.

## Agreed Experience

A lightweight SPA shows a reference candlestick chart (66–75% of desktop visual
space) beside expandable Meteora DLMM pools and their individual positions
(25–33%). Positions may belong to any owner; no wallet connection is required.
Checkboxes and size filters control a combined horizontal liquidity profile
aligned to the chart price axis. This is a current bin-distribution snapshot,
not historical position movement.

## Access And Transparency

- Open source, with GitHub Pages as the intended hosting target.
- Users supply one RPC endpoint, held only in page-session memory.
- Free public data sources are allowed without another user credential or a
  project-maintained market-data key.
- GeckoTerminal is the starting candle source, pending feasibility validation.
- An in-app Docs tab explains sources, refresh behavior, reference-market
  selection, normalization, selection semantics, and limitations.
- Reference market, units, freshness, and coverage are visible beside the data.

## Scope Boundary

Research and visualization only. Exclude trading, signing, wallet connection,
private keys, seed phrases, swaps, liquidity mutation, transaction submission,
and fund movement unless an explicitly approved future spec changes scope.

The user determines whether Phase 0 direction and MVP functionality are
satisfactory. See the [MVP spec](specs/mvp.md).
