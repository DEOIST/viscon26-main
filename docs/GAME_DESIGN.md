# Game design: ETH Life (working title)

What we are building, for everyone on the team: code, art and pitch. How it is
built is in [ARCHITECTURE.md](ARCHITECTURE.md), the finger-gun computer vision
in [SHOOTER_CV.md](SHOOTER_CV.md), the tools in [STACK.md](STACK.md).

> **One-liner:** Create your ETH student, survive a casino night that decides
> your stipend and a webcam finger-gun shootout against the Basisprüfung, and
> find out whether you graduate into the C-suite or the McDonald's at Zürich HB.

**The wow moment, protect it at all costs:** a judge makes a finger gun, sees
their own hand tracked on screen with a neon skeleton, and shoots exam questions
that fly at them out of the depths of an isometric exam hall. No controller, no install, nothing leaves
the laptop.
Everything else in the game frames that moment.

## Player journey

| # | Page | What happens | API |
|---|---|---|---|
| 1 | `/` Title | Logo, **Enroll at ETH**, Hall of Fame (top 10: avatar, name, department, career) | `GET /api/leaderboard` |
| 2 | `/enroll` Character creator | Name, pronouns, department, archetype, avatar, with a live preview as a Legi (student ID card). **Matriculate** starts the run | `POST /api/runs` |
| 3 | `/campus` Story hub | Your Legi card, semester banner, a study advisor who talks about *you*, two activity cards, **Graduate** once both are done | `GET /api/runs/{id}`, `POST …/dialogue` |
| 4 | `/blackjack` | Casino night: bet your stipend | `POST …/scores` |
| 5 | `/shooter` | Basisprüfung: shoot exam questions with your finger gun | `POST …/scores` |
| 6 | `/graduation` | Click **Open your diploma**: career reveal, ending art, your epilogue typed out and read aloud by the rector, your rank, **Play again** | `POST …/graduate`, `…/epilogue`, `…/epilogue/speech` |

- The player picks the order of the two minigames.
- Replaying a minigame before graduation overwrites its score, so a crashed
  demo round can simply be played again.
- Graduation locks the run: the career is final and the run enters the Hall of Fame.

## Character creation

Every run starts with a character, so the story is about *this* student, not a
generic one. The character drives the art (avatar), the AI-written text
(dialogue, epilogue, narration) and one small gameplay perk.

| Field | Values | Used for |
|---|---|---|
| Name | 1–20 characters: letters (accents allowed), digits, space, `. ' _ -` | Everywhere. In `live` AI mode it is checked with OpenAI's free moderation endpoint before the run is created, because the narrator reads it aloud on stage |
| Pronouns | she / he / they | AI text and narration |
| Department | the 16 ETH departments (table below) | AI jokes, Legi card, Hall of Fame |
| Archetype | Nerd, Risk-taker, Gamer, ASVZ athlete | Personality in AI text, plus one perk (below) |
| Avatar | 8 preset portraits `a1`–`a8` (generated offline in one style; placeholders until then) | Legi card, hub, graduation, Hall of Fame |

Departments (`DepartmentId` → label):

| Id | Label | Id | Label |
|---|---|---|---|
| `arch` | Architecture (D-ARCH) | `itet` | Information Technology and Electrical Engineering (D-ITET) |
| `baug` | Civil, Environmental and Geomatic Engineering (D-BAUG) | `math` | Mathematics (D-MATH) |
| `biol` | Biology (D-BIOL) | `matl` | Materials (D-MATL) |
| `bsse` | Biosystems Science and Engineering (D-BSSE) | `mavt` | Mechanical and Process Engineering (D-MAVT) |
| `chab` | Chemistry and Applied Biosciences (D-CHAB) | `mtec` | Management, Technology, and Economics (D-MTEC) |
| `erdw` | Earth Sciences (D-ERDW) | `phys` | Physics (D-PHYS) |
| `gess` | Humanities, Social and Political Sciences (D-GESS) | `usys` | Environmental Systems Science (D-USYS) |
| `hest` | Health Sciences and Technology (D-HEST) | `infk` | Computer Science (D-INFK) |

