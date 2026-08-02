# 10 — Field Tuning and Acceptance

**Blocks on:** 09
**Blocks:** nothing — this closes the epic

## Goal

The installation tuned in its actual space, at its actual viewing distance, in its
actual ambient light — then signed off, with the tuned state captured back into the
repo.

## Why this is its own ticket

Everything before this was built to a specification. This is where the piece is
judged by eye. Brightness, pattern pacing, crossfade length, and flashbulb timings
all read differently at scale, in the dark, with people moving through — and every
one of them is a runtime slider rather than a code change.

This ticket exists because that tuning pass is real, scheduled work that gets
skipped, and because the tuned values must be **captured back into version control**
or the repo silently becomes a lie.

## What gets tuned on site

| Parameter | Placeholder | Owner |
|---|---|---|
| Global brightness | — | Stakeholder + ambient light |
| Pattern hold duration | 60s each | Stakeholder |
| Pattern crossfade | 1000ms | Stakeholder |
| Per-pattern sliders (speed, intensity, custom1-3) | From ticket 03 | Stakeholder |
| Flash hold | 100ms | Stakeholder |
| Flash fade-to-black | 5000ms | Stakeholder |
| Flash return-to-pattern | 2000ms | Stakeholder |
| Sensor threshold distance | Per gate | Measured on site |
| Sensor cooldown | 15s | Observed foot traffic |
| Per-gate read stagger | — | Set to whatever suppresses cross-talk |

Everything in this table is adjustable from a phone. That was the point of choosing
WLED — use it.

## Tasks

- [ ] **Tune at night, with the stakeholder present.** The piece runs night-only, so
      afternoon tuning is worthless however convenient the scheduling. Budget for this
      properly — it means a night session on site with no cell service.
- [ ] Set global brightness against real ambient light and real viewing distance
- [ ] Tune pattern pacing and crossfades. Expect these to lengthen — durations that
      feel right on a bench usually feel rushed at architectural scale.
- [ ] Tune the flashbulb timings with people actually walking through
- [ ] Calibrate each gate's sensor threshold in position, using the live reading in
      the WLED info panel. Thresholds will legitimately differ per gate depending on
      mounting and surroundings.
- [ ] **Test detection with people in winter outerwear.** Clothing absorbs ultrasound,
      and this piece runs at night in the cold — a threshold calibrated against someone
      in a t-shirt will miss people in coats. This is the HC-SR04's biggest reliability
      risk and it is only discoverable here.
- [ ] **Watch for phantom triggers from ultrasonic cross-talk** with all six gates
      live. Tune the per-gate read stagger until they stop. If they persist, escalate
      to the VL53L1X fallback in `06`.
- [ ] Note that thresholds may drift seasonally with temperature (~0.6 m/s per °C
      affects the speed of sound) — leave margin rather than tuning to the edge.
- [ ] Set the sensor cooldown against **observed** foot traffic. The 15s inherited
      default may be wrong in either direction: too long and a queue of visitors
      sees nothing; too short and the gate never returns to its patterns. Watch real
      traffic before deciding.
- [ ] Watch for the failure mode that only appears under real traffic: a
      **frequently-triggered gate that never reaches patterns 2 and 3** because it
      keeps restarting the playlist. If ticket 05 found restart-not-resume
      behaviour, this is where it becomes visible.
- [ ] **Re-export `cfg.json` and `presets.json` from every gate and commit them.**
      Non-negotiable — the repo must match the hardware at handover.
- [ ] Walk the installation looking for anything that reads wrong physically:
      visible hot spots, a tint gradient toward a far end, a gate noticeably dimmer
      than its neighbours, sensor blind spots.
- [ ] Write the operator handover doc: how to adjust brightness, how to power cycle
      a gate, how to tell if a gate is unhealthy, who to call.

## Acceptance criteria

- [ ] Stakeholder sign-off on the tuned state of all six gates
- [ ] All tuned values re-exported and committed; repo state matches hardware
- [ ] Observed under real foot traffic: patterns 2 and 3 are still reachable on the
      busiest gate
- [ ] No gate visibly dimmer, warmer, or out of step with its neighbours
- [ ] Sensor thresholds calibrated per gate; no false triggers observed during a
      sustained observation window; no missed triggers for normal walking pace
- [ ] Detection verified against people in **winter outerwear**, not just light clothing
- [ ] No phantom triggers from ultrasonic cross-talk with all six gates live
- [ ] Gates confirmed switching on at dusk and off at dawn unattended across several
      consecutive nights
- [ ] Operator handover doc written and delivered
- [ ] Epic acceptance criteria in `00-epic-summary.md` all met

## Deferred work to capture here

At sign-off, record anything learned that should shape the next phase — especially
around cross-gate choreography, which is out of scope now but implied as future
work. In particular note:

- Did the independent gates read as a coherent single piece, or did the lack of
  coordination between them show?
- If coordination is wanted, is it *simultaneous* (WLED UDP sync handles this) or
  *phase-relative / spatially propagating* (needs the shared-clock usermod or DDP
  takeover — see `00-epic-summary.md`)?

That distinction is the whole decision for phase two. Capture the answer while the
piece is in front of you.
