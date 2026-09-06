# met-visualizer

A way to view Meteora LP positions on arbitrary Solana tokens.

This project is intentionally at the planning/bootstrap stage. The first goal is
to define the product direction, technical boundaries, and agent workflow before
broad implementation begins. The agreed MVP is a static SPA: enter a token CA,
provide a session-only RPC, view reference candles and expandable DLMM
pools/positions, and select current bin-liquidity contributions. GeckoTerminal
is the starting free candle source, pending validation. An in-app Docs tab
will explain sources, refresh behavior, and limitations.

See the [MVP spec](docs/specs/mvp.md), a Phase 0 draft for review.
Implementation is not yet authorized; the stack remains a proposal.

## Current Setup

- Local repo: `met-visualizer repository root`
- Product seed: visualize Meteora LP positions for arbitrary Solana tokens.
- Active work should be planned through GitHub Issues and milestones.
- Durable project memory should live in `docs/`.
- The branch strategy should be confirmed during the first PM planning session.

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
- [Phases](docs/phases/README.md)
- [Epics](docs/epics/README.md)

## Safety

Never commit secrets, API keys, credentials, database dumps, exports, `.env`
files, human notes, or other sensitive local artifacts.

This project should start as read-only visualization/research software. Do not
add trading, signing, wallet connection, private-key handling, seed-phrase
handling, swaps, liquidity mutation, transaction submission, or fund-movement
behavior unless a future explicit spec changes scope.
