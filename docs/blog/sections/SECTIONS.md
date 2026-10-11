# ETH.fun blog: sections for the DEOIST blog editor

One section per block below: upload the PNG named in "Image" (from this folder), pick the
image position, and paste everything between the `--- content ---` and `--- end ---` lines into
Content. Sections without an image have "Image: none". Tables were turned into bullet lists
because the editor's Markdown support for tables is unknown.

Suggested post title: ETH.fun: three years of ETH in ten minutes, the first one played with your bare hand

==================================================================================
SECTION 1
Image: 01-cover.png
Position: Top
--- content ---
Every ETH student knows the arc by heart: a first year that decides whether you stay, a probability course that never quite clicks, and a thesis defense in front of a committee that has read every footnote. At VIScon Hackathon 2026, the five of us turned that arc into a game.

**ETH.fun** lets you enrol as a student, play one minigame for each year of study, and graduate into whatever career your ECTS can buy: quant researcher in Zug, PhD student in year seven, or still flat-hunting in Zürich. A full degree takes about ten minutes. The first year is played with your bare hand in front of a webcam.

This post covers the three games, the hand tracking behind the first one, and what the booth taught us.

## Built for a projector in a loud room

The setting shaped every decision. The game runs on one laptop mirrored to a projector, in a loud room, with people watching over the player's shoulder and turns that last about a minute.

That gave us four rules:

- **Every year is one short minigame with its own mechanic.** Nobody at a booth reads a manual.
- **Every screen has to read from three metres away.** Big numbers, high contrast, nothing subtle.
- **Nothing is allowed to block play.** No account, no install, no controller. Each browser gets an anonymous player ID, and the server keeps your character and progress.
- **Every failure has a way out.** If the camera fails, the round carries on with the mouse.
--- end ---

==================================================================================
SECTION 2
Image: 02-character-builder-and-letter.png
Position: Top
--- content ---
## Your first day

You start by building your student: a live student-ID preview with curated colour presets for hair, skin and eyes. An optional photo button measures your skin tone on the device and asks a vision model for hair and eye colour from a single still. It sends one image, only when you click, and it is never stored.

Then the unofficial admissions office writes back: *"Your potential is impressive. Your free time has been successfully unenrolled."*
--- end ---

==================================================================================
SECTION 3
Image: 03-first-day-intro.png
Position: Top
--- content ---
Then your first day happens. You beam "You got into ETH!", and then Lectures, Practice Classes and the Lernphase each land a hit, Minecraft style, until a final Emotional Damage leaves you crying on half a heart. Only then does your avatar take its seat in the sidebar. The scene can be skipped, and it stays out of the way of players who ask their system for reduced motion.
--- end ---

==================================================================================
SECTION 4
Image: 04-year-panels.png
Position: Top
--- content ---
Every year opens the same way: three illustrated how-to-play steps and a **Start lecture** button. When the year is done, its panel turns into a gauge of the ECTS it paid out of 60, with a line that teases you about your score ("Unreasonably good. Are you a TA in disguise?"). You can retry for glory, but the first result keeps its credits, and the server enforces that.
--- end ---

==================================================================================
SECTION 5
Image: 05-bug-bash.png
Position: Top
--- content ---
## Year 1: Bug Bash, played with your hand

*Introduction to Programming - Bug Bash* turns your first programming course into release day in an IDE. You play it with your hand in the air. The picture above is from a real round, played by one of us in front of a laptop webcam; the cartoon hand is drawn from the 21 landmarks our server tracks in every camera frame.

Pixel-alien bugs crawl over the code. Working-code cards arrive with a lit bomb fuse. Colleagues wander in with "Quick call?", "Works on my machine!" and "Can you fix my printer?". Three gestures handle all of it:

- **Pinch** a bug between thumb and index finger, move your hand, and open your fingers to throw it off the screen.
- **Swipe** an open hand across a card before its nine-second fuse reaches the bomb.
- **Slap** to knock out the colleague who is interrupting you.

