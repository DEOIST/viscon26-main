# Agent Git Workflow Rules

This is a shared GitHub organization repository. Read these rules at the start
of every task, and [docs/BRANCH_RULES.md](docs/BRANCH_RULES.md) before any Git or
GitHub change. They apply even when GitHub does not enforce branch protection.
`CLAUDE.md` imports this file, so edit only `AGENTS.md`.

Project architecture, commands and code conventions are in
[CLAUDE.md](CLAUDE.md). Agents that do not load `CLAUDE.md` automatically
(Codex, Cursor, Copilot, ...) must read it before changing code.

## 1. Protect `main`

Treat `main` as the protected integration branch. Never:

- Edit files or create commits while checked out on `main`.
- Push directly to `main`, including through an alternate refspec or API.
- Force-push, reset, rebase, amend, rewrite, replace, or delete `main`.
- Merge a branch or pull request into `main` without the explicit authorization
  and checks in section 8.
- Bypass protection with administrator privileges, disable checks, change
  protection settings, or enable auto-merge to evade human review.

Prohibited commands include `git push origin main`, `git push origin HEAD:main`,
`git push --force origin main`, `git push origin :main`, and `git reset --hard`
while on `main`. Do not use bulk pushes (`--all`, `--mirror`, or matching
refspecs) or an unverified default push target. A local checkout of `main` for
inspection is allowed; switch to an owned working branch before editing.

## 2. Verify ownership before changing anything

Inspect the working directory, branch, remote, and pending changes:

```bash
pwd
git status --short --branch
git branch --show-current
git remote -v
```

Work on a branch dedicated to the task. Follow the repository convention
`<type>/<issue>-<slug>` (for example `feat/14-upload-page` or
`fix/15-items-404`), with the types from section 4. `agent/<task-name>` is
also allowed. Continue an existing task branch only when ownership and scope
are clear. Do not modify, push, rename, or delete another person's or agent's
branch without explicit instructions. Recheck the branch before committing,
pushing, or merging.

## 3. Synchronize without disturbing shared work

Fetch before starting a new task. With a clean worktree, create a branch
directly from the remote integration branch:

```bash
git fetch origin
git switch -c agent/<task-name> origin/main
```

Updating or checking out local `main` is unnecessary. If there are existing
changes, preserve them: continue the owned task branch where appropriate, or
create an isolated worktree from `origin/main`. Never automatically stash,
discard, overwrite, reset, or clean another contributor's work. Do not switch
branches underneath other agents sharing the same worktree.

A new worktree has no `frontend/node_modules` or `backend/.venv`; run
`make install` in it before `make check`.

## 4. Commit only relevant changes

