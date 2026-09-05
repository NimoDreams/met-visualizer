# Dev-To-Main Promotion Checklist

Use this runbook to promote a reviewed integration baseline from `dev` into
stable `main`. A promotion changes no product behavior beyond what is already
reviewed on `dev`.

## Stage 1: Prepare The Checklist On `dev`

Checklist documentation is normal issue work:

1. Branch from the latest `dev`.
2. Open a focused PR back into `dev` with `Implements #123` or `Refs #123`,
   replacing `#123` with the active promotion issue.
3. Assign it to the active promotion milestone.
4. Review and merge the checklist PR into `dev`.

Do not promote `dev` to `main` in the checklist-preparation PR. Keep the active
promotion issue open until the later promotion PR merges into `main`.

## Stage 2: Confirm Promotion Readiness

Run these gates against the exact latest `dev` commit that the promotion PR
will use:

- Confirm the current phase or stabilization milestone is closed and every
  intended issue is closed or explicitly deferred with no remaining promotion
  blocker.
- Confirm no open PR is pending against `dev` or `main`. The checklist PR must
  already be merged.
- Confirm the user has completed any requested manual review and explicitly
  approves proceeding with promotion.
- Record the verified `dev` commit SHA in the promotion PR.

Useful GitHub checks:

```sh
gh pr list --base dev --state open
gh pr list --base main --state open
gh issue list --milestone "Current Phase Name" --state open
```

If any gate fails, stop and resolve or explicitly defer it before opening the
promotion PR.

## Stage 3: Verify The `dev` Commit

Use the repository's documented runtime and package-manager versions. Typical
checks include:

```sh
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run build
git diff --check
```

Adapt commands to the stack documented in `AGENTS.md`, `README.md`, and
`docs/architecture.md`.

If the app has a local runtime, verify configuration and startup. Prefer
example or placeholder env files for shareable config output:

```sh
docker compose --env-file .env.example config >/tmp/project-compose-promotion.txt
docker compose up -d --wait --wait-timeout 300
curl --fail http://127.0.0.1:PORT/health
```

The config command should use committed placeholder values and redirect rendered
configuration to a temporary file. A normal runtime startup may use the ignored
local `.env`, but treat any config rendered from that file as secret-adjacent:
never paste it into GitHub, chat, review notes, or logs shared with others.

Inspect runtime status and relevant logs if startup or smoke checks fail. Do
not discard database volumes or local review data as routine recovery.

## Stage 4: Review Privacy And Safety

Before promotion, confirm Git does not track:

- `.env` or other local secret files; committed `.env.example` files may
  contain placeholders only;
- local runtime data, databases, backups, exports, or dumps;
- provider dumps or raw API payloads;
- human notes, scratch notes, or other sensitive local review notes;
- private keys, seed phrases, recovery material, API keys, credentials, or
  private annotations.

Use `git status`, `git ls-files`, and review of `main...dev` locally. Never
paste secret values or sensitive file contents into terminal logs, issues, PRs,
or chat.

Also review `main...dev` against the project's domain-specific safety
boundaries. If the project has forbidden actions, confirm the promotion does not
introduce them.

## Stage 5: Open And Review The Promotion PR

After every preceding gate passes, the PM opens the actual promotion PR with:

- base: `main`;
- compare/head: `dev`;
- the active promotion milestone;
- a summary of the integrated changes;
- exact automated, runtime, smoke, privacy, and safety verification results;
- the verified `dev` commit SHA;
- a regular merge commit as the required merge method so the resulting `main`
  commit remains a descendant of `dev`;
- `Closes #123`, replacing `#123` with the active promotion issue, because this
  PR targets the default branch.

The promotion PR must receive the normal GitHub-visible reviewer readiness
signal and any final user approval before merge. Do not mix new product changes
into it; fix a failed gate on a focused branch through `dev`, then re-verify the
updated commit. Use GitHub's **Create a merge commit** option; do not squash or
rebase-merge a promotion PR because the later `dev` fast-forward depends on
preserving that ancestry.

## Stage 6: Finish The Promotion

After the promotion PR merges:

1. Pull the updated remote `main` into the local `main` checkout.
2. Because the promotion used a regular merge commit, fast-forward local `dev`
   to the promoted `main` commit and push that sync to remote `dev` so both
   branches share the promoted baseline.
3. Recheck the stable `main` runtime and smoke endpoints if the merge commit
   differs from the tested head.
4. Confirm the active promotion issue closed through the promotion PR.
5. Remove only clean, completed issue worktrees and prune obsolete branches or
   remote refs using the repository worktree-cleanup procedure.
6. Close the promotion milestone only after `main` is updated, local and remote
   branches are synced, and the stable runtime is confirmed.

If post-merge verification fails, keep the milestone open and create a focused
follow-up rather than treating the promotion as complete.
