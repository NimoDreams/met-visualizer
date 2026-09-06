# Decision Log

This file records important product and architecture decisions. New decisions
should be added with a date, context, decision, and consequence.

## 2026-09-05: Start From Codex Application Template

Context: The user wants `met-visualizer` to begin with the agent workflow,
documentation structure, safety posture, and branch/promotion lessons learned
from recent Codex-assisted application work.

Decision: Bootstrap the repository from the Codex application template before
planning or implementation.

Consequence: The project starts with PM/Developer/Code Reviewer role guidance,
GitHub Issues as the source of truth, durable docs, safety/privacy defaults,
worktree guidance, and a reusable dev-to-main promotion workflow. Product and
technical choices remain open until Phase 0 planning.

## 2026-09-06: Establish The MVP Experience

Context: Phase 0 discussions clarified the first user and valuable workflow.

Decision: Token CA entry leads to reference candles and expandable Meteora DLMM
pools/positions, with checkboxes and size filters controlling a current
price-aligned bin-liquidity profile. Include a concise in-app Docs tab and
visible source, freshness, and coverage context.

Consequence: No wallet identity is needed. Snapshot liquidity and historical
candles have distinct semantics; reference selection does not follow LP selection.

## 2026-09-06: One RPC Credential And Free Public Data

Context: The user prefers an open-source GitHub Pages SPA without maintaining
a shared market-data key.

Decision: Users provide a memory-only RPC endpoint; free public data APIs are
allowed. Start with GeckoTerminal for candles. Meteora candles remain a fallback
candidate. No additional market-data credential is required for the MVP.

Consequence: Browser access, coverage, rate limits, and price normalization must
be validated. A static build must never contain a developer RPC credential.

## 2026-09-06: Authorize Planning, Keep Implementation Gated

Context: The user approved the Phase 0 documentation and GitHub planning pass.

Decision: Create a reviewable documentation PR and Phase 0 planning issues.
Stack, refresh defaults, and detailed selection policies remain proposals.
Implementation, dev creation, and Phase 0 completion await explicit user approval.

Consequence: Use a documentation branch from main for this bootstrap pass;
no application code, deployment, or promotion is authorized by this decision.