Keep edits within the assigned task. Avoid unrelated refactors, formatting,
dependencies, and generated files. Never commit `frontend/dist/`,
`frontend/node_modules/`, `backend/.venv/`, caches, or `.env` files (all are
git-ignored; don't force-add them). Before committing, inspect:

```bash
git status --short --branch
git diff
git diff --cached
```

Stage explicit paths and inspect the staged diff. Do not blindly stage the
whole worktree. Write commit messages as `<type>: <what it does> (#<issue>)`,
with type `feat`, `fix`, `chore`, `docs` or `pitch`, plus an optional body
explaining why. Example: `feat: add upload endpoint (#12)`. Intermediate commits
are fine; integration uses squash merging, so the PR title becomes the commit
on `main` and must follow the same format.

When a change touches the API contract, keep both sides in the same branch:
`backend/app/schemas.py` and `frontend/src/misc/CommonInt.ts` change together
(see CLAUDE.md, "Add an API endpoint").

## 5. Push only the owned branch

Verify the current branch and remote destination before every push. Use an
explicit destination, replacing the placeholder with the actual owned branch:

```bash
git push -u origin HEAD:refs/heads/agent/<task-name>
```

Use the same explicit destination for later pushes. Never push to `main` or
another shared or protected branch. Do not force-push unless the human
explicitly authorizes it for the named, exclusively owned working branch;
even then use a lease and verify the expected remote commit. Such permission
never permits force-pushing `main` or any shared or protected branch.

## 6. Verify before every push

Run `make check` after the final changes and before every push. It runs
`tsc --noEmit` and `prettier --check` in `frontend/`, and `ruff check`,
`ruff format --check` and `pytest` in `backend/`.

Also run the **Docker smoke test** (`make prod && make smoke`) when the change
affects runtime, serving or deployment behavior: `Dockerfile`, `compose.yaml`,
`.dockerignore`, `frontend/build.js`, `frontend/template.html`,
`backend/app/frontend.py`, `backend/app/main.py`, `backend/app/config.py`,
dependencies (`package.json`, `requirements.txt`), or a new page or router.
Stop the stack afterwards with `make prod-down`. If Docker is unavailable,
at least run `make build`, start the backend, and run
`make smoke URL=http://localhost:8000`; report that the Docker build itself
was not verified.

Inspect `git diff --check`, the staged diff, and `git status`; ensure no
secrets, credentials, generated junk, or unrelated changes are included. Put
real secrets in the ignored `backend/.env`, and document only variable names
in `backend/.env.example`.

Investigate failures. Never delete or weaken tests, suppress failures, or
present skipped checks as passing. If verification cannot run, report the
specific blocker and keep the work local until the required checks can pass.

## 7. Open a reviewable pull request

Open a PR from the owned task branch into `main`, filling in
[the PR template](.github/pull_request_template.md). Title it like a commit
message (section 4). The description must cover:

- **Problem:** what was wrong or missing, with `Closes #<n>` when applicable.
- **Change:** the resulting behavior, and any important decisions.
- **Contract:** API or `CommonInt.ts`/`schemas.py` changes, if any.
- **Validation:** the checks you ran (section 6) and their results, pasted or
  summarized honestly, including anything you could not run.
- **Risks:** remaining risks, data-reset needs, follow-ups.

A request to implement, commit, push, or open a PR does not authorize merging it.

## 8. Integration requires an explicit human request

Your default stopping point is a tested branch and reviewable PR. Do not merge
your own or another agent's PR unless the human explicitly asks you to merge
that PR. Zero required approvals in GitHub does not grant agents permission to
self-merge.

When explicitly authorized, use **Squash and merge only**, and verify the PR
targets `main`, its current head is the reviewed change, and it is mergeable.

All four required checks from [CI](.github/workflows/ci.yml) must pass for
that current head. To reproduce one locally before pushing:

| Required check | Local equivalent |
|---|---|
| Repo hygiene | `git diff --check origin/main...HEAD` is clean; no file over 5 MB; `git ls-files` lists no `.env` |
| Backend (ruff + pytest) | `make check` (backend part) |
| Frontend (tsc + prettier + build) | `make check` (frontend part) and `make build` |
| End-to-end smoke (Docker) | `make prod && make smoke`, when section 6 requires it |

Any additional checks required by GitHub must also pass. Local results never
replace a CI check that is red or missing. Honor GitHub-required reviews and unresolved
review requests. Pending, missing, skipped, cancelled, stale, or failing checks
are not approval. Never use an administrative bypass or change repository
settings to make a merge possible. The squash commit must clearly describe the
completed change.

## 9. Resolve conflicts on the owned branch

With the owned task branch checked out and your work safely committed:

```bash
git fetch origin
git merge origin/main
```

Resolve conflicts on that branch, inspect the result, and rerun `make check`
and relevant checks before pushing. Do not resolve conflicts by resetting,
rewriting, force-pushing, or modifying `main`. Fix mistakes already integrated
into `main` with a revert or repair PR.

Conflicts concentrate in the shared "hot files" listed in CLAUDE.md
(`CommonInt.ts`, `schemas.py`, `apiClient.ts`, `routers/__init__.py`,
`Layout.tsx`). Keep both sides' additions; never drop another feature's section
to make a conflict go away.

## 10. Preserve history and authority

If an action could violate these rules, stop that action and use a safe branch
or PR alternative. Ask only when missing ownership or authority prevents safe
progress; do not work around a prohibition. Do not change CI workflows,
rulesets, or repository settings unless that change was explicitly requested.
Never add AI attribution to commits, PRs, issues, or code.

Expected flow: `origin/main` → owned task branch → edit → `make check` (+ smoke)
→ commit → push that branch → PR → human review → explicitly authorized squash
merge.

Human workflow shortcuts in other documents (including
[docs/PLAYBOOK.md](docs/PLAYBOOK.md)) do not override these stricter agent rules.
