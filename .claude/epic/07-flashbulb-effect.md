# 07 — Flashbulb Effect

## STATUS: working on hardware; decay reshaped to a sparkle, **not yet on a board**

Verified on board 1 on 2026-08-06. The shape measured then off WLED's live frame buffer
rather than inferred: snap to white → **15s** fade to black → 2s settled black → **15s**
fade up into the pattern → 2s settle → hand back. Total **34.1s**.

### 2026-08-15 — the decay is now a sparkle, not a fade. Verified on board 1.

Stakeholder call: the flash should stay a hard white snap, but instead of dimming evenly
to black it should *break up* — noise rising over the decay as a sparkle that fizzes out.
Shape as built and measured:

| Entry | Preset | `dur` | `transition` | What it does |
|---|---|---|---|---|
| 1 | `10` Flashbulb White | 0.1s | 0s | the snap, unchanged |
| 2 | `13` Flashbulb Sparkle | 7s | 5s | white dissolves into full-density sparkle |
| 3 | `11` Flashbulb Black | 11s | 9s | the whole field fizzles out to black |
| 4 | `12` Flashbulb Recover | 17s | 15s | fade up into the pattern, unchanged |

Total **35.1s** against `cooldownSec` 60 — ~25s of margin. Flash to settled black is 18.1s
against the 17s of the fade it replaces, so the pacing of the piece is essentially
unchanged.

**Why this needs no new effect.** WLED renders *both* the outgoing and incoming effect
during a transition and blends the two frames (`Segment::_t->_oldSegment` in `FX_fcn.cpp`),
so crossfading a solid preset into an effect preset dissolves the solid surface into that
effect. The rising noise is that blend, not an animation anyone had to write.

`13` is **Twinkleup (`fx: 106`)**, the same effect as pattern `2`, at `ix: 255` / `sx: 200`.
Two details from `FX.cpp` matter:

- `ix` is a threshold on a *fixed* per-pixel random value (`if (prng.random8() >
  SEGMENT.intensity) pixBri = 0`). At 255 no pixel is masked, so all 234 twinkle on
  independent sine phases — which is what gives the field its density.
- With `pal: 0`, `color_from_palette()` returns `col[0]` directly instead of a palette
  entry (`FX_fcn.cpp:1169`). That is what keeps the sparkle **white**. Setting a palette
  on `13` would turn the afterglow into colour.

### The stage that had to be deleted — parameter-only transitions do not blend

The first build had a third stage between them: `14` Flashbulb Fizzle, Twinkleup at
`ix: 96` / `sx: 230`, to thin the field before it went out. The reasoning was that `ix`
masks on a fixed per-pixel value, so lowering it removes pixels from the *same* set and
the thinning would read as dying rather than churning. That part was right. The transition
was not. Captured off the live-preview buffer:

| t (s) | mean | stdev | lit | |
|---|---|---|---|---|
| 6.5 | 131 | 90 | 89% | full sparkle |
| 7.5 | 46 | 82 | 32% | **popped** — one frame, no 4s crossfade |
| 14.5 | 88 | 50 | **100%** | **bloomed** — brighter than the sparkle it replaced |
| 17.0 | 2 | 1 | 10% | black, eventually |

Two distinct failures, one cause. **WLED starts a blend when `fx`, colour, or palette
change — not when `ix`/`sx` change**, which apply instantly. So `13` → `14` was a hard cut.
Then `14` → `11` *did* blend (`fx 106` → `fx 0`), but blended down from a full-density
render rather than from the sparse one actually on the pixels: all 234 pixels relit and
mean rose 46 → 88 before decaying. A second bloom, three-quarters of the way through the
decay — precisely the artifact class of the phantom flash above, found the same way.

`14` is deleted. `13` now fades straight to black over 9s. Re-measured: stdev falls
**84 → 0** in a linear ramp, `peak` decays monotonically **255 → 8**, black at t+16.0s,
and the strip settles at 195.5 mean / 33.5 stdev from t+33.0s — bit-for-bit the pre-flash
pattern, so the hand-back stays a visual no-op.

