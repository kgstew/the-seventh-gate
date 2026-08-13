# 12 — Echo Level Conversion (BSS138 module, not a resistor divider)

**Blocks on:** 06 (pin map)
**Blocks:** 09 — six harnesses cannot be batched until the conversion method is fixed

## Why this is its own ticket

Ticket 06 chose the sensor and left level conversion as a *conditional*: a 2.2kΩ/3.3kΩ
divider under ~1m of cable, a BSS138 module beyond it. That condition depended on a
measurement (controller-to-sensor distance at a real gate) that has never been taken, and
it left the harness design unresolvable.

The part is now selected and on hand, so the conditional collapses. There is also a
**firmware consequence** — the trigger pulse width — that 06 does not cover and that will
present as a dead sensor if it is missed.

## DECIDED: BSS138 4-channel bidirectional shifter, at the controller end

**Part:** HiLetgo 4-channel bidirectional logic level converter, 3.3V ↔ 5V, BSS138-based.
10 pcs for $7.49 — six gates plus four spares, so a field repair never waits on a
reorder. Marketed for I²C; it is a general-purpose MOSFET shifter and the HC-SR04's lines
are ordinary push-pull digital.

Ships as bare boards with loose header pins. Soldering is required either way — the
divider needed perfboard too.

### Why the module rather than the divider

| | 2.2kΩ/3.3kΩ divider | BSS138 module |
|---|---|---|
| Echo 5V → 3.3V | ✅ ≈3.0V | ✅ |
| **Trig 3.3V → 5V** | ❌ stays 3.3V | ✅ shifted up |
| Cable conductors | 4 | 4 (at the controller end) |
| Valid cable length | under ~1m only | short or long |
| Parts per gate | 2 resistors | 1 module |

The decisive line is **Trig**. The divider only ever solved Echo. Ticket 06 records that
GPIO 32 driving Trig at 3.3V is already marginal for a 5V part's threshold, that cable
length makes it worse, and that this should be *suspected before the code* if triggering
is unreliable. The module removes that failure mode instead of documenting it.

Second reason: it **de-risks the unmeasured cable run**. The divider forces a decision
that depends on a number nobody has yet; the module is correct at either length. One
fewer thing that has to be right before six harnesses get built.

### Why the controller end, not the sensor end

- **Both rails are already there.** 3.3V from QEXP, 5V from the relay JST PH. Mounting at
  the sensor end would need a 5th conductor to carry the 3.3V reference out to it.
- **The cable then carries 5V-level signals in both directions** — better noise margin on
  a width-encoded pulse than a 3.3V one.
- **One enclosure instead of two.** The sensor end stays a bare 4-way housing with nothing
  to fail out at the gate.

### Wiring

Module sits on the perfboard in the controller enclosure, alongside the terminals.

| Module pin | Connects to |
|---|---|
| `HV` | Relay JST PH **constant 5V** (same net that powers the sensor) |
| `HV1` | Cable → sensor **Trig** |
| `HV2` | Cable ← sensor **Echo** |
| `HV GND` | Ground rail |
| `LV` | QEXP **3V3** |
| `LV1` | QEXP **GPIO 32** |
| `LV2` | QEXP **GPIO 33** |
| `LV GND` | Ground rail |

`HV3/HV4` and `LV3/LV4` are unused — two spare channels per gate.

⚠️ **HV is the sensor side, LV is the ESP32 side.** Reversed, the 5V rail lands on the LV
side and into GPIO 33. There is no protection against this; check the silkscreen twice.

⚠️ **Both rails must be present and both GNDs tied.** With no 3.3V on `LV` the module does
not shift and the sensor reads dead — another fault that looks like software.

⚠️ **Do not fit the divider as well.** The module replaces it. A divider downstream of a
shifted signal just attenuates it.

## Consequence: the trigger pulse must be widened

