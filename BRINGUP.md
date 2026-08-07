# Gate Bring-Up — QuinLED Dig-Next-2

Ordered procedure for taking one gate from a bare QuinLED board to a verified,
config-loaded unit. This is the hardware half of `.claude/epic/11-quinled-migration.md`;
the software half (WLED checkout, build env, baseline `cfg.json`) is already done and
described in [Firmware](#1-firmware) below.

Work top to bottom. **Do not skip section 0** — two of its checks destroy hardware if
they are wrong, and both fail silently in a way that looks like a software bug.

---

## 0. Before power — meter checks

Nothing is connected yet. Board unpowered, sensor unconnected.

- [ ] **Identify the constant 5V on the external relay JST PH connector.** Three
      conductors: constant 5V, a switched 5V trigger driven by GPIO 5, and GND. Power the
      HC-SR04 from the **constant** one. On the trigger the sensor is unpowered whenever
      GPIO 5 is low — its idle state — so the sensor reads as dead and the fault looks
      like software.
- [ ] **Confirm QEXP is 3.3V only.** QuinLED's docs conflict on this (specifications page
      says 3V3/GND/4×GPIO, pinout guide says 5V available). The board is the authority.
- [ ] **Identify the QEXP pin order** and which flying lead is GPIO 32 vs 33. Trig on the
      wrong pin is a silent no-op; **Echo on the wrong pin fed 5V destroys a GPIO.**
- [ ] **Confirm the LED data terminal is GPIO 2.** `cfg.json` and the firmware default
      (`-D DATA_PINS=2`) both assume output 1 = GPIO 2, output 2 = GPIO 4. If the
      silkscreen or your continuity check disagrees, change `hw.led.ins[0].pin` in
      `wled_cfg.json` before uploading — do not renumber the firmware flag.
- [ ] **Level conversion is fitted and measured.** Echo idles/drives 5V; every GPIO here
      is 3.3V max. Measure the divided Echo at GPIO 33 with the sensor powered — expect
      ≈3.0V from the 2.2kΩ/3.3kΩ pair, not 3.3V. See the usermod README for the
      divider-vs-BSS138 decision.
- [ ] Divider on perfboard in an enclosure with strain relief. **Not a floating splice** —
      these face nightly power cycles for a season unattended.
- [ ] Sensor cable routed **away from the LED data line and the 12V run**, twisted or
      shielded.
- [ ] Nothing wired to **GPIO 0** (boot strapping pin — low at power-on means download
      mode and a dark gate, and this board cold-boots unattended ~365 times a year).
- [ ] Button stays at `-1`. GPIO 34/35 are hardware-debounced inputs — fine for a switch,
      fatal for a width-encoded Echo pulse.

---

## 1. Firmware

Already set up on this machine — recorded here so a replacement machine can reproduce it.

**Version note.** The repo documents the baseline as "WLED 0.16.1". There is no `v0.16.x`
tag upstream: WLED renumbered after `v0.15.5`, so the real tag is **`v16.0.1`**
(`VERSION 2605010`). Same release, different scheme.

```sh
git clone --depth 1 --branch v16.0.1 https://github.com/wled/WLED.git ~/Code/WLED

# Symlink, so edits in this repo are what compiles:
ln -s ~/Code/the-seventh-gate/usermods/hcsr04_flashbulb        ~/Code/WLED/usermods/hcsr04_flashbulb
ln -s ~/Code/the-seventh-gate/usermods/hcsr04_flashbulb/platformio_override.ini \
      ~/Code/WLED/platformio_override.ini

cd ~/Code/WLED && pio run -e seventhgate
```

Artifact: `~/Code/WLED/build_output/release/WLED_16.0.1_SEVENTHGATE.bin`.
Verified: usermod links in (`um_hcsr04_flashbulb` present in the usermod registry), the
echo ISR lands in IRAM, and AudioReactive is excluded. Flash 60.2%, RAM 24.7%.

### Flash the board

⚠️ **Erase first.** WLED's own note on the IDF-V4 platform: an existing ESP32 install
cannot be updated to a V4 build, and OTA to it does not work properly. QuinLED boards
ship with WLED preinstalled, so this applies to a board out of the box.

```sh
ls /dev/cu.usbserial-*                     # find the port
esptool.py --port /dev/cu.usbserial-XXXX erase_flash
cd ~/Code/WLED && pio run -e seventhgate -t upload --upload-port /dev/cu.usbserial-XXXX
pio device monitor -e seventhgate --port /dev/cu.usbserial-XXXX   # optional, for boot log
```