**Rule, now in CLAUDE.md: a flashbulb stage that wants to differ from its neighbour must
differ in `fx`, not just in slider values.**

Verified on board 1 (2026-08-15), presets uploaded and read back byte-identical:

- [x] The rise reads as the flash breaking up — stdev 10 → 90 as mean falls 241 → 129
- [x] The fizzle is monotone and reaches genuine black before `12` starts its fade up
- [x] Hand-back to `100` is a no-op
- [ ] Peak draw unchanged — the sparkle is strictly dimmer than the white snap, so ticket
      02's PSU sizing should hold, but confirm nothing new is ABL-clamped (`maxpwr` is 0
      today, so nothing is clamping at all yet)
- [ ] Seen by eye, at night, on a real gate rather than in the frame buffer (ticket 10)

### The phantom second flash — root cause

A second, full-brightness white flash appeared just before the gate returned to its
pattern. Three plausible explanations were tested and **all three were wrong**: dead white
`col[0]` on the incoming preset, the 255→128 brightness step at the hand-back, and the
preset-vs-playlist transition precedence.

The actual cause: **preset `101` had `transition: [0,50]` against `dur: [1,50]`** — the 5s
fade to black ran exactly as long as its 5s entry. An entry whose fade is still running
when the entry ends never *commits*, so the next crossfade blends from the last committed
state, which was preset `10`'s **white**. The strip rendered black correctly, then blended
from white anyway.

**Rule, now recorded in CLAUDE.md: in a WLED playlist every entry's `transition` must be
strictly shorter than its `dur`.** Every entry now carries 2s of settle.

Found by capturing WLED's live-preview WebSocket frame buffer, which is ground truth for
what is on the pixels; `/json/state` reports target values and shows nothing of this.

### Also changed

- **New preset `12` Flashbulb Recover**, pixel-identical to `1` Rainbow. The flash fades
  *up* into it from black, so the hand-back to `100` is visually a no-op. Keep the two in
  sync or a step returns.
- **All presets at `bri: 255`**, plus `def.bri`. One brightness everywhere means no preset
  boundary can produce a step.


**Blocks on:** 05, 06
**Blocks:** 09

## Goal

A sensor trigger fires a camera-flash effect on that gate — hard white flash, slow
fade to black, gentle return to the running pattern — then the gate resumes its
playlist.

## The effect, as specified by the predecessor

From `~/Code/reflecting-the-present/src/flashbulb_patterns.cpp`, a 4-phase state
machine with these timings:

| Phase | Duration | Behaviour |
|---|---|---|
| `FLASH` | 100ms | Full white, instant, no fade in |
| `FADE_TO_BLACK` | 5000ms | Fade white → black |
| `TRANSITION_BACK` | 2000ms | Blend black → the running pattern |
| `INACTIVE` | — | Normal playlist operation |

These timings are a starting point carried from a working installation, not gospel.
Expect to tune them on site (ticket 10).

## How this maps onto WLED — no state machine needed

The four phases collapse into preset applications with different transition times.
WLED's transition engine does the interpolation.

1. **Flash** — solid-white preset, transition **0ms** (instant)
2. **Hold** — 100ms
3. **Fade** — solid-black preset, transition **5000ms**
4. **Return** — main playlist, transition **2000ms**

Ticket 06 selected the HC-SR04, so the trigger comes from **the usermod** — that is
settled. But the usermod does not need to hand-time the phases itself.

**Preferred: usermod triggers a one-shot WLED playlist.** A playlist is an ordered list
of presets with per-entry durations and transitions, a repeat count, and an **end
preset**. So the flashbulb becomes a playlist of [white, black], repeat once, end
preset = the main pattern playlist. The usermod's only jobs are then **threshold
detection and the 15s cooldown** — it fires one preset and WLED owns all the timing.
Far less code than three timed `applyPreset()` calls tracked across frames.

