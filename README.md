# met-visualizer

A way to view Meteora LP positions on arbitrary Solana tokens.

Phase 0 planning is complete and the first implementation phase is active. The
agreed MVP is a static SPA: enter a token CA,
provide a session-only RPC, view reference candles and expandable DLMM
pools/positions, and select current bin-liquidity contributions. GeckoTerminal
is the validated starting free candle source. An in-app Docs tab
will explain sources, refresh behavior, and limitations.

See the [MVP spec](docs/specs/mvp.md) and selected
[technical foundation](docs/specs/technical-foundation.md). Active delivery is
tracked in [Phase 1 epic #15](https://github.com/NimoDreams/met-visualizer/issues/15).

## Current Setup

- Local repo: `met-visualizer repository root`
- Product seed: visualize Meteora LP positions for arbitrary Solana tokens.
- Active work should be planned through GitHub Issues and milestones.
- Durable project memory should live in `docs/`.
- `main` holds the stable accepted baseline; `dev` integrates Phase 1 work.
  Developers use issue branches into `dev` and reviewed promotions to `main`.

## Docs

- [Project Context](docs/project-context.md)
- [Vision](docs/vision.md)
- [Roadmap](docs/roadmap.md)
- [Architecture](docs/architecture.md)
- [Decision Log](docs/decisions.md)
- [GitHub Issues Workflow](docs/workflows/github-issues.md)
- [Dev-To-Main Promotion Checklist](docs/workflows/dev-to-main-promotion.md)
- [Follow-Ups](docs/follow-ups.md)
- [Specs](docs/specs/README.md)
- [Reviews](docs/reviews/README.md)
- [Phase 0 Completion Review](docs/reviews/phase-0-completion.md)
- [Phases](docs/phases/README.md)
- [Epics](docs/epics/README.md)

## Safety

Never commit secrets, API keys, credentials, database dumps, exports, `.env`
files, human notes, or other sensitive local artifacts.

This project should start as read-only visualization/research software. Do not
add trading, signing, wallet connection, private-key handling, seed-phrase
handling, swaps, liquidity mutation, transaction submission, or fund-movement
behavior unless a future explicit spec changes scope.
