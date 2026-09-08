# GitHub Issues Workflow

GitHub Issues are the source of truth for active work. Local docs are for
durable context, decisions, complex specs, and reviews.

## Active Work

Use GitHub Issues for:

- Epics.
- Implementation tasks.
- Bugs.
- Follow-ups.
- Documentation tasks.
- Review findings that need action.

Use milestones to group issues by phase or work batch.

Recommended labels:

- `type:epic`
- `type:task`
- `type:bug`
- `type:follow-up`
- `area:web`
- `area:api`
- `area:data`
- `area:docs`
- `area:infra`
- `status:blocked`

## Pull Requests

Use small PRs linked to issues.

During active multi-agent phase work, target issue PRs at `dev` unless the PM
explicitly says the work is a hotfix or production documentation update for
`main`.

Each meaningful PR should include:

- Summary.
- Linked issue or issues.
- Verification performed.
- Follow-ups, if any.

When possible, use GitHub closing keywords so PR merges close completed issues.

During active phase work, most issue PRs target `dev` while `main` remains the
stable branch. If `main` is the repository default branch, GitHub's automatic
closing-reference behavior is default-branch-oriented, so a PR targeting `dev`
may not show `Closes #123` as a closing reference and may not auto-close the
issue when merged into `dev`.

For PRs targeting `dev`:

- Assign the PR to the same milestone as the linked issue.
- Prefer `Refs #123` or `Implements #123` in the PR body rather than relying on
  auto-close behavior.
- After the PR merges into `dev`, the PM should manually close or update the
  linked issue with a short comment: `Completed by #123 and merged into dev.`
- Keep automatic closing keywords for promotion PRs or other PRs targeting
  `main` when the issue should close on merge to the default branch.

## Reviewer Readiness Signal

Code reviewers must leave a GitHub-visible readiness signal on the PR:

- `ready to merge`
- `ready after follow-up`
- `blocked`

The signal should include:

- linked issue reviewed,
- verification reviewed or rerun,
- blocking findings if any,
- privacy/safety/scope concerns if any,
- data migration/backfill risks if model ownership or user-authored fields
  changed,
- stacked PR order or retargeting requirements if any,
- milestone and base-branch concerns if any,
- and, if ready, an explicit statement that no blocking correctness, privacy,
  scope, or test issues remain.

## Branches

Do not implement directly on `main` once the project has active issue work.

Branch roles:

- `main`: stable branch. The user should be able to run this as the usable
  baseline once the app exists.
- `dev`: integration branch for the current batch or phase of active work.
  Developer issue branches should normally start here and PR back here.
- `issue-*`: focused implementation branches created from `dev`.

Before starting issue work:

- Confirm the intended base branch with the PM or issue notes.
- Pull latest `dev` for normal phase work, or latest `main` only for explicit
  production/hotfix work.
- Create a focused branch from that base branch.

Recommended branch names:

- `issue-12-short-description`
- `phase-0-project-foundation`
- `docs-agent-workflow`

Keep one issue or tightly related issue group per branch.

## Concurrent Agent Worktrees

Use Git worktrees when multiple agents need to work at the same time. Each
agent should get a separate checkout rooted outside the main repo directory.

Example from the parent development directory:

```sh
git -C my-project worktree add ../my-project-agent-feature dev
git -C my-project worktree add ../my-project-agent-review dev
```

Then, inside each worktree, create the issue branch:

```sh
git switch -c issue-12-short-description
```

Each worktree should keep its own branch, dependency install, local runtime, and
test output. Agents should not share one checkout when working concurrently.

If multiple worktrees need local runtime stacks at the same time, use distinct
project names and avoid port collisions. Do not stop another agent's runtime
unless the PM/user explicitly approves it.

## Worktree Cleanup

After a PR is merged into `dev`, the PM should clean up any local worktree used
for that completed issue once these checks are true:

- the GitHub PR is merged,
- the linked issue is closed or updated,
- the local worktree has no uncommitted changes,
- and no agent is still using that worktree for follow-up work.

Use Git to remove worktrees; do not manually delete worktree folders:

```sh
git -C my-project worktree list
git -C my-project worktree remove ../my-project-issue-12
```

Because issue PRs are often squash-merged into `dev`, Git may not consider the
original issue branch merged by ancestry. After confirming the PR was merged and
the worktree is clean, delete the obsolete local issue branch and prune stale
remote refs:

```sh
git -C my-project branch -D issue-12-short-description
git -C my-project fetch --prune origin
```

Do not remove active worktrees or branches for in-progress PRs, blocked work, or
follow-up changes that have not been merged. Never discard uncommitted local
changes without explicit user approval.

## PM Handoff Prompts

When a PM gives a Developer or Code Reviewer a copy-paste prompt during active
multi-agent work, include the branch/worktree instructions directly in the
prompt. Future agents should not need to infer the workflow from chat history.

Developer handoffs should say:

- start from latest `dev`,
- preferably work in a dedicated Git worktree,
- create a focused `issue-*` branch from `dev`,
- open the PR back into `dev`,
- assign the PR to the same milestone as the linked issue,
- use `Refs #123` or `Implements #123` for `dev` PRs unless the PM explicitly
  wants default-branch auto-close behavior,
- and avoid touching `main` unless the PM explicitly says the task is a
  production/hotfix change.

Reviewer handoffs should say:

- review the PR against its stated base branch,
- confirm issue branches target `dev` for normal phase work,
- confirm the PR is assigned to the same milestone as the linked issue,
- call out any accidental `main` targeting or stacked-PR ordering issues,
- and leave the required GitHub-visible readiness signal.

## Promotion Flow

Normal phase flow:

1. Developer branches from `dev`.
2. Developer opens a PR back into `dev`.
3. Code reviewer leaves a GitHub-visible readiness signal.
4. PM and user perform any needed manual verification.
5. PM merges the PR into `dev` and manually closes or updates linked issues
   because GitHub may not auto-close issues for PRs targeting non-default
   branches.
6. After an integrated batch is stable, prepare or update the promotion
   checklist through a focused PR back into `dev`; this preparation PR does not
   promote branches or close the promotion issue.
7. Run the documented verification, runtime, privacy, safety, blocker, and
   user-review gates against the exact latest `dev` commit.
8. The PM opens the actual promotion PR from `dev` into `main`. Because it
   targets the default branch, use `Closes #123`, replacing `#123` with the
   active promotion issue. Use a regular merge commit, not squash or rebase
   merge, so the promoted `main` commit remains a descendant of `dev`.
9. Merge only after the required reviewer readiness signal and user approval,
   then sync local/remote branches and verify stable `main`. If protected `dev`
   rejects the direct sync, use a reviewed, zero-content `main`-to-`dev` PR and
   record identical tree IDs rather than claiming identical branch SHAs.
10. Close the promotion milestone only after `main` is updated and branch/runtime
    synchronization is complete.

Follow the complete
[Dev-To-Main Promotion Checklist](dev-to-main-promotion.md) for commands,
failure gates, safety checks, promotion PR contents, and post-merge cleanup.

## Durable Docs

Update durable docs when work changes lasting project knowledge:

- `docs/project-context.md`
- `docs/vision.md`
- `docs/roadmap.md`
- `docs/architecture.md`
- `docs/decisions.md`
- `docs/specs/`
- `docs/reviews/`