- [x] Board boots — serial emits `Ada` (WLED's Adalight init). Release builds have
      `WLED_DEBUG` off, so there is no verbose boot log and the usermod's `DEBUG_PRINTF`
      lines are compiled out. Silence past `Ada` is expected, not a fault.

Once flashed and on the network, later firmware pushes can go over OTA — but only
between V4 builds, so keep the erase step for any first flash.

### Board 1 — as-built record

| | |
|---|---|
| Chip | **ESP32-PICO-V3-02** rev v3.1, 240MHz dual core |
| Flash | 8MB embedded (manufacturer `20`, device `4017`) |
| PSRAM | 2MB embedded, **not enabled in the build** — `BOARD_HAS_PSRAM` is unset, and 234 pixels do not need it |
| MAC | **`c0:cd:d6:3b:af:b0`** |
| USB bridge | CH340 (`1A86:7523`) → `/dev/cu.usbserial-110` |
| Firmware | `WLED_16.0.1_SEVENTHGATE.bin`, env `seventhgate` (extends `esp32dev_8M`) |

**This package's usable GPIO set differs from a classic ESP32.** Per WLED's own
`PinManager::isPinOk()`, on a PICO-V3-02 the unusable pins are **6 and 11** (flash) and
**9 and 10** (PSRAM) — which means **GPIO 7 and 8 are free here**, where on a classic
ESP32 module all of 6–11 are off-limits. Nothing in the gate design uses them, but this
is the table to consult if a pin ever has to move.

---

## 2. Network

⚠️ **`cfg.json` cannot provision WiFi.** WLED exports the passphrase *length* (`pskl`),
never the passphrase — so uploading the repo config will not get a freshly erased board
onto the network. Credentials have to be entered once, by hand, per board.

After an `erase_flash` the board comes up on its own AP:

- SSID **`WLED-AP`**, password **`wled1234`** (`DEFAULT_AP_PASS`)
- Web UI at **`http://4.3.2.1`** → Config → WiFi Setup
- Enter SSID + passphrase, set **mDNS address `gate-1`**, Save & Reboot

Then:

- [ ] Reachable at **`gate-1.local`**
- [ ] Note the DHCP lease and add a **router reservation** — IP belongs in DHCP, not in a
      cloned `cfg.json`

Once the board is on the network the credentials survive a `cfg.json` upload, so this
step is only needed on a first flash or after an erase.

---

## 3. Upload config

**`presets.json` first, `cfg.json` last** — `cfg.json` may force a reconnect.

```sh
cd ~/Code/the-seventh-gate
curl -F "data=@wled_presets.json;filename=/presets.json" http://gate-1.local/upload
curl -F "data=@wled_cfg.json;filename=/cfg.json"         http://gate-1.local/upload
# cfg.json takes effect on reboot:
curl -X POST http://gate-1.local/json/state -H 'Content-Type: application/json' -d '{"rb":true}'
```

`/edit` in the web UI does the same thing by hand if curl misbehaves.

What the baseline `wled_cfg.json` now carries:

| Field | Value | Why |
|---|---|---|
| `id.mdns` / `id.name` | `gate-1` / `Gate 1` | per-gate |
| `hw.led.ins[0].pin` | `[2]` | was `[16]` on the bench ESP32 |
| `hw.led.ins[0].len` | `234`, type 22, order 0 (GRB) | flat 0–233, no ledmap |
| `um.HCSR04Flashbulb` | trig 32 / echo 33, threshold 150, cooldown 15s, preset 101 | new — the bench export had no usermod block |
| `um.AudioReactive` | **removed** | not in the fleet binary, and its stale config claimed GPIO 32 (= Trig) |
| `hw.relay.pin` | `20` | was `-1` — **without this the strip gets no power at all**, see 3b |
| `vid` | `2605010` | was `2606300`, newer than v16.0.1 — a cfg claiming a newer version makes WLED skip its migrations |
| `def.ps` | `100` | boot into the Main Pattern playlist |
| `hw.led.maxpwr` | `0` | ABL off — see section 5 |

- [ ] Presets 1, 2, 10, 11, 100, 101 all present in the UI
- [ ] **Usermod settings visible** under Config → Usermods with the values above.
      If the section is missing, the usermod did not register — stop and check the build.
- [ ] Boots into preset 100 after the reboot

---

## 3b. ⚠️ The power outputs are relay-gated — GPIO 20

**Found the hard way on board 1.** The QuinLED's fused power outputs do **not** pass 12V
straight through. Each is switched by an onboard relay, and the relay feeding the LED
output is driven by **GPIO 20**. With `hw.relay.pin: -1` — WLED's default, and what the
bench config carried — the relay never closes and the strip gets nothing.

The symptom is deceptive: 12V present at the board input, fuse intact, ground continuous,
and **~2.6V on the output terminal** rather than 0V. That 2.6V is the data line
back-feeding the strip through the WS2815 ICs' ESD diodes — so the board looks half-alive
and the fault reads as a wiring or supply problem. Blank the output (`{"on":false}`) and
the phantom voltage disappears.

Required in `cfg.json`, and now in the repo baseline:

```json
"relay": { "pin": 20, "rev": false, "odrain": false }
```

Consequences that follow from this, all load-bearing:

- **WLED's relay tracks on/off state.** Whenever WLED is "off", the relay physically opens
  and the strip loses power. Any preset with `on: false`, an off command, or the nightlight
  timer expiring will cut power and click the relay. All six presets are currently
  `on: true` — including preset 11 "Flashbulb Black", which is black *colour* at full
  brightness rather than off. **Keep it that way**: an `on: false` there would open the
  relay on every visitor trigger.
- **`def.on` must stay `true`** so the relay closes on the nightly unattended cold boot.
- **The other two outputs are on GPIO 21 and 22** and stay undriven. WLED's built-in relay
  supports exactly one pin, so lighting a second power output would require the
  `multi_relay` usermod — which breaks the one-usermod fleet-baseline rule. Worth knowing
  before anyone plans to split the run across outputs.
- This is now a dependency of the strip on firmware booting successfully. Already true for
  data, but it now applies to power as well.

Note that `GPIO 21/22 are relay control lines, not I²C` was already documented — the part
that was missing is that **GPIO 20 gates the LED power output and must be configured, or
the gate is dark.**

## 4. Re-verify ticket 01 on the real board and real strip

Ticket 01 passed on the bench ESP32. None of it transfers. Redo it here.

- [ ] Pixel 0 and pixel 233 are at the expected **physical** positions on the gate
- [ ] **Colour order verified empirically.** `order: 0` (GRB) is the expectation for
      WS2815 — drive pure red and confirm, do not assume
- [ ] Full-white fill is **uniform end to end**. A tint gradient toward the far end is
      voltage drop and means a second injection point, not a config change
- [ ] 10+ minutes of fast animation with no flicker or corruption at the far end
- [ ] **WS2815 backup data line continuity** through the full run
- [ ] Idle draw measured and recorded: `________ A @ 12V`
- [ ] Full-white draw measured and recorded: `________ A @ 12V`
- [ ] **Cold-boot soak** — several dozen power cycles at the 12V supply, zero failures.
      This is the nightly reality of the installation, not an edge case
- [ ] Board MAC recorded: `________________`

---

## 5. Power / ABL decision

`maxpwr` is `0` (ABL disabled) and cannot be set honestly without section 4's numbers.
Note that `ledma: 30` in `cfg.json` is a **5V-per-LED** figure and WLED's ABL math is
5V-based, so it does not describe a 12V WS2815 strip.

Resolve one of two ways and record which:

- [ ] Set `maxpwr` from the measured full-white draw, with `ledma` corrected for the real
      per-pixel current at 12V, **or**
- [ ] Record the deliberate decision to run without ABL on a PSU sized for sustained full
      white — which the flashbulb demands anyway

### ⚠️ The 5A output fuse may be undersized for this load

234 WS2815 at 12V full white is roughly **3.5A** (~15mA/px), against a **5A** fuse — about
30% headroom. Preset 10 "Flashbulb White" drives all 234 pixels to full white **by
design**, so the peak is not an abnormal condition to be avoided; it is the intended
effect, fired on every visitor.

This makes the ABL decision load-bearing rather than cosmetic. Take the measured
full-white figure from section 4 before choosing, and check it against both the fuse
rating and the PSU. If the real draw lands near 3.5A, either move to a higher-rated fuse
sized to the PSU, or set ABL to cap below the fuse — do not leave a nightly full-white
flash sitting inside the fuse's tolerance band.

Also settle ticket 11's open question: **were ticket 02's measurements taken on the real
strip and PSU, or on the bench?** If bench, `complete/02-power-and-electrical.md` needs
its values retaken and this section supersedes them.

---

## 6. Sensor chain (ticket 06, never yet run on hardware)

The usermod compiles and links, but has **never executed on a board**. Everything here
is a first run.

- [ ] Sensor powers up from the constant 5V (section 0)
- [ ] **Info panel shows a plausible distance.** Web UI → Info → *Gate distance*. Wave a
      hand and watch it track. `off` means the usermod is disabled or pin allocation
      failed; a permanent `no echo` means wiring, not code
- [ ] **Frame rate unaffected.** Watch a fast pattern with the sensor running, then set
      `enabled: false` and compare. Any visible stutter means the non-blocking read is not
      working as designed — do not accept "looks fine"
- [ ] Walking toward the gate fires preset 101, the flash runs (~5.1s), and the gate
      **returns to preset 100**
- [ ] Retriggering during the 15s cooldown is suppressed; *Flashbulb* readout counts down
- [ ] `thresholdCm` calibrated by standing where a visitor would, then set comfortably
      **inside** that reading
- [ ] **Tested with a real body in winter outerwear.** Clothing absorbs ultrasound and
      this runs cold at night. A threshold calibrated against a t-shirt will miss coats —
      the single biggest reliability risk in the sensor choice
- [ ] Multi-hour idle test with zero false triggers
- [ ] Pin changes, if any, followed by a **reboot** — the usermod stages them and does not
      re-init the ISR live

Cross-talk between the six sensors cannot be tested with one gate. That stays in ticket 09.

---

## 7. Close out

- [ ] Re-export `cfg.json` from the board and diff it against `wled_cfg.json` — the board
      normalises fields, and the repo should hold what actually ran
- [ ] Record measured draw, MAC, and the calibrated `thresholdCm` in the ticket
- [ ] Tick ticket 11 and ticket 06 acceptance criteria; move them to `complete/`
- [ ] Ticket 09 unblocks — clone to the remaining boards, varying only **hostname**,
      **`thresholdCm`**, and **`readIntervalMs`** (primes 97/101/103/107/109/113; gate 1
      is 97)
