# 11 — Migrate from Bench ESP32 to QuinLED Dig-Next-2

**Blocks on:** ~~06 (usermod working on the bench)~~ — see *Bench stage skipped* below
**Blocks:** 09 — the fleet cannot be commissioned on bench hardware

## Status — software done, hardware pending

QuinLED boards are on hand (1–2 of 6) along with a real 234-pixel WS2815 run. The
software half of this ticket is complete; the hardware half is the runbook in
**`BRINGUP.md`** at the repo root.

Done:

- [x] WLED checked out and the fleet binary **builds** — `WLED_16.0.1_SEVENTHGATE.bin`
- [x] Usermod verified to compile, link, and register (see *Build resolved* below)
- [x] `wled_cfg.json` promoted to the QuinLED baseline; bench config discarded
- [x] Build env version-controlled at `usermods/hcsr04_flashbulb/platformio_override.ini`

- [x] Board 1 flashed, provisioned, running the Main Pattern playlist on the real
      234-pixel strip. Patterns confirmed correct by eye.
- [x] **Power fault found and fixed** — the fused outputs are relay-gated, see below

Pending, all requiring the physical board: `BRINGUP.md` sections 4 (measurements, soak,
cold-boot cycling), 6 (the whole sensor chain — nothing is wired yet) and 7.

### ⚠️ The fused power outputs are relay-gated — GPIO 20

The largest finding of the migration, and one that would have shipped six dark gates.

