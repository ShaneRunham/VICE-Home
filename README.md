# 📺 VICE Home

<img src="https://raw.githubusercontent.com/ShaneRunham/ShaneRunham/main/screens/vice-home-tv.jpg" alt="VICE Home on the TV" width="100%">

A home screen for my LG webOS TV. It opens when the TV turns on or I press Home, and puts my apps, consoles and
homelab in one place.

### What it does

- **Live tiles** for the PS5 and Nintendo Switch: what's on, the game's cover, and wake the PS5 from the sofa
- **Play on PC:** Steam games streamed from the PC with Moonlight, with real covers
- **Vice Radio** tile, weather, the light, and a one-line homelab health check
- **On-screen cards** (the OSD) for alerts, now playing and the radio, on top of any app (`osd-overlay`)
- **Phone remote:** scan the QR code and the phone becomes a remote

### How it fits together

`vice/` is the screen itself (plain JavaScript and CSS, fast on the TV's CPU). `service/vice_tv.py` is a small
Python service on the PC that answers it: PS5 state, games, covers, light and weather. `screensaver/` is a
QML screensaver. `tools/` has the build, test and performance scripts.

The look builds on [Luma](https://github.com/ecklf/luma) (MIT, see `vice/LUMA-LICENSE`).

> A cleaned copy of my private repo, updated automatically: personal details are swapped for placeholders and
> app logos, artwork, fonts and videos are left out.