A round lasts 60 seconds. A thrown bug is worth 10 points, saved code 25 and a dismissed colleague 15, and the third catch in a row starts a streak bonus of 5 per catch. An escaped bug costs 5, exploded code 15 and an empty grab 2. 325 points earn the year's full 60 ECTS.

Year 1 didn't start out like this. The first version was a finger-gun shooter: you aimed with your index finger and dropped your thumb to fire. By Saturday evening it had turned into Bug Bash, on the same camera pipeline with new gesture rules on top.
--- end ---

==================================================================================
SECTION 6
Image: none
--- content ---
## Why the hand tracking runs on our server

Our first plan was MediaPipe in the browser. Early in the weekend we moved hand tracking to the Python backend instead:

- **The browser stays light.** It only captures the camera, encodes a small JPEG per frame and draws the game. There's no 12 MB WASM runtime to download, and no hand model competing with Phaser for the GPU.
- **The gesture logic is plain Python with pytest coverage.** It sits next to the MediaPipe wrapper and a test that runs the real model on a real photo.
- **It costs nothing per frame.** MediaPipe runs on the server's CPU, with no API involved.

The price is a network hop on every frame, so we budgeted the latency explicitly. A small `FramePacer` in the browser keeps exactly one frame in flight and never sends the same frame twice. Each 640 px JPEG goes over a WebSocket, MediaPipe finds up to two hands, our gesture code turns the 21 landmarks into events, and about a kilobyte of JSON comes back. The moment it arrives, the next frame goes out.

We measured the pipeline on an Apple M4 on 10 October. That was still the finger-gun version, before the pinch and slap rules existed:

- **Engine time per 640 px frame of a real hand:** 9.7 ms median, 12.9 ms p95
- **Round trip on localhost:** 10.7 ms native, 26.1 ms in the production Docker image
- **Four players at once:** 26 ms median and at most 32 ms p95 round trip each
- **Engine answers per second in the browser:** 30.1, limited by the camera (17 before `FramePacer`)

Four players at once still get their answers in about 26 ms each, because MediaPipe releases Python's GIL while it works and the sessions run in parallel in the server's thread pool.
--- end ---

==================================================================================
SECTION 7
Image: 06-pinch-check.png
Position: Top
--- content ---
## Twenty-one points, three gestures

MediaPipe gives us 21 points per hand and nothing more. Every gesture in Bug Bash is our own geometry on top.

**A pinch calibrated to your hand.** Hands and cameras differ, so every round starts with a pinch check: fingers apart, pinched, apart, pinched. The engine takes the 20th percentile of your open readings and the 80th of your pinched ones, and demands a gap of at least 0.15 palm widths between them. It then places grab and release at 30 % and 70 % of that gap. That hysteresis keeps a held bug from dropping when your fingers tremble. If your gap is too small, the check asks you to separate your finger and thumb more and tries again.

**Throws decided by the scene.** A grab reaches 1.8 times a bug's size, and the held bug follows the midpoint of thumb and index. A release counts as a throw after 100 game pixels of travel or at 650 pixels per second; anything slower drops the bug back. A hand that drops out of tracking gets 350 ms of grace before the bug falls.

**Swipes that only touch what they cross.** A swipe needs at least 12 % of the camera width within 0.9 seconds, an average of 0.3 widths per second, and a mostly straight path. It then saves only the cards and colleagues touched by the swept outline of the whole hand between two frames: palm, thumb and fingers.

**Slaps, even when the hand is a blur.** A fast slap covers 35 % of the frame in a quarter of a second. It saves every burning card and knocks out the visitor without any aiming. A hand that moves too fast for MediaPipe to see still counts: when at least a quarter of the watched area changes and the changed region moves at 0.9 frame widths per second, the engine calls it a slap.
--- end ---

