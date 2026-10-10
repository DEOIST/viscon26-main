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

## Minigame 1: Galton Blackjack ("Casino night")

You bet your semester stipend of 1 000 chips at the casino. It is blackjack
where every seat owns a Galton board (9 columns) instead of a hand: each drawn
card turns its suit symbols into balls that fall through the pins into the
board's columns. A normal curve is drawn over the columns. Going over it is the
new "over 21"; landing on it three times is the new blackjack.

- **Flow:** 10 hands, or until you can't cover the minimum bet of 10. Leaving
  through the shell's back button ends the round without a score.
- **Bets:** click chips (1, 5, 10, 25, 50, 100, 500, 1000) onto the bet pile;
  click a chip on the pile to take it back. The next hand starts with the same bet.
- **Deck:** 52 cards without Jokers, freshly shuffled every hand.
- **Balls per card:** Ace 1, 2–10 one per suit symbol, J/Q/K 10. Each ball
  bounces left or right with equal chance at each of the board's 8 pin rows.
- **Ball colour, fixed on landing:** each column holds a fixed number of balls
  under the curve (**green**), then the one the curve crosses on the column's
  centre line (**yellow**); every further ball is above it (**red**). Columns
  0–8 hold Y, GY, GGY, GGGGGY, GGGGGGY, GGGGGY, GGY, GY, Y.
- **Opening deal:** two cards onto your board; one open card onto the dealer's
  board plus one secret card kept face down.
- **Your turn:** Hit, Stand, or Double (only right after the opening deal:
  doubles the bet, exactly one more card, then the dealer plays).
- **Dealer's turn:** the secret card is revealed and dropped, then the dealer
  draws while it has fewer than 10 balls.
- **Deciding the hand:** the first decisive ball wins. On your board a red ball
  is a bust (bet lost) and the third yellow ball is a blackjack (instant win,
  pays 3:2). On the dealer's board red means you win and three yellow means the
  dealer wins. Otherwise more balls wins; equal counts push.
- **Score:** `clamp(round(50 × chips / 1000), 0, 100)`: keep your money = 50,
  double it = 100, broke = 0. The result's `stats` are `bankroll` and `hands`.
