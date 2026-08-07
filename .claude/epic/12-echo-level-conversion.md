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
