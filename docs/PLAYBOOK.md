# Hackathon playbook

Build one useful user journey, deploy it early, and make its value easy to
understand. Preparation should remove setup and coordination problems so the
event can be spent on the original core feature. This guide improves execution;
it cannot guarantee an award.

Everyone reads this page, then [CLAUDE.md](../CLAUDE.md) for the architecture,
commands and code conventions, and [BRANCH_RULES.md](BRANCH_RULES.md) for how
changes reach `main`. During the event, two working records are created at
T+1h and kept in the repository (not in chat): `docs/DEMO.md` (the exact demo
script, inputs and fallback) and `docs/PITCH.md` (the pitch outline and who
answers which question).

**Chosen idea (2026-10-09): ETH Life**, a game with a webcam finger-gun shooter
as the core feature. What we build is in [GAME_DESIGN.md](GAME_DESIGN.md); the
architecture, API contract, six ownership tracks and build order are in
[ARCHITECTURE.md](ARCHITECTURE.md). Those documents refine the generic gates
below for this project.

## Event facts and questions to settle

Checked against official 2026 pages on 6 October 2026:

| Published fact | Planning consequence |
|---|---|
| VIScon runs 9–11 October; the event listing gives Friday 15:00 to Sunday 18:00 at ETH HG Library and advertises 42 hours of hacking | Confirm the actual coding start and submission deadline; the listed clock times span 51 hours and do not identify the coding window |
| Teams have five or six people; registration is individual | Verify all members' registration/attendance; the listing says register before 7 October |
| Teams build a web app on supplied Linux VM infrastructure; organizers provide proposals and accept submitted own ideas | Choose a provided proposal or obtain organizer approval for an own idea; practice VM-compatible deployment now (our app is one Docker container, see "Deployment target" below) |
| Functionality, aesthetics, ease of use and overall feel are the published judging dimensions | Make each dimension visible; no published scoring weights are assumed |
| Open-source libraries/frameworks are allowed; the original core contribution is developed during the hackathon | Record the starter baseline and separate pre-event practice from original core work |

