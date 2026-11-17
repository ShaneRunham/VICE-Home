# 📺 VICE Home

<img src="https://raw.githubusercontent.com/ShaneRunham/ShaneRunham/main/screens/vice-home/home.jpg" alt="VICE Home on the TV" width="100%">

A home screen for my LG webOS TV, and **Vice Phone**, the remote on my phone. It opens when the TV turns on or I
press Home, and puts my apps, consoles, PC games, the radio and the homelab in one place.

**Contents:** [The TV](#the-tv) · [On-screen cards](#on-screen-cards) · [Vice Phone](#vice-phone) ·
[How it fits together](#how-it-fits-together)

## The TV

**Home** has the greeting and an info line (weather, GTA VI countdown, the homelab's health with the Wanted stars),
then rows you move through with the remote:

- **Favorites:** my apps, and the Vice Radio tile showing the song and its album cover (OK plays it; after a minute idle a full-screen now-playing view takes over)
- **Inputs:** PS5 (on, rest, last game), Nintendo Switch (awake or asleep), Sky; a tile wakes the console and switches to it
- **Play on PC:** Steam games streamed from the PC with Moonlight, with real covers
- **GTA VI news:** Rockstar Newswire posts with photos and videos

<img src="https://raw.githubusercontent.com/ShaneRunham/ShaneRunham/main/screens/vice-home/play-on-pc.jpg" alt="Play on PC row" width="49%"> <img src="https://raw.githubusercontent.com/ShaneRunham/ShaneRunham/main/screens/vice-home/gta6-news.jpg" alt="GTA VI news row" width="49%">

**Apps** lists everything installed; **Settings** has the TV's settings, all inputs, hiding apps, reloading the home
and the phone remote's QR code. The light and Ask (Claude) buttons are top right.

<img src="https://raw.githubusercontent.com/ShaneRunham/ShaneRunham/main/screens/vice-home/apps.jpg" alt="Apps" width="49%"> <img src="https://raw.githubusercontent.com/ShaneRunham/ShaneRunham/main/screens/vice-home/settings.jpg" alt="Settings (the pairing code is blurred)" width="49%">

## On-screen cards

<img src="https://raw.githubusercontent.com/ShaneRunham/ShaneRunham/main/screens/vice-home/osd-card.jpg" alt="An on-screen card with the Wanted stars" width="100%">

Cards slide in at the top right for homelab problems (with the Wanted stars), "Lost them" when they're fixed,
reminders, the phone ringing, a new song on the radio and messages from Vice Phone. On VICE Home they're drawn by the
home screen itself; over any other app or input a tiny overlay app (`osd-overlay`) shows them, and the TV's own pop-up is the
fallback. A short Vice Ident plays when the TV turns on.

## Vice Phone

The phone remote (`phone/`), installed on my Pixel as an app from the browser. It works at home and, over Tailscale,
anywhere.

<img src="https://raw.githubusercontent.com/ShaneRunham/ShaneRunham/main/screens/vice-phone/home.jpg" alt="Vice Phone home screen" width="24%"> <img src="https://raw.githubusercontent.com/ShaneRunham/ShaneRunham/main/screens/vice-phone/remote.jpg" alt="Remote" width="24%"> <img src="https://raw.githubusercontent.com/ShaneRunham/ShaneRunham/main/screens/vice-phone/trackpad.jpg" alt="Remote in trackpad mode" width="24%"> <img src="https://raw.githubusercontent.com/ShaneRunham/ShaneRunham/main/screens/vice-phone/apps.jpg" alt="Apps sheet" width="24%">

- **Remote:** a swipe pad (swipe to move, hold to keep going, tap for OK, long press for a held OK) or a trackpad for the LG's pointer; back, home, play/pause, volume, mute, power, inputs, typing into the TV's search box, apps, a sleep timer

<img src="https://raw.githubusercontent.com/ShaneRunham/ShaneRunham/main/screens/vice-phone/watch.jpg" alt="Watch" width="24%"> <img src="https://raw.githubusercontent.com/ShaneRunham/ShaneRunham/main/screens/vice-phone/ask.jpg" alt="Ask" width="24%"> <img src="https://raw.githubusercontent.com/ShaneRunham/ShaneRunham/main/screens/vice-phone/messages.jpg" alt="Messages to the TV" width="24%"> <img src="https://raw.githubusercontent.com/ShaneRunham/ShaneRunham/main/screens/vice-phone/sleep.jpg" alt="Sleep timer" width="24%">

- **Watch:** keep watching and picks; tap to play it on the TV
- **Ask:** "put on the latest Bluey": Claude finds it and puts it on, with quick replies and the mic
- **Messages:** text the TV; it pops up as a card, with quick replies like "Dinner's ready"

<img src="https://raw.githubusercontent.com/ShaneRunham/ShaneRunham/main/screens/vice-phone/contacts.jpg" alt="Contacts" width="24%"> <img src="https://raw.githubusercontent.com/ShaneRunham/ShaneRunham/main/screens/vice-phone/light.jpg" alt="The light" width="24%"> <img src="https://raw.githubusercontent.com/ShaneRunham/ShaneRunham/main/screens/vice-phone/radio.jpg" alt="Vice Radio" width="24%"> <img src="https://raw.githubusercontent.com/ShaneRunham/ShaneRunham/main/screens/vice-phone/wanted.jpg" alt="Wanted" width="24%">

- **Contacts:** the devices: wake the PS5, put the Switch on the TV, lock the PC or open VS Code, the light with brightness and whites
- **Radio:** what's playing, skip, or listen on the phone
- **Wanted:** the rap sheet, and a link into Vice Map
- The status bar shows what the TV is doing and the Wanted stars

## How it fits together

| | |
|---|---|
| `vice/` | The TV screen: plain JavaScript and CSS, quick on the TV's CPU; built into an LG app by `build.py` |
| `phone/` | Vice Phone: HTML, CSS and JavaScript, no build step |
| `service/vice_tv.py` | A small Python service on the PC for both: PS5, games, covers, the light, weather, the radio, on-screen cards, and the phone's calls to the TV bridge |
| `osd-overlay/` | The overlay app that shows cards over other apps |
| `screensaver/` | A QML screensaver |
| `tools/` | Build, test and performance scripts |

The look builds on [Luma](https://github.com/ecklf/lg-luma) (MIT, see `vice/LUMA-LICENSE`).

> A cleaned copy of my private repo, updated automatically: personal details are swapped for placeholders and
> app logos, artwork, fonts and videos are left out.
