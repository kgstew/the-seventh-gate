# 03 — Pattern Vocabulary and the Stock-vs-Custom Decision

**STATUS: COMPLETE.**

## Verdict: stock WLED effects cover both patterns

**AMENDED: two patterns, not three.** Original scope said three in series; the decision
was to run two. Prose further down still says "three" — that is the historical
requirement, left as written. Two is correct.

No custom effects required. **`04-custom-effects.md` is cancelled** on the strength of
this finding.

Note this does *not* remove the custom WLED build — ticket `06`'s HC-SR04 usermod still
requires compiling WLED. The fleet firmware remains a custom binary; it simply contains
the usermod and no custom effects.

| Preset | Name | Stock effect | Colour | Segment | Brightness |
|---|---|---|---|---|---|
| 1 | Rainbow | fx 9 | palette | 0–234 | 128 |
| 2 | Twinkleup | fx 106, speed 23 | **red** `col[0] = 255,0,0` | 0–234 | 255 |

Authoritative copy lives in the committed `wled_presets.json`; the table is for human
reference.

**2026-08-15 — Twinkleup recoloured white → red** (stakeholder call). With `pal: 0` the
effect takes `col[0]` directly rather than a palette entry, so the colour of the twinkles
*is* `col[0]`; nothing else about the preset changed. Verified on board 1 off the
live-preview buffer: 100% of lit pixels are pure `(r,0,0)`, brightest `(255,0,0)`.

⚠️ Preset `13` Flashbulb Sparkle is the **same effect** (fx 106) and is deliberately
**still white** — it is the afterglow of a camera flash, not a pattern. These two are not
a matched pair the way `1` and `12` are; do not "sync" them.

Note the two presets capture **different brightness** (128 vs 255). This ticket
recommended inheriting global brightness so a single slider dims the whole gate; as
captured, on-site dimming means editing both presets. Worth revisiting in `10`.

**Blocks on:** 01 ✅
**Blocks:** 04 (cancelled), 05 ✅

## Goal

Decide which three patterns run in series, then answer the single most
schedule-relevant question in this epic: **do stock WLED effects express them, or
do we write custom effects?**

## Why this is still a decision gate

If stock effects cover all three patterns, ticket 04 disappears and the remaining work
is configuration.

Note the cost has shifted since this was written: ticket 06's HC-SR04 usermod already
forces a custom WLED build, so **ticket 04 no longer carries the fork-and-rebase cost**
— only the effect code itself. The bar for entering it is lower than it was. Judge on
whether the pattern gap is real, not on build overhead.

**Still: do not start writing custom effects speculatively.** Audition stock first.

## Candidate vocabulary

Harvested from `~/Code/reflecting-the-present`, filtered to what is meaningful on a
single flat 234-pixel run:

| Pattern | Source | Likely stock equivalent |
|---|---|---|
| Palette-gradient chase | `src/chase_patterns.cpp:32-40` | `Chase`, `Palette`, `Colorwaves`, `Pride` |
| Breathing | `src/breathing_patterns.cpp` | `Breathe`, `Fade`, `Pulse` |
| Rainbow | `src/rainbow_patterns.cpp` | `Rainbow`, `Rainbow Cycle` |
| Solid | `src/solid_patterns.cpp` | `Solid` |

Not viable — these were multi-strip effects and have no meaning on one run:
`pinwheel` (needs a 2D matrix of adjacent strips), `warp` (lights one strip of N),
`rainbow_horizontal` (one hue per strip), `single_chase` (tours strips).

Initial expectation, to be verified rather than assumed: **stock WLED effects plus
custom palettes probably cover all three.** WLED ships ~100 effects and ~70
palettes, and the three viable harvested patterns are all within its normal
vocabulary.

## Tasks

- [ ] Confirm the three patterns with the artist/stakeholder. Get a description of
      the *intent* ("slow warm swell from the base", "cool colour drift"), not just
      an effect name — intent is what you evaluate stock effects against.
- [ ] On the bench gate, audition stock effects against each of the three intents.
      Use the live web UI; this is fast, do it at the real pixel density.
- [ ] Build custom palettes if the colour vocabulary matters. WLED supports custom
      palettes as config, no code. The predecessor's palettes are in
      `src/patterns.cpp:391-400` (white / warm / cool / rainbow / sunset).
- [ ] For each of the three, record a verdict:
  - **Stock, as-is** — effect name + slider values
  - **Stock, close enough** — with a note on what differs and whether it matters
  - **Custom required** — with a specific description of the gap
- [ ] If any verdict is "custom required", confirm the gap is real by having the
      stakeholder look at the closest stock candidate on the actual hardware. A gap
      that is invisible at viewing distance is not a gap.
- [ ] Record the decision and its rationale in this file.

## Evaluating on hardware, not on a desk

Judge at the real pixel density (234 px over the real gate length) and the real viewing
distance. Effects that look crude in a web preview often read beautifully on a physical
run, and vice versa. This is the whole reason ticket 01 comes first.

**Judge in the dark.** The piece runs night-only, so evaluate in darkness — brightness,
contrast, and colour saturation all read very differently at night, and an effect
auditioned in a lit workshop will mislead you.

## Note on slider mapping

WLED exposes per-segment `speed`, `intensity`, `custom1-3` (uint8) and
`check1-3` (bool). The predecessor project encoded pattern parameters in a
`PatternParams` union of floats (`src/patterns.h:54-96`) — e.g. breathing's
`min_brightness` / `max_brightness` / `color_cycle_speed`.

Those map onto sliders at slightly coarser resolution, and gain something
significant in exchange: **they become live-tunable from a phone, standing in front
of the gate.** For an installation that will be tuned on site, that is a better
instrument than a float that requires a rebuild.

## Acceptance criteria

- Three patterns defined by intent, agreed with the stakeholder
- Each has a recorded verdict: stock / stock-close-enough / custom-required
- Verdicts reached by viewing on the bench gate, not from documentation
- Custom palettes built if needed
- Ticket 04 either cancelled or scoped with a specific, stakeholder-confirmed gap
- Decision and rationale written back into this file

## Open questions

- What are the three patterns? (Owner: stakeholder)
- Is there a reference — video, mood board, the predecessor installation — to
  evaluate against?
