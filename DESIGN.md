---
name: "Thesis Defense (Year 3): The Typeset Thesis"
description: "Year 3's own visual world: page 42 of your thesis, open in a PDF viewer, defended live in highlighter and red pen."
colors:
  viewer-toolbar: "#323639"
  viewer-ground: "#525659"
  viewer-sidebar: "#2f3134"
  viewer-pane: "#3c3f42"
  viewer-field: "#191b1c"
  chrome-ink: "#f1f3f4"
  chrome-muted: "#bdc1c6"
  viewer-selection: "#8ab4f8"
  paper: "#ffffff"
  ink: "#1b1b1b"
  ink-soft: "#555555"
  red-pen: "#d11a2a"
  blue-pen: "#1f3c9b"
  highlighter-blue: "#5ec8ff"
  highlighter-pink: "#ff7ad9"
  highlighter-green: "#8cf27a"
  highlighter-orange: "#ffa94d"
  highlighter-yellow: "#fff23a"
typography:
  display:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "64px"
    fontWeight: 700
  countdown:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "150px"
    fontWeight: 700
  numeral:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "64px"
    fontWeight: 700
  headline:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "28px"
    fontWeight: 700
  title:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "20px"
    fontWeight: 400
  reference:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "21px"
    fontWeight: 400
  body:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "15px"
    fontWeight: 400
  caption:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "14px"
    fontWeight: 400
  label:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "12px"
    fontWeight: 400
    letterSpacing: "1.5px"
  mono:
    fontFamily: "Source Code Pro, Menlo, monospace"
    fontSize: "15px"
    fontWeight: 400
  hand:
    fontFamily: "Caveat, Bradley Hand, cursive"
    fontSize: "22px"
    fontWeight: 400
  hand-shout:
    fontFamily: "Caveat, Bradley Hand, cursive"
    fontSize: "44px"
    fontWeight: 700
rounded:
  key-sm: "4px"
  key-md: "5px"
  dialog: "10px"
spacing:
  toolbar-height: "44px"
  sidebar-width: "196px"
  column-inset: "52px"
  margin-gutter: "26px"
  column-width: "520px"
  margin-width: "220px"
components:
  viewer-toolbar:
    backgroundColor: "{colors.viewer-toolbar}"
    textColor: "{colors.chrome-ink}"
    typography: "{typography.mono}"
    height: "{spacing.toolbar-height}"
  page-counter:
    backgroundColor: "{colors.viewer-field}"
    textColor: "{colors.chrome-ink}"
    typography: "{typography.body}"
    size: "42px 22px"
  sheet:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
  pane-key-cap:
    textColor: "{colors.chrome-ink}"
    rounded: "{rounded.key-sm}"
    height: "22px"
    padding: "0 8px"
  key-action:
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.key-md}"
    height: "30px"
    padding: "0 10px"
  key-action-primary:
    textColor: "{colors.ink}"
    rounded: "{rounded.key-md}"
    height: "30px"
    padding: "0 10px"
  pause-dialog:
    backgroundColor: "{colors.viewer-toolbar}"
    textColor: "{colors.chrome-ink}"
    rounded: "{rounded.dialog}"
    size: "500px 150px"
---

<!-- SCOPE: this system governs ONLY the Year 3 "Thesis defense" Phaser canvas (frontend/level3/). The React account shell keeps its own dark navy and blue UI; never apply these tokens, fonts or rules to the shell, and never pull the shell's tokens into this canvas. -->

# Design System: Thesis Defense (Year 3): The Typeset Thesis

## Overview

**Creative North Star: "The Defended Manuscript"**

**Scope.** Everything here describes the Year 3 game surface only: the 1280 x 720 Phaser 4 canvas in `frontend/level3/`, mounted inside the shell's game workspace and allowed to go fullscreen. The surrounding React shell (dark navy, blue accents, sans UI) is a separate, incumbent system and is not governed by this file. Tokens live as TypeScript constants, not CSS: `COLORS`/`CSS`/`SERIF`/`MONO`/`HAND` in `textures.ts`, geometry in `layout.ts`, lane inks in `config.ts`. Sizes are logical canvas pixels at 1280 x 720.