The QuinLED's fused power outputs are **not** straight passthrough. Each is switched by an
onboard relay; the one feeding the LED output is driven by **GPIO 20**. `hw.relay.pin` was
`-1` (WLED's default, inherited from the bench config), so the relay never closed and the
strip received nothing despite the board being fully alive.

What made it hard to read: 12V present at the input, fuse intact, ground continuous, and
**2.6V on the output terminal** instead of 0V — the data line back-feeding the strip
through the WS2815 ICs' ESD diodes. The board looked half-powered and the fault presented
as a supply or wiring problem.

Fix, now in the repo baseline: `"relay": {"pin": 20, "rev": false, "odrain": false}`.

Second-order consequences, recorded in `BRINGUP.md` section 3b:

- WLED's relay follows on/off state, so **any preset with `on: false` physically cuts
  strip power**. All six presets are `on: true` today — preset 11 "Flashbulb Black" is
  black *colour* at full brightness, not off. That is now a constraint, not a
  coincidence.
- `def.on` must stay `true` for the nightly unattended cold boot.
- Outputs 2 and 3 sit on GPIO 21/22 and stay undriven. WLED's built-in relay handles one
  pin only, so using a second power output would need the `multi_relay` usermod — which
  breaks the one-usermod fleet-baseline rule. Relevant if anyone later wants to split the
  234-pixel run across outputs.

The repo already warned that GPIO 21/22 are relay control lines rather than I²C. What was
missing is that **GPIO 20 gates the LED power output**, and the fleet cannot function
without it configured.

### Bench stage skipped — 06 is now verified here, not before

This ticket nominally blocked on 06 ("usermod working on the bench"). The usermod was
written but **never run on any hardware**, and the bench ESP32 is not going into the
installation. Verifying the sensor chain on hardware that will be thrown away is wasted
work, so 06's hardware checklist moved into `BRINGUP.md` section 6 and is executed on the
QuinLED. 06 and 11 now close together.

The bench ESP32's only remaining value was proving the usermod compiles, and that is now
proven directly against the fleet binary.

### Build resolved

**The version tag in every doc was wrong.** The repo pinned "WLED 0.16.1"; there is no
`v0.16.x` tag upstream. WLED renumbered after `v0.15.5`, so the baseline is **`v16.0.1`**
(`VERSION 2605010`). Same release, different scheme. Docs corrected.

API compatibility against `v16.0.1`, checked rather than assumed — all three
version-sensitive lines flagged in the source are correct as written:

| Line | Result |
|---|---|
| `REGISTER_USERMOD(hcsr04_flashbulb);` | Matches `PIR_sensor_switch` exactly |
| `PinManager::allocatePin(gpio, output, tag)` | `PinManager` is a **namespace** in 16.x; the call form is unchanged |
| `createNestedObject` / `createNestedArray` | ArduinoJson **6.18.1** — native, not deprecated |

Link verified in the ELF, not inferred from a successful compile:

- `um_hcsr04_flashbulb` present in WLED's usermod registry array
- `hcsr04EchoISR()` at `0x40080edc` — **inside IRAM**, so `IRAM_ATTR` took effect
- `Gate distance` / `Flashbulb` info-panel strings present in the binary
- `audioreactive` **excluded** — `custom_usermods` in the override replaces the base
  env's value rather than appending, so the fleet binary carries this usermod and
  nothing else. This also removes AudioReactive's claim on GPIO 32, which is Trig here.

Base env is `esp32dev_8M` (8MB flash, `large_partitions`). Flash 60.2%, RAM 24.7%.

⚠️ **First flash must be `esptool.py erase_flash`.** WLED's platformio.ini warns that an
existing ESP32 install cannot be updated to an IDF-V4 build and that OTA to it misbehaves.
QuinLED boards ship with WLED preinstalled, so this applies out of the box.

## Why this exists

Development is happening on a **plain ESP32 dev board**, not the target QuinLED
Dig-Next-2. Everything currently in `wled_cfg.json` is bench configuration.

This matters more than a pin swap, because **ticket 01's bring-up was completed on the
bench board.** Pixel addressing, colour order, data integrity over the full 234-pixel
run, and the power baseline were all verified against hardware that is not going into
the installation. Those checks have to be re-run on the real board with the real strip
before `09` can start.

## Pin map: bench → target

| Function | Bench (current) | QuinLED target | Note |
|---|---|---|---|
| LED data | GPIO 16 | **GPIO 2** (or 4) | Level-shifted, ESD/overvoltage protected on the QuinLED |
| HC-SR04 Trig | TBD | **GPIO 32** (QEXP) | |
| HC-SR04 Echo | TBD | **GPIO 33** (QEXP) | Never 34/35 — debounce destroys the pulse |
| HC-SR04 5V | dev board 5V | **Relay JST PH, constant 5V pin** | QEXP is 3.3V only |
| Button | `-1` disabled | `-1`, or **34** for a service button | See below |

- [ ] **Meter the QEXP pins and the relay-port 5V on the physical board** before wiring.
      Confirm which relay-port conductor is constant 5V versus the GPIO 5 trigger.
- [ ] Update `trigPin` / `echoPin` in the usermod config if the bench used different pins
- [ ] Update the LED bus pin in `cfg.json`
- [ ] **Reboot after pin changes** — the usermod stages them but does not re-init the ISR live

## Differences that are not just pin numbers

**GPIO 34/35 pull-ups.** On the QuinLED these are hardware-debounced and pulled high. On
a bare ESP32 they are input-only with **no internal pull-up**, so anything wired there
floats. The button is currently `-1` (disabled) because that is correct on both boards.
If ticket 08's AP-on-button-hold service button is wanted, GPIO 34 becomes valid **only**
on the QuinLED.

**Level shifting is needed on both.** A raw ESP32 GPIO is 3.3V max just like the QuinLED.
The Echo divider or BSS138 module is required on the bench too — do not defer it.

**Power is a different world.** The bench board is presumably driving a short test strip
off USB. The target is 234 WS2815 pixels at 12V with a flashbulb that drives them all to
full white.

- [ ] Confirm whether ticket 02's measured draw figures were taken on the **real strip
      and PSU** or on bench hardware. If bench, they are not valid and 02's recorded
      values need retaking.
- [ ] ABL is currently disabled (`maxpwr: 0`). Set it from real measurements, or record
      the deliberate decision to run without it on a PSU sized for full white.

## Re-verify on the real board

Re-run the parts of `complete/01-hardware-bringup.md` that depend on hardware:

- [ ] Pixel 0 and 233 at expected physical positions on the real gate
- [ ] Colour order verified empirically (WS2815, expect GRB — confirm, do not assume)
- [ ] Full-white fill uniform end to end, no tint gradient toward the far end
      (a gradient means voltage drop → second injection point)
- [ ] 10+ minutes of fast animation with no flicker or corruption at the far end
- [ ] WS2815 backup data line continuity through the full run
- [ ] Idle and full-white draw measured and recorded
- [ ] Cold-boot soak: several dozen cycles, zero failures
- [ ] Board MAC recorded

Then re-verify the sensor chain from `06`:

- [ ] Distance readings sane in the info panel on QuinLED wiring
- [ ] **Frame rate unaffected** by sensor reads
- [ ] Trigger fires preset 101; gate returns to preset 100
- [ ] Cooldown suppresses retriggering

## Config management — RESOLVED

`wled_cfg.json` **is now the QuinLED fleet baseline**, promoted in place. The bench
variant was discarded rather than kept under `config/bench/`: the bench board is not
going into the installation, and a second config file that boots a gate with its LED
data on the wrong pin is a trap, not an asset.

Changes made:

| Field | Was | Now | Why |
|---|---|---|---|
| `hw.led.ins[0].pin` | `[16]` | `[2]` | bench ESP32 → QuinLED output 1 |
| `id.mdns` / `id.name` | `wled-e8a2ac` / `WLED` | `gate-1` / `Gate 1` | per-gate |
| `um.HCSR04Flashbulb` | *absent* | full block, `readIntervalMs: 97` | the bench export had no usermod block at all — proof the usermod had never run on that board |
| `um.AudioReactive` | present, disabled | **removed** | not compiled into the fleet binary, and its stale `digitalmic.pin` claimed **GPIO 32** — which is Trig |
| `vid` | `2606300` | `2605010` | the bench export was from a build **newer** than v16.0.1. A cfg claiming a newer version than the running firmware makes WLED skip its config migrations |

- [x] `presets.json` carries over unchanged — confirmed, not assumed. All four patterns
      are `seg 0–234`, `def.ps` is `100`, and the `101 → end: 100` hand-back is intact.
      No pin or board state anywhere in the file.

Still open: `hw.led.ins[0].ledma` is `30`, a **5V-per-LED** figure, and WLED's ABL maths is
5V-based. It does not describe a 12V WS2815 pixel. Harmless while `maxpwr: 0`, wrong the
moment ABL is switched on. See `BRINGUP.md` section 5.

## Acceptance criteria

- One gate fully working on QuinLED hardware with the real 234-pixel WS2815 run
- All ticket 01 hardware checks re-run and passing on the target board
- Sensor chain verified on QuinLED wiring, frame rate unaffected
- Draw measured on the real strip; ABL set from it or its absence recorded as deliberate
- QuinLED config promoted to the repo baseline; bench config resolved
- `09` can proceed against hardware that matches the installation

## Open questions

- ~~How many QuinLED boards are on hand?~~ **1–2 of 6.** Enough for this ticket; `09`
  stays blocked on the remaining boards arriving.
- ~~Is the real 234-pixel WS2815 run available for testing?~~ **Yes** — the full run and
  a 12V PSU are on the bench, so section 4's voltage-drop, uniformity, and draw
  measurements can all be taken for real.
- Were ticket 02's measurements taken on real hardware? — still open, resolved by
  `BRINGUP.md` section 5.
- Is the LED data terminal actually GPIO 2? Taken from QuinLED's pinout guide, not from
  the board in hand. `BRINGUP.md` section 0 confirms it before anything is powered.
