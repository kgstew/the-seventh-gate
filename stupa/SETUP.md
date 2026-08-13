# Stupa — Mac + Controller Setup

How to connect a Mac to the Stupa's Advatek controller and stream the Chromatik show
live. This is the **programming** path; at runtime the installation plays standalone from
the controller's microSD (see *SHOWTime* at the end). For the pixel/output addressing
contract, see the **The Stupa** section of the repo root `CLAUDE.md`.

## Prerequisites

- **Chromatik** installed (the show targets version 1.2.x).
- **Advatek Assistant 3** installed — <https://www.advateklighting.com/advatek-assistant-3>
- A wired **Ethernet** link from the Mac to the controller (direct cable or a switch).
  Wi-Fi is not used.
- The project file: `stupa/Stupa_Show_2026_8out.lxp`.

## Fixed addresses

| Device | IP | Subnet mask |
|---|---|---|
| Controller (A4-S Mk3, "ASS 1") | `10.0.0.21` | `255.255.255.0` |
| Mac (Ethernet adapter) | `10.0.0.10` | `255.255.255.0` |

Both must be on the `10.0.0.x` subnet, which is also the sACN target host baked into the
show. No router/gateway is required.

## 1. Connect the hardware

Plug the Mac's Ethernet adapter into the controller (directly, or through a switch on the
same network). Power the controller and the LED supply.

## 2. Give the controller a static IP

Open **Advatek Assistant 3** — it discovers PixLite units by broadcast even across
mismatched subnets. Open the device ("ASS 1") → **IP Address**, and set:

- IP mode: **Static** (not DHCP/AutoIP)
- IP Address: **10.0.0.21**
- Subnet Mask: **255.255.255.0**
- Gateway: **0.0.0.0** (blank)

Apply; the controller reboots onto that address.

> Why static: on DHCP/AutoIP with no DHCP server, the PixLite self-assigns a
> `169.254.x.x` link-local address that nothing can reach. If the Network Details page
> shows `169.254.x.x`, it is **not** configured — set it static as above.

## 3. Give the Mac a matching static IP

Find the Ethernet service name, then set it manually (replace `"AX88179A"` if your
adapter is named differently):

```sh
networksetup -listallnetworkservices
sudo networksetup -setmanual "AX88179A" 10.0.0.10 255.255.255.0
```

## 4. Verify the link

```sh
networksetup -getinfo "AX88179A"     # expect IP 10.0.0.10 / mask 255.255.255.0
ping 10.0.0.21                        # expect replies
```

Replies mean the Mac and controller are on the same subnet and reachable. `Host is down`
means they are not — recheck the IPs in steps 2–3.

## 5. Run the Chromatik show

1. Open `stupa/Stupa_Show_2026_8out.lxp` in Chromatik.
2. **MODEL** tab → confirm each fixture's output toggle (left of its name) is **on**.
   Inspector should show Protocol sACN, Host `10.0.0.21`.
3. In the mixer, bring up a channel and select a pattern; confirm it animates in the
   preview.
4. Enable **Live** on the **Master** channel (equivalently MODEL → OUTPUT → *Live Network
   Output*). Nothing streams until this is on.

## 6. Confirm data is flowing

In Advatek Assistant 3 → **Statistics**, the Pixel Data **In Rate** should climb from 0 to
~40–60 Hz. That confirms the controller is receiving the sACN stream. The LEDs should
match the Chromatik preview.

## Troubleshooting

- **Nothing lights, In Rate stays 0** — Mac not on `10.0.0.x`, or Master **Live** is off.
- **`ping` says "Host is down"** — subnet mismatch; the controller likely fell back to
  `169.254.x.x` (redo step 2).
- **Colors wrong** — byte order. The model sends **RGB** and the controller swaps to
  **GRB**; the swap must happen in exactly one place, never both.
- **Only part of a run lights / pixels drift** — check the output pixel counts and the
  addressing contract in root `CLAUDE.md`; regenerate the `.lxp` addressing rather than
  hand-editing the controller.

## Switching the Mac back

The static IP takes the Mac off other networks. To restore:

```sh
sudo networksetup -setdhcp "AX88179A"                        # automatic, or
sudo networksetup -setmanual "AX88179A" 192.168.1.10 255.255.255.0   # the strip-test net
```

## Standalone playback (runtime)

For the permanent install the computer is not needed. Record the live Chromatik stream to
the controller's microSD via **SHOWTime** (Advatek Assistant 3 → Recording), add the scene
to a playlist, and create a **startup trigger** that plays it on boot. The Stupa then runs
from the SD card with no Mac or network attached.
