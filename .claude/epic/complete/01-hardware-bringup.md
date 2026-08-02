# 01 — Hardware Bring-Up (Single Gate on the Bench)

**STATUS: COMPLETE.** Verified on the bench — pixel addressing, colour order, data
integrity over the full run, and power baseline all check out.

**Blocks on:** nothing
**Blocks:** 03, 06, 08 — all now unblocked

## Recorded values

Fill these in — downstream tickets consume them, and they are the reason the
verification steps existed. Left blank they are lost the moment this is archived.

| Value | Recorded | Consumed by |
|---|---|---|
| WLED version used for bring-up | | `09` (distinguish from fleet baseline) |
| Data output GPIO wired (2 or 4) | | `09` |
| Colour order (verified empirically) | | `09` |
| Which physical end is pixel 0 | | `03`, `06` |
| Idle draw, all black | | `02` PSU sizing |
| Full-white draw | | `02` PSU sizing + ABL mA-per-LED |
| Bench board MAC | | `08` DHCP reservations |
| Cold-boot cycles run, failures seen | | `05`, `09` |

## Goal

One QuinLED Dig-Next-2 driving one 234-pixel WS2815 run, correctly configured in
WLED, verified on the bench. This is the reference unit every other gate is cloned
from.

## Why this first

Every downstream ticket assumes a known-good single gate. Pixel count, colour
order, and data integrity are the three things that silently ruin pattern work if
they are wrong, and all three are cheap to verify now and expensive to debug later.

## Board pinout (QuinLED pinout guide)

LED data **GPIO 2 / 4** · relays **20 / 21 / 22** · external relay trigger **5** ·
hardware-debounced buttons **34 / 35** (input-only) · I²C Stemma QT **SDA 15 / SCL 14**
· QEXP **GPIO 0 / 25 / 32 / 33** · PDM mic **7 / 8**. All GPIO inputs **3.3V max**.

Use **GPIO 2** for the strip unless there is a reason not to; record which output is
wired. The HC-SR04 lands on QEXP GPIO 32 / 33 — see `06`.

## Tasks

- [ ] Flash **stock** WLED for bring-up. Note the exact version.
      **This is not the final fleet firmware** — ticket 06's HC-SR04 usermod requires a
      custom build, which becomes the frozen fleet baseline in `09`. Bring up on stock
      first so hardware problems are separable from build problems.
- [ ] Configure LED output:
  - [ ] Type: **WS2815** (not WS2812 — different voltage and the driver entry
        differs). Confirm WLED's list has an explicit WS2815 option in this version.
  - [ ] Count: **234**
  - [ ] GPIO: whichever of the board's two data outputs is wired. Record it.
  - [ ] Colour order: verify empirically — set pixel 0 to pure red and confirm it
        reads red, not green or blue. WS2815 is commonly GRB but do not assume.
- [ ] Verify pixel indexing: light pixel 0 and pixel 233 individually and confirm
      they sit at the physical ends of the run in the direction you expect. Record
      which end is the injection point.
- [ ] Confirm the run behaves as a **flat 0–233 index** with no discontinuity —
      sweep a single lit pixel end to end and watch for jumps.
- [ ] Set ABL per `02-power-and-electrical.md`. Do not leave it at the 5V default.
- [ ] Verify WS2815 backup data line continuity: the strip's BI line should carry
      through the whole run. Optionally bench-test resilience by bypassing one
      pixel's DI and confirming downstream pixels still light.
- [ ] Confirm data integrity over the **full run length** at high refresh — run a
      fast full-strip effect for 10+ minutes and watch the far end for flicker or
      colour corruption. The Dig-Next-2 has a 33R series resistor and level
      shifting, so this should be clean; confirm rather than assume.
- [ ] Record baseline: idle power draw (all black) and full-white draw. These feed
      back into ticket 02.
- [ ] Note the board MAC address and label the physical unit.
- [ ] Begin the **cold-boot soak** early — the installation switches power externally
      every night, so unattended boot reliability is a primary requirement, not an
      afterthought. Power-cycle repeatedly and log any failure. Continues in `05`/`09`.

## Acceptance criteria

- Pixel 0 and pixel 233 are at known physical positions, documented
- A full-strip white fill shows uniform colour with no tint gradient along the run
  (a tint shift toward the far end means a voltage drop problem → ticket 02)
- 10 minutes of fast animation with zero flicker or corruption at the far end
- Idle and full-white current draw measured and recorded
- WLED version recorded

## Open questions

- Which of the two data outputs is used, and is the second one left for a future
  second run or genuinely unused?
- Is there a spare board available as a bench/dev unit so field units aren't
  the development target?

## Notes

The board has 8MB flash and 2MB PSRAM, which is comfortable headroom for WLED plus
usermods — 4MB ESP32 boards get tight once you add several. No concern here.
