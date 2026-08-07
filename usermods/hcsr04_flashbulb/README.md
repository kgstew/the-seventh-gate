# HC-SR04 Flashbulb Trigger — WLED Usermod

One ultrasonic sensor per gate. On detection it applies the flashbulb preset, then
enforces a cooldown. This is the **only custom code in the project** and the sole reason
the fleet runs a custom WLED build.

See `.claude/epic/06-proximity-sensor.md` for the decision record and known limitations.

## Wiring — QuinLED Dig-Next-2

| HC-SR04 | Board | Notes |
|---|---|---|
| Vcc | **External relay JST PH — constant 5V pin** | ⚠️ see below |
| Trig | QEXP GPIO **32** (blue lead) | 3.3V out — marginal for a 5V part, see below |
| Echo | QEXP GPIO **33** (white lead) | **5V out — must be level-converted** |
| GND | QEXP GND | |

The bench ESP32 stage is over — `wled_cfg.json` is now the QuinLED baseline (LED bus on
**GPIO 2**), and the sensor chain is verified directly on the target board. See
**`BRINGUP.md`** at the repo root for the ordered procedure.

Meter the QEXP pins and the relay-port 5V on the real board before wiring. A wrong Trig
pin is a silent no-op; a wrong Echo pin fed 5V destroys a GPIO.

### ⚠️ Use the constant 5V, not the trigger

QEXP is **3.3V only** — confirmed. 5V comes from the external relay JST PH connector,
which carries **three** conductors: constant 5V, a switched 5V trigger driven by GPIO 5,
and GND.

Wire to the **constant 5V**. On the trigger pin the sensor is unpowered whenever GPIO 5
is low, which is its idle state — so the sensor reads as dead and the fault looks like a
software problem. **Identify the pins with a meter before connecting.**

Leave WLED's relay function unconfigured, or at least know it drives GPIO 5.

### ⚠️ Do not use GPIO 34 or 35 for Echo

They are the hardware-debounced button inputs. Debouncing is what makes them good for a
switch and fatal here — Echo encodes distance in *pulse width* (~150µs–25ms), which a
debounce filter smears or swallows. They are also input-only, so Trig could never live
there either.

### Level conversion

Echo outputs 5V; every GPIO on this board is **3.3V maximum**.

**Short run (under ~1m) — divider at the controller end.** 2.2kΩ from Echo to GPIO 33,
3.3kΩ from GPIO 33 to GND (≈3.0V). The commonly-cited 1kΩ/2kΩ pair yields 3.33V, right
at the limit. Keeping the divider at the *controller* end means the cable carries a
driven 5V signal, with better noise margin than a weak divided one.

**Longer run — BSS138 bidirectional level-shifter module at the sensor end.** Handles
both directions: Trig up to 5V where the sensor wants it, Echo down to 3.3V. No divider
at the controller.

The second option also fixes something the divider does not: **GPIO 32 driving Trig at
3.3V is already marginal** for a 5V part's threshold, and cable length makes it worse.
If triggering is unreliable, suspect this before suspecting the code.

Do not build the divider into a floating splice — perfboard, enclosure, strain relief.
These face nightly power cycles for a season unattended.

### Routing

Keep the sensor cable **away from the LED data line and the 12V run.** WS2815 data has
fast edges; the 12V run carries switching current. A width-encoded timing pulse routed
alongside either will pick up noise and produce phantom readings. Use twisted or
shielded multi-core.

## Build — WLED v16.0.1

**The tag is `v16.0.1`, not `v0.16.1`.** WLED renumbered after `v0.15.5`; no `v0.16.x`
tag exists upstream. Where this repo says "0.16.1" it means `v16.0.1` (`VERSION 2605010`).

From 0.15 onward usermods are PlatformIO libraries enabled with `custom_usermods`; there
is no manual `usermods_list.cpp` editing.

Files here:

| File | Purpose |
|---|---|
| `usermod_hcsr04_flashbulb.h` | The usermod class |
| `usermod_hcsr04_flashbulb.cpp` | ISR state, PROGMEM strings, registration |
| `library.json` | Makes the directory a PlatformIO library |
| `platformio_override.ini` | The `seventhgate` build env |

Both the usermod and the build env live in this repo, not the WLED tree, so they stay
version-controlled alongside the gate config. Symlink rather than copy, so edits here are
what actually compiles:

```sh
git clone --depth 1 --branch v16.0.1 https://github.com/wled/WLED.git ~/Code/WLED

ln -s ~/Code/the-seventh-gate/usermods/hcsr04_flashbulb        ~/Code/WLED/usermods/hcsr04_flashbulb
ln -s ~/Code/the-seventh-gate/usermods/hcsr04_flashbulb/platformio_override.ini \
      ~/Code/WLED/platformio_override.ini

cd ~/Code/WLED && pio run -e seventhgate
```

> `usermods/` is at the WLED **repo root** in 0.15+, not `wled00/usermods/`.

Output: `build_output/release/WLED_16.0.1_SEVENTHGATE.bin`. Flashing and first-boot
provisioning are in **`BRINGUP.md`** at the repo root.

The env extends `esp32dev_8M` — the QuinLED carries an ESP32-PICO-V3-02 with 8MB flash.
`custom_usermods` **replaces** the base env's value rather than appending, so the fleet
binary contains this usermod and nothing else. That is deliberate twice over: it is the
fleet-baseline rule from the epic summary, and it drops AudioReactive's stale claim on
GPIO 32, which is Trig here.

## Version-sensitive lines — verified against v16.0.1

All three spots flagged in the source are correct as written on this baseline. Re-check
on any version bump; `usermods/PIR_sensor_switch/` is the reference to compare against.