### Archetype perks (small, tunable)

| Id | Archetype | Flavor | Perk |
|---|---|---|---|
| `nerd` | Nerd | Lives in the HG library | Blackjack: shows a card-counting hint (Hi-Lo running count) |
| `risk_taker` | Risk-taker | "Stipend? What stipend?" | Blackjack: starts with 1 200 CHF instead of 1 000 |
| `gamer` | Gamer | 300 APM, zero sleep | Shooter: targets 15 % larger |
| `athlete` | ASVZ athlete | At the ETH gym at 7 am | Shooter: trigger re-arms 30 % faster |

Perks only act inside the minigames. The scoring formulas stay the same
(blackjack still scores against 1 000 CHF), so a perk is a real advantage. Game
owners tune the numbers after playtests.

## Minigame 1: Blackjack ("Casino night")

You bet your semester stipend of 1 000 CHF at the casino.

- **Rules:** one 52-card shoe that persists between hands and is reshuffled
  when fewer than 15 cards remain (so the Nerd's count hint means something);
  dealer stands on all 17s; blackjack pays 3:2; double down on the first two
  cards; no split, no insurance (could: split).
- **Flow:** up to 6 hands, or until you can't cover the minimum bet, or you click **Cash out**.
- **Bets:** 50 / 100 / 200 CHF chips.
- **Score:** `clamp(round(50 × bankroll / 1000), 0, 100)`: keep your money = 50,
  double it = 100, broke = 0.
- **Dealer lines** (AI dialogue event keys): `intro`, `deal`, `playerBlackjack`,
  `playerBust`, `dealerBust`, `win`, `lose`, `push`, `broke`, `cashOut`.
- **Pure logic** (shoe, hand value with soft aces, dealer play, settlement,
  score) lives in `games/blackjack/rules.ts` with unit tests. The Phaser scene
  only renders and handles input.

## Minigame 2: Finger-gun shooter ("Basisprüfung")

The Basisprüfung, ETH's first-year exam block, attacks: exam questions fly
toward you out of an isometric exam hall (2D art that fakes depth, in Phaser),
layered over your own mirrored webcam image. Make a finger gun, aim with your
index finger, drop your thumb to shoot. The technical design is in
[SHOOTER_CV.md](SHOOTER_CV.md). Both minigames use Phaser.

- **Controls:** finger gun via the webcam (hand tracking in the browser). The
  mouse (aim + click) is the automatic fallback when the camera is unavailable;
  the operator can force it with `M`.
- **Flow:** calibration doubles as the tutorial (shoot 3 practice targets:
  centre, top-left, bottom-right), then a 60-second round with a rising spawn
  rate. Could: a boss "Analysis I" paper in the last 10 seconds.
- **Targets:** exam question (1 hit, 10 points), deadline clock (fast, 25
  points), coffee (+3 seconds). Could: "F grade" decoys (−15 if shot), open-palm
  reload with a 6-shot magazine.
- **Score:** `points = target points + combo bonus − 2 × missed shots`;
  `score = clamp(round(100 × points / PAR), 0, 100)`, with `PAR` tuned so a good
  first-time player scores about 70.
- **Proctor lines** (AI dialogue event keys): `intro`, `streak`, `miss`,
  `halfway`, `boss`, `end`.
- **Juice is part of the feature, not polish:** papers that shatter when hit,
  muzzle flash at your fingertip, camera shake, hit-stop, particles, sound,
  combo counter, and the neon hand skeleton over your hand.

## Endings

The average of the two minigame scores picks the career. The server computes it
(`backend/app/services/endings.py`): thresholds are constants in one place, and
every boundary has a pytest case.

| Average | Ending id | Career | Epilogue tone |
|---|---|---|---|
| 85–100 | `c_level` | C-level executive | Absurd success, private jet to Davos |
| 65–84 | `big_tech` | Big-tech engineer in Zürich | Free lunch, endless reorgs |
| 45–64 | `phd` | Eternal PhD student | Year 7, "one more paper" |
| 25–44 | `mcdonalds` | McDonald's at Zürich HB | Best fries throughput in the canton |
| 0–24 | `unemployed` | Unemployed in a 6-person WG | Still looking for a flat |

All of this is parody: no real company logos anywhere (UI or generated art),
and no official ETH logo.

## Story hub (`/campus`)

- **Semester banner:** "Semester 1" → "Semester 2" → "Graduation day", by the
  number of finished minigames.
- **Study advisor:** a fictional NPC (e.g. "Dr. Gradient") with 3 lines per
  visit from the AI dialogue pack (event key `advisor`), reacting to your
  character and your last result.
- **Activity cards:** Casino night (blackjack) and Basisprüfung (shooter); each
  shows its score once played.
- **Graduate** unlocks when both scores exist.

## Graduation (`/graduation`)

1. The page loads, calls `graduate` (idempotent) and prefetches the epilogue and
   the narration while showing "The rector approaches the podium…".
2. The player clicks **Open your diploma**. That click also unlocks audio:
   browsers block sound until the user interacts with the page.
3. Reveal: ending art with your avatar framed in it, career title, epilogue
   typed out while the rector's voice reads it, your two scores, "X % of
   students share your fate", Hall of Fame rank, **Play again**.

If the AI is unavailable, the epilogue is a pre-written one for your ending
(templated with your name, pronouns and department) and the narration is the
pre-generated mp3 for that ending. The player never sees an error.

## Art and audio direction

One style for everything, so generated art, UI, the blackjack sprites and the
isometric shooter art match:

- **Image prompt style prefix** (kept with the art tool): flat vector
  illustration, bold outlines, ETH-inspired deep blue with a warm accent
  palette, playful and slightly satirical, no text, no logos.
- **Shooter perspective:** classic 2:1 isometric for the exam hall, desks, props
  and targets, so depth reads without a 3D engine.
- **Generated offline** (`make art`, reviewed by a human before committing):
  8 avatars, 5 ending scenes, backgrounds for campus, casino and exam hall,
  isometric target sprites (exam papers, clocks, coffee cups), 5 fallback narrations.
- **Third-party:** Kenney.nl (CC0) for cards, chips, UI, crosshairs, particles
  and isometric tiles and props; jsfxr for sound effects; one display font plus the
  system UI font (check licenses).
- Credit third-party assets in `frontend/public/CREDITS.md` (planned).
- Check the event rules on AI-generated assets and disclose their use in the README.

## Scope

| Priority | Items |
|---|---|
| **Must** | Character creation (all 5 fields; avatars may start as placeholders) · campus hub · blackjack · shooter with webcam finger gun, calibration and mouse fallback · scoring → ending · graduation reveal with fallback epilogue · runs stored in Redis · deployed and demoable with the camera |
| **Should** | AI dialogue packs · AI epilogue · narrator voice · generated art · Hall of Fame and ending stats · archetype perks · hand skeleton overlay and juice · name moderation |
| **Could** | Boss paper · open-palm reload · dual-wield (two hands) · webcam shader effect (Phaser filter on the video) · glow on the `sharp` quality setting · blackjack split · round timer pauses while the hand is lost · per-department stats |
| **Won't (this event)** | Accounts or login · multiplayer · phone support · walkable campus · runtime image generation |

## Demo script hook (draft for `docs/DEMO.md`)

1. A judge enrolls (name, department, archetype, avatar): about 20 s.
2. Campus: the advisor greets them by name and department ("the game knows me").
3. Blackjack: 2–3 hands; the operator can cash out to keep time.
4. Shooter: calibration, then 60 s of finger-gun shooting. **This is the wow.**
5. Graduation: open the diploma; the career and a personal epilogue are read aloud.

About 3 minutes in total. Fallbacks: mouse mode (`M`), pre-written epilogue,
recorded video of a perfect run.

## Open questions

- Final name of the game.
- Shooter `PAR` and the blackjack hand count, after the first playtest.
- Whether the organizers allow AI-generated art (ask in the "Event facts" issue).
