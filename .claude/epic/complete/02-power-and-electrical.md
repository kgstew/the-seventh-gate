# 02 — Power and Electrical

**STATUS: COMPLETE.** Verified.

**Blocks on:** nothing
**Blocks:** 09 — unblocked

## Outcome

Downstream tickets reference these; `09`'s commissioning checklist verifies each gate
against them. Left blank they are lost once this is archived.

| Value | Recorded | Consumed by |
|---|---|---|
| Measured full-white draw per gate | | `09` per-gate verification |
| Measured idle draw | | Fleet total |
| PSU selected (V / W / margin) | | `09` |
| ABL: max current + mA-per-LED | | `09` — must not clamp the flashbulb |
| Injection: single-end or both ends | | `09` |
| Fuse ratings fitted | | `09` |
| Night switching: photocontrol or timer | | `09` fleet cold-boot test |
| Switching: per-gate or central | | `08` router power source |
| 5V accessory rail source for HC-SR04 | | `06` harness build |

## Goal

Each gate has a correctly sized, protected 12V supply that can deliver the
installation's real peak draw, with the ABL configured to match reality rather than
WLED's 5V defaults — and the whole installation switches on and off with darkness
without the controllers needing to know the time.

## Night-only operation is solved here, in hardware

The piece runs at night only. There is no network on site and therefore no NTP, and
the ESP32 has no battery-backed clock — so **the controllers cannot know the time,
and should not need to.** Switch the 12V supply externally instead:

| Option | Assessment |
|---|---|
| **Dusk-to-dawn photocontrol** | **Recommended.** Self-adjusting through the seasons, standard outdoor-lighting hardware, zero firmware. |
| Mains timer | Cheaper, but fixed times that drift out of step with sunset across the year. |

Secondary benefit: the installation is genuinely *off* for two-thirds of every day —
no WS2815 quiescent draw across 1,404 pixels, no six PSUs idling.

**The cost of this approach:** every gate cold-boots unattended, every night, roughly
365 times a year. That makes boot reliability a primary concern — see `05` (boot
preset) and `09` (power-cycle soak test). It also makes the **GPIO 0 strapping-pin
trap** in `06` a nightly risk rather than a rare edge case.

- [ ] Select photocontrol or timer; confirm its rating covers all six gates if
      switching centrally, or fit one per gate
- [ ] Decide central vs per-gate switching. Per-gate matches the one-controller-per-gate
      independence and avoids a single point of failure that darkens the whole piece.
- [ ] Verify the switch-on behaviour: no inrush issue, no partial brownout that boots
      the ESP32 but browns out the strip

## The number that matters: the flashbulb

Normal pattern operation is nowhere near peak. The **flashbulb drives the entire
234-pixel run to full white**, and that is the design load. Size for the flash, not
for the patterns.

This creates a tension worth deciding consciously:

> ABL protects the PSU by clamping brightness — which means it will **mute your
> loudest moment**. Either size the supply for genuine full white, or accept that
> the flashbulb is dimmer than intended. Do not discover this on site.

Recommendation: size the PSU for full white with headroom, and set ABL as a
genuine safety backstop above expected draw rather than as an active limiter.

## Calculation method

Do not trust a per-pixel figure from a forum. WS2815 draw varies meaningfully
between reels, and WLED's ABL model assumes 5V strip, so the mA-per-LED field needs
an empirically derived value for 12V.

- [ ] **Measure** on the bench unit (ticket 01), with a clamp meter or bench supply
      readout:
  - [ ] Full white, brightness 255 — this is peak
  - [ ] All black, powered — WS2815 has non-trivial quiescent draw and six gates
        idling adds up
  - [ ] A representative pattern at intended brightness — the realistic average
- [ ] Compute per-gate peak watts: `measured_amps × 12V`
- [ ] Size the PSU with margin over measured peak (30%+ is conventional; a supply
      run continuously at 100% is a supply that fails early)
- [ ] Derive mA-per-LED for ABL: `measured_full_white_mA / 234`
- [ ] Compute total installation draw across 6 gates for the venue's supply budget

For rough procurement planning before measurement: WS2815 at full white commonly
lands somewhere around 0.2–0.35 W per pixel, putting 234 pixels in the **~50–80W**
range per gate, i.e. ~4–7A at 12V. **Treat this as a procurement placeholder only**
and replace it with measured values before ordering final supplies.

## Tasks

- [ ] Measure and record the three draw figures above
- [ ] Select and order per-gate 12V supplies
- [ ] Decide injection strategy — 234 pixels of 12V WS2815 on a single run is
      generally fine for single-end injection (12V has far less voltage-drop
      trouble than 5V), but confirm against the white-fill uniformity test in
      ticket 01. If the far end shows a warm/dim shift, add a second injection
      point at the far end.
- [ ] Configure ABL on the bench unit: enable, set max current to the PSU's safe
      ceiling, set mA-per-LED to the measured value
- [ ] Verify ABL behaves as intended: trigger a full-white flash and confirm it is
      *not* being clamped at the intended brightness
- [ ] Plan fusing — the Dig-Next-2 has three individually fused power outputs with
      relay control; select fuse ratings appropriate to the measured draw
- [ ] Strain relief at the injection point. The WS2815 backup data line protects
      against a failed pixel chip, **not** against a broken connector or severed
      wire — mechanical protection at the injection point is what actually keeps a
      gate alive.
- [ ] Enclosure and ingress rating, pending the indoor/outdoor answer
- [ ] Confirm the **5V accessory rail** for the HC-SR04. QuinLED's docs conflict on
      whether QEXP carries 5V; if not, the external relay JST PH connector is
      documented as 5V at up to 500mA. Sensor draw is ~15mA, so this is about which
      connector, not about current. → `06`
- [ ] Mains-side work: if this involves permanent mains installation, that is
      licensed-electrician scope. Scope it out to the appropriate trade. The
      photocontrol/timer switching above sits on this side too.

## Acceptance criteria

- Photocontrol or timer selected, installed, and verified to switch all gates on at
  dusk and off at dawn without intervention
- Switch-on produces a clean boot — no brownout that starts the ESP32 but not the strip
- Measured peak, idle, and typical draw recorded per gate
- PSU selected with documented margin over measured peak
- ABL configured with an empirically derived mA-per-LED, verified not to clamp the
  intended flashbulb brightness
- White-fill uniformity confirmed end to end; second injection point added if not
- Fusing specified; strain relief implemented at every injection point

## Open questions

- Indoor or outdoor? Drives enclosure, ingress rating, thermal margin. (No longer
  affects sensor choice, but still open for the electrical build.)
- Photocontrol per gate, or one switching all six? Per-gate avoids a single failure
  darkening the entire piece.
- Is there a total venue power budget or circuit constraint to design within?
- Are the six gates fed from one distributed 12V supply or six local supplies? Six
  local is simpler and matches the one-controller-per-gate independence, but
  depends on where mains is available.