| Line | Status on v16.0.1 |
|---|---|
| `REGISTER_USERMOD(hcsr04_flashbulb);` | ✅ Matches `PIR_sensor_switch` exactly |
| `PinManager::allocatePin(gpio, output, tag)` | ✅ `PinManager` is a **namespace** in 16.x rather than a class with static methods — the call form is unchanged either way. On 0.14.x and earlier it was the instance form `pinManager.allocatePin(...)` |
| `createNestedObject` / `createNestedArray` | ✅ ArduinoJson **6.18.1** — native, no deprecation. If a future bump moves to AJ7: `root["u"].to<JsonObject>()` and `user["Name"].to<JsonArray>()` |

Verified in the ELF rather than inferred from a clean compile: `um_hcsr04_flashbulb` is
present in WLED's usermod registry array, and `hcsr04EchoISR()` resolves to `0x40080edc`
— inside IRAM, so `IRAM_ATTR` took effect.

## Confirmed running on hardware

First execution on a real board, 2026-08-06 (MAC `c0:cd:d6:3b:af:b0`):

- Usermod ID **900** appears in `/json/info` → `um`
- Info panel reports `Gate distance: no echo` and `Flashbulb: armed`
- **`no echo` rather than `off` is the meaningful result** — `off` is what prints when
  `enabled` is false *or* `pinsOk` is false, so this proves `PinManager` granted GPIO
  32/33 and `attachInterrupt` was installed. With no sensor wired, no echo is correct.
- Config round-trips: the board's `um.HCSR04Flashbulb` block matches this repo's
  `wled_cfg.json` exactly, so `addToConfig`/`readFromConfig` both work.

Still unrun: everything needing a sensor physically attached — see `BRINGUP.md` section 6.

## Configuration

All settings appear under **Config → Usermods** and persist in `cfg.json`, so they are
tunable from a phone with no reflash.

| Setting | Default | Notes |
|---|---|---|
| `enabled` | `true` | |
| `trigPin` / `echoPin` | 32 / 33 | **Reboot required to change** |
| `thresholdCm` | 150 | Fire when closer than this. Calibrate per gate. |
| `minValidCm` | 5 | Below this, discard as a bad reading |
| `maxValidCm` | 400 | Above this, treat as no target. Also sets the echo timeout. |
| `consecutiveHits` | 2 | Readings under threshold before firing |
| `cooldownSec` | 15 | Suppression window after a trigger |
| `readIntervalMs` | 100 | **Vary per gate — see cross-talk** |
| `flashPresetId` | **101** | "Flashbulb Playlist" — matches `wled_presets.json` |

`consecutiveHits` matters more than it looks. HC-SR04 readings are noisy, and a single
spurious short reading should not fire a flash across a whole gate. Raise it if you see
phantom triggers; lower it to 1 only if detection feels sluggish.

## Cross-talk between gates — set `readIntervalMs` per gate

Six ultrasonic sensors within earshot can hear each other's pings as their own echoes.
This **cannot be reproduced on a bench with one sensor** and will appear on site.

Give each gate a different, non-harmonic interval so they drift in and out of phase
rather than locking together. Primes work well:

| Gate | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| `readIntervalMs` | 97 | 101 | 103 | 107 | 109 | 113 |

This is one of the three genuinely per-gate values in `cfg.json`, alongside hostname and
`thresholdCm`.

## Field tuning

1. Open the gate's web UI → **Info**. Two live readouts: **Gate distance** and
   **Flashbulb** (armed / cooldown / disabled).
2. Stand where a visitor would. Read the distance. Set `thresholdCm` comfortably inside
   it — generous margin, not the edge.
3. **Test with people in winter outerwear.** Clothing absorbs ultrasound and this piece
   runs at night in the cold. A threshold calibrated against a t-shirt will miss people
   in coats. This is the biggest reliability risk in the sensor choice.
4. Leave margin for temperature drift — the speed of sound moves ~0.6 m/s per °C, so
   readings shift across seasons.
5. Watch for phantom triggers with all six gates live; adjust intervals or
   `consecutiveHits`.
6. Re-export `cfg.json` and commit it.

## Design notes

**Why interrupt-driven, not `pulseIn()`.** `pulseIn()` blocks, and a no-echo reading
blocks for the full timeout (~25ms at 4m). WLED's frame budget is ~24ms, so blocking
reads visibly stutter the LEDs. Here nothing blocks longer than the ~14µs trigger pulse.

**Why a phase counter instead of `digitalRead()` in the ISR.** `digitalRead()` is not
guaranteed to live in IRAM, and calling a flash-resident function from an IRAM ISR can
crash when flash is busy. Since we control when the trigger fires, the edge order is
known, so a phase counter is sufficient. `micros()` is IRAM-resident and safe.

**Why the read path is isolated.** `harvestMeasurement()` is the only HC-SR04-specific
code. Everything downstream — streak, cooldown, config, info panel — is sensor-agnostic,
so the documented VL53L1X fallback replaces one function rather than the usermod. If
cross-talk or coat absorption proves fatal in the field, that swap stays cheap.

## Not yet verified on hardware

Outstanding:

- [x] Compiles against the chosen WLED baseline — v16.0.1, links and registers, see above
- [ ] Constant-5V pin identified with a meter; sensor powers up
- [ ] Distance readings sane and stable in the info panel
- [ ] **Frame rate unaffected** — no stutter while reads are running
- [ ] Trigger fires the flashbulb preset; gate returns to its playlist
- [ ] Cooldown suppresses retriggering
- [ ] No false triggers over a multi-hour idle test
- [ ] Detection reliable with real bodies in outerwear
- [ ] Cross-talk tested with all six gates running
