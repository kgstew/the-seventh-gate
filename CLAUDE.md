# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

Control configuration for **The Seventh Gate** — six independent lighting gates, each
234 WS2815 pixels driven by its own QuinLED Dig-Next-2 running **WLED 0.16.1**. Two
patterns cycle in series; one ultrasonic sensor per gate triggers a "flashbulb" on that
gate only. There is no cross-gate coordination.

The repo also covers a second, separate installation on a different control chassis — the
**Stupa** (authored in Chromatik and driven by an Advatek pixel controller, *not* WLED).
It shares nothing with the gate fleet but the WS2815 pixel type; see *The Stupa* below.

The repository is deliberately small because **WLED is the chassis** for the gates. Sequencing,
crossfades, power limiting, OTA, and the web UI are all configuration, not code. The
repo therefore contains only:

| Path | Role |
|---|---|
| `usermods/hcsr04_flashbulb/` | The **only custom code in the project** — HC-SR04 → flashbulb trigger |
| `wled_presets.json` | Patterns, playlists, flashbulb chain — the installation's behaviour |
| `wled_cfg.json` | Device config: LED bus, network, usermod settings. **Currently a bench export, not the fleet baseline** |
| `.claude/epic/` | Ticket-per-file decision record; completed tickets move to `complete/` |
| `stupa/` | The **Stupa** sculpture — Chromatik project (`.lxp`) + fixture (`.lxf`) for its Advatek controller; unrelated to the gate fleet (see *The Stupa*) |

Read `.claude/epic/00-epic-summary.md` first — it holds the architecture decisions,
hardware pinout, open questions, and the ticket dependency graph. Ticket files are the
authority on *why*; this file only summarises what a code change must respect.

## Build and deploy

There is nothing to build in this repo. The usermod compiles **out of tree** against a
separate WLED checkout:

```sh
# 1. Clone WLED, check out v0.16.1 (the frozen fleet baseline)
# 2. Expose this directory to that build — symlink, so edits here are what compiles:
ln -s /path/to/the-seventh-gate/usermods/hcsr04_flashbulb \
      /path/to/WLED/usermods/hcsr04_flashbulb        # usermods/ at WLED repo root, not wled00/
# 3. In WLED's platformio_override.ini:
#      [env:seventhgate]
#      extends = env:esp32dev
#      custom_usermods = hcsr04_flashbulb
pio run -e seventhgate -t upload                     # run from the WLED tree
```

Config deploys as file uploads to a board's web UI (`/edit` filesystem interface or the
JSON API) — `presets.json` first, `cfg.json` last, since it may force a reconnect.
⚠️ **`cfg.json` carries `nw.ins[0].ssid` and overwrites it.** The passphrase is preserved
(WLED only applies `psk` when present, and the export omits it), but the SSID is not — so
uploading the baseline to a board provisioned onto a different network sends it to
`WLED-AP`, where it looks dead from the LAN while running perfectly. Check that field
against the board's actual network before every `cfg.json` push.
Boards are reached at `gate-1.local` … `gate-6.local`, or `4.3.2.1` via AP fallback.
Ticket 09 calls for a fleet push script; it does not exist yet.

There is no test suite. Verification is the hardware checklists in the usermod README
and `09-fleet-commissioning.md`.

## Architecture that spans files

**Preset numbering is a contract across three files.** Break it and a triggered gate
strands permanently:

- `1` Rainbow, `2` Twinkleup (**red**) — the two patterns
- `10` Flashbulb White, `11` Flashbulb Black, `12` Flashbulb Recover, `13` Flashbulb Sparkle
- `100` Main Pattern playlist — `ps [1,2]`, `repeat: 0` (loops forever), **the boot preset** (`cfg.json` → `def.ps`)
- `101` Flashbulb Playlist — `ps [10,13,11,12]`, `repeat: 1`, **`end: 100`** — the hand-back to the main playlist
- The usermod's `flashPresetId` default is **101**. Renumber presets and you must change it too.

**`12` Flashbulb Recover must stay pixel-identical to `1` Rainbow.** The flash fades *up*
into `12` from black, so when the playlist hands back to `100` the strip is already
rendering exactly what `1` renders and the hand-back is visually a no-op. Change Rainbow
and you must change `12` with it, or a step reappears at the hand-back.

⚠️ **In a WLED playlist, every entry's `transition` must be strictly shorter than its
`dur`.** This is not a style preference. An entry whose fade is still running when the
entry ends never *commits*, so the next crossfade blends from the last committed state
rather than from what is on the pixels. `101` originally had `dur: [1,50]` against
`transition: [0,50]` — the 5s fade to black ran exactly as long as its 5s entry, so the
hand-back blended from preset `10`'s **white** and produced a second, phantom flash.
Diagnosed by capturing WLED's live-preview frame buffer; neither colour nor brightness
changes touched it. Every entry now carries 2s of settle.