==================================================================================
SECTION 8
Image: none
--- content ---
## A video endpoint anyone can open

Anyone who can load the page can open the WebSocket, so we treat every frame as hostile input. Frames must be JPEG, at most 200 KB and 1280 px per side, checked from the header before decoding. An image side of 32,767 px or more aborts OpenCV inside MediaPipe and would take down the whole server process, so that limit is checked again right before the detector runs. Four camera slots are available at once, and idle streams are closed after 20 seconds. Every failure (busy, unavailable, idle, a denied camera, an insecure origin) switches the round to the mouse instead of stopping it.
--- end ---

==================================================================================
SECTION 9
Image: 07-gauss-jack.png
Position: Top
--- content ---
## Year 2: blackjack on a Galton board

*Probability Class - Gauss Jack* is probability theory at a casino table: a blackjack variant we designed around the normal distribution. The picture above is hand two of a real game: all 150 remaining chips on the table, then three yellow beads for a blackjack that pays 3:2.

Every seat owns a Galton board instead of a hand. Each card turns its suit symbols into beads (an ace drops one, a face card ten) that bounce through eight rows of pins into nine columns, under a bell curve drawn over the board. A bead that lands under the curve is green, the one the curve crosses is yellow, and anything above it is red.

- Any red bead busts the board.
- Three yellow beads without a red one are a blackjack, which pays 3:2.
- Otherwise, more beads beats the dealer, who draws below ten.

You get three hands and a 300-chip stipend. Keeping your stipend scores 50 and doubling it scores 100. The character you built sits at the table and reacts to every hand: it cries at a red bead and throws confetti at a blackjack.
--- end ---

==================================================================================
SECTION 10
Image: 08-gauss-jack-game-over.png
Position: Top
--- content ---
## Balanced by simulation, then by a playtest

The rules engine decides every card, bead path and colour, and emits an event log. The Phaser scene only plays that log back, so the whole game can be tested without a renderer. That also made it easy to balance. The curve's width (1.2 times the binomial over an expected 26 beads), the three-yellow blackjack and the dealer's stop at ten beads were tuned together by simulation until the odds sat close to classic blackjack: a 0.5 % house edge.

Then a playtest found two rules we hadn't written. A blackjack could be paid out with a red bead on the board, which happened in 2.5 % of hands, and a dealer with a red bead wasn't counted as bust (1.5 %). We made any red bead a bust, because that is a rule a player can read at a glance. Two million simulated hands through the current rules give:

- **House edge:** 2.3 % in Gauss Jack, about 0.5 % in classic blackjack
- **Player blackjack:** 3.0 % in Gauss Jack, 4.75 % in classic blackjack
- **Dealer busts (when it plays):** 27 % in Gauss Jack, about 28 % in classic blackjack

The house edge went up, and we kept it. A rule everyone understands beats a slightly fairer one nobody can follow from three metres away. The game-over screen above shows how that night went: 225 chips, 75 down, and 23 of 60 ECTS.
--- end ---

==================================================================================
SECTION 11
Image: 09-thesis-defense.png
Position: Top
--- content ---
## Year 3: defending your thesis to the beat

Your bachelor thesis is open in a PDF viewer, and you defend it live against a three-professor committee. It is a four-lane rhythm game: theorems, equations, figures and citations slide down Figure 3.1, and you highlight each one by pressing its lane's key as it reaches the line. D is theory, F is proofs, J is experiments and K is critique.

The committee is doodled in blue ballpoint in the margin and grades you in red pen: "Who supervised this?!", "Have you tried a larger n?!", "Who put tabs in your LaTeX?!". Milestones arrive in the same red ink, from PROMISING RESEARCH through MENSA QUEUE SKIPPED to FIELDS MEDAL SPEEDRUN. Golden notes fill a Eureka meter, and Space then doubles your points for eight seconds. If your thesis confidence runs out, the defense fails.