These modules do the LOW→HIGH transition through a **10kΩ pull-up**, not a push-pull
driver, so every rising edge is an RC curve against cable capacitance.

- **Echo is unaffected.** τ ≈ 1µs at 1m (~100pF), ~3µs at 3m. Against a 150µs minimum
  pulse that is a rounding error — under 0.1cm of distance.
- **Trig is marginal.** Our pulse is **10µs**, which is also the HC-SR04's specified
  *minimum*. A 2–7µs rise eats a meaningful fraction of it, and longer cable makes it
  worse.

Fix in `usermods/hcsr04_flashbulb/usermod_hcsr04_flashbulb.h`, `sendTrigger()`:

```cpp
digitalWrite(trigPin, HIGH);
delayMicroseconds(10);   // -> 20 for the BSS138 build
```

20µs against a ~24ms frame budget costs nothing measurable. Do it **before** wiring, not
after debugging an intermittent sensor.

This is the honest trade against Build A: the divider drives Trig push-pull (crisp
timing, marginal level); the module fixes the level and softens the timing. Widening the
pulse makes the trade strictly favourable.

## What this replaces

The **2.2kΩ/3.3kΩ divider is withdrawn as the fleet build.** It stays documented in the
usermod README and the harness drawing as the emergency variant — buildable from two
resistors anywhere, valid under ~1m — but no gate ships with it.

## Tasks

- [ ] Widen the trigger pulse to 20µs and rebuild the fleet binary
- [ ] Solder headers to one module; verify orientation against the silkscreen
- [ ] Build **one** harness end to end: module, terminals, 4-core cable, 4-way housing
- [ ] Meter before power: `LV` reads 3.3V, `HV` reads 5V, both GNDs continuous
- [ ] With the sensor powered, scope or meter `LV2` — must never exceed 3.3V
- [ ] Confirm the sensor triggers reliably at 20µs; if not, suspect the HV pull-up before
      the code and try 30µs
- [ ] Verify frame rate is unaffected (BRINGUP.md §6)
- [ ] Only then batch the remaining five
- [ ] Record the module in the BOM with the spare count

## Real-world test scenarios — follow-up

Everything verified so far was a hand waved at a bench sensor on a short lead. These are
the scenarios that decide whether the gate actually works in position, and most of them
cannot be run until the final harness (module, real cable length, real mounting) exists —
which is why they live here rather than in `06`.

Each needs a recorded result, not a vibe. Where a scenario belongs to another ticket's
acceptance, it is marked.

### A. Detection under real passage

- [ ] **Walk-through at normal pace, 20 passes, count misses.** Target: zero.
      The real risk is geometric, not electrical. `consecutiveHits: 2` at
      `readIntervalMs: 97` means a target must sit in the beam for **≥ ~200ms**. At a
      normal 1.5 m/s walk that is ~30cm of travel through a ~15° cone — comfortable at 2m
      range, tight up close. If passes are missed, drop `consecutiveHits` to 1 before
      touching anything else, and accept the higher phantom-trigger risk knowingly.
- [ ] **Run/fast walk through the opening.** Someone hurrying is the worst case for the
      dwell-time arithmetic above.
- [ ] **A person stopping in the opening to look.** Should fire once, then be adopted as
      background after `stuckResetSec` (60s) rather than flashing repeatedly. Confirm it
      re-arms cleanly once they move on.
- [ ] **Approach vs passage.** Ticket `06` never resolved whether the flash should fire on
      approach or on passage. Decide it here against real bodies and real mounting, and
      record the mounting position and aim that follow from it.

### B. The clothing problem — highest-risk item

- [ ] **Same 20 passes in heavy winter outerwear**, at the real ambient temperature.
      Clothing absorbs ultrasound and this piece runs cold at night. A `deltaCm` proven
      against a t-shirt is not evidence.
- [ ] Compare returned distances: t-shirt vs coat, at the same standing position. Record
      both. The delta between them is the real margin `deltaCm` has to live inside.