**The flash decays through sparkle, and the decay is made of crossfades, not brightness.**
WLED renders *both* effects during a transition and blends the two frames, so a crossfade
from a solid preset into an effect preset dissolves the solid surface into that effect.
The flash therefore goes white → `13` (Twinkleup, `ix: 255` — every pixel twinkling) →
`11` black: noise rises out of the white over 5s, then the whole field fizzles down over
9s. Measured off the live-preview buffer, spatial stdev across the strip climbs 10 → 90
on the way in and falls linearly 84 → 0 on the way out. `13` must keep `pal: 0`; with
palette 0 the effect takes `col[0]` directly, which is what makes the sparkle white
rather than palette-coloured. `13` shares its effect with pattern `2` but **not** its
colour — `2` is red, `13` is white, deliberately. They are not a matched pair the way
`1` and `12` are, so recolouring one must not drag the other with it.

⚠️ **A playlist entry that changes only effect *parameters* does not crossfade.** WLED
starts a blend when `fx`, colour, or palette changes — not when `ix`/`sx` change, which
apply instantly. The decay originally had a second sparkle stage `14` at `ix: 96` to thin
the field before black; on hardware it **popped** (mean 131 → 46 in one frame) and, worse,
the following fade to black blended from a *full-density* render, so all 234 pixels
relit and mean rose 46 → 88 before decaying — a visible second bloom, the same class of
artifact as the phantom flash below. Any future stage that wants to differ from its
neighbour must differ in **`fx`**, not just in slider values.

**All presets run at `bri: 255`.** One brightness everywhere means no preset boundary can
produce a brightness step. `cfg.json` → `def.bri` matches, so boot has no step either.
This is also why the decay is built from crossfades between full-brightness presets.

**The sensor cooldown must exceed the whole flash sequence.** `101` currently runs 35.1s
(0.1s white + 16s sparkle decay to black + 2s black + 17s fade up); `cooldownSec` is **300**.
Shorten the cooldown below the sequence and the sensor re-fires mid-fade, which visibly
corrupts it.

**Segment bounds must be 234 in every preset.** Presets were once exported with
`seg.stop: 150` and the flashbulb lit only 64% of the gate. There is no ledmap and no
segment split — patterns address a flat 0–233 index.

**Three values are genuinely per-gate**, everything else clones identically across the
fleet: hostname, `deltaCm`, and `readIntervalMs` (primes 97/101/103/107/109/113, to
desynchronise ultrasonic pings between gates). IP belongs in DHCP reservations on the
router, not in a cloned `cfg.json`.

**Detection is relative, not absolute — `thresholdCm` no longer exists.** The sensor fires
on *passage*: something `deltaCm` closer than a self-tracking background estimate, not
something nearer than a fixed distance. A gate's background is whatever sits across its
opening, which differs per gate and drifts with temperature. See the usermod README.

**`cfg.json` / `presets.json` are minified single-line device exports.** Edit them
surgically or regenerate by exporting from a board. Their schemas are not guaranteed
portable across WLED major versions, which is why 0.16.1 is pinned. Note that the repo's
current presets contain review fixes that **have not been uploaded to any board**.

## Constraints on usermod changes

- **Never block the frame loop.** WLED's frame budget is ~24ms; `pulseIn()` on a
  no-echo read stalls ~25ms and visibly stutters the LEDs. Echo capture is
  interrupt-driven for this reason and nothing blocks longer than the ~14µs trigger.
- **The ISR uses a phase counter, not `digitalRead()`.** `digitalRead()` is not
  guaranteed IRAM-resident, and calling flash-resident code from an IRAM ISR can crash
  when flash is busy. `micros()` is safe.
- **Keep `harvestMeasurement()` the only sensor-specific function.** Streak, cooldown,
  config, and info panel are deliberately sensor-agnostic so the documented VL53L1X
  fallback stays a one-function swap.
- **`addToJsonInfo()` is load-bearing, not diagnostics.** The live distance and
  armed/cooldown readouts are what make on-site calibration possible without a laptop.
- Version-sensitive lines, flagged in the source: `REGISTER_USERMOD(...)`,
  `PinManager::allocatePin` (static form is 0.15+), and `createNestedObject` /
  `createNestedArray` (ArduinoJson 6 form; AJ7 wants `.to<JsonObject>()`).
  Cross-check against `usermods/PIR_sensor_switch/` in the WLED tree.
- Pin changes are staged, not applied live — a reboot is required.

## Hardware facts that change code decisions

- **Migration to the QuinLED is done (ticket 11).** `wled_cfg.json` is now the QuinLED
  fleet baseline — LED bus on GPIO 2, usermod block present, relay on GPIO 20 — verified
  running on board 1 (ESP32-PICO-V3-02, MAC `c0:cd:d6:3b:af:b0`). The bench ESP32 config
  is gone. Remaining hardware work is in `BRINGUP.md`.
