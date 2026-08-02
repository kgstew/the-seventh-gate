# Epic: The Seventh Gate — Lighting Control

## Overview

Six independent wishbone gates, each lit by a single continuous run of 234 WS2815
(12V, individually addressable) pixels driven by its own QuinLED Dig-Next-2
controller running WLED. **Two patterns** cycle in series. One proximity sensor per
gate triggers a "flashbulb" effect on that gate only.

Each gate is a fully self-contained unit. There is no cross-gate coordination in
this phase.

## Architecture decision: WLED, not custom firmware

WLED is the chassis. It provides, with no code written:

- **Playlists** — two patterns in series with per-entry duration and crossfade
- **Presets** — pattern definitions as versionable JSON
- **Transitions** — global crossfade between presets
- **ABL** — automatic brightness limiter for power protection
- **OTA + web UI** — reconfigure and retune from a phone, no cable, no reflash
- **Segments** — runtime geometry mapping if the physical read demands it later

### How much custom code — settled: exactly one usermod

**Patterns: none.** Ticket `03` found stock WLED effects cover both patterns, so
`complete/04-custom-effects.md` is **cancelled**. No effect code will be written.

**Sensor: one usermod.** The HC-SR04 (already owned) needs host-side pulse timing, so a
usermod is required — see `06-proximity-sensor.md`.

**Important: the fleet still runs a custom WLED build.** The usermod requires compiling
WLED, so the fork, the pinned upstream version, and the rebase obligation all remain.
Ticket 04's cancellation removes effect code, not the build. Do not read it as "stock
firmware is now viable."

**Fleet firmware baseline:** all six boards run one identical custom binary containing
the usermod and nothing else. Freeze and record the version before generating any
config — `cfg.json` / `presets.json` schemas are not guaranteed portable across WLED
major versions. Ticket 01's stock flash was bring-up only.

WLED drives pixels via NeoPixelBus but uses FastLED's math layer for effects
(`beatsin8`, `ColorFromPalette`, `blend`, `fadeToBlackBy`). Pattern math harvested
from the predecessor project therefore ports over largely intact if custom effects
turn out to be needed.

### Why not custom firmware

Roughly half of a custom build would be reimplementing infrastructure WLED already
ships — sequencer, crossfade, power limiting, OTA, config, web UI. Estimated scope
was weeks versus days, and every on-site tuning change would mean reflashing six
boards on a ladder rather than moving a slider on a phone.

## Predecessor project

`~/Code/reflecting-the-present` — ESP32/FastLED firmware for an earlier
installation (22 strips × 122 px across 6 output pins). **Do not port it.** Its
structural investment is multi-strip-per-pin address mapping, which this project
does not have; its scheduler implements overlapping time-offset patterns, which
this project does not want.

What is worth harvesting is the pattern math:

| Source | Value |
|---|---|
| `src/breathing_patterns.cpp` | `beatsin8` brightness range + palette interpolation |
| `src/chase_patterns.cpp:32-40` | Palette-gradient scroll via `ColorFromPalette` |
| `src/rainbow_patterns.cpp` | `fill_rainbow` with rotating start hue |
| `src/flashbulb_patterns.cpp` | 4-phase flash state machine and its timings |

Known bugs in that source, for anyone reading it as reference — do not carry these
forward:

- Transition-in blend is a no-op in 5 of 8 patterns (`existing.lerp8(sameValue, t)`)
- `uint8_t speed_divisor = (101 - speed) * 5` overflows for any speed below 52
- FlashBulb slots leak and jam after 5 triggers
- `saved_colors` is a ~40KB buffer that is written and never read

## Hardware

| Item | Spec |
|---|---|
| Controller | QuinLED Dig-Next-2 (ESP32, 8MB flash, 2MB PSRAM, 2 data out, 3 fused power out, I2C + QEXP) |
| Count | 6 — one per gate |
| Pixels | WS2815, 12V, individually addressable, 234 per gate (1,404 total) |
| Topology | Single continuous run from the injection point. No jumpers, no folds. |
| Sensor | 1 per gate — **HC-SR04 ultrasonic**, Trig GPIO 32 / Echo GPIO 33 via QEXP |
| Operating window | **Night only.** 12V supply switched externally (photocell or timer) — the ESP32 never knows the time. |