The screen is a page of your own thesis open in a PDF viewer. Graphite viewer chrome frames one white sheet; on the sheet everything is either typeset (black Source Serif 4) or written by hand (red and blue ballpoint, Kalam). The rhythm lanes are Figure 3.1, a flat, booktabs-ruled four-column table; notes are references (Thm. 4.2, eq. (3.7), [42]) that you highlight on the beat with chisel-tip marker. The committee grades in red pen, and red marks persist, so the page ends up recording how the defense went. The verdict is a transcript of records with an inked rubber stamp.

The world refuses the rhythm-game default: no neon perspective highway on black, no glowing rails, no gamer HUD. Every element has to be something that could plausibly be on a printed thesis page or in the viewer around it. Density is that of a real LaTeX page: generous white, small precise rules, and two bold numerals that carry the score from three metres.

**Key Characteristics:**
- Graphite PDF-viewer chrome around one white A4 sheet, drawn past the frame so fullscreen shows more viewer, never bands.
- Two scripts only on paper: typeset Source Serif 4 and handwritten Caveat; Source Code Pro only for the file name and the `\begin{defense}` call.
- Four highlighter inks as lanes; yellow is reserved for golden notes and Eureka.
- Red ballpoint judges (misses, corrections, scars, stamp); blue ballpoint draws the professors and writes your hit words.
- Flat booktabs geometry: constant-speed notes, no perspective, no glow.
- Hand marks are wobbly and seeded: stable per element, never vector-straight.

## Colors

Office greys around paper white, black type, and the only saturated colour on the page is ink someone put there: highlighter or ballpoint.

### Primary
- **Committee Red Pen** (red-pen): the judgment colour. Miss strike-throughs, the errata scars in the gutter, margin notes and the professor's signature, milestone scrawls with their double underline, the circle around the lead professor, the meltdown hit rule, the start-prompt underline, and the verdict stamp.

### Secondary
- **Doodle Blue Pen** (blue-pen): the professors' margin portraits and names, and the handwritten judgment word ("perfect", "great") above a hit lane, plus the hit tick. Blue is the friendly pen; red is the grading pen.

### Tertiary
- **Lane Highlighters** (highlighter-blue, highlighter-pink, highlighter-green, highlighter-orange): lanes D F J K in that order (Theory, Proofs, Experiments, Critique). Laid as a 16% wash down each lane column, as the tinted marker swipe on a hit, behind the key in Table 1, and as tiny marks in the sidebar thumbnails. The confidence bar borrows green and orange as its high and middle states.
- **Golden Highlighter** (highlighter-yellow): golden notes, the Eureka meter, the Eureka band across the hit rule (22% fill), and the Space row of Table 1. Nothing else.

### Neutral
- **Paper** (paper): the sheet, the title page, the transcript.
- **Typeset Black** (ink): all set type, booktabs rules, the hit rule at rest, beat lines (7% on beats, 16% on bars), lane separators (22%).
- **Soft Ink** (ink-soft): running head, subtitles, secondary transcript lines, the faded reference after a miss, the quiet "Revise" action.
- **Viewer Toolbar** (viewer-toolbar), **Viewer Ground** (viewer-ground), **Thumbnail Sidebar** (viewer-sidebar), **Properties Pane** (viewer-pane), **Page-Counter Field** (viewer-field): the viewer's graphite layers, darkest at the field, lightest at the ground behind the sheet.
- **Chrome Ink** (chrome-ink) and **Chrome Muted** (chrome-muted): all text, icons, key caps and timing ticks in the viewer chrome.
- **Viewer Selection** (viewer-selection): the frame around the current section's thumbnail; the viewer's own selection colour, not a game accent.

### Named Rules
**The Yellow Law Rule.** Yellow highlighter means golden: golden notes, Eureka, Space. A lane, label or celebration never uses it.

**The Two Pens Rule.** Red pen corrects and judges; blue pen doodles and praises. Ink colour tells the player whether the page is grading them or cheering them.

**The Grey Chrome Rule.** The viewer chrome is greys plus the selection blue. Highlighter inks appear in the chrome only in miniature, inside the page thumbnails.

## Typography

**Display Font:** Source Serif 4 bold (opsz 32, with Georgia)
**Body Font:** Source Serif 4 regular and italic (opsz 20, same stack)
**Label/Mono Font:** Source Code Pro medium (with Menlo)
**Hand Font:** Caveat medium and bold (with Bradley Hand), set 1.22x its nominal size

