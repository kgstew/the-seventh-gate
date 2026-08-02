# 06 — Proximity Sensor Integration (HC-SR04)

**Blocks on:** 01
**Blocks:** 04 (forces the custom build), 07, 09

## DECIDED: HC-SR04 ultrasonic, integrated via usermod

Recorded rationale:

- **Already owned** — zero procurement cost and zero lead time, so the full
  trigger → flashbulb → return chain can be built and validated immediately
- **Night-only operation removed sunlight as a criterion**, which was the main
  argument for mmWave over cheaper sensors
- **Echo tolerates a longer cable run than I²C** — a plain digital pulse travels
  several metres on decent cable, where a VL53L1X's Stemma QT link gets unreliable
  past roughly a metre. This matters if the controller enclosure cannot sit close to
  where the sensor needs to see.

**Consequence — this is Path B.** HC-SR04 requires host-side timing, so a usermod is
required, which means **a custom WLED build for all six boards**. That is now
certain, not conditional. With `complete/04-custom-effects.md` cancelled, **this usermod
is the only custom code in the project** and the sole reason the fleet runs a custom
build. See `09-fleet-commissioning.md` for the firmware baseline.

## Wiring on the Dig-Next-2

| Signal | GPIO | Connector |
|---|---|---|
| Trig | **32** | QEXP (blue lead) |
| Echo | **33** | QEXP (white lead) |
| GND | — | QEXP |
| 5V | — | **External relay JST PH — constant 5V pin** |

**RESOLVED: QEXP is 3.3V only.** 5V comes from the external relay JST PH connector.

⚠️ **That connector has three conductors: constant 5V, a switched 5V trigger (driven by
GPIO 5), and GND. Use the constant 5V.** Wired to the trigger instead, the sensor is
unpowered whenever GPIO 5 is low — which is its idle state — so the sensor appears dead
and the fault looks like a software problem. **Identify the pins with a meter before
connecting.**

Related: leave WLED's relay function unconfigured, or at least be aware it drives
GPIO 5. It does not affect the constant-5V pin, but it makes the trigger line move.

