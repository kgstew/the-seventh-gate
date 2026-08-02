# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

Control configuration for **The Seventh Gate** — six independent lighting gates, each
234 WS2815 pixels driven by its own QuinLED Dig-Next-2 running **WLED 0.16.1**. Two
patterns cycle in series; one ultrasonic sensor per gate triggers a "flashbulb" on that
gate only. There is no cross-gate coordination.

The repository is deliberately small because **WLED is the chassis**. Sequencing,
crossfades, power limiting, OTA, and the web UI are all configuration, not code. The
repo therefore contains only:

| Path | Role |
|---|---|
| `usermods/hcsr04_flashbulb/` | The **only custom code in the project** — HC-SR04 → flashbulb trigger |
| `wled_presets.json` | Patterns, playlists, flashbulb chain — the installation's behaviour |
| `wled_cfg.json` | Device config: LED bus, network, usermod settings. **Currently a bench export, not the fleet baseline** |
| `.claude/epic/` | Ticket-per-file decision record; completed tickets move to `complete/` |

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
Boards are reached at `gate-1.local` … `gate-6.local`, or `4.3.2.1` via AP fallback.
Ticket 09 calls for a fleet push script; it does not exist yet.

There is no test suite. Verification is the hardware checklists in the usermod README
and `09-fleet-commissioning.md`.

## Architecture that spans files

**Preset numbering is a contract across three files.** Break it and a triggered gate
strands permanently:

- `1` Rainbow, `2` Twinkleup — the two patterns
- `10` Flashbulb White, `11` Flashbulb Black
- `100` Main Pattern playlist — `ps [1,2]`, `repeat: 0` (loops forever), **the boot preset** (`cfg.json` → `def.ps`)
- `101` Flashbulb Playlist — `ps [10,11]`, `repeat: 1`, **`end: 100`** — the hand-back to the main playlist
- The usermod's `flashPresetId` default is **101**. Renumber presets and you must change it too.

`101` ends by *applying* `100`, which **restarts** the main playlist at Rainbow rather
than resuming. Combined with the 15s cooldown this means Twinkleup may rarely be seen
under steady traffic — a known interaction, documented in the epic summary, to be
resolved in ticket 10, not silently "fixed".

**Segment bounds must be 234 in every preset.** Presets were once exported with
`seg.stop: 150` and the flashbulb lit only 64% of the gate. There is no ledmap and no
segment split — patterns address a flat 0–233 index.

**Three values are genuinely per-gate**, everything else clones identically across the
fleet: hostname, `thresholdCm`, and `readIntervalMs` (primes 97/101/103/107/109/113, to
desynchronise ultrasonic pings between gates). IP belongs in DHCP reservations on the
router, not in a cloned `cfg.json`.

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

- **Development is on a plain ESP32 dev board, not the QuinLED.** `wled_cfg.json` has
  the LED bus on GPIO 16; the target is GPIO 2. Migration is ticket 11. Do not treat
  bench-verified results as valid for the fleet.
- **GPIO 34/35 are never valid for Echo** — hardware debouncing destroys a
  width-encoded pulse, and they are input-only. Trig 32 / Echo 33 via QEXP.
- **Every GPIO is 3.3V max; Echo outputs 5V** — level conversion is mandatory on both
  the bench and the target board.
- **QEXP is 3.3V only.** Sensor 5V comes from the external relay JST PH connector's
  *constant* 5V pin — not the GPIO 5-driven trigger pin, which idles low and makes the
  sensor look dead.
- **GPIO 0 is the boot strapping pin**; held low at power-on the board enters download
  mode. Gates cold-boot unattended ~365 times a year, so this is a nightly risk.
- **GPIO 21/22 are relay control lines here**, not I²C. Never call a bare
  `Wire.begin()` — always `Wire.begin(15, 14)`.
- Operation is **night-only** with the 12V supply switched externally. Nothing may
  depend on NTP or time of day, and nothing may depend on a network being present —
  running with no reachable AP is the *normal* state.

## Predecessor project

`~/Code/reflecting-the-present` is an earlier ESP32/FastLED installation. **Do not port
it.** Its multi-strip address mapping and overlapping-pattern scheduler are both
unwanted here. It is a reference for pattern math only, and the epic summary lists four
known bugs in it not to carry forward.
