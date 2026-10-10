# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

VIScon 2026 hackathon judges and passers-by at our booth, mostly ETH Zürich students, playing short turns on one demo laptop whose screen is also shown on a projector (confirmed). Many have never played a rhythm game; everyone knows ETH student life by heart.

## Product Purpose

ETH Simulator ("ETH Life", working title): you create an ETH student and play one minigame per study year (Year 1 the webcam finger-gun shooter, Year 2 Galton Blackjack, Year 3 the thesis defense rhythm game); completing all three years earns the 180 ECTS and the graduation diploma. Success on judging day is that a stranger understands each game in seconds, laughs at the ETH references and wants another turn.

## Positioning

A parody of an ETH degree that only ETH people fully get: Basisprüfung, Mensa, Polybahn, HG, the 1–6 grading scale, Kompensation, Repetition. The jokes are the product; the minigames are the delivery.

## Operating Context

- Played at a hackathon booth: noisy room, projector, people watching over the player's shoulder, turns of about a minute.
- The account shell is an anonymous-player web app (React + Vite); each year launches its minigame inside the shell's game workspace.
- Year 3, "Thesis defense", is keyboard only (D F J K, Space, Esc, R, Enter, M) and may take over the whole screen once launched (confirmed).

## Capabilities and Constraints

- Minigames are Phaser 4 canvases at a 1280 x 720 logical resolution, mounted through the shell's minigame contract.
- No audio files ship; Year 3's music and effects are synthesised in the browser.
- The camera only works on a secure origin (Year 1); OpenAI is backend-only and never needed by Year 3.

## Brand Commitments

- The ETH meme copy is binding: verdicts, career forecasts, committee lines and milestones stay (confirmed for the Year 3 redesign).
- Year 3 owns its own visual world, separate from the shell's dark navy and blue UI (confirmed).
- Unofficial student parody: no ETH logos or official marks, no claim of affiliation.

## Evidence on Hand

- Game design and rules: `docs/GAME_DESIGN.md`; Year 3 code: `frontend/level3/`.
- No real photography, logos or official ETH assets are available; any imagery is authored.

## Product Principles

1. Readable from three metres: a projector audience must follow what is happening.
2. One minute, one laugh, one more try: short loops, instant replay.
3. Insider jokes over generic gamer tropes.
4. Never block play: missing camera, audio or storage degrades gracefully.
