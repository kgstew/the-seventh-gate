# 11 — Migrate from Bench ESP32 to QuinLED Dig-Next-2

**Blocks on:** 06 (usermod working on the bench)
**Blocks:** 09 — the fleet cannot be commissioned on bench hardware

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

## Config management

Right now `wled_cfg.json` is a **bench** config sitting where `08`/`09` expect fleet
config. Resolve at migration:

- [ ] Promote the QuinLED config to the repo baseline once verified
- [ ] Decide whether to keep a bench variant (e.g. `config/bench/`) or discard it
- [ ] `presets.json` should carry over unchanged — it holds no pin or board state.
      Confirm rather than assume.

## Acceptance criteria

- One gate fully working on QuinLED hardware with the real 234-pixel WS2815 run
- All ticket 01 hardware checks re-run and passing on the target board
- Sensor chain verified on QuinLED wiring, frame rate unaffected
- Draw measured on the real strip; ABL set from it or its absence recorded as deliberate
- QuinLED config promoted to the repo baseline; bench config resolved
- `09` can proceed against hardware that matches the installation

## Open questions

- How many QuinLED boards are on hand? Migration needs at least one before `09`.
- Is the real 234-pixel WS2815 run available for testing, or only a short test strip?
- Were ticket 02's measurements taken on real hardware?
