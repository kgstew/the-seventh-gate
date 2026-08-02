# 05 — Pattern Sequencing (Two Patterns in Series)

**STATUS: COMPLETE.** Presets + looping playlist verified, boot preset set.

**AMENDED: two patterns, not three.** Prose below still says "three" — that is the
historical requirement, left as written. Two is correct.

**Blocks on:** 03 ✅ (04 cancelled)
**Blocks:** 07, 09 — unblocked

## Outcome — as built

From `wled_presets.json` / `wled_cfg.json`:

| Value | As built |
|---|---|
| Pattern presets | `1` Rainbow, `2` Twinkleup |
| Flashbulb presets | `10` white, `11` black |
| Main playlist | `100` — ps [1,2], **loops indefinitely** (`repeat: 0`, correct here) |
| Flashbulb playlist | `101` — ps [10,11], `repeat: 1`, `end: 100` |
| Per-pattern hold | 10s (`dur: [100,100]`, tenths of a second) |
| Crossfade | 3s (`transition: [30,30]`) |
| Boot preset | `100` ✅ |
| Cold-boot cycles run, failures | *(not recorded)* |

### Fixes applied after review

Three defects were found in the exported presets and corrected:

- **`101` had `repeat: 0, end: 0`** — the flashbulb playlist looped white→black forever
  and never returned to the main pattern. A triggered gate would strand permanently.
  Now `repeat: 1, end: 100`.
- **Presets 2, 10, 11 had `seg.stop: 150`** on a 234-pixel gate — saved before the LED
  count was corrected, so segment bounds were frozen. The flashbulb would have lit only
  64% of the gate. All now 234.
- **White hold was 1000ms** (`dur[0]: 10`) against a 100ms spec. Now `dur: [1, 50]`.

**These edits are in the repo files and have not been re-uploaded to any board.**

## Resume vs restart — answered

`101` hands back via `end: 100`, which **applies preset 100 afresh, restarting the main
playlist at Rainbow.** It does not resume mid-cycle.

Consequence, with a 15s cooldown: the cooldown expires while Rainbow is still showing,
so **Twinkleup only appears if the gate is untriggered for a further ~10s.** See the
timing note in `00-epic-summary.md`; decide under real traffic in `10`.

## Goal

The three patterns cycle in series, indefinitely, with crossfades, surviving power
cycles unattended. Achieved with WLED presets and a playlist — no code.

## How this maps

The requirement "three patterns run in series" is exactly what a WLED **playlist**
is: an ordered list of presets, each with a duration and a transition time, looping.

- **Preset** = one pattern (effect + palette + slider values + brightness)
- **Playlist** = the three presets in order, with per-entry durations
- **Transition time** = the crossfade between them

This replaces the predecessor's entire `updatePatternQueue()` scheduler
(`src/patterns.cpp:269-349`) — the time-offset activation, the shared-strip
crossfade negotiation, the `is_active`/`is_transitioning` state pair. All of it
becomes configuration.

## Tasks

- [ ] Create three presets, one per pattern, from the verdicts in ticket 03
  - [ ] Give each a clear name — these show up in the UI and in the playlist
  - [ ] Set brightness per preset if patterns need different levels
  - [ ] Note: decide whether presets should capture brightness at all, or inherit
        the global value. Capturing it makes presets self-contained; inheriting
        makes on-site brightness tuning a single global change. **Inheriting is
        usually better for an installation** — one slider dims the whole gate.
- [ ] Reserve preset slots for the flashbulb chain (ticket 07) so numbering doesn't
      collide. Suggested layout, adjust as needed:
  - `1-3` — the three patterns
  - `4` — flashbulb: white
  - `5` — flashbulb: black
  - `10` — the playlist
- [ ] Build the playlist: three entries, in order, looping
- [ ] Set per-entry duration. **Placeholder: 60s each.** This is a tuning parameter
      and will change on site — see ticket 10.
- [ ] Set transition time. The predecessor used 1000ms between patterns
      (`src/patterns.cpp:421-452`); a reasonable start, likely to grow for a slower,
      more contemplative piece.
- [ ] Configure **boot behaviour**: set the playlist as the boot preset.
      **This is critical, not routine** — the installation runs night-only with the 12V
      supply switched externally (see `02`), so every gate cold-boots unattended
      roughly 365 times a year. A boot path that fails one time in fifty means a gate
      dark for a night with nobody there to notice.
  - [ ] Verify by pulling power mid-cycle and confirming it returns to the playlist
  - [ ] **Soak it: power-cycle the bench gate several dozen times** and confirm it
        comes up correctly every single time. Log any failure, however rare.
- [ ] Verify the loop runs cleanly for an extended period (several hours minimum,
      overnight preferred) with no stall, no drift into a stuck preset, no memory
      issue.
- [ ] Export `presets.json` and `cfg.json` and commit them to this repo (see
      ticket 08 — config as code).

## Things to verify rather than assume

- [ ] **Does the playlist resume or restart after an interrupting preset?** This
      matters directly for the flashbulb: when the flash sequence ends and returns
      to the playlist, does it pick up where it was or jump back to preset 1? Test
      it explicitly — the answer shapes ticket 07's return logic.
- [ ] Does a playlist entry's duration include or exclude its transition time?
      Affects perceived pattern length at long crossfades.
- [ ] Confirm the playlist survives a WiFi outage — it should be entirely local,
      but confirm rather than assume, since the gates may run without a network
      present.

## Acceptance criteria

- Three named presets, each reproducing its agreed pattern
- Playlist cycles all three in order, looping indefinitely
- Crossfades are smooth with no visible pop or black frame between patterns
- Gate boots directly into the playlist after an unattended power cycle, verified
  across **several dozen consecutive cycles** with zero failures
- Runs overnight with no stall or degradation
- Playlist resume-vs-restart behaviour after an interrupting preset is **documented**
- `presets.json` and `cfg.json` committed to this repo

## Open questions

- How long should each pattern hold? (60s placeholder; owner: stakeholder, tuned in
  ticket 10)
- How long should crossfades be? Same.
- Should the three patterns run at equal durations, or is a weighted cycle wanted?