### Board pinout (QuinLED pinout guide)

LED data **GPIO 2 / 4** · relays **20 / 21 / 22** · external relay trigger **5** ·
hardware-debounced buttons **34 / 35** (input-only) · I²C Stemma QT **SDA 15 / SCL 14**
· QEXP **GPIO 0 / 25 / 32 / 33** · PDM mic **7 / 8**. All GPIO inputs **3.3V max**.

Three traps, each documented in the ticket that cares:
- **GPIO 0 is the boot strapping pin** — held low at power-on the board enters
  download mode. With nightly cold boots this is a nightly risk, not an edge case.
- **ESP32's default I²C pins (21/22) are relay control lines here** — never call a
  bare `Wire.begin()`.
- **GPIO 25 is ADC2**, unreadable while WiFi is active. Use 32/33 for anything analog.

Confirmed: because each gate is one continuous run from the injection point, **no
segment split or ledmap is required.** Patterns address a flat 0–233 index. If the
apex/arm symmetry reads wrong once gates are physically up, WLED segments
(`mirror`/`reverse`) or a `ledmap.json` can be added as runtime config without
touching pattern code.

## Tickets

Completed tickets move to `complete/`.

| # | Ticket | Blocks on | Status |
|---|---|---|---|
| 01 | `complete/01-hardware-bringup.md` — one gate flashed, configured, lit on the bench | — | ✅ COMPLETE |
| 02 | `complete/02-power-and-electrical.md` — PSU sizing, night switching, protection | — | ✅ COMPLETE |
| 03 | `complete/03-pattern-vocabulary.md` — 2 patterns chosen; stock effects sufficient | 01 ✅ | ✅ COMPLETE |
| 04 | `complete/04-custom-effects.md` — custom WLED effects | 03 ✅ | 🚫 CANCELLED |
| 05 | `complete/05-pattern-sequencing.md` — presets + playlist for 2-in-series | 03 ✅ | ✅ COMPLETE |
| 06 | `06-proximity-sensor.md` — HC-SR04 harness + usermod | 01 ✅ | **▶ READY — critical path** |
| 07 | `07-flashbulb-effect.md` — preset chain, trigger, cooldown | 05 ✅, 06 | Blocked on 06 |
| 08 | `08-network-and-ops.md` — router, addressing, OTA, config as code | 01 ✅ | **▶ READY** |
| 09 | `09-fleet-commissioning.md` — replicate to 6 gates | 05 ✅, 07, 08, 11 | Blocked |
| 10 | `10-field-tuning-acceptance.md` — on-site tuning and sign-off | 09 | Blocked |
| 11 | `11-quinled-migration.md` — bench ESP32 → QuinLED Dig-Next-2 | 06 | Blocked on 06 |

Critical path: ~~01~~ → ~~03~~ → ~~05~~ → **06** → 07 → **11** → 09 → 10.

⚠️ **Development is currently on a plain ESP32 dev board, not the QuinLED.** Ticket 01's
bring-up was completed on that bench hardware, so its checks must be re-run on the target
board — see `11-quinled-migration.md`. `wled_cfg.json` in this repo is presently a bench
config, not the fleet baseline.

**Everything now hinges on ticket 06.** It is the only remaining critical-path item and
the only custom code in the project — the HC-SR04 usermod, which also forces the custom
WLED build that becomes the fleet baseline. 08 is independent and can run in parallel
right now; 07 unblocks the moment 06 lands.

Half the epic is closed and no pattern work remains. The remaining risk is concentrated
almost entirely in sensor reliability — see 06's limitations section, and the cross-talk
and coat-absorption failure modes tracked in 09 and 10.

## Site conditions (confirmed)