**Character:** Source Serif 4 is a sturdy book face that reads as a typeset thesis and holds up on a projector; Caveat is the committee's ballpoint against it. All faces are self-hosted OFL woff2 in `assets/fonts/`, loaded by `loadFonts()` before the scene draws, and rasterised at the camera's zoom so text stays sharp on any screen.

### Hierarchy
- **Countdown** (700, 150px): the 3, 2, 1 before an attempt, centred on the figure.
- **Display** (700, 64px): the title page heading "Thesis Defense".
- **Numeral** (700, 64px): the combo in Table 3.1; the transcript grade is the same voice at 46px. Big numerals are the three-metre read.
- **Headline** (700, 28px): section number and heading on the page ("3.3 Professor Meltdown"), the start prompt; italic 28px for the multiplier (×1).
- **Reference** (400, 21px; 700 for golden): the moving note tokens.
- **Title** (400, 20px): transcript course row, the title-page subtitle in italic.
- **Body** (400, 15 to 17px): table cells, pane text, transcript lines; 15px italic for "Now playing".
- **Caption** (400 italic, 13 to 14px): "Figure 3.1: ..." and "Table 3.1: ..." captions, lane names under the key letters.
- **Label** (400, 12px, 1.4 to 1.6px tracking, uppercase): the running head and the properties pane's field names (Soundtrack, Timing, Keys), the CONFIDENCE and EUREKA meter labels.
- **Mono** (400, 15px; 46px for the go call): the toolbar file name and `\begin{defense}`.
- **Hand** (Caveat, 14 to 24px nominal; 30px bold for scrawls): margin notes, professor names, judgment words, "good luck :)", milestone shouts.

### Named Rules
**The Typeset-or-Handwritten Rule.** Every glyph on the sheet is Source Serif 4 or Caveat. No sans-serif on paper, ever; mono only where a file name or LaTeX source would appear.

**The Caption Rule.** Figures and tables are numbered and captioned like a thesis ("Figure 3.1:", "Table 1:", "Table 3.1:"). New panels on the page arrive as captioned tables or figures, not cards.

## Layout

A fixed 1280 x 720 logical canvas laid out as a PDF viewer. Toolbar across the top (44px). Thumbnail sidebar on the left (196px) showing the four sections as pages with a red tick once passed. The sheet starts at x 220, y 60, 830 wide, and runs off the bottom edge like a scrolled PDF. The properties pane starts at x 1072 (soundtrack, timing ruler, key hints). On the sheet: a 52px inset text column 520 wide holding Figure 3.1, a 26px gutter carrying the errata scars, and a 220px margin for professor doodles, red notes, the confidence and Eureka bars, and Table 3.1.

Figure 3.1 is four equal lanes (130px). Notes appear at the top rule (y 178) and travel at constant speed to the hit rule (y 590) over 1.5s; key letters and lane names sit under the rule; the caption under them. Every background is drawn 700px past the frame (`BLEED`), so `Scale.EXPAND` fullscreen reveals more viewer and paper instead of empty bands. Title page and transcript reuse the same sheet and column, so the world never cuts away from the page.

**The Flat Table Rule.** The lanes are a typeset table, not a road: no perspective, no vanishing point, constant note speed.

## Elevation & Depth

Flat. Depth is the viewer's own: graphite layers stepping from field to ground, and one soft shadow under the sheet. Inside the page there is no shadow at all; layering is ink over paper (highlighter under type, pen over both).

### Shadow Vocabulary
- **Sheet shadow** (five stacked rects of black at 5.5%, each grown by 1px, offset 2px right and 4px down): only under the paper sheet; built from fills so it also renders in Phaser's Canvas fallback.
- **Pause scrim** (black at 35% over the whole canvas): only behind the pause dialog.

### Named Rules
**The Ink-Not-Light Rule.** Emphasis is more ink, never light: no glow, no bloom, no blur. The hit rule swells in stroke width on the beat (2px to 4.5px over 160ms), it does not shine.

## Shapes

Paper geometry: square sheet, square thumbnails, hairline booktabs rules in three weights (top and bottom 1.3 to 1.6px, mid 0.6 to 0.8px, hit rule doubled 2px plus 1px). Rounding exists only on keyboard key caps (4 to 5px) and the viewer's pause dialog (10px). Hand-made forms are irregular by construction: `penLine` walks a seeded wobble every 14px, `penCircle` is a slightly open loop, highlighter strokes have streaky bodies and ragged ends, and the stamp has a jittered double border, uneven pressure and voids. Seeds make each mark stable frame to frame.

