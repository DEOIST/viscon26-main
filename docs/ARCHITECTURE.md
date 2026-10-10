# Architecture

How the pieces fit. What we build: [GAME_DESIGN.md](GAME_DESIGN.md). The
computer-vision deep dive: [SHOOTER_CV.md](SHOOTER_CV.md). Versions and the
reasons for each tool: [STACK.md](STACK.md). Conventions and recipes:
[CLAUDE.md](../CLAUDE.md).

> **Status (2026-10-10): foundation built (#12).** Contract, Redis, OpenAI
> plumbing, the build and every page work end to end; both minigames are still
> placeholders. Files marked *(planned)* do not exist until their PR lands; tick
> them off in [Build status](#build-status).

## Overview

```
Browser: one HTML page per scene
┌──────────────────────────────────────────────────────────────────────┐
│ React outer shell        components/<page>/App.tsx                   │
│   title · enroll · campus hub · graduation · intro/result overlays   │
│        │ mountX({ parent, character, dialogue, onFinish })           │
│  ┌─────▼──────────────────────────────┐     InputSource              │
│  │ WebGL inner shell  games/<game>/    │◄─── {aim, onFire} ◄── MediaPipe hand tracking
│  │ Phaser 4 (2D): blackjack, shooter   │                      (webcam, on-device)
│  │ shooter fakes depth: isometric art  │                              │
│  └────────────────────────────────────┘                              │
│        misc/apiClient.ts → fetch /api/... (same origin)              │
└────────┬─────────────────────────────────────────────────────────────┘
         ▼
FastAPI   routers → services ─► app/db.py ─► Redis 8   runs, leaderboard, AI cache, budget
                             └► app/ai.py ─► OpenAI    the only place that holds the keys
```

Three rules hold the design together:

1. **React owns everything around a round; the game engine owns the round**
   (Phaser 4 in both minigames; the shooter fakes depth with isometric art). They
   meet at one interface, `MountMinigame`. Pages never import Phaser; `games/`
   never fetches, never navigates and never imports React.
2. **The browser never sees a secret and never calls OpenAI.** Only the backend
   does, through `app/ai.py`, with caching, a daily cap and fallbacks.
3. **Camera frames never leave the browser.** Computer vision runs on the
   device; the backend only receives a score from 0 to 100.

## Pages and navigation

One HTML page per scene (the existing multi-page setup). The run id travels in
the query string, `?run=<id>`; everything else comes from the API.

| Page | Root component | Purpose | Calls |
|---|---|---|---|
| `/` | `components/index/App.tsx` | Title, **Enroll**, Hall of Fame | `apiListLeaderboard` |
| `/enroll` | `components/enroll/App.tsx` | Character creator | `apiCreateRun`, then `/campus?run=…` |
| `/campus` | `components/campus/App.tsx` | Story hub | `apiGetRunById`, `apiGenerateDialogue` (`campus`), `apiGraduateRun`, then `/graduation?run=…` |
| `/blackjack` | `components/blackjack/App.tsx` | Shell around `mountBlackjack` | `apiGetRunById`, `apiGenerateDialogue` (`blackjack`), `apiSubmitScore`, then `/campus?run=…` |
| `/shooter` | `components/shooter/App.tsx` | Shell around `mountShooter`, camera permission UI | as blackjack, with scene `shooter` |
| `/graduation` | `components/graduation/App.tsx` | Diploma reveal | `apiGetRunById`, `apiGraduateRun`, `apiGenerateEpilogue`, `apiGenerateEpilogueSpeech`, `apiGetEndingStats` |

- Pages other than `/` and `/enroll` redirect to `/` when `?run=` is missing or
  unknown. A graduated run sends `/campus`, `/blackjack` and `/shooter` to `/graduation`.
- Build run URLs with `misc/run.ts`: `readRunId()` and
  `runHref(path, runId)`. Never concatenate `?run=` by hand.
- **No client-side store (no Redux).** Every navigation is a full page load,
  which would wipe it. The character and the run live on the server; each page
  loads them with `apiGetRunById`.
- **Why one page per scene** (decided 2026-10-09):
  - every scene is its own bundle, so Phaser and MediaPipe load only where they
    are used (Phaser as one chunk shared by the two game pages);
  - teammates own separate folders;
  - leaving the shooter page releases the camera and WebGL automatically;
  - a crash costs one reload, because the state is in Redis;
  - any page can be opened directly for testing (`/shooter?run=<id>`).

  The cost is a reload between scenes. Hide it with a short fade and a dark
  background in `template.html`.

## Run lifecycle

```
enroll ─POST /runs─► playing 0/2 ─POST /scores─► playing 1/2 ─POST /scores─► playing 2/2
                                                                               │ POST /graduate
                                                                               ▼
                                                     graduated: ending fixed, in the Hall of Fame, locked
```

- Submitting a score for a game that already has one overwrites it (retry-safe;
  a crashed round can be replayed).
- `graduate` requires both scores, computes `totalScore = round(mean)` and the
  ending, and adds the run to the leaderboard and the ending counts exactly once.
  Calling it again returns the same run.
- After graduation, score submissions answer 409.

## The minigame contract (React ↔ game engine)

The contract does not care which engine draws the round: `mountBlackjack` creates
a Phaser game, `mountShooter` creates another Phaser game plus the hand tracker.

```ts
// frontend/src/games/shared/minigame.ts
import type { Character } from "../../misc/CommonInt";

export interface MinigameResult {
    score: number; // 0–100, normalized by the game
    stats: Record<string, number>; // for the result screen, e.g. { bankroll: 1350, hands: 6 }
}

export interface MinigameOptions {
    parent: HTMLElement; // container element owned by React
    character: Character; // perks and flavor
    dialogue: Record<string, string[]> | null; // prefetched lines by event key, or null
    onFinish(result: MinigameResult): void; // called exactly once
}

export interface MinigameHandle {
    destroy(): void; // idempotent: stops loops, input and camera, removes the canvas
}

export type MountMinigame = (options: MinigameOptions) => MinigameHandle;
```

- `games/blackjack/index.ts` exports `mountBlackjack`, and
  `games/shooter/index.ts` exports `mountShooter`, both typed `MountMinigame`.
- `components/common/MinigameHost.tsx` is the **only** caller of a
  mount function. It mounts in an effect and destroys in the cleanup, which also
  survives StrictMode's double mount in development.
- Games pick dialogue lines locally (a random line for the event, never the same
  one twice in a row) and make no network calls. When `dialogue` is `null` they
  use their own short built-in lines.
- The React page owns everything outside the round: instructions, the camera
  permission screen, the result screen, saving the score and navigation.

## API contract

Every type below exists twice, in `backend/app/schemas.py` (Pydantic, extending
`CamelModel`) and in `frontend/src/misc/CommonInt.ts` (TypeScript), camelCase on
the wire. Change both in the same PR.

```ts
// --- runs ---
type GameId = "blackjack" | "shooter";
type EndingId = "c_level" | "big_tech" | "phd" | "mcdonalds" | "unemployed";
type Pronouns = "she" | "he" | "they";
type DepartmentId =
    | "arch" | "baug" | "biol" | "bsse" | "chab" | "erdw" | "gess" | "hest"
    | "infk" | "itet" | "math" | "matl" | "mavt" | "mtec" | "phys" | "usys";
type ArchetypeId = "nerd" | "risk_taker" | "gamer" | "athlete";

interface Character {
    name: string; // 1–20 chars: letters (accents allowed), digits, space, . ' _ -
    pronouns: Pronouns;
    department: DepartmentId;
    archetype: ArchetypeId;
    avatar: string; // preset id "a1"…"a8"; the frontend owns the list
}
interface RunWHid {
    character: Character;
}
interface Ending {
    id: EndingId;
    title: string;
}
interface Run extends RunWHid {
    id: string;
    createdAt: string;
    scores: Partial<Record<GameId, number>>; // integer 0–100 per finished minigame
    totalScore: number | null; // set at graduation
    ending: Ending | null; // set at graduation
    graduatedAt: string | null;
}
interface ScoreSubmission {
    game: GameId;
    score: number; // integer 0–100
}

// --- leaderboard ---
interface LeaderboardEntry {
    runId: string;
    name: string;
    avatar: string;
    department: DepartmentId;
    totalScore: number;
    endingId: EndingId;
    graduatedAt: string;
}
interface EndingStats {
    total: number;
    counts: Record<EndingId, number>;
}

// --- story (OpenAI-backed) ---
type AiSource = "ai" | "fallback";
type DialogueScene = "campus" | "blackjack" | "shooter";
interface DialogueRequest {
    scene: DialogueScene;
}
interface DialoguePack {
    scene: DialogueScene;
    lines: Record<string, string[]>; // event key → lines; keys per scene in GAME_DESIGN.md
    source: AiSource;
}
interface Epilogue {
    text: string;
    source: AiSource;
}
```

### Endpoints

| Action | Method + path | Handler = service function | Client | Success · errors |
|---|---|---|---|---|
| Enroll | `POST /api/runs` (body `RunWHid`) | `create_run` | `apiCreateRun` | 201 `Run` · 422 invalid character or rejected name |
| Read a run | `GET /api/runs/{run_id}` | `get_run_by_id` | `apiGetRunById` | 200 `Run` · 404 |
| Save a minigame score | `POST /api/runs/{run_id}/scores` (body `ScoreSubmission`) | `submit_score` | `apiSubmitScore` | 200 `Run` · 404 · 409 already graduated |
| Graduate | `POST /api/runs/{run_id}/graduate` | `graduate_run` | `apiGraduateRun` | 200 `Run`, idempotent · 404 · 409 a score is missing |
| Hall of Fame | `GET /api/leaderboard?limit=10` (1–50) | `list_leaderboard` | `apiListLeaderboard` | 200 `LeaderboardEntry[]` |
| Ending stats | `GET /api/leaderboard/endings` | `get_ending_stats` | `apiGetEndingStats` | 200 `EndingStats` |
| Dialogue pack | `POST /api/runs/{run_id}/dialogue` (body `DialogueRequest`) | `generate_dialogue` | `apiGenerateDialogue` | 200 `DialoguePack` · 404 |
| Epilogue | `POST /api/runs/{run_id}/epilogue` | `generate_epilogue` | `apiGenerateEpilogue` | 200 `Epilogue` · 404 · 409 not graduated |
| Narration | `POST /api/runs/{run_id}/epilogue/speech` | `generate_epilogue_speech` | `apiGenerateEpilogueSpeech` | 200 `audio/mpeg` · 404 · 409 no epilogue yet · 503 narrator unavailable |
| Health | `GET /api/health` | `get_health` (exists) | `apiGetHealth` | 200; touches no dependency |

Routers: `routers/runs.py` (prefix `/runs`), `routers/leaderboard.py` (prefix
`/leaderboard`), `routers/story.py` (prefix `/runs`, tag `story`). Services have
the same file names.

**Contract rules**

- **POST may spend OpenAI credits; GET never does.** Crawlers, link prefetchers
  and the smoke test only ever send GETs.
- **Story endpoints never fail because of the AI.** A timeout, exhausted credit,
  missing keys or `AI_MODE=off` all return pre-written content with
  `source: "fallback"` (templated with the character). Only narration answers
  503, because the server has no fallback audio; the frontend then plays the
  pre-generated mp3 for that ending.
- **Story endpoints are idempotent per run.** Results are cached in Redis, so a
  second call returns the same content and spends nothing.
- `apiGenerateEpilogueSpeech` is the one client function that doesn't return
  JSON: it returns `ApiResult<string>` holding an object URL for an `<audio>`
  element. Revoke the URL on unmount.
- In `live` AI mode, `create_run` checks the name with OpenAI's free moderation
  endpoint; a flagged name answers 422 "Please choose another name". In
  `off`/`fake` mode only the character rules apply.
- Scores are reported by the client. Nothing here is cheat-proof, and for a
  hackathon game it doesn't need to be.
- If Redis is unreachable, an exception handler in `main.py` answers 503
  "Storage is unavailable, try again in a moment". `/api/health` stays
  dependency-free.

## Backend layout

```
backend/
├── app/
│   ├── main.py · config.py · frontend.py · schemas.py      (exist)
│   ├── db.py              get_redis(): the only place that creates a Redis client
│   ├── ai.py              the only module that imports openai: AI_MODE, key failover,
│   │                      daily cap, timeouts, usage logging
│   ├── prompts.py         all prompt text and structured-output schemas
│   ├── routers/           health (exists) · runs · leaderboard · story
│   └── services/          runs · leaderboard · story
│                          endings.py    pure: scores → ending (no router of its own)
│                          fallbacks.py  pre-written dialogue and epilogues
├── tools/                 ai_check.py · generate_art.py (command line; not in the image)
└── tests/                 conftest (fakeredis, FakeAI, network blocked) · test_runs ·
                           test_endings · test_leaderboard · test_story · test_ai
```

Services stay free of FastAPI imports. They return `None` for "not found" and
raise small domain errors such as `RunStateError` for conflicts; routers turn
those into 404 and 409.

## Redis data model

| Key | Type | Holds |
|---|---|---|
| `run:{id}` | string | `Run` as JSON (`model_dump_json` / `model_validate_json`) |
| `leaderboard` | sorted set | member `runId`, score `totalScore` |
| `endings:count` | hash | `endingId` → count |
| `story:dialogue:{runId}:{scene}:{stage}` | string | `DialoguePack` JSON; `stage` = number of finished minigames |
| `story:epilogue:{runId}` | string | `Epilogue` JSON |
| `story:speech:{runId}` | bytes | narration mp3, 24 h TTL |
| `ai:calls:{yyyy-mm-dd}` | integer | daily AI call counter, 48 h TTL |
| `ai:key:{index}:dead` | flag | key number `index` is invalid or out of credit, 1 h TTL (never the key itself) |

- **Container**: `public.ecr.aws/docker/library/redis:8-alpine` running `redis-server --appendonly yes`
  (AOF with `fsync` every second, so a crash loses at most about one second of
  writes), a named volume `redis-data:/data`, a `redis-cli ping` healthcheck, and
  **no `ports:` entry**. Redis has no password here; an exposed port gets
  compromised fast.
- **Development without Docker:** when `REDIS_URL` is empty, `db.py` uses an
  in-process fakeredis. Data then resets on every `--reload`, as before.
  `make redis` starts a real one on `127.0.0.1:6379` for anyone who
  wants persistence locally. Production refuses to start without `REDIS_URL`.
- New keys get a row in this table in the same PR.

## OpenAI integration

### Where the API keys live

| Where | What goes there | Who |
|---|---|---|
| `backend/.env` on your laptop (git-ignored; copy `.env.example`) | **Your own** key in `OPENAI_API_KEYS`, and `AI_MODE=off` (the default). Use `fake` for UI work; `live` only when you work on prompts or voice on purpose | Only the people who work on AI text, voice or art. Everyone else needs no key |
| The server `.env` on the event VM (`chmod 600`): `~/app/.env` when CD deploys with `compose.prod.yaml`, or `backend/.env` in the clone when deploying by hand ([PLAYBOOK.md → Deployment target](PLAYBOOK.md#deployment-target)) | The **production failover chain** `OPENAI_API_KEYS=key1,key2,key3`, and `AI_MODE=live` | The integrator; each key owner pastes their own key over SSH |
| `backend/.env` on the demo laptop, when it runs `make prod` itself | Same as the VM | The integrator |
| Git, issues, PRs, GitHub Actions secrets, chat, screenshots, frontend code, the Docker image | **Nothing, ever** | |

- **In code:** `app/config.py` reads `OPENAI_API_KEYS` (comma-separated) into a
  `list[SecretStr]`, which hides the values in reprs and logs. Only `app/ai.py`
  uses them. Logs show at most `sk-…abcd`. API responses never contain keys or
  raw OpenAI error bodies.
- **Split the six keys:** three go to the VM failover chain and are never used
  in development, so the demo budget is protected. Three go to the people
  working on AI text, voice and art.
- **On platform.openai.com, for each key:** a project for this event, a key
  restricted to the endpoints we use (responses, audio, images, moderations,
  models), and a project budget limit below the $100 grant.
- **Leaks:** if a key ever lands in git, chat or a screenshot, revoke it
  immediately and put a new one in the `.env`. Revoking is what protects us;
  rewriting history is not needed (and never on `main`).
- **After the event:** revoke all six keys.
- *(planned)* `.githooks/pre-commit` refuses commits that contain `sk-` keys;
  `make install` enables it with `git config core.hooksPath .githooks`.

### `AI_MODE`

| Mode | Behavior | Used by |
|---|---|---|
| `off` (default) | No OpenAI calls. Story endpoints return the fallback instantly; narration answers 503; name moderation is skipped | Everyone by default, all tests, CI |
| `fake` | No OpenAI calls. Canned AI-style content after a 1–2 s delay, `source: "ai"`, and a sample mp3 for narration | UI work on loading states, typewriter and audio |
| `live` | Real OpenAI calls through the key chain, with cache, cap and fallback | The production VM; deliberate prompt and voice work |

`live` without keys behaves like `off` and logs one warning.

### Key failover and limits

- Keys are used **in order**. On a 401 (invalid key) or a 429 whose error code is
  billing-related (`insufficient_quota`, `credit_balance_exhausted`,
  `organization_spend_limit_exceeded`, `project_spend_limit_exceeded`), the key
  is marked dead in Redis for an hour and the call is retried once with the next key.
- On an ordinary rate-limit 429 or a timeout, the **same** key is retried once,
  then the call falls back. We do not spread requests over several keys to dodge
  rate limits: that can breach OpenAI's terms, and at our scale we won't hit them.
- `OPENAI_TIMEOUT_SECONDS=12`, at most one retry, `max_output_tokens` capped per prompt.
- `AI_DAILY_CALL_LIMIT` (default 3000) is counted in Redis; above it everything
  falls back. This protects the credits if someone scripts our public endpoints.
- Every call logs the model, latency and token usage (no prompt text), so spend
  is visible in `docker compose logs`.

### What each use costs

Estimates from the published prices on 2026-10-09; check the dashboard before
large batches.

| Use | Model (setting) | When | Cost |
|---|---|---|---|
| Dialogue pack | `gpt-6-luna`, reasoning effort `none`, Structured Outputs (`OPENAI_TEXT_MODEL`) | Prefetched once per scene and stage, while the intro screen shows | ≈ $0.0003 each |
| Epilogue | `gpt-6-luna` | Once per graduated run | ≈ $0.0003 |
| Narration | `gpt-4o-mini-tts`, voice `cedar`, `instructions` "pompous university rector…" (`OPENAI_TTS_MODEL`, `OPENAI_TTS_VOICE`) | Once per epilogue | ≈ 1–2 ¢ per minute of audio |
| Name moderation | `omni-moderation-latest` | Once per enrollment, `live` only | free |
| Art, offline | `gpt-image-2.5-sunburst`, webp (`OPENAI_IMAGE_MODEL`) | `make art`, reviewed by a human, committed | ≈ $0.05–0.25 per image |

A full live playthrough costs about 2 ¢, so the credits are not the bottleneck;
abuse and latency are, and both are handled above.

### Prompts and safety

- All prompt text and structured-output schemas live in `app/prompts.py`;
  services fill them with character and run data.
- The character goes into the prompt as **data** (JSON in the user message).
  Only `name` is free text, and it is restricted by the character rules and
  moderated. The system prompt says the player data is untrusted and must not
  change the instructions.
- Tone: playful satire about ETH life. No insults about real people,
  nationalities or protected traits; no real brands or logos in images; English;
  epilogue ≤ 120 words; dialogue lines ≤ 18 words.
- Dialogue packs use Structured Outputs with the fixed event keys of each scene,
  so the games always get the keys they expect.

## Testing strategy: zero credits by default

Credits are spent only by a person, on purpose, in `live` mode. Automated tests
cannot spend them, by construction:

| Layer | Tool | What it guarantees |
|---|---|---|
| Backend logic and API | pytest, TestClient, fakeredis | `conftest.py` forces `AI_MODE=off` with no keys, swaps `app.ai` for `FakeAI`, and blocks all network access with **pytest-socket** (`--disable-socket --allow-unix-socket`): an accidental real HTTP call fails the test immediately |
| AI plumbing (`ai.py`) | pytest with a fake OpenAI client object | Key order, dead-key marking, daily cap, timeout → fallback, error mapping, all without the network |
| Story features | pytest with `FakeAI` | A cache hit doesn't call `FakeAI` again (assert the call count); fallback content when `FakeAI` raises; 404 and 409 rules |
| Endings | pytest | Every tier boundary: 24/25, 44/45, 64/65, 84/85 |
| Pure frontend logic | vitest *(planned)* | Blackjack rules and scoring, gesture detection on synthetic and recorded landmarks, the One-Euro filter, `run.ts` |
| Docker smoke | `scripts/smoke.sh` | Read-only GETs only, never a story POST. CI has no keys, so no AI call can happen |
| Performance (game + CV) | In-page perf overlay (`?debug=1`), real browser | Frame times (p50/p95), detection time and draw calls, measured on the demo laptop and on the weakest team laptop with the camera on. Never on the VM or in CI: neither has a GPU, so the browser falls back to software rendering and the numbers mean nothing |
| Manual, UI | Browser with `AI_MODE=fake` | Loading states, typewriter, audio, all without credits |
| Manual, live | Browser with `AI_MODE=live` and your own key | Only the story and art owners, on purpose; about 2 ¢ per full playthrough |
| Pre-demo rehearsal | VM in `live` mode | About 10 full runs, about 20 ¢ |

`make ai-check` verifies every key without spending anything: it
only lists the models per key (free) and prints `key …abcd: ok / invalid / model missing`.
`make ai-check LIVE=1` adds one 1-token call per key to detect exhausted credit
(a fraction of a cent).

If a test needs the real API, it is not a test: it is a manual check, and you
announce it to the team first.

## Failure modes (demo safety)

| Failure | What the player sees |
|---|---|
| OpenAI down, out of credit, or no keys | Pre-written dialogue and epilogue (templated), pre-generated narration mp3 |
| Camera denied, busy or missing; model not loaded | Mouse mode, a short message, the round continues |
| Hand lost mid-round | Crosshair hidden, "Show your finger gun"; could: the round timer pauses |
| Saving a score fails | The result stays on screen with **Retry**; we never navigate away with an unsaved score |
| Redis down | API answers 503 with a readable message; pages show "Campus is closed, try again in a moment" |
| WebGL unavailable | Phaser falls back to Canvas in both games; gameplay never depends on WebGL-only effects (glow, filters) |
| WebGL context lost mid-round | The round pauses with "Graphics interrupted"; it resumes when the context is restored, or the player retries |
| Page crash or refresh | The state is in Redis; reloading continues the run |
| Unknown or old run id | Redirect to `/` (unknown) or `/graduation` (graduated) |

## Deployment

- `compose.yaml` and `compose.prod.yaml` run a second service,
  `redis` (see "Redis data model"). `app` gets `REDIS_URL=redis://redis:6379/0`
  and waits until Redis is healthy. `AI_MODE` comes only from the server's
  `.env` (default `off`), never from the Compose files, so a local `make prod`
  can't spend credits by surprise.
- Secrets: see "Where the API keys live". CD needs no OpenAI secret; the
  server's `.env` holds them.
- **The camera needs a secure origin.** In order of preference:
  1. HTTPS on the VM, if the organizers provide a hostname and TLS (or Caddy with
     automatic TLS when we have a domain and ports 80/443);
  2. on the demo laptop, an SSH tunnel `ssh -L 8000:localhost:8000 <user>@<vm>`,
     then `http://localhost:8000` (localhost counts as secure);
  3. the demo laptop runs `make prod` itself.

  Judges' own devices need option 1. Decide by T+4h and record it in the
  "Event facts" issue.
- **The VM never renders anything.** WebGL and hand tracking run in the
  player's browser on the player's GPU; the VM serves files and the API. Game
  FPS is therefore a property of the player's laptop. The only setup where the
  VM's hardware would matter is a browser running *inside* the VM (remote
  desktop): avoid it, it has no GPU and no webcam.
- **What the VM does carry:** the shooter page's first visit downloads about
  20 MB of MediaPipe files (12.4 MB wasm runtime + 7.8 MB hand model; see
  STACK.md → Measured download sizes). Responses are compressed with
  Starlette's `GZipMiddleware` in `main.py`, and start the download while the
  shooter intro screen is showing. Revalidation (`Cache-Control: no-cache` with
  ETags) already makes later visits cheap.
- One uvicorn worker stays. With all state in Redis more would be safe, but we
  don't need them.

## Ownership and build order

| Track | Owns | First deliverable |
|---|---|---|
| A. Backend and release | `routers/` + `services/` `runs`, `leaderboard`, `endings.py`, `db.py`, Redis in Compose, deployment, TLS or tunnel | Runs API with Redis in Compose |
| B. AI and story | `ai.py`, `prompts.py`, `fallbacks.py`, `routers/story.py`, `services/story.py`, `backend/tools/` | Story endpoints that return fallbacks, then `live` |
| C. Shell and UX | Pages `index`, `enroll`, `campus`, `graduation`; `MinigameHost`, `run.ts`, design tokens, Legi card | Enroll → campus → graduation with stub data |
| D. Blackjack (Phaser 2D) | `games/blackjack/`, `components/blackjack/` | `rules.ts` with tests, then the scene |
| E. Shooter game (Phaser, isometric 2D) | `games/shooter/ShooterScene.ts` (Phaser scene, isometric art, fake depth), `hitTest.ts`, scoring, juice, `MouseInput` | Playable with the mouse |
| F. Shooter vision | `games/shooter/input/`, model and wasm hosting, debug overlay, recordings | The T+6h CV gate ([SHOOTER_CV.md](SHOOTER_CV.md)) |

1. **T → T+2h: contract PR** (A, B and C together): the types in `schemas.py` and
   `CommonInt.ts`; stub routers that return fixed data; the `apiClient.ts`
   functions; `minigame.ts`; page skeletons; `run.ts`; the `items` example and the
   `about` page removed. Merge it first; everyone branches from it. Meanwhile F
   builds the throwaway CV spike.
2. **T+2h → T+8h: walking skeleton on the VM.** Enroll → campus → stub minigames
   (a "Finish with score" button) → graduation with the fallback epilogue; Redis
   in Compose; secure origin decided; `make smoke` against the VM.
3. **T+8h → T+24h:** real blackjack; real shooter (mouse first, then the camera);
   AI `live` behind `AI_MODE`; art via `make art`.
4. **T+24h → D-6h:** juice, perks, Hall of Fame, narration, CV tuning at the
   venue with recordings, playtests with people outside the team.
5. **D-6h:** feature freeze ([PLAYBOOK.md](PLAYBOOK.md)).

### Build status

- [x] Contract PR: types, routers, client functions, `minigame.ts`, page skeletons, example removed (#12)
- [x] Redis: `db.py`, Compose service, fakeredis in tests (#12)
- [x] Runs API, endings, leaderboard (#12)
- [x] Story API: `ai.py`, `AI_MODE`, fallbacks, cache, daily cap, pytest-socket, `make ai-check` (#12)
- [x] Pages: index, enroll, campus, graduation, as working skeletons (#12)
- [ ] Blackjack (a placeholder scene is wired in)
- [ ] Shooter with the mouse, then with the camera (a placeholder mouse round is wired in)
- [ ] Generated art and fallback narration
- [ ] Deployed on a secure origin
- [ ] vitest, and adding it to CI (changing `ci.yml` needs an explicit OK from the team)
