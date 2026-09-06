# Reference Market And Valuation Axis

Status: approved Phase 0 direction. Implementation details remain subject to
fixture and browser verification.

## Goal

Give traders one stable, clearly identified candle market and place current
Meteora DLMM liquidity on the same USD valuation scale. The interface must say
which market, supply basis, conversion source, and observation times it uses.

## Reference-Market Selection

Use GeckoTerminal's Solana token-pools endpoint for candidates. Preserve its
default ranking, which combines USD liquidity and 24-hour volume, and verify the
entered mint's base/quote membership by address.

Check a bounded initial set of the three highest-ranked candidates in order.
Select the first candidate with valid USD OHLCV for the entered token, at least
one completed candle, and usable metadata. Prefer a candidate covering the
approximately 24-hour default viewport; accept its available lifetime when the
pool is newer. If a higher-ranked candidate has unusable candles, record the
reason and try the next candidate without exceeding the public request budget.

Do not give a DEX a fixed preference. Keep the chosen pool stable for the token
session. Show provider, DEX, pair, pool address, USD liquidity, 24-hour volume,
last trade, candle interval, and available history. A manual reference selector
may use the returned candidate list; changing it reloads the entire series and
never joins candles from different pools.

Compare the newest candle with the pool's reported last trade so provider lag
and market inactivity are described separately. Tune the numeric stale threshold
from implementation evidence. A refresh failure keeps last-good candles with a
stale label. It does not silently select another pool. If no candidate supplies
usable candles, the pool/position workflow remains available without fabricated
history.

## Default Valuation Axis

Default to a USD valuation axis. Each USD OHLC price is multiplied by one supply
basis fixed for the current token session:

```text
valuation OHLC = USD token-price OHLC * display supply
```

USD candle volume is not multiplied.

Use these states in order:

1. **Market Cap (USD):** when GeckoTerminal returns a non-null verified
   `market_cap_usd` and a valid `price_usd`, derive the current implied
   circulating supply as `market_cap_usd / price_usd`.
2. **FDV (USD):** otherwise, read the current Solana mint supply through the
   user's RPC and use it as the display supply.
3. **Price (USD):** if neither supply basis is available, keep usable candles
   visible in a clearly labeled degraded state.

Never label total-supply valuation as market cap. Show the active label and
source beside the chart, for example `Market Cap (USD) · CoinGecko verified` or
`FDV (USD) · current Solana mint supply`.

This is a current-supply valuation view. Historical candles reuse the session's
fixed display supply; they are not a reconstruction of circulating or minted
supply at each historical candle. An explicit supply refresh may rescale the
full chart and must disclose the new basis and observation time. A provider-
verified market cap may reflect the provider's asset-level methodology,
including supply outside this Solana mint for a multichain asset.

A SOL-denominated price view is outside the MVP default. It can be added later
without changing the market-selection contract.

## Position-Overlay Conversion

Normalize every enabled DLMM pool so a bin's y-coordinate expresses the entered
token's USD price, then multiply it by the same display supply used by candles.
Use the current bin ratio and a public USD price for the pool's other token.
Fetch conversions only for enabled pools, cache them by mint, and record their
source and observation time. Do not assume that a stablecoin equals exactly one
dollar.

Take conversion prices with the explicit RPC liquidity refresh rather than
silently moving a snapshot on each candle poll. If a pool's other token has no
supported USD conversion, keep the pool and its positions browsable, state the
native quote unit, and disable its common-axis overlay.

The reference candle pool and an enabled DLMM pool are independent. A Raydium
or Orca reference can anchor the chart while Meteora positions use their own bin
prices and quote conversions.

## Refresh And Request Budget

- Poll only the selected reference's newest candles, no faster than once per 60
  seconds while the page is visible.
- Load supply, DLMM state, and enabled-pool quote conversions on token load and
  explicit RPC refresh. Do not poll large RPC snapshots.
- Cache market metadata and quote prices by mint, deduplicate in-flight reads,
  stop hidden-tab candle polling, and cancel work for an obsolete CA or RPC.
- Budget discovery plus at most three initial candle probes against approximately
  ten public requests per minute. Back off on 429 and transient 5xx responses.
- Keep candle, supply, conversion, and RPC statuses separate so one failure does
  not erase usable data from another boundary.

## Required In-App Disclosure

The Docs view must explain:

- how the reference pool is ranked, validated, kept stable, and changed;
- the difference between verified Market Cap, on-chain-supply FDV, and USD price;
- that historical valuation candles use the current session supply;
- that a verified provider market cap can use an asset-level supply methodology;
- how non-USD Meteora bin prices are converted and why some overlays may be
  unavailable;
- source and refresh cadence for candles, supply, quote prices, and LP state; and
- that the liquidity profile is a current snapshot rather than historical
  liquidity at the candle time.

Sources: [GeckoTerminal/CoinGecko top-pool ranking](https://docs.coingecko.com/reference/top-pools-contract-address),
[pool OHLCV parameters](https://docs.coingecko.com/reference/pool-ohlcv-contract-address),
[market-cap and FDV behavior](https://docs.coingecko.com/reference/onchain-simple-price),
and [Solana `getTokenSupply`](https://solana.com/docs/rpc/http/gettokensupply).