**The Pen-Never-Straight Rule.** Anything the committee or the candidate writes is drawn with `penLine`/`penCircle` or Caveat; only typeset rules are straight.

## Components

### Viewer Toolbar
Graphite strip with a three-bar menu glyph, the mono file name `thesis_FINAL_v7_really_final.pdf`, a dark page-counter field showing progress as "page / 58", and on the right the sound state with a drawn speaker and the fullscreen corners, each preceded by its key letter (M, F) in chrome-muted. Click zones cover the controls.

### Key Caps
- **Pane key cap:** chrome-ink bold serif in a 1px chrome-ink outline at 60%, 4px radius, 22px tall, followed by its action in chrome-muted.
- **Transcript action:** a key cap (5px radius, 30px) plus a label, both clickable. Deliberately unequal: "R Revise and resubmit" quiet in ink-soft with a 1.2px frame; "Enter Submit final version" primary in ink with a 1.8px frame, bold 23px label and a rule above it. A 3px ink line at 25% under the cap gives it a pressed edge.

### Figure 3.1 (lane table)
Lane washes, beat-locked ruled lines, `\toprule` at the top, a doubled hit rule that turns red-pen in the meltdown phase and gold during Eureka. A hit draws a tinted marker swipe left to right (90ms, Cubic.Out), the reference sinks into the rule as it fades (240ms), a blue tick and judgment word appear. A miss leaves the reference in soft ink, struck through in red pen, fading after 380ms. Simultaneous notes are joined by a bracket under their tokens.

### Margin: Committee and Table 3.1
Three professor doodles in blue pen (Lemma, Gradient, Bootstrap) with moods in brows and mouths; the asking professor is circled in red. Red margin notes with a red bracket and a signature. Confidence and Eureka as highlighter bars in hairline frames; when Eureka is full, a red-circled "Space!" pulses. Table 3.1 sets Score, Accuracy and Combo between booktabs rules, combo at 64px bold.

### Errata Scars
Each miss leaves a permanent short red stroke in the gutter at the point in the defense where it happened, labelled "errata" at the foot. Cleared only on a new attempt.

### Transcript and Stamp
The result is a Leistungsüberblick: name, degree line, a Course / ECTS / Grade booktabs table with the grade as the big numeral, the remark, the career forecast, "Table 2: The defense in numbers", the record circled in red, and the footer disclaimer. The verdict stamp is a red rubber-stamp texture in bold serif (46px, at most two balanced lines) that slams in from scale 1.6 and -15 degrees to 88% opacity over 300ms (Cubic.In).

### Title Page
A thesis title page on the same sheet: display title, italic subtitle, author, department, examiners, "Table 1: How to answer the committee." (key on its highlighter swatch, lane name, notation ∀ ∫ χ² ?! ×2), and the start prompt with a blinking caret and a red-pen underline; a red "good luck :)" in the margin.

### Pause Dialog
Viewer chrome, not paper: toolbar-grey rounded box over a 35% scrim, "Paused" bold, an italic chrome-muted line, and the key hints.

## Do's and Don'ts

### Do:
- **Do** keep this system inside `frontend/level3/`; the shell's navy and blue UI is a different world.
- **Do** import colours, fonts and geometry from `textures.ts`, `config.ts` and `layout.ts` instead of restating hex values.
- **Do** reserve highlighter-yellow for golden notes, Eureka and Space.
- **Do** use red pen for judgment and blue pen for doodles and praise.
- **Do** set new on-page information as a numbered, captioned table or figure with booktabs rules.
- **Do** draw every hand mark with `penLine`, `penCircle` or Caveat, seeded so it stays stable.
- **Do** draw backgrounds past the frame by `BLEED` so fullscreen shows more viewer.
- **Do** keep the score, combo and grade as large bold serif numerals readable from three metres.

### Don't:
- **Don't** add perspective, a vanishing-point highway, glow, bloom or neon to the lanes.
- **Don't** set sans-serif type on the sheet.
- **Don't** use a lane ink or yellow in the viewer chrome outside the thumbnails.
- **Don't** add shadows on the paper; the sheet shadow is the only one.
- **Don't** put a tracked uppercase label above a heading as an eyebrow; tracked caps are for the running head, pane field names and meter labels only.
- **Don't** use ETH logos or official marks; the transcript stays labelled unofficial.