- [ ] If coats are unreliable at the chosen geometry, this is the trigger for the
      documented **VL53L1X swap** (`06`), not for endlessly retuning `deltaCm`.

### C. Unattended stability

- [ ] **Full-night idle soak with zero flashes.** No people, gate powered, sensor aimed as
      installed. Any trigger is a false positive and must be explained, not averaged away.
- [ ] **Background stability across the night.** Log `Gate background` hourly. The speed of
      sound moves ~0.6 m/s per °C, so readings drift as the temperature falls — but the
      baseline should drift *with* them and cancel it. Confirm that, rather than assuming
      it: a baseline that lags a falling temperature would slowly arm the gate.
- [ ] **Weather.** Rain, fog, or snow in the beam, if the piece is outdoors. Establish
      whether precipitation produces phantom triggers; this interacts with the unresolved
      indoor/outdoor question in `02`.
- [ ] **Wind-moved objects** near the beam — banners, foliage, cabling.

### D. Boot and recovery

- [ ] **Cold boot with the beam clear.** Baseline seeds on the first reading; confirm it
      settles to the true background and the gate arms.
- [ ] **Cold boot with someone standing in the beam.** The baseline seeds to *them*. Verify
      it self-corrects once they leave and does not sit permanently dead or permanently
      firing. This is a nightly risk: gates cold-boot unattended ~365 times a year and
      nobody will be watching.
- [ ] **Parked-object recovery.** Leave a bag in the beam. Expect one flash, then adoption
      as background within `stuckResetSec`, then clean re-arming when it is removed.

### E. Harness-specific (this ticket)

- [ ] **Trigger reliability at the real cable length**, at the chosen pulse width. Record
      the width that worked and the length it was proven at — the bench result does not
      transfer to an unusually long run.
- [ ] `LV2` measured at 3.3V maximum with the sensor live, on the finished harness.
- [ ] **Frame rate unaffected** through the module, on the real run (`BRINGUP.md` §6).
- [ ] Sensor cable routed away from the LED data line and the 12V run, then re-run
      scenario A. A width-encoded pulse picking up switching noise produces phantom
      readings that look exactly like sensor flakiness.

### F. Fleet-level — needs all six gates (ticket `09`)

- [ ] **Cross-talk with all six running.** Six ultrasonic sensors within earshot can hear
      each other's pings as their own echoes. Cannot be reproduced with one sensor and
      *will* appear on site. Primes 97/101/103/107/109/113 are the mitigation; verify it.
- [ ] Confirm each gate flashes on **its own** sensor only.

### G. Experience under real traffic (ticket `10`)

- [ ] **Flow test with a queue or group.** `cooldownSec` is **60** and the flash sequence
      runs **34.1s**. Under steady footfall most visitors will therefore arrive during a
      cooldown and never trigger anything — they see someone else's flash, or none. That
      may be the right call for an accent effect, but it is currently an untested
      consequence of a number chosen to protect the fade, not to shape the experience.
- [ ] **Does a passer-by ever see the 15s fade-up?** They trigger the flash and keep
      walking. Confirm the long recovery reads as intended for the *space* rather than
      being a tail nobody is present for.

## Acceptance criteria

- One gate detecting reliably through the module, with `Gate distance` stable in the WLED
  info panel and no stutter
- `LV2` measured at 3.3V maximum with the sensor live
- Trigger reliability confirmed at the chosen pulse width, with the width recorded here
- Divider removed from the fleet build; six modules fitted, four spares boxed
- Cable stays 4-conductor — confirms the controller-end decision held

## Open questions

- **Does the 20µs pulse hold at the real cable length?** Unknown until the run is measured
  at a gate. If a gate needs an unusually long run, re-check the trigger rise there
  specifically rather than assuming the bench result transfers.
- Do the spare channels earn a use? Two per gate are free — a service button (ticket 08's
  AP-on-button-hold) or a second sensor would not need new hardware.