- **Your seat:** the character you built sits in the bottom-right portrait,
  animated. Idle, it breathes, sways, blinks and glances around; when a hand goes
  wrong (a red ball on your board, three yellow on the dealer's, or fewer balls)
  it cries, and when it goes right it throws its arms up, jumps and sprays
  confetti, with a spin for a blackjack. The mood settles at the next hand. The
  shapes are shared with the builder's portrait (`frontend/src/avatarArt.ts`);
  the moods live in `frontend/level2/PlayerAvatar.ts`.
- **Dealer lines** (AI dialogue event keys): `intro`, `deal`, `playerBlackjack`,
  `playerBust`, `dealerBust`, `win`, `lose`, `push`, `broke`, and `cashOut`
  (said when you finish the ten hands ahead). Without a dialogue pack the game
  uses its own lines (`frontend/level2/lines.ts`). The keys, the AI's speaker
  description and the fallback lines are in `backend/level2/dialogue.py`.
- **Balance:** the curve (the expected stack of 26 balls, 1.2 times wider than
  the binomial the balls follow), the three yellows and the dealer's limit of
  10 were searched together by simulation for odds close to classic blackjack.
  Two million hands through `rules.ts` (player hits below 12 balls, never
  doubles):

  | | Galton Blackjack | Classic blackjack |
  |---|---|---|
  | House edge | 0.5 % | ~0.5 % |
  | Player blackjack | 4.8 % | 4.75 % |
  | Player loses | 49.4 % | ~49 % |
  | Dealer busts (when it plays) | 27 % | ~28 % |
  | Wins / pushes | 46.5 % / 4.1 % | ~42 % / ~8.5 % |

  Busts are more common than in classic blackjack (34 % of hands) and pushes
  rarer, because ball counts spread wider than card totals.
- **Code:** blackjack is level 2: the game in `frontend/level2/`, its server
  side in `backend/level2/`. The rules (`rules.ts`, with unit tests) decide every
  card, ball path, landing slot and colour, and emit an event log; the Phaser
  scene only plays it back. Board geometry and the curve are in `board.ts`,
  tunables in `config.ts`. Cards are composed from the frame, number, symbol
  and people sheets, so each pip is its own sprite and can turn into a ball.
- **Table:** 1000 units tall and as wide as the shared 16:9 canvas
  (`layout.ts`); the scene's camera zooms it onto the 1280 × 720 game canvas
  every minigame uses.
- **Not in this version:** the archetype perks above, split, sound, the 5- and
  7-column boards.

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

## Minigame 3: Thesis defense (Year 3, level 3)

Guitar Hero meets your thesis defense. A three-professor examination committee
fires questions down a four-lane neon highway; you answer each one by pressing
its lane's key as it crosses the hit line. Keyboard only, no audio, no server
side: the code is in `frontend/level3/`.

- **Controls:** `D` Theory (∀), `F` Proofs (∫), `J` Experiments (χ²),
  `K` Critique (?!). `Space` starts and spends Eureka, `Esc`/`P` pauses (also
  automatic when the tab loses focus), `R` restarts from the pause or the verdict,
  `Enter` submits the thesis.
- **Chart:** one deterministic 31-bar chart at 128 BPM (about 58 s), written in
  `chart.ts`, so practice pays off. Four phases, each opened by an empty bar
  for its banner: *Opening questions* (quarters and eighths), *Cross-examination*
  (chords), *Professor meltdown* (Prof. Gradient's sixteenth-note bursts) and
  *Final defense* (the densest bars, ending on a golden four-key "QED" chord).
  Beat lines on the highway and a hall that pulses on every beat replace the
  music's timing cues; chord notes are linked by a bar.
- **Judgment:** by the key event's own timestamp, ±45 ms PERFECT, ±90 GREAT,
  ±135 GOOD, later is a MISS. A press with no note in its window is a stray: it
  breaks the combo and costs a little confidence, so mashing never pays. A
  timing meter under the receptors shows where recent presses landed.
- **Score:** 100/70/40 points × multiplier (+1 every 10 combo, max 4×; Eureka
  doubles it); golden notes add 50. Golden notes fill the Eureka meter (four
  fill it); `Space` then gives 8 s of double points and halves miss damage.
- **Thesis confidence:** starts at 70/100, +2/+1.5/+1 per hit, −4 per miss,
  −2 per stray. At 0 the defense fails. Simulated players who hit about two
  thirds of the notes survive; a flawless run scores 100.
- **Milestones:** 10 combo "PROMISING RESEARCH", 25 "PEER REVIEW SURVIVED",
  50 "ACADEMIC WEAPON", 75 "CITED BY EVERYONE", 100 "TENURE TRACK UNLOCKED",
  150 "FIELDS MEDAL SPEEDRUN"; 25 PERFECTs in a row "NOBEL PRIZE INCOMING".
- **Verdict:** SUMMA CUM LAUDE (≥ 93 % accuracy), THESIS DEFENDED (≥ 80),
  CONDITIONAL PASS (≥ 65), MAJOR REVISIONS REQUIRED, or ACADEMICALLY DESTROYED
  when confidence ran out, plus an ETH grade (1–6 in quarter steps, never a pass
  for a failed defense). The personal best lives in `localStorage` only.
- **Contract score:** the weighted share of all notes (1 / 0.8 / 0.5 / 0),
  unplayed notes of a failed defense count as misses; the best attempt of the
  visit is sent once, when the player submits.

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
3. Blackjack: up to ten hands (`HANDS` in `frontend/level2/config.ts` sets the length).
4. Shooter: calibration, then 60 s of finger-gun shooting. **This is the wow.**
5. Graduation: open the diploma; the career and a personal epilogue are read aloud.

About 3 minutes in total. Fallbacks: mouse mode (`M`), pre-written epilogue,
recorded video of a perfect run.

## Open questions

- Final name of the game.
- Shooter `PAR` and the blackjack hand count (10 today), after the first playtest.
- Whether the organizers allow AI-generated art (ask in the "Event facts" issue).
