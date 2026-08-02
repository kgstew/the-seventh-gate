# 04 — Custom WLED Effects — CANCELLED

**STATUS: CANCELLED — not required.**

Ticket `03-pattern-vocabulary.md` found that **stock WLED effects cover all three
patterns.** There is no gap to fill, so no custom effect code will be written.

## What this does and does not change

**Does not change:** the fleet still runs a **custom WLED build.** Ticket `06`'s
HC-SR04 usermod requires compiling WLED, so the fork, the pinned upstream version, and
the rebase obligation all still exist. The binary simply contains the usermod and no
custom effects. Do not read this cancellation as "stock firmware is now viable" — see
`09-fleet-commissioning.md` for the fleet baseline.

**Does change:** no effect-API surface to maintain across upstream WLED upgrades, which
makes future rebases meaningfully cheaper.

## If this is ever reopened

The content below is retained as a working reference — the structural translation table
from the predecessor project's FastLED patterns to WLED's effect API is the useful part,
and the predecessor bug list is worth reading before touching that source.

---

## Goal

Port harvested pattern math into WLED as custom effects, exposed with UI sliders,
in a maintainable custom build deployable to all six boards.

## Cost of entering this ticket

The custom-build obligation is **already incurred by ticket 06** — the HC-SR04 usermod
requires compiling WLED, so a fork, a custom binary on all six boards, and a rebase
obligation on every upstream upgrade all exist whether or not this ticket runs.

Marginal cost here:

- Effect code to write and verify
- Upstream effect-API changes to absorb on rebase (a small increment on the rebase you
  already owe for the usermod)

Practically: put the usermod and any custom effects in **the same fork and the same
binary**, so there is one build to manage and one version to freeze for the fleet.

## The good news on porting

WLED uses FastLED's math layer for effects — `beatsin8`, `inoise8`,
`ColorFromPalette`, `blend`, `fadeToBlackBy` are all available. Harvested code from
`~/Code/reflecting-the-present` transfers largely intact; what changes is the
surrounding structure, not the math.

## Structural translation

| Predecessor | WLED equivalent |
|---|---|
| `void runXPattern(ChasePattern*)` | `uint16_t mode_x()` |
| Loop over `target_strips`, `getStripLED()` | Operate on `SEGMENT`, `SEGMENT.setPixelColor(i, c)` |
| `getStripLength(strip_id)` | `SEGLEN` |
| `pattern->params.x.someFloat` | `SEGMENT.speed` / `.intensity` / `.custom1-3` / `.check1-3` |
| `pattern->chase_position` | `SEGENV.step`, `SEGENV.aux0`, `SEGENV.aux1` |
| `pattern->palette[]` / `fastled_palette` | `SEGPALETTE`, `ColorFromPalette()` |
| Manual transition blending | **Delete it** — WLED owns transitions globally |

That last row matters: a large fraction of the predecessor's pattern code is
hand-rolled crossfade logic, and five of eight implementations got it wrong. All of
it is dead weight here. WLED crossfades on preset change.

## Tasks

- [ ] Set up a WLED build environment (PlatformIO) targeting the Dig-Next-2's ESP32
- [ ] Confirm you can build and flash **stock** WLED from source before adding
      anything — establish the baseline separately from your changes
- [ ] For each confirmed-custom effect:
  - [ ] Implement `mode_x()` against `SEGMENT` / `SEGLEN`
  - [ ] Register it with a mode string defining slider names and defaults so the
        parameters surface in the web UI
  - [ ] Map the predecessor's float params onto uint8 sliders; document the scaling
  - [ ] Verify on the bench gate at real density
- [ ] Do **not** carry forward the known predecessor bugs:
  - [ ] No `existing.lerp8(sameValue, t)` no-op blends (WLED handles transitions;
        you should not be writing blend code at all)
  - [ ] Watch `uint8_t` intermediate arithmetic — the predecessor's
        `(101 - speed) * 5` overflowed for any speed below 52
- [ ] Keep effect state within `SEGENV` slots; if you need more, allocate
      `SEGENV.data` properly rather than using statics (statics break with multiple
      segments)
- [ ] Pin the upstream WLED version you forked from; record it here
- [ ] Document the build + flash procedure in this repo

## Acceptance criteria

- Custom effect(s) build cleanly against a pinned upstream WLED version
- Parameters exposed as named UI sliders and live-tunable over WiFi
- Verified on the bench gate at real pixel density and viewing distance
- Stakeholder confirms the effect closes the gap identified in ticket 03
- Build and flash procedure documented and reproducible by someone else
- Upstream fork point recorded

## Open questions

- Which effect(s), and what specifically was the gap? (Populated from ticket 03)
- Who maintains the fork after handover?
