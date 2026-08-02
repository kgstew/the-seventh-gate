# 08 — Network and Operations

**Blocks on:** 01
**Blocks:** 09

## Goal

Six gates that can be reached, retuned, updated, and restored — without a laptop on
a ladder. All configuration version-controlled in this repo.

## Baseline assumption: there is no permanent network on site

Confirmed — no venue router. This is **not a functional problem**. There is no
cross-gate choreography, so no gate depends on a network to run: patterns and the
flashbulb are entirely local, and a gate with no reachable AP must keep running its
playlist and responding to its sensor indefinitely.

The network is purely a **service** concern:

- On-site tuning via the web UI (the main reason)
- OTA firmware updates
- Config backup, restore, and fleet push
- Diagnosis when something looks wrong

So the design question is not "what network do we install" but **"how do we get
access when we show up."**

## Service access design — bring the network with you

Configure both layers on every board. They cover different situations.

### Layer 1 — the local network from the provided router

Configure all six boards with the router's SSID and password. When it is powered, all
six join and you get mDNS names, scripted fleet config push, and OTA — the full
workflow from ticket 09.

**Open: does the router live on site permanently, or get carried in for service?**
Both work; the difference is worth deciding deliberately.

| | Permanently on site | Carried in per visit |
|---|---|---|
| Service access | Immediate, no waiting for reconnect | Gates rejoin after a reconnect interval |
| Attack surface | A network standing up next to six unauthenticated web UIs | Exists only while you are present |
| Failure mode | Router dies → fleet access lost until noticed | Nothing to fail between visits |

If it stays on site, the neatest option is to **power it from the same switched supply
as the gates** (see `02`). The network then exists exactly when the installation is
running — which is also when you would be tuning — and nothing is powered pointlessly
through the day.

Either way the gates do not depend on it: they run standalone regardless.

**DECIDED: a small dedicated hotspot router provides the local WiFi network.**

**It needs no internet uplink.** It will broadcast a LAN with DHCP and mDNS with
nothing plugged into its WAN port, and that is sufficient for the web UI, config push,
and OTA. No cell service and no venue infrastructure required.

Requirements on the router:

- [ ] **Must broadcast 2.4GHz. The ESP32 cannot see a 5GHz network at all.** On a
      dual-band unit, confirm the SSID the boards are configured for is on the 2.4GHz
      radio — if it lands on 5GHz only, the symptom is six boards that never appear,
      with nothing indicating why.
- [ ] **Fix the SSID and password permanently before configuring any board.** They get
      baked into all six; changing them later means reconfiguring the fleet.
