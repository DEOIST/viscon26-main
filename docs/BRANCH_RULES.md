# Branch rules for `main`

How changes get into `main`, for people and for AI coding agents working on
their behalf. Short version: **every change goes through a pull request that
with green CI, squash-merged. Nobody pushes to `main` directly.**

## Enforcement status

| | |
|---|---|
| Ruleset | `protect-main`, defined at the DEOIST organization level |
| Applies to | Repository `viscon-2026`, default branch (`main`) |
| Enforced by GitHub? | **No, not yet.** The organization is on the free plan, and GitHub only enforces rulesets on private repositories with GitHub Team. |
| CI / CD | [`ci.yml`](../.github/workflows/ci.yml) runs the four required checks on every PR and on `main`. [`cd.yml`](../.github/workflows/cd.yml) publishes the Docker image to GHCR after CI passes on `main`, and deploys it once a server is configured. |
| What that means | GitHub will *let* you push to `main` or force-push. **Don't.** Treat every rule below as if it were enforced. |

The rules become enforced automatically, with no change to this document, if
the organization upgrades to GitHub Team. If the repository is made public, a
repository-level ruleset with the same settings will be added. When either
happens, update the "Enforced by GitHub?" row above.

## The rules

| Rule | Setting | What it means for you |
|---|---|---|
| Require a pull request before merging | On, **0 approvals** required | Work on a branch and open a PR. You may merge your own PR; a teammate's quick look is encouraged but not required. |
| Allowed merge methods | **Squash** only | Each PR becomes exactly one commit on `main`, titled with the PR title. Write PR titles as commit messages (see "Naming" below). |
| Require status checks to pass | On, these four checks | They show on every PR. While the ruleset isn't enforced, GitHub won't block a red merge, so **don't merge until all four are green**. Run the local equivalent before pushing to catch failures early. |
| | `Repo hygiene` | No merge conflict markers, no files over 5 MB, no committed `.env`. Locally: `git diff --check origin/main...HEAD`, `git ls-files \| grep -E '(^\|/)\.env$'` prints nothing. |
| | `Backend (ruff + pytest)` | Lint, format check and tests in `backend/`. Locally: `make check`. |
| | `Frontend (tsc + prettier + build)` | Typecheck, format check and production build in `frontend/`. Locally: `make check` and `make build`. |
| | `End-to-end smoke (Docker)` | Builds the Docker image and runs `scripts/smoke.sh` against it. Locally: `make prod && make smoke`, then `make prod-down`. Required when runtime, serving or deployment behavior changes (list in [AGENTS.md](../AGENTS.md) §6). |
| Require branches to be up to date | **Off** | You don't have to re-sync with `main` before every merge. Still merge `origin/main` into your branch every hour to avoid conflicts. |
| Block force pushes | On | Nobody rewrites `main`'s history. |
| Restrict deletions | On | `main` cannot be deleted. |
| Require linear history | On | No merge commits on `main` (squash merging already guarantees this). |
| Bypass list | **Empty** | Nobody is exempt, not even org owners. All members are owners, so a bypass for owners would exempt everyone. |
| Signed commits, code scanning, coverage, Copilot review, deployments | Off | Not worth the setup cost during a hackathon. |

The job `name:`s in `ci.yml` must match the four check names above exactly. If
you rename a job, update the ruleset in the same change; otherwise, once
enforcement is on, GitHub waits forever for a check that never reports.

Human contributors may rebase or force-push an exclusively owned feature
branch. Agents follow the stricter authorization and ownership rules below;
neither humans nor agents may rewrite a shared branch or `main`.

## Naming

| What | Format | Example |
|---|---|---|
| Branch | `<type>/<issue>-<slug>` (agents may also use `agent/<task-name>`) | `feat/14-upload-page` |
| Commit and PR title | `<type>: <what it does> (#<issue>)` | `feat: add upload endpoint (#12)` |
| Types | `feat` new behavior · `fix` bug fix · `chore` tooling, deps, config · `docs` documentation · `pitch` pitch/demo material | |