Worth verifying on hardware: that a playlist can name another playlist's preset slot as
its end preset. Playlists are stored as presets in WLED's model so this should hold,
but confirm before designing around it.

**Fallback: usermod drives the phases directly** with timestamped, non-blocking
`applyPreset()` calls, if the playlist-as-flashbulb approach does not behave.

Either way: no phase enum, no per-frame state machine, no saved-colour buffer.

Note what this deletes relative to the predecessor: the `FlashBulbManager` 5-slot
pool (which leaked slots and jammed permanently after 5 triggers), and the
`saved_colors[22*122]` buffer — ~40KB that was written every trigger and never read.
Neither has an analogue here.

## Two design tensions to resolve deliberately

**1. ABL will mute the flash.** The flash is full white across all 234 pixels — the
installation's peak power draw by a wide margin. If ABL is clamping, your loudest
moment is quietly dimmed. Resolve via ticket 02: size the PSU for genuine full white
and set ABL as a backstop above expected draw, not as an active limiter. Verify the
flash is actually reaching full brightness.

**2. Playlist resume vs restart.** When the flash sequence ends and hands back to
the playlist, does the playlist resume mid-cycle or restart from preset 1?
**Ticket 05 is complete — read the answer from `complete/05-pattern-sequencing.md`
before implementing the return logic.** If it restarts, a gate on a busy path could get stuck
perpetually replaying pattern 1 and never reach patterns 2 and 3 — which would be a
real artistic failure, not just a technical one. If that is the behaviour, the
usermod needs to capture and restore playlist position explicitly.

## Tasks

- [ ] Create the flashbulb presets (slots reserved in ticket 05):
  - [ ] Solid white, transition 0ms
  - [ ] Solid black, transition 5000ms
- [ ] Build the one-shot flashbulb playlist; have the usermod trigger it
- [ ] Keep the usermod's responsibility minimal — threshold plus cooldown. **Do not use
      `delay()`** anywhere; it stalls the frame loop and the web server. Note the
      HC-SR04 read itself is a blocking-call risk — see `06`.
- [ ] Handle the playlist return per the resume/restart finding from ticket 05
- [ ] Make the three timings (flash hold, fade duration, return duration)
      configurable via `addToConfig()` so they are tunable on site
- [ ] Verify the flash reaches genuine full brightness and is not ABL-clamped
- [ ] Verify a trigger **during** a pattern crossfade behaves sanely rather than
      producing a visual glitch
- [ ] Verify a second trigger arriving mid-sequence is correctly suppressed by the
      cooldown and cannot corrupt the state
- [ ] Confirm the gate returns to normal operation every time — a flashbulb that
      occasionally strands a gate at black is the worst failure mode here, since it
      is silent and the gate simply goes dark
- [ ] Soak test: trigger repeatedly over an extended period and confirm no drift,
      no stuck state, no memory growth

## Acceptance criteria

- Trigger produces the full 4-phase sequence with correct timings
- Flash is at genuine full brightness, not ABL-clamped
- Gate returns to its playlist afterward, **every time**, verified over a soak test
  of many triggers
- Playlist position behaviour is correct and documented (patterns 2 and 3 are still
  reachable on a frequently-triggered gate)
- Triggers during crossfades and during an in-progress sequence are handled without
  glitch or state corruption
- The three timings are configurable from the WLED UI
- Effect fires on **that gate only** — no cross-gate leakage

## Open questions

- Are the predecessor's 100ms / 5000ms / 2000ms timings still artistically right for
  this piece, or is this a fresh design? (Owner: stakeholder, ticket 10)
- Should the flash colour be pure white, or slightly warmed to match the palette?
- Should the fade go fully to black, or to a dim floor? Full black on a gate in a
  dark space is a strong, potentially startling effect.