Sources: [VIScon 2026 FAQ](https://viscon.ethz.ch/2026/hackathon) and
[VIS event listing](https://vis.ethz.ch/en/events/1121/). Organizer instructions
and the chosen challenge brief take priority over this guide.

The product owner confirms these at check-in and writes the answers in a pinned
GitHub issue titled **"Event facts"**:

- Exact coding start **T**, submission deadline **D**, timezone and platform.
- Challenge-specific criteria/weights, required features and eligible proposals.
- Pitch/demo duration, slide/video/repository requirements and repo visibility.
- Permission to reuse this starter, required disclosure and any rules for AI tools.
- VM credentials/resources, allowed ports, TLS, whether Docker is available, and
  external services.
- Whether the VM can be reached over HTTPS: the webcam shooter needs a secure
  origin (HTTPS, or `localhost` through an SSH tunnel; see ARCHITECTURE.md →
  Deployment).

The public pages do not establish exact submission mechanics, pitch duration or
AI-assistance rules. A three-minute rehearsal is a practice format. Owners must
understand and verify any generated code; organizer rules control permitted
assistance.

## Roles

Assign a primary and a backup for each role. One person may hold two roles in
a five-person team.

| Role | Owns | Must be able to |
|---|---|---|
| Product owner | Idea choice, scope cuts, "Event facts" issue, submission | State the one-liner and the demo input/output at any moment |
| Integrator / release owner | `main` health, Docker image, VM deployment, release SHA | Build, deploy, restart and roll back the container; run `make smoke` against the VM |
| Frontend | `frontend/src/`, page flow, `apiClient.ts` | Add a page and wire an endpoint into the UI (CLAUDE.md "Recipes") |
| Backend | `backend/app/`, schemas, services, tests | Add an endpoint end to end with a test; explain validation errors |
| Core | The distinctive capability (algorithm, data, external API) | Run the core on a real input and explain its limits |
| UX / QA | Visual polish, usability trials, acceptance checks, `docs/DEMO.md` | Find friction with an unfamiliar user; rerun the acceptance examples |

## Before the event: two preparation sessions

Prepare generic tooling, documentation, deployment practice and familiarity
with the stack. Show the baseline to organizers if reuse is unclear. Do not
prebuild the selected challenge's original core implementation. Keep practice
work on labelled branches and tag the starter commit as the baseline
(`starter-baseline`) for disclosure.

### Session 1: everyone can contribute (90 minutes)

| Time | Activity | Evidence / owner |
|---|---|---|
| 0–15 min | Confirm registration, attendance, tool versions (Node >= 26.5, Python >= 3.12, Docker for release owner + backup) and role preferences | Product owner records six members or the five-person fallback |
| 15–40 min | Run `make install`, `make check`, `make dev`; use the example page at http://localhost:8000 and the API at `/docs` | Each member demonstrates a working laptop; identify incompatible tooling early |
| 40–65 min | Practice a small branch → PR → `make check` → squash-merge workflow on a "practice" issue (e.g. each member adds a page using CLAUDE.md "Add a page") | Each member opens their own scoped PR; preserve other members' work |
| 65–90 min | Trace one UI request end to end (`ItemForm` → `apiCreateItem` → `routers/items.py` → `services/items.py` → `schemas.py` validation → back), including a 422 for an empty title; explain the Git rules | Frontend/backend teach the flow; everyone explains human versus agent merge authority |

The Makefile assumes a POSIX-style environment with Make, Bash, Python and
Node available. Windows members use WSL or the raw commands in CLAUDE.md.
Resolve laptop setup problems before travel, with a teammate who can reproduce
the same commands. Docker is required for the release owner and backup; every
member should understand what the smoke test proves (the built image serves
the API, the pages and their bundles).

### Session 2: the team can recover and explain the app (90 minutes)

| Time | Activity | Evidence / owner |
|---|---|---|
| 0–40 min | Role drills from the table above, paired with backups | Each primary demonstrates an example and a failure case; the backup repeats it |
| 40–65 min | Build the Docker stack; restart it; practice recovery | Integrator and backup run `make prod && make smoke`, then `docker compose restart` and observe that in-memory data is lost |
| 65–90 min | Run a timed starter demo, swap operators, review an unfamiliar screen | Product/QA records friction; everyone can explain the flow |

If authorized practice hosting exists, rehearse a remote deploy and rollback.
Otherwise use local Compose and prepare the checklist; mark remote deployment
**unverified** until the event VM is reachable. Prepare accounts, quota checks
and synthetic sample data for plausible needs; avoid collecting services the
selected app may never use.

Before leaving, each member has:

- [ ] Confirmed registration/availability, a primary role and backup.
- [ ] A working app, a passing `make check` and a reviewed practice PR.
- [ ] Completed their drill and taught the backup without taking over the keyboard.
- [ ] A documented handoff, sample inputs and a way to reach the team.
- [ ] Read rules for secrets, pre-existing work, PRs and agent merge permission.

## Deployment target

The whole app is **one container** (`compose.yaml`, service `app`, port 8000):
FastAPI serves the API and the built frontend. A second, internal `redis`
service is planned (ARCHITECTURE.md → Deployment); it is never published on a
host port. OpenAI keys go into `backend/.env` on the VM, never into the repo.
On the VM:

```bash
git clone <repo> && cd <repo> && git checkout <release-sha>
cp backend/.env.example backend/.env   # then fill in real values
APP_PORT=<allowed port> docker compose up --build -d
make smoke URL=http://<vm-host>:<allowed port>
```

Rollback = check out the last known-good SHA and run the same `docker compose`
command. If the VM is reachable over SSH from GitHub, CD can do this instead:
set `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PORT` and `DEPLOY_SSH_KEY` in the repo
settings, and every green merge to `main` is deployed (see CLAUDE.md
"Production (Docker)"); rollback is then `TAG=<sha>` with `compose.prod.yaml`. If the VM has no Docker, run `make install && make build` and
`cd backend && .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port <port>`.
Either way, keep **one worker**: the starter stores data in process memory.

## Choose an idea by an acceptance example

Within the first hour, inspect actual proposals and ask the partner/mentor
about the intended user and expected result. Compare at most three eligible
options with this internal scorecard. These are **our planning questions**, not
invented official judging weights:

| Question | Strong candidate |
|---|---|
| Is the problem concrete? | One user type, a repeated task and a clear pain |
| Can we demonstrate value? | A realistic input and a result a judge understands immediately |
| Is there a distinctive core? | A useful capability beyond the starter's example item list (a CRUD form is not a core) |
| Can we deliver it? | Small core path, parallel UI/API work and a known fallback |
| Are inputs/dependencies available? | Legal sample data, working access and no unproven prerequisite |

Write: **"For [user], [app] turns [input/task] into [observable result], helping
them [benefit]."** Then record the demo input, expected output and strongest
moment in the "Event facts" issue and `docs/DEMO.md`. A generic feature
collection without that outcome is not our MVP. Do not claim a measured benefit
until it has been observed.

Define three acceptance examples: ordinary success, invalid/empty input and an
unavailable dependency. Turn each into a backend test (`backend/tests/`) as soon
as the endpoint exists. Keep the initial MVP to one journey and at most three
indispensable actions; everything else is `should` or `could`. The product
owner cuts optional scope when a gate is missed.

## Execution schedule and gates

**T** is the confirmed coding start; **D** is the actual submission deadline.
These are team timeboxes for a 42-hour plan, not an official schedule. Adjust
them to the confirmed window and protect the final six hours. Product/QA starts
the pitch and submission checklist at T+1h, while engineers build the core.

| Window | Primary work / owners | Exit criterion | If missed |
|---|---|---|---|
| T → T+1h | Product leads eligible idea choice; all challenge risks | User, one-liner, demo input/output and criteria recorded | Cut to the smallest eligible proposal; stop extra-feature debate |
| T+1h → T+2h | Frontend/backend agree the contract (types in `schemas.py` + `CommonInt.ts`, pushed first); integrator plans VM release; core tests access | Each `must` issue has owner, example and dependency; roles confirmed | Remove unproven dependencies; agree on a simpler contract |
| T+2h → T+4h | UI/API integrate one route; UX shapes screen; core supplies sample | Browser shows contract-matching result; mocks clearly labelled | Pair on the single route; stop parallel expansion |
| T+4h → T+8h | Integrator deploys; backend/core prove real processing/storage | Remote URL works when VM access exists, `make smoke URL=<vm>` passes, one real core input works, persistence/reseed demonstrated | Prioritize deployment/core proof; escalate VM access; cut breadth |
| T+8h → T+12h | Required actions; UX/product observe unfamiliar users | Main task works without coaching; errors/loading understandable | Simplify flow before adding features |
| T+12h → T+24h | Complete core; validate examples; integrate small PRs; stagger sleep | Repeatable representative results, required features connected, compatible branches | Move available members to failing acceptance check |
| T+24h → D-6h | Edge cases, visual finish, measured benefit | Stable candidate; another member completes journey | Cut unreliable additions; keep one convincing real path |
| D-6h → D-3h | Feature freeze; polish, error checks, samples, backup assets | Three consecutive demos succeed on actual release URL | Fix/remove failing part; no framework/dependency changes |
| D-3h → D-1h | Timed rehearsals; backup operator; pinned release | Two rehearsals, honest recording, matching URL/SHA, submission draft | Trim to tested smaller demo; reserve submission time |
| D-1h → D-30min | Submit using actual instructions; independently check links | Receipt/status saved; links open on second device | Stop features; resolve submission/access problems |
| D-30min → D | Buffer for submission or critical recovery | Submitted version, assets and receipt confirmed | Escalate to organizers while time remains |

At T+2h decide if records/files must survive a restart. The starter keeps data
in process memory (`backend/app/services/`), so **every container restart or
redeploy wipes it**. By T+8h either prove persistence on the deployment target
(e.g. SQLite on a named Docker volume, added to `compose.yaml`) or demonstrate a
sub-two-minute reseed with the product owner's agreement. Do not add multiple
uvicorn workers to process-local memory stores (CLAUDE.md "Gotchas").
Decided on 2026-10-09: Redis with AOF on a named volume (ARCHITECTURE.md →
Redis data model). By T+8h, prove that runs survive `docker compose restart` on
the deployment target.

Use two-minute updates every three hours: demonstrated result, next acceptance
check, blocker. Hand off before breaks and stagger primaries with backups. Plan
a protected sleep block per member; keep someone able to recover deployment,
frontend and API behavior awake.

## How a feature earns integration time

An issue is ready with an owner, user action, sample input/result, affected
API/files and acceptance check. Open a small draft PR early. It is done when
implementation/tests are integrated with passing checks and the relevant
behavior has been exercised in the browser. A mock or local screenshot alone
is not completion.

Before integrating a change on the demo path:

1. Review its diff and contract impact (`schemas.py` / `CommonInt.ts`) with the
   appropriate backup/neighbor.
2. Run `make check`, plus `make prod && make smoke` for runtime or deployment
   changes, before pushing; wait for all four CI checks to be green on the PR.
3. Use PR/squash flow. Humans follow [BRANCH_RULES.md](BRANCH_RULES.md); agents
   follow [AGENTS.md](../AGENTS.md) and stop at the PR unless asked explicitly
   to merge that PR. No direct/force push to `main`.
4. Verify deployed behavior if deployment is part of the change; note release
   SHA, data reset needs and last known-good revision.

Cut an optional feature if it lacks visible value, misses a gate twice or
cannot prove its dependency within a 45-minute investigation. After D-6h,
integrate only fixes/polish for the agreed demo path. Product and integrator
decide any exception together; agent authority and required checks still apply.

## Make the judging dimensions visible

| Published dimension | Our observable evidence |
|---|---|
| Functionality | Real input produces promised result; required actions work; invalid input recovers with a readable error (FastAPI `detail` shown in the UI) |
| Aesthetics | Coherent type/spacing/color via the tokens in `global.css`, readable projected UI and complete loading/empty/error states |
| Ease of use | Unfamiliar person completes main task without coaching; labels/feedback explain results |
| Overall feel | Clear purpose, consistent behavior and a smooth complete demonstration |

Use a few consented, non-sensitive usability trials to find friction. Record
sample size, task and observed timing; describe it as a small trial. For an
impact claim, compare the same task to its manual baseline and state conditions.
A rehearsal does not establish general adoption or an unmeasured improvement.

## Release, pitch and submission checklist

Product tracks one issue each for release, demo, pitch and submission;
integrator and backup verify the actual candidate:

- [ ] Brief, criteria, coding/deadline clocks and submission requirements recorded.
- [ ] Main journey works on required VM; release SHA, image tag and URL match.
- [ ] `make smoke URL=<release url>` and second-device browser checks pass; restart/storage behavior understood.
- [ ] Real processing, sample/cached data and unavailable functionality disclosed.
- [ ] Three demos pass; two members can operate and recover the app.
- [ ] Pitch fits confirmed limit; all members can answer their role's core question.
- [ ] Backup video/screenshots show tested release and are labelled if used.
- [ ] README has actual problem, solution, screenshot, run steps and final links; the example `items` feature is removed or clearly not part of the product.
- [ ] Required repo visibility/access, URL, slides/video and baseline disclosure (`starter-baseline` tag) checked.
- [ ] A human publishes any required release/tag and confirms platform receipt.

Keep tags and recordings tied to the tested revision. A passing check, tag or
uploaded slides are not a submission receipt. Use `docs/DEMO.md` and
`docs/PITCH.md` as exact scripts rather than maintaining competing versions in
chat.
