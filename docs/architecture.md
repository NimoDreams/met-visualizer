# Architecture

The architecture is intentionally open until the project is planned.

## Current Lean

- Monorepo-friendly structure.
- Local web application or applications.
- Docker Compose for local runtime where useful.
- Database choice determined by project needs.
- External services only when explicitly chosen and documented.
- Solana/Meteora data access should be read-only and should be planned before
  implementation.

## Safety Boundaries

Document project-specific safety boundaries before implementing sensitive
features.

Initial boundary: visualization and research only. Do not add trading, signing,
wallet connection, private-key handling, seed-phrase handling, swaps, liquidity
mutation, transaction submission, or fund movement without a future explicit
spec and review process.

## Data Boundaries

Never commit:

- local databases,
- database dumps,
- backups,
- exports containing sensitive data,
- API keys,
- `.env` files,
- credentials,
- secrets.

Demo fixtures should use synthetic data only.