- **The firmware baseline tag is `v16.0.1`, not `v0.16.1`.** WLED renumbered after
  `v0.15.5`; no `v0.16.x` tag exists. Docs saying "0.16.1" mean `v16.0.1`.
- **GPIO 34/35 are never valid for Echo** — hardware debouncing destroys a
  width-encoded pulse, and they are input-only. Trig 32 / Echo 33 via QEXP.
- **Every GPIO is 3.3V max; Echo outputs 5V** — level conversion is mandatory on both
  the bench and the target board.
- **QEXP is 3.3V only.** Sensor 5V comes from the external relay JST PH connector's
  *constant* 5V pin — not the GPIO 5-driven trigger pin, which idles low and makes the
  sensor look dead.
- **GPIO 0 is the boot strapping pin**; held low at power-on the board enters download
  mode. Gates cold-boot unattended ~365 times a year, so this is a nightly risk.
- **The fused power outputs are relay-gated. `hw.relay.pin` must be `20`.** The QuinLED
  does not pass 12V straight through to its output terminals — an onboard relay switches
  each one, and GPIO 20 drives the one feeding the LED strip. At WLED's default of `-1`
  the relay never closes and the gate is dark, while the board itself looks perfectly
  healthy. Because WLED ties the relay to on/off state, **no preset may use `on: false`**
  (that opens the relay and cuts strip power); use black at full brightness instead, as
  preset 11 does. `def.on` must stay `true` for the nightly cold boot.
- **GPIO 21/22 are relay control lines here**, not I²C. Never call a bare
  `Wire.begin()` — always `Wire.begin(15, 14)`. They gate the other two power outputs and
  are undriven; WLED's built-in relay supports only one pin, so a second output would
  require the `multi_relay` usermod and break the one-usermod fleet baseline.
- Operation is **night-only** with the 12V supply switched externally. Nothing may
  depend on NTP or time of day, and nothing may depend on a network being present —
  running with no reachable AP is the *normal* state.

## The Stupa (Chromatik + Advatek)

A **separate sculpture on a different control chassis** — authored in Chromatik (the LX
engine) and streamed as **sACN / E1.31** to one **Advatek PixLite A4-S Mk3**. Not part of
the six-gate WLED fleet and shares no code with it. In normal operation it plays
**standalone from the controller's microSD** (Advatek SHOWTime); the computer and network
are present only while programming.

**Structure.** 34 ring arcs = 17 rings × 2 mirrored sides (A/B), ~2,638 WS2815 pixels
total (~1,319 per side). The pixels are **12V, GRB, data-only** (no clock line).

**Files.** `stupa/Stupa_Show_2026_8out.lxp` is the Chromatik project; its model is 34
**embedded ArcFixtures** — the geometry lives in the `.lxp`, not in any `.lxf`.
`stupa/StupaColumnsUpdated.lxf` is a separate *columns* fixture blueprint and is **not
used** by the current arc-based show.

**Controller (A4-S Mk3, "ASS 1").** Static IP **10.0.0.21 / 255.255.255.0** — it *must* be
static; on AutoIP it self-assigns a `169.254.x.x` link-local that nothing can reach. Data
source sACN, "Pixels can be split across universes" **OFF**, RGB(W) Order **GRB**.
**Expanded Mode is ON**: it repurposes each output's clock pin as a second data line to
give **8 data-only outputs** (only valid because WS2815 is clockless), capped at **510 px
/ 3 universes per output**.

**Addressing is a contract — model and controller must agree.** Eight outputs, each one
contiguous block. Side A = outputs 1-4 (physical terminals 1 & 2), universes **1-9**; Side
B = outputs 5-8 (terminals 3 & 4), universes **10-18**. Each side splits rings **1-3 / 4-6
/ 7-9 / 10-17** = **312 / 329 / 299 / 379** px. Two things are baked into the model so the
controller needs no compensation: color order happens in exactly one place (**model sends
RGB, controller swaps to GRB**), and the **serpentine wiring is baked into pixel order** by
reversing every other ring (rings **2, 5, 8, 11, 13, 15, 17** per side) — so controller
**Zig Zag stays at 1** (its minimum = off) and **Reversed off**.

**Re-address, don't hand-patch.** The `.lxp` addressing and the controller table are a
matched pair (contiguous, split-OFF, 170 px/universe). If ring counts or the physical
output split change, regenerate the `.lxp` addressing rather than editing one side alone,
or the pixel map drifts.

## Predecessor project

`~/Code/reflecting-the-present` is an earlier ESP32/FastLED installation. **Do not port
it.** Its multi-strip address mapping and overlapping-pattern scheduler are both
unwanted here. It is a reference for pattern math only, and the epic summary lists four
known bugs in it not to carry forward.