Year 3 did not start out looking like this. Its first version was a neon note highway, and it looked like every other rhythm game. On a projector, black ink on white paper reads from metres away, so we rebuilt it as a typeset thesis with flat highlighter lanes.
--- end ---

==================================================================================
SECTION 12
Image: 10-thesis-title-and-verdict.png
Position: Top
--- content ---
## A chart written by the music

The level plays a 128 BPM track made by the team, and nobody wrote its chart by hand. A small development tool built on librosa fits the track's beat grid and measures onset strength and the dominant pitch at every sixteenth note. It then keeps the strongest onsets of each bar, up to a budget per phase, and maps higher pitches to lanes further right, like a keyboard. The four phases start on the track's own break bars, and the defense ends on a golden four-key QED chord. The budgets keep it fair: under four notes per second, and never more than four sixteenths in a row.

The chart went through three versions. It began hand-written, then moved to public-domain classics played by a Web Audio synthesiser. Once the team had its own track, we generated the chart from it, and every note now lands on something the player hears.

Two details make it feel right. Presses are judged by the key event's own timestamp (±45 ms for PERFECT, ±90 for GREAT, ±135 for GOOD), so a dropped frame never costs you a hit. And the track is scheduled on the Web Audio clock with the device's output latency compensated, so the notes and the music agree on what "now" means.

The verdict is an ETH transcript with the committee's rubber stamp. Your accuracy becomes a grade on the Swiss scale from 1 to 6, and every band has its own verdict: 4.0 IS A PASS and KOMPENSIERT near the line, A VERY SWISS 5.0 in the middle, SUMMA CUM LAUDE at the top and EXMATRIKULIERT at the bottom.
--- end ---

==================================================================================
SECTION 13
Image: none
--- content ---
## Making it sound like a game

With all three games playable, the last big pass was sound. Bug Bash and the casino got their own music, and the casino plays room ambience underneath. Every action got a sound, often with two or three variants picked at random so repeated grabs, throws and card flips don't sound identical. A held bug has its own sound loop while it's in your hand, and the committee in Year 3 now reacts out loud: impressed, amazed, disappointed or furious. Clicks, panels, the acceptance letter, the stamp and the graduation have sounds too.

Year 3 used to make its effects with a Web Audio synthesiser: a cowbell for milestones, the Zürich tram bell for Eureka and a sad trombone for a failed defense. Recorded samples have replaced those gags. The synthesiser still plays the music itself, on the latency-compensated clock that keeps the track in time with the chart.
--- end ---

==================================================================================
SECTION 14
Image: 11-graduation.png
Position: Right (the image is tall; Top also works)
--- content ---
## Graduation

Submitting your thesis graduates you on the spot. Each year pays its 60 ECTS in proportion to your score, and your share of the 180 picks your career:

- **153 ECTS and more:** Quant researcher in Zug
- **117 to 152:** PhD student at ETH, year 7
- **81 to 116:** Master's student at ETH (again)
- **45 to 80:** Fast-food crew at Zürich HB
- **Below 45:** Still flat-hunting in Zürich

A credit transcript stays in view through the whole degree, so you always know what each game earned and how many ECTS the next career needs. The student in our screenshots earned 60 in Bug Bash, 23 at the casino and 60 for the thesis: 143 ECTS, and a PhD in its seventh year.
--- end ---

==================================================================================
SECTION 15
Image: none
--- content ---
## How five people built three games at once

Five of us built three games in parallel on one repository, in one weekend. A few rules kept us out of each other's way.

**React owns everything around a round; Phaser owns the round.** The two meet at one interface: a mount function that receives a parent element, the player's character, dialogue and an `onFinish` callback, and returns a `destroy()`. Game code never fetches, never navigates and never imports React. The shell around it (enrolment, the year panels, the transcript) is React 19 with Vite; all three games run on Phaser 4.