- **No venue infrastructure and no cell service.** A small dedicated hotspot router
  provides the local WiFi network, with no internet uplink — it exists for service
  access only. Gates run standalone regardless. Must be **2.4GHz**; the ESP32 cannot
  see 5GHz. See `08`.
- **Night-only operation.** Resolves the time-of-day problem by removing it — the 12V
  supply is switched externally, so the ESP32 never needs to know the time. See `02`.
- **Consequence: ~365 unattended cold boots per year.** Boot reliability is now a
  primary concern, not an edge case. See `05`, `09`.
- Ambient light is not a design factor.

### Timing interaction to watch — pattern 2 may rarely be seen

With the current config, a triggered gate runs: flash ~5.1s → main playlist **restarts**
at preset 1 (Rainbow, 10s) → preset 2 (Twinkleup, 10s). The sensor cooldown is 15s.

So the cooldown expires at t=15s while Rainbow is still showing (it runs t≈5.1 to
t≈15.1). Twinkleup only appears if **no one triggers the gate for a further ~10s**. On a
gate with steady foot traffic, visitors may only ever see Rainbow and the flash.

Not a bug — the numbers simply interact badly. Levers: lengthen the cooldown, shorten the
pattern durations, or have the usermod restore playlist position instead of restarting.
Decide under real traffic in `10`, not from a spreadsheet.

## Open questions

These are unresolved and each one changes downstream work. Listed with the ticket
that owns resolution.

1. **Detection geometry** — opening width, mounting position, and whether the flash
   fires on approach or on passage. → `06`
2. **Controller-to-sensor distance**, measured at a real gate. Decides whether the
   HC-SR04 needs a simple divider or a level-shifter module. → `06`
3. **Measured WS2815 draw** on the real strip and PSU. ABL is currently disabled
   (`maxpwr: 0`) and cannot be set without this. → `02`, `11`
4. **Were ticket 02's measurements taken on real hardware**, or on the bench ESP32? If
   bench, they are not valid. → `11`
5. **Indoor or outdoor** still matters for enclosure and ingress rating, though it no
   longer affects sensor choice. → `02`
6. **Pattern timing under real traffic** — currently 10s per pattern with a 15s sensor
   cooldown. See the interaction note under Site conditions. → `10`

## Explicitly out of scope

- **Cross-gate choreography.** Deferred by decision. When it comes back, the
  constraint to know is that WLED syncs *state, not phase* — UDP sync groups
  broadcast "switch to preset N" and each board then runs on its own clock and
  drifts. Two viable approaches, neither requiring abandoning WLED:
  - *Shared-clock usermod* (~200–400 lines): one gate broadcasts a frame epoch,
    others phase-lock, effects rewritten as `f(global_time, gate_index)`.
  - *Selective DDP takeover*: local effects normally, a master streams DDP for
    choreographed moments; WLED auto-reverts on realtime timeout. No code.
  If choreography later becomes the centerpiece rather than an accent, revisit the
  custom-firmware decision — but not before.
- Arm A / Arm B segmentation — not needed, single continuous run confirmed.
- Audio reactivity (the board has an onboard microphone; unused this phase).
- Any cloud/remote-access layer.

## Epic acceptance criteria

- [ ] Both patterns cycle in series, correctly, on all six gates
- [ ] Each gate's sensor triggers the flashbulb on **that gate only**, with cooldown
- [ ] Every gate returns to correct running state after a power cycle, unattended
- [ ] All configuration (`cfg.json`, `presets.json`, usermod settings) is
      version-controlled in this repo and restorable to a replacement board
- [ ] Brightness, pattern timing, and sensor threshold are tunable on site with no
      laptop and no reflash
- [ ] Every gate runs correctly with **no network present** — that is the normal
      operating state; the service network is carried in, not installed
- [ ] Every gate comes up correctly from a **cold boot, unattended**, verified across
      dozens of power cycles — this happens nightly for the life of the installation
- [ ] No ultrasonic cross-talk between gates with all six running simultaneously
- [ ] A single gate can be swapped out and recommissioned from the repo in under
      30 minutes