Board pinout reference (from QuinLED's pinout guide): LED data GPIO 2 / 4 · relays
GPIO 20 / 21 / 22 · external relay trigger GPIO 5 · buttons GPIO 34 / 35 · I²C
SDA 15 / SCL 14 · QEXP GPIO 0 / 25 / 32 / 33 · mic GPIO 7 / 8. **All GPIO inputs are
3.3V maximum.**

### Do NOT use GPIO 34 or 35 for Echo

Those are the hardware-debounced button inputs. Debouncing is exactly what makes them
good for a switch and fatal here — the HC-SR04 encodes distance in the **width** of
the echo pulse (~150µs to 25ms), and a debounce filter will smear or swallow it.
They are also input-only, so Trig could never live there either.

Use plain QEXP GPIOs for both lines.

### 5V source needs verifying on the physical board

QuinLED's documentation conflicts: the specifications page lists QEXP as
3V3/GND/4×GPIO, the pinout guide says 5V is available via QEXP.

- [ ] Confirm on the board. If QEXP is 3.3V only, take 5V from the **external relay
      JST PH connector** (documented 5V, max 500mA). HC-SR04 draws ~15mA so current
      is a non-issue — this is purely about which connector.

### Level conversion — choose by run length

Echo outputs **5V**; every GPIO here is 3.3V max.

**Short run (under ~1m) — resistive divider at the controller end.** 2.2kΩ from Echo
to GPIO 33, 3.3kΩ from GPIO 33 to GND (~3.0V). The commonly-cited 1kΩ/2kΩ pair gives
3.33V, right at the limit — not worth it. Placing the divider at the *controller* end
keeps the cable carrying a driven 5V signal, which has better noise margin than a
weak divided one.

**Longer run — BSS138 bidirectional level-shifter module at the sensor end.** A few
dollars, handles both directions: Trig up to 5V where the sensor needs it, Echo down
to 3.3V. No divider needed at the controller.

The second option also fixes something the divider does not: **GPIO 32 driving Trig
at 3.3V is already marginal** for a 5V part's trigger threshold, and cable length
makes it worse. If triggering proves flaky, suspect this before suspecting the code.

### Physical build

- QEXP appears to ship as a pigtail with colour-coded flying leads — confirm the
  connector type and whether a cable is included
- HC-SR04 side is a 4-pin 0.1" male header; use a 4-way 0.1" female socket housing
- [ ] **Do not build the divider into a floating heat-shrunk splice.** Put it on
      perfboard in a small enclosure with strain relief — these face nightly power
      cycles and outdoor temperature swings for a season unattended.

### Cable routing

- [ ] **Keep the sensor cable away from the LED data line and the 12V power run.**
      WS2815 data has fast edges; the 12V run carries switching current under load.
      A width-encoded timing pulse routed alongside either will pick up noise and
      produce phantom distance readings.
- [ ] Use twisted or shielded multi-core for the sensor run

## Board GPIO traps

- [ ] **Never use QEXP's GPIO 0 for anything that can be low at boot.** It is the
      boot strapping pin — held low at power-on, the ESP32 enters download mode and
      the gate stays dark. With night-only operation this is a nightly dice roll,
      not a rare edge case.
- [ ] **ESP32's default I²C pins are GPIO 21/22 — which are relay control lines on
      this board.** Irrelevant for HC-SR04, but if any library ever calls a bare
      `Wire.begin()` it will bit-bang your power output relays. Always pass pins
      explicitly (`Wire.begin(15, 14)`).
- [ ] If an analog sensor is ever added, use GPIO 32/33 (ADC1). **GPIO 25 is ADC2,
      which cannot be read while WiFi is active.**

## Detection geometry — still unresolved

- [ ] How wide is the gate opening the sensor must cover?
- [ ] Trigger on **approach** or on **passage**? Different placement, different logic.
- [ ] Mounting position and aim
- [ ] **Measure the real controller-to-sensor distance at one gate** before building
      six harnesses — it decides the level-conversion approach above
- [ ] False-trigger tolerance: is a rare spurious flash acceptable, or must it be
      near zero?

## Implementation status

**Code written** — `usermods/hcsr04_flashbulb/` in this repo (usermod + README with
wiring, build, registration, and tuning procedure). Kept in this repo rather than the
WLED tree so it stays version-controlled alongside gate config.

Design decisions taken:

- **Interrupt-driven echo capture, not `pulseIn()`** — nothing blocks longer than the
  ~14µs trigger pulse, so the frame loop is untouched
- **Phase counter instead of `digitalRead()` in the ISR** — avoids calling a possibly
  flash-resident function from an IRAM ISR
- **`consecutiveHits` (default 2)** — HC-SR04 readings are noisy; a single spurious short
  reading must not flash a whole gate
- **Read path isolated in one function** so the VL53L1X fallback stays a cheap swap
- **`readIntervalMs` per gate** (primes: 97/101/103/107/109/113) to desynchronise pings

**Not yet verified on hardware.** Remaining checklist is in the usermod README; the
acceptance criteria below are unchanged.

## Usermod implementation

- [ ] `setup()` — configure Trig as output, Echo as input
- [ ] `loop()` — read, threshold, cooldown, fire trigger
- [ ] **Do not block the frame loop.** `pulseIn()` blocks, and a no-echo reading
      blocks for the full timeout. WLED's frame budget is ~24ms; a 30ms blocking read
      every frame halves the frame rate and visibly stutters the LEDs. In order of
      effort:
  1. **Throttle the read** — every ~100ms is ample for detecting a walker
  2. **Tighten the timeout** to real max range (3m round trip ≈ 17.5ms → ~20ms
     timeout, not the default)
  3. **Go interrupt-driven** — record `micros()` on Echo rise and fall — only if
     stutter is still visible
- [ ] `addToConfig()` / `readFromConfig()` — persist **threshold distance**,
      **cooldown seconds**, **enable flag** so they are tunable from the WLED UI
      without a reflash
- [ ] `addToJsonInfo()` — publish the **live distance reading** to the WLED info
      panel. This is what makes on-site threshold calibration possible without a
      laptop; do not skip it.
- [ ] Cooldown default **15 seconds**, carried from the predecessor
      (`~/Code/reflecting-the-present/src/main.cpp:147`), made configurable
- [ ] **Stagger the trigger cadence per gate** to reduce ultrasonic cross-talk (see
      below). Vary the read interval slightly per unit rather than having six sensors
      ping on identical timing.

### Precedent to crib from

WLED's usermod ecosystem includes sensor-triggered examples — the *Animated Staircase*
usermod (PIR/ultrasonic triggering a lighting sequence) and the PIR sensor switch
usermod are structurally close to what this needs, including the ultrasonic read.
Read them before writing from scratch.

Keep the **read function isolated behind a clean boundary** so the VL53L1X fallback
below stays a cheap swap rather than a rewrite.

## HC-SR04 limitations to design around

These are real and mostly will not show up on a bench:

- **Clothing absorbs ultrasound.** A person in a heavy coat returns a weak echo —
  and this piece runs at night, in the cold, when people wear coats. The single
  biggest reliability risk with this sensor choice.
- **Temperature changes the speed of sound** (~0.6 m/s per °C). Outdoors at night
  across seasons, distance readings drift. Use a generous threshold margin.
- **Cross-talk between gates.** Six independently-triggering ultrasonic sensors
  within earshot can hear each other's pings as their own echoes. Will not appear
  with one sensor on a bench; will appear on site. Mitigate with spacing and
  staggered timing, and **test it explicitly with all six running** (ticket 09).
- **Reliable range on a human body is ~2–3m**, not the 4m headline figure.
- Angled or soft surfaces scatter rather than reflect.

## Documented fallback: VL53L1X

Not chosen, but recorded so the decision can be revisited without redoing the
analysis. Switch to it if HC-SR04 reliability disappoints in position — particularly
on the coat-absorption or cross-talk failure modes.

- Buy an **Adafruit (#3967) or SparkFun Qwiic** version — those have the Stemma QT
  connector and plug straight into the board's I²C port with a cable, no soldering,
  no level shifting. Generic GY-VL53L1X / TOF400C boards have headers only.
- **Constraint: I²C does not travel.** Reliable to roughly a metre. If the mounting
  distance measured above is longer, this is not a drop-in swap.
- Usermod structure is nearly identical — the read function swaps, everything else
  (threshold, cooldown, config, info panel) stays. Write the usermod with that
  boundary clean so the swap stays cheap.

## Acceptance criteria

- Harness built with strain relief and level conversion appropriate to measured run
  length; not a floating splice
- 5V source confirmed on the physical board
- Usermod reads reliably **without stalling the frame loop** — verify frame rate is
  unaffected, do not assume
- Threshold, cooldown, and enable configurable from the WLED UI and persistent
  across reboot
- Live distance reading visible in the WLED info panel
- Zero false triggers over a multi-hour idle test in representative night conditions
- Reliable detection of people walking at normal pace — **tested with real bodies in
  outerwear**, not a hand waved at a bench
- 15s cooldown demonstrably suppresses retriggering
- Cross-talk tested with all six gates running (ticket 09)

## Open questions

- Detection geometry: opening width, mounting position, approach vs passage
- Controller-to-sensor distance — decides level-conversion approach
- Acceptable false-trigger rate
