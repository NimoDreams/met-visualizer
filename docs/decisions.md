# Decision Log

This file records important product and architecture decisions. New decisions
should be added with a date, context, decision, and consequence.

## YYYY-MM-DD: Decision Title

Context: What situation or tradeoff led to the decision?

Decision: What was decided?

Consequence: What this enables, prevents, or defers.

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
