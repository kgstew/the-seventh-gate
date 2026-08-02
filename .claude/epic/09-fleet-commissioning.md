# 09 — Fleet Commissioning (Six Gates)

**Blocks on:** 05, 07, 08, **11** (must be on QuinLED hardware, not the bench ESP32)
**Blocks:** 10

## Goal

All six gates built, configured from the repo, labelled, and individually verified.
The bench unit's proven configuration replicated with as little per-unit hand-work
as possible.

## Principle

**Nothing is configured by hand in the field.** Every gate is flashed with the same
firmware and receives `cfg.json` + `presets.json` from the repo. Only three values
are genuinely per-gate: hostname, IP, and the calibrated sensor threshold.

Hand-entering settings through the UI six times is how a fleet drifts. If you find
yourself doing it, stop and fix the config-as-code path from ticket 08 first.

## Replication mechanics

Firmware and config replicate differently and should be thought about separately.

**Firmware — genuinely identical.** One binary, all six boards, no per-board variation.
This is a **custom build** containing the HC-SR04 usermod (ticket 06) and nothing else —
ticket 04 was cancelled, so there are no custom effects. Ticket 01's stock flash was
bring-up only; that is not the fleet firmware.

**Config — two files, one of them carries identity.**

| File | Per-board variation |
|---|---|
| `presets.json` | **None.** All pattern, playlist, and flashbulb work. Clones as-is. |
| `cfg.json` | Hostname, IP (if static), calibrated sensor threshold. Everything else identical. |

Usermod settings (threshold, cooldown, enable) live in `cfg.json`, so they travel
with it — but only take effect if the firmware actually contains that usermod.

### Order of operations per board

1. Flash fleet firmware (same version as the frozen baseline)
2. Upload `presets.json` — safe, no network impact
3. Upload per-gate `cfg.json` — **may trigger a reconnect**, so do it last

### Footguns

- **Static IP in a cloned `cfg.json` gives six boards one address.** Either vary the
  field per gate, or use DHCP reservations keyed by MAC so the IP lives on the router
  and `cfg.json` stays closer to identical. Reservations are the cleaner option.
- **WiFi credentials are inside `cfg.json`.** Convenient — the fleet joins the same
  AP automatically — but it means the file is sensitive. Decide whether it belongs in
  the repo as-is or with credentials stripped and applied separately.
- **`cfg.json` / `presets.json` schemas are not guaranteed stable across WLED major
  versions.** Freeze the fleet baseline version *before* generating config, and never
  mix versions across the fleet.
- **Prove the clone on board 2 before batching 3–6.** A restore that silently drops a
  setting is much cheaper to find once than five times.

### Scripting it

WLED exposes HTTP endpoints for uploading both files (the `/edit` filesystem
interface and the JSON API — verify exact paths for your version). A short shell
script looping over `gate-1.local` … `gate-6.local` turns fleet deployment into one
command, and makes post-tuning re-deployment cheap enough that you will actually do
it rather than letting the repo drift.

- [ ] Write and commit that script; use it for initial commissioning rather than
      the UI, so it is proven before you need it for a field repair

### Managing the six `cfg.json` files

For six gates, **export-and-commit each board's `cfg.json`** is simplest and matches
ticket 08. The weakness: changing a *common* setting means editing six files.

If you find yourself doing that repeatedly, switch to a `template.json` plus a
per-gate overrides file and a small merge script. Worth building at six gates only if
common settings churn; definitely worth it if the fleet ever grows.

## Per-gate commissioning checklist

Run this for each of gates 1–6 and record the result. Copy this block per gate.