**Each game is a plug-in level.** A minigame lives in its own `levelN/` folder on the frontend, and on the backend if it needs a server, with its own tests. It touches the shell only through a handful of hooks: the game registry, router registration, test paths and one line in the Dockerfile. Three games grew side by side without editing the shell or each other.

**Words and numbers live in shared files.** Every player-facing string is in one `text.json`, and the years, ECTS and career thresholds are in one `game-config.json`. The frontend and the backend both read them, so a copy change never touches code.

**The server enforces the rules.** A year unlocks only when the earlier years are complete, the first result keeps its credits, and completions take a per-player row lock in PostgreSQL. A double click can't award ECTS twice.

**`main` always runs.** Every change went through a pull request with four required checks (repo hygiene, backend, frontend, and a Docker end-to-end smoke test) and was squash-merged. By the end of the weekend that was 534 automated tests: 263 in the backend, from player progress to gesture rules replayed against recorded play, and 271 in the frontend, from blackjack rules to the thesis chart.

**AI that can't spend credits by accident.** OpenAI is called from exactly one module on the server. Every AI feature has pre-written fallback content and is cached per run, and only `POST` requests can reach it. A daily cap and a key failover chain protect the budget. The tests force AI off, swap in a fake client and block the network, so an accidental real call fails the test instead of costing money.
--- end ---

==================================================================================
SECTION 16
Image: none
--- content ---
## What we learned

**A projector changes the brief.** The neon highway and the typeset thesis are the clearest example, but the same reasoning gave Gauss Jack a fullscreen mode and put the credit transcript on every screen that matters.

**Let the music write the chart.** Generating the chart from the track turned "these notes feel off" from a tuning session into a non-issue.

**Playtests find the rules you didn't write.** Our simulation was right about the rules we had written. It couldn't tell us that a blackjack with a red bead on the board feels wrong.

**Real hands are bigger than targets.** Bug Bash first saved code only when your hand touched the flame at the tip of the fuse, a 30-pixel target. Now touching the card anywhere counts. Playtests also asked for a slower round, bigger hit areas and more sensitive swipes. Slaps and swipes got separate cooldowns, because a slow swipe (often just the wind-up) kept swallowing the slap that came right after it.

**Never let a good round pay nothing.** Early mistakes could push Bug Bash's running score below zero, so a round with real catches sometimes paid 0 ECTS. The total now never drops below zero.
--- end ---

==================================================================================
SECTION 17
Image: none
--- content ---
## What's next

The core loop is complete, so the next steps deepen it rather than widen it:

- **A narrated graduation.** The advisor dialogue, the AI-written epilogue and the narrated send-off are already built and tested in the backend. They just need to reach the diploma screen.
- **Archetypes that change play.** The Gamer and ASVZ-athlete perks already exist in Bug Bash's configuration. Exposing archetypes in the character builder would make them a real choice.
- **Head-to-head at the booth.** The camera engine already serves four players at once, so two students bashing bugs side by side is a natural next mode.

## Try it

The code, the setup instructions and a deeper technical tour are in [our repository](https://github.com/DEOIST/viscon26-main). One `docker compose up` starts the whole stack. The camera needs `localhost` or HTTPS, and without one, every game still plays with a mouse and keyboard.

ETH.fun was designed and built at VIScon Hackathon 2026 by [@ITheClixs](https://github.com/ITheClixs), [@Mer123haba456](https://github.com/Mer123haba456), [@ibrahim1metin](https://github.com/ibrahim1metin), [@toezcan](https://github.com/toezcan) and [@anomyq](https://github.com/anomyq).

*ETH.fun is an unofficial student parody. It is not affiliated with or endorsed by ETH Zürich and uses no official logos. Every image in this post was captured from the game running locally. The Bug Bash footage is a real round played by a team member on a laptop webcam; the Gauss Jack hands were played in a browser with random deals; the Thesis defense was played by a script that presses the keys from the game's own chart.*
--- end ---