Keep PRs small: one feature end to end (schema → service → router → client →
UI) is a good size. The PR description says what problem it solves, what
changed, any API contract change, how it was validated, and remaining risks.

## What to do when…

| Situation | Do this |
|---|---|
| CI is red on your PR | `gh run view --log-failed`, reproduce with `make check` (or `make build`, `make prod && make smoke`), push a fix to the same branch. `make format` fixes formatting. Never skip or weaken a test to get green. |
| A check is stuck or flaky | Re-run it from the PR's Checks tab. If it's still red, ask the team before doing anything else. |
| Smoke test fails | In CI, the job prints `docker compose logs`; locally, `make prod-logs` shows the server error. Check that the frontend built (`make build`) and that new files are not excluded by `.dockerignore`. |
| A check passes for you but not a teammate | Compare `node -v` (>= 26.5) and `python3 --version` (>= 3.12), then rerun `make install`. |
| Something broken reached `main` | Open a revert PR: `git revert <sha>` on a new branch, then PR as usual. Never reset or force-push `main`. |
| You accidentally pushed to `main` directly | Say so in the team chat immediately. If CI on `main` is red, revert via PR as above. CD only deploys commits whose CI passed. |
| Your branch conflicts with `main` | On your working branch, commit your work, `git fetch origin`, then `git merge origin/main`. Resolve (keep both sides' additions in shared files), rerun checks, and push only that branch. |
| You think a rule should change | Discuss with the team first; an org owner changes it under DEOIST → Settings → Rulesets, then updates this file in a PR. |

## For AI coding agents

If you are an AI agent (Claude Code, Codex, Cursor, Copilot or similar) acting
for a team member, these are hard rules. They apply even though GitHub does not
currently block violations.

The full agent policy is in [AGENTS.md](../AGENTS.md); [CLAUDE.md](../CLAUDE.md)
imports it, so every agent loads the same rules at task startup.
Human self-merge permission and workflow shortcuts do not override it.

1. **Never edit or commit on `main`, or push directly to it**, including via
   `HEAD:main`, an API, a bulk push, or an implicit push target. Never
   force-push, reset, rebase, amend, rewrite, replace, or delete `main`.
2. **Work only on an owned task branch.** Verify branch, remote, and worktree
   before changing anything. Use `<type>/<issue>-<slug>` (`feat`, `fix`, `chore`,
   `docs`, `pitch`) or `agent/<task-name>`. Fetch and branch from `origin/main`;
   preserve existing changes and use isolated worktrees when needed. Do not
   switch a shared worktree or modify another contributor's branch.
3. **Stage only relevant paths and inspect the staged diff.** Push with an
   explicit refspec targeting only the owned branch. Force-pushing requires
   explicit human authorization for that exclusively owned branch and a lease;
   it is never allowed for `main` or a shared or protected branch.
4. **Run `make check` before every push**, plus `make prod && make smoke` when
   runtime, serving or deployment behavior changes. Fix failures without
   deleting or weakening tests. Report blocked verification accurately and keep
   unverified work local.
5. **Open a focused PR using the template** (AGENTS.md §7) and
   `Closes #<n>` when applicable. Stop with a tested branch and reviewable PR
   unless the human explicitly asks to merge that PR. Implementation or PR
   creation permission is not merge permission; zero required approvals does
   not authorize agent self-merging.
6. **When authorized, squash-merge only**, with all four required CI checks and
   any additional required checks green for the current PR head and required
   reviews satisfied. Never bypass checks, protection, or
   review requirements, including with administrator privileges or auto-merge.
   Resolve conflicts by merging `origin/main` into the owned branch, then
   recheck; repair integrated mistakes through another PR.
7. **Never commit secrets.** Real values go in `backend/.env` (git-ignored); add
   only variable names to `backend/.env.example`. Do not add AI attribution to
   commits, pull requests, issues, or code.
8. **Do not change CI workflows, rulesets, or repository settings** unless the
   human explicitly requests that change. These documentation rules do not
   enable GitHub enforcement or change repository settings.
9. **Stop prohibited actions and choose a safe alternative.** Ask only when
   missing ownership or authority blocks safe progress; never work around a
   rule.