```
GATE __

Hardware
  [ ] Physical label applied, matches WLED device name
  [ ] Controller MAC recorded: ________________
  [ ] Strip: 234 px WS2815, continuous run, injection point secured
  [ ] Strain relief at injection point verified
  [ ] PSU installed, rating correct, fusing in place
  [ ] Photocontrol/timer switching verified on this gate's supply
  [ ] HC-SR04 mounted, aimed, mechanically secure
  [ ] Sensor harness: Trig GPIO 32, Echo GPIO 33, level conversion fitted,
      enclosed with strain relief (not a floating splice)
  [ ] Sensor cable routed AWAY from LED data line and 12V run

Firmware + config
  [ ] WLED version matches fleet baseline: ________________
  [ ] cfg.json uploaded from repo (config/gate-N/)
  [ ] presets.json uploaded from repo (config/common/)
  [ ] OTA password set
  [ ] Hostname resolves: gate-N.local
  [ ] Static IP / DHCP reservation confirmed

Verification
  [ ] Pixel 0 and 233 at expected physical positions
  [ ] Full white fill: uniform, no tint gradient toward far end
  [ ] Full white draw measured, within PSU rating: ______ A
  [ ] ABL configured, flash NOT clamped
  [ ] Both patterns render correctly
  [ ] Playlist cycles both in order
  [ ] Sensor live reading visible in WLED info panel
  [ ] Sensor threshold calibrated for this gate's geometry: ______
  [ ] Flashbulb fires on trigger, full sequence, returns to playlist
  [ ] Flashbulb affects THIS GATE ONLY — no leakage to neighbours
  [ ] Cooldown suppresses retrigger
  [ ] Frame rate unaffected by sensor reads (no stutter from blocking pulseIn)
  [ ] Cold-boot test: several dozen consecutive power cycles, zero failures
  [ ] No-network test: no AP present, gate keeps running and keeps responding
  [ ] Final cfg.json re-exported and committed after threshold calibration

Signed off by: ____________  Date: __________
```

## Tasks

- [ ] Freeze the fleet baseline: exact WLED version + custom build (if ticket 04
      ran). Record it in the epic summary.
- [ ] Generate per-gate `cfg.json` from the bench unit's export, varying only
      hostname / IP / threshold
- [ ] Commission gates 1–6 against the checklist above
- [ ] Verify **cross-gate independence** explicitly: trigger gate 3's sensor and
      confirm gates 1, 2, 4, 5, 6 are visually unaffected. This is the core
      architectural claim of the whole design — prove it rather than assuming it
      follows from having separate controllers.
- [ ] **Test ultrasonic cross-talk with all six gates running at once.** Six HC-SR04s
      within earshot can hear each other's pings as their own echoes. This cannot be
      reproduced with one sensor on a bench and *will* appear on site. Watch for
      phantom triggers on gates nobody is near. Mitigate with spacing and per-gate
      staggered read timing (`06`); if it persists, that is the strongest argument for
      switching to the VL53L1X fallback.
- [ ] **Cold-boot the entire fleet repeatedly** by cycling the photocontrol/timer, not
      just individual gates. Nightly simultaneous boot is the real operating pattern —
      confirm six boards coming up at once causes no supply or boot issue.
- [ ] Run the whole installation together for an extended period — overnight
      minimum, ideally 24h+ — watching for any gate that stalls, drifts, goes dark,
      or gets stuck mid-flashbulb
- [ ] Commit all six final `cfg.json` files after on-gate threshold calibration
- [ ] Prepare a spare: one controller pre-flashed with fleet firmware, ready to take
      a `cfg.json` and drop in. Verify the swap procedure end to end and time it.

## Acceptance criteria

- All six gates pass the full checklist, signed off
- Cross-gate independence demonstrated by test, not by argument
- **No ultrasonic cross-talk** with all six gates running simultaneously
- **Whole-fleet cold boot** verified by cycling the photocontrol/timer repeatedly
- Multi-night continuous run with no gate failing, stalling, or going dark
- All six `cfg.json` files committed post-calibration
- Spare controller prepared and the swap procedure timed and documented (target:
  under 30 minutes)

## Open questions

- Are all six gates physically identical in size and pixel layout? The plan assumes
  yes — 234 px, single run. If any gate differs, its `cfg.json` and possibly its
  pattern timing diverge.
- Is there a staging space where all six can run together before install, or does
  first full-fleet operation happen on site? The latter is riskier and argues for a
  longer soak window in the schedule.
- Who signs off commissioning?