- [ ] Support DHCP reservations by MAC, so per-gate IPs live on the router rather than
      in cloned `cfg.json` files (see ticket 09's address-collision footgun)
- [ ] Decide the power source — see below

### Layer 2 — per-board AP fallback, for when the router is unavailable

WLED brings up its own soft-AP when it can't join a configured network — covering a
dead or forgotten router. Connect a phone or laptop directly to the board and reach it
at **`4.3.2.1`**.

- [ ] **Set a unique AP SSID per board** — `gate-1-ap` … `gate-6-ap`. Left at the
      default, all six broadcast `WLED-AP`, your phone associates with whichever is
      strongest, and you have no idea which gate you are configuring.
- [ ] Change the AP password from the `wled1234` default.
- [ ] Decide the AP trigger mode. WLED offers roughly: always on / only when no
      connection / on button hold / never. **`Button hold` is the best fit here** —
      the board has button terminals, so a service button means no persistent
      attack surface and physical access becomes the authorization. `No connection`
      is more convenient but leaves six open doors permanently broadcasting in a
      public space, and WLED's web UI has no meaningful authentication.

Expect to reach only one gate at a time this way, and only from close range. That is
fine for adjusting one gate; it is not a fleet workflow.

### Layer 3 — wired, as last resort

USB-C on the Dig-Next-2, with a laptop. Always works, requires physical access to a
possibly-awkwardly-mounted controller. This is the recovery path for a board whose
WiFi config is wrong, not a routine one.

## No NTP — resolved by removing the requirement

There is no network at boot, so no time sync, and the ESP32 has no battery-backed
clock. **Note that a permanently-installed router would not fix this either** — with
no cell service there is no internet uplink, so a local router provides DHCP and mDNS
but no time source.

**Resolved:** night-only operation is handled in hardware by switching the 12V supply
externally (photocontrol or timer — see `complete/02-power-and-electrical.md`). The controllers
never need to know the time, so the NTP gap is a non-issue.

The consequence lands elsewhere: **gates cold-boot unattended every night.** Boot
reliability becomes a primary concern — see `05` (boot preset) and `09` (power-cycle
soak test).

- [ ] Leave NTP disabled or unconfigured; nothing should depend on it
- [ ] Confirm nothing in the preset/playlist configuration references a schedule or
      time-of-day condition

## Config as code — the important part

WLED exports its entire state as two JSON files: **`cfg.json`** (device
configuration — LED setup, network, ABL, usermod settings) and **`presets.json`**
(presets and playlists). Both are downloadable and uploadable from the web UI.

Commit both to this repo. Consequences worth stating plainly:

- Gate configuration becomes reviewable and diffable
- A dead controller is replaced by flashing WLED and uploading two files
- Fleet replication (ticket 09) is a file upload per board, not a UI re-entry
- Retuning on site is captured by re-exporting and committing, so the repo stays the
  source of truth rather than drifting behind the hardware

Suggested layout:

```
config/
  common/            # shared across all gates
    presets.json
  gate-1/ ... gate-6/
    cfg.json         # per-gate: hostname, static IP, sensor threshold
```

Only genuinely per-gate values should differ — hostname, IP, and the calibrated
sensor threshold. Everything else lives in `common/`.

## Tasks

- [ ] Procure the hotspot router; **confirm 2.4GHz broadcast**; fix its SSID and
      password permanently (these get baked into all six boards)
- [ ] Decide permanent-on-site vs carried-in, and the router's power source
- [ ] Configure the network credentials on every board
- [ ] Configure per-board AP fallback: unique SSID, non-default password, chosen
      trigger mode
- [ ] Assign identity per gate:
  - [ ] mDNS hostnames: `gate-1.local` … `gate-6.local`
  - [ ] DHCP reservations by MAC on the router — **preferred over static IPs in
        `cfg.json`**, which would collide across cloned config (see ticket 09)
  - [ ] WLED device name matching the physical label
- [ ] Set an **OTA password** on every board and record it in the team's secret
      store — not in this repo
- [ ] Verify OTA works end to end on the bench unit before it matters in the field
- [ ] Set up the `config/` directory structure and commit the bench unit's exports
      as the baseline
- [ ] **Verify network-independence properly — this is now the normal operating
      state, not an edge case.** With no service network present, confirm a gate runs
      its playlist and responds to its sensor for a multi-hour period. Specifically
      watch for: reboot loops from repeated connection attempts, visual stutter on
      each retry, and any growth in response latency over time.
- [ ] Verify the round trip: gates running standalone → power up the router → confirm
      all six join and become reachable by hostname without intervention → power the
      router down → confirm gates continue undisturbed
- [ ] Verify AP fallback: reach one gate from a phone with no router present, confirm
      you can identify which gate you are on, and confirm you can change a setting
- [ ] Confirm nothing depends on NTP or time-of-day (handled in hardware, see `02`)
- [ ] Bring offline copies of config files, tickets, and WLED documentation to site —
      no cell service means no lookups and no calling anyone from the gates
- [ ] Document the access procedure — how someone reaches a gate to adjust
      brightness — in a place the venue operator will actually find. Include what to
      do when the router isn't to hand.

## Optional, worth considering

- [ ] MQTT for basic health monitoring across the fleet. Adds an always-on broker
      dependency; only worth it if someone will actually watch it.
- [ ] Disable or restrict the WLED web UI on public networks if the gates end up on
      one — WLED has no meaningful authentication beyond the OTA password.

## Acceptance criteria

- **A gate with no network present runs correctly for a multi-hour period** — no
  reboot loop, no retry stutter, no latency drift. This is the normal operating
  state and the most important criterion in this ticket.
- Router confirmed broadcasting 2.4GHz with all six boards joining it
- Powering up the router brings all six gates online, reachable by hostname, with no
  manual intervention; powering it down leaves them undisturbed
- Any single gate reachable via its own AP fallback from a phone, correctly
  identifiable, with no router present
- OTA verified working on at least the bench unit
- `cfg.json` + `presets.json` committed for every gate; a restore-to-blank-board
  test performed successfully at least once
- AP passwords changed from default; AP trigger mode chosen deliberately
- OTA password set on all boards, stored outside this repo
- Nothing depends on NTP; night switching is entirely hardware-side
- Access procedure documented, including the no-router case

## Open questions

- **Router permanently on site or carried in?** If permanent, powering it from the
  switched night supply is the neatest option. → also `02`
- Are controllers physically reachable for the USB-C recovery path, or mounted where
  that means a ladder?
- How far apart are the gates? Affects whether one router position covers all six, or
  whether reaching every gate means repositioning it.
- Who needs access after handover, and at what level? An operator who only ever needs
  brightness is different from someone expected to debug a gate.
