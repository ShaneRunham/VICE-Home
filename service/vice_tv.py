#!/usr/bin/env python3
"""vice-tv: the PC side of the Vice TV home (homelab line, PS5, Govee light, Play on PC).

Runs as the user service vice-tv.service on port 5401. The TV home calls it over the LAN; the
couch-tv bridge (port 5400) still does apps, inputs and Ask. If couch-tv's config.json has
bridge.pairing_key set, every call here needs the same key (Authorization: Bearer <key>).

    GET  /api/status           homelab line: {"good": bool, "line": "All 6 services up"}
    GET  /api/ps5              {"state": "on" | "standby" | "off"}
    POST /api/ps5/wake         wakes it, waits up to 30 s: {"ok": bool, "state": ...}
    POST /api/light            {"cmd": ["on"] | ["off"] | ["white", "2700"] | ["color", r, g, b] | ["brightness", n]}
    GET  /api/games            {"host_uuid": ..., "games": [{"name", "app_id", "cover"}]} from Sunshine's apps.json
    GET  /api/light            {"on", "pct", "mode", "kelvin", "rgb"}: what HA last sent the bulb
    GET  /api/weather          {"temp": 6, "condition": "sunny"} from Home Assistant's weather.home (same as the HA panel)
    GET  /covers/<file>        game cover images
    GET  /news-img/<w>/<id>.jpg  a GTA VI news picture at display size (w 640 or 1920; Rockstar's are 3840x2160)
    GET  /radio                Vice Radio's MP3 stream, relayed (the TV can't reach the tailnet; no key)
    POST /api/radio/skip       skip the song (on a station visit: back to own music)
    GET  /api/radio            what Vice Radio is playing: {src, station, artist, title, album, dir, since, cover}
    GET  /radio-cover/<id>.jpg album cover (600 px), id = sha1("Artist/Album")[:16]
    POST /api/osd              a Vice OSD card: {"title", "line", "em", "sub", "icon", "dot", "art", "ttl"}. On Vice Home
                               when it's on screen, else over whatever the TV shows (the overlay app app.vice.osd,
                               opened through HA); {"ok", "shown": bool}: false when the TV is off (HA falls back).
                               Optional "tag": POST /api/osd/clear {"tag"} takes cards with that tag off again
    GET  /api/osd?after=<id>   Vice Home's poll (every 2 s while it shows): {"items": [...], "last": id}
    GET  /api/osd?overlay=1    the overlay app's poll: its cards not yet taken
    GET  /api/tv/woke          {"woke": bool}: the TV turned on in the last 3 minutes (HA history), for Vice Home's Ident
"""
import glob
import hashlib
import hmac
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
import zlib
import collections
import queue
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.expanduser("~/homelab/discord-bot"))
import gaming  # noqa: E402  (PS5 discovery + wake, shared with the VICE bot)

PORT = 5401
HOME = os.path.expanduser("~")
COUCH_CONFIG = f"{HOME}/couch-tv/config.json"
GOVEE = f"{HOME}/.local/bin/ha-light"  # the light goes through Home Assistant (same args as govee)
KUMA = "http://127.0.0.1:3001/api/{}/homelab"
SUNSHINE_APPS = f"{HOME}/.config/sunshine/apps.json"
SUNSHINE_ASSETS = "/usr/share/sunshine"
STEAM_CACHE = f"{HOME}/.var/app/com.valvesoftware.Steam/.local/share/Steam/appcache/librarycache"
COVERS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "covers")
STEAM_USERDATA = f"{HOME}/.var/app/com.valvesoftware.Steam/.local/share/Steam/userdata"
HA_COVERS = f"{HOME}/homelab/home-assistant/config/www/vice-panel/covers"  # game art HA saves (scripts/cover.py)
GTA6_FEED = os.path.expanduser("~/homelab/home-assistant/config/www/vice-panel/gta6.json")  # Rockstar's GTA VI posts (bot's rockstar_news.py)
# display-size copies of the news pictures, in HA's www so the Vice panel can load them from HA too (/local/vice-panel/news/)
NEWS_IMG = os.path.expanduser("~/homelab/home-assistant/config/www/vice-panel/news")
RADIO = "http://127.0.0.1:3004"  # Vice Radio (~/homelab/radio): /vice-radio stream
RADIO_NOW = "http://127.0.0.1:3005/now"  # what it is playing (JSON)
MUSIC = "/mnt/storage/media/music"
RADIO_COVERS = os.path.expanduser("~/homelab/home-assistant/config/www/vice-panel/radio")  # shared with the HA panel
LAST_PLAYED = os.path.join(os.path.dirname(os.path.abspath(__file__)), "last-played.json")  # {"ps5": {...}}

_cache = {}


def cached(key, seconds, fn):
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < seconds:
        return hit[1]
    value = fn()
    _cache[key] = (time.time(), value)
    return value


def pairing_key():
    try:
        with open(COUCH_CONFIG) as f:
            return ((json.load(f).get("bridge") or {}).get("pairing_key") or "").strip()
    except (OSError, ValueError):
        return ""


# ---------- homelab line ----------
HOMELAB_STATE = f"{HOME}/homelab/home-assistant/config/homelab-state.json"  # the bot's problems (same as the phone alerts)


def clean_problem(m):
    """'Container `x` is exited (Exited (1) 2 min ago)' -> 'Container x is exited' (same as the HA panel).
    First sentence, without a bracket at its end; brackets inside it stay ('TV home service (vice-tv) has stopped')."""
    m = re.split(r"\.\s", re.sub(r"[`*]", "", str(m)))[0]
    m = re.sub(r"\s*\((?:[^()]|\([^()]*\))*\)\s*$", "", m)
    return m if len(m) <= 60 else re.sub(r"[\s,;:]+\S*$", "", m[:58]) + "…"  # cut at a word


def homelab_status():
    try:
        st = json.load(open(HOMELAB_STATE))
        probs = list((st.get("problems") or {}).values())
        w = st.get("wanted") or {}
    except (OSError, ValueError):
        probs, w = [], {}
    # Wanted Level (2026-11-16, ~/homelab/discord-bot/wanted.py): stars = level, evading = the level flashing as it clears
    stars = {"stars": w.get("stars", 0), "evading": w.get("evading", 0)}
    if probs:  # a real problem beats "All 6 services up"; the worst one first (the Wanted Level's order)
        crimes = w.get("crimes") or []
        first = crimes[0]["what"] if crimes else probs[0]
        return {"good": False, "line": clean_problem(first) + (f" · +{len(probs) - 1} more" if len(probs) > 1 else ""), **stars}
    try:
        get = lambda u: json.load(urllib.request.urlopen(u, timeout=5))  # noqa: E731
        page, beats = get(KUMA.format("status-page")), get(KUMA.format("status-page/heartbeat"))
    except Exception:
        return {"good": False, "line": "Can't reach Uptime Kuma"}
    down = []
    total = 0
    for g in page["publicGroupList"]:
        for m in g["monitorList"]:
            total += 1
            hb = (beats["heartbeatList"].get(str(m["id"])) or [{}])[-1]
            if hb.get("status") != 1:
                down.append(m["name"])
    if not down:
        return {"good": True, "line": f"All {total} services up", **stars}
    if len(down) == 1:
        return {"good": False, "line": f"{down[0]} is down"}
    return {"good": False, "line": f"{len(down)} of {total} services down"}


# ---------- Play on PC ----------
def app_id(name, image, index, taken):
    """Sunshine's own app id: CRC-32 of the name plus the image's SHA-256 (src/process.cpp)."""
    path = image if os.path.isabs(image) else os.path.join(SUNSHINE_ASSETS, image)
    extra = ""
    if image and os.path.isfile(path):
        with open(path, "rb") as f:
            extra = hashlib.sha256(f.read()).hexdigest()
    elif image:
        extra = path

    def crc(s):
        c = zlib.crc32(s.encode())
        return str(abs(c - (1 << 32) if c >= 1 << 31 else c))
    first = crc(name + extra)
    return first if first not in taken else crc(name + extra + str(index))


def steam_cover(steam_id):
    """A 660x308 cover in covers/: the Steam library's hero art with the game's logo on it (as Steam's own
    library shows games), else its wide header. Returns the file name."""
    d = os.path.join(STEAM_CACHE, steam_id)
    first = lambda *pats: next((f for p in pats for f in glob.glob(f"{d}/{p}")), None)  # noqa: E731
    hero, logo = first("library_hero.jpg", "*/library_hero.jpg"), first("logo.png", "*/logo.png")
    header = first("library_header.jpg", "*/library_header.jpg", "header.jpg")
    if not ((hero and logo) or header):
        return None
    os.makedirs(COVERS, exist_ok=True)
    name = f"{steam_id}.jpg"
    out = os.path.join(COVERS, name)
    newest = max(os.path.getmtime(f) for f in (hero, logo, header) if f)
    if os.path.exists(out) and os.path.getmtime(out) >= newest:
        return name
    try:
        from PIL import Image
        W, H = 660, 308
        if hero and logo:
            bg = Image.open(hero).convert("RGB")
            scale = max(W / bg.width, H / bg.height)
            bg = bg.resize((round(bg.width * scale), round(bg.height * scale)), Image.LANCZOS)
            left, top = (bg.width - W) // 2, (bg.height - H) // 2
            bg = bg.crop((left, top, left + W, top + H))
            lg = Image.open(logo).convert("RGBA")
            s = min(W * 0.72 / lg.width, H * 0.62 / lg.height)
            lg = lg.resize((round(lg.width * s), round(lg.height * s)), Image.LANCZOS)
            bg.paste(lg, ((W - lg.width) // 2, (H - lg.height) // 2), lg)
        else:
            bg = Image.open(header).convert("RGB").resize((W, H), Image.LANCZOS)
        bg.save(out, quality=88)
    except Exception:
        with open(header or hero, "rb") as src, open(out, "wb") as dst:
            dst.write(src.read())
    return name


def news_img(width, pid):
    """A news picture at most `width` px wide (the TV shows cards at 418 px and nothing above 1920x1080, so a
    smaller copy looks the same there but is a fraction of the download and memory). Only pictures that are
    in the feed. Made on first request, kept in news-img/ (copies older than 60 days are cleared)."""
    try:
        with open(GTA6_FEED) as f:
            items = json.load(f).get("items", [])
    except (OSError, ValueError):
        return None
    urls = [x.get("image") for x in items] + [p.get("url") for x in items for p in x.get("photos", [])]
    url = next((u for u in urls if u and hashlib.sha1(u.encode()).hexdigest()[:16] == pid), None)
    if not url:
        return None
    out = os.path.join(NEWS_IMG, f"{width}-{pid}.jpg")
    if os.path.isfile(out):
        return out
    from PIL import Image
    import io
    os.makedirs(NEWS_IMG, exist_ok=True)
    for old in glob.glob(f"{NEWS_IMG}/*.jpg"):
        if time.time() - os.path.getmtime(old) > 60 * 86400:
            os.remove(old)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    im = Image.open(io.BytesIO(urllib.request.urlopen(req, timeout=20).read())).convert("RGB")
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    im.save(out + ".tmp", "JPEG", quality=92)
    os.replace(out + ".tmp", out)
    return out


def news_prepare():
    """Make the copies of every picture in the feed ahead of time (checked each minute, work only when the feed
    changes), so neither the TV nor the HA panel waits for one or falls back to the 4K original."""
    import threading
    def loop():
        seen = None
        while True:
            try:
                m = os.path.getmtime(GTA6_FEED)
                if m != seen:
                    with open(GTA6_FEED) as f:
                        items = json.load(f).get("items", [])
                    urls = [x.get("image") for x in items] + [p.get("url") for x in items for p in x.get("photos", [])]
                    for u in dict.fromkeys(u for u in urls if u):
                        pid = hashlib.sha1(u.encode()).hexdigest()[:16]
                        for w in (640, 1920):
                            try:
                                news_img(w, pid)
                            except Exception:  # noqa: BLE001  (one bad picture: try again on the next feed change)
                                pass
                    seen = m
            except (OSError, ValueError):
                pass
            time.sleep(60)
    threading.Thread(target=loop, daemon=True).start()


def radio_cover_id(album_dir):
    return hashlib.sha1(album_dir.encode()).hexdigest()[:16]


def radio_covers():
    """A 600 px cover for every album folder in the music library: cover/folder/front.jpg if there is one, else
    the art embedded in its first track. Made once; checked every minute for new albums (a walk of ~30 folders)."""
    import threading
    def make(rel, files):
        out = os.path.join(RADIO_COVERS, radio_cover_id(rel) + ".jpg")
        if os.path.isfile(out):
            return
        pics = [f for f in files if f.lower() in ("cover.jpg", "folder.jpg", "front.jpg", "cover.png", "folder.png")]
        tracks = sorted(f for f in files if f.lower().endswith((".flac", ".mp3", ".m4a", ".ogg", ".opus")))
        src = os.path.join(MUSIC, rel, (pics or tracks)[0])
        args = ["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", src, "-an", "-frames:v", "1",
                "-vf", "scale=600:600:force_original_aspect_ratio=decrease", "-q:v", "3", out + ".tmp.jpg"]
        if subprocess.run(args, timeout=60).returncode == 0:
            os.replace(out + ".tmp.jpg", out)
    def loop():
        while True:
            os.makedirs(RADIO_COVERS, exist_ok=True)
            for root, _dirs, files in os.walk(MUSIC):
                if root != MUSIC and any(f.lower().endswith((".flac", ".mp3", ".m4a")) for f in files):
                    try:
                        make(os.path.relpath(root, MUSIC), files)
                    except Exception:  # noqa: BLE001  (no art or a file still copying: try again next round)
                        pass
            time.sleep(60)
    threading.Thread(target=loop, daemon=True).start()


def with_cover(now):
    cid = radio_cover_id(now["dir"]) if now.get("dir") else None
    now["cover"] = f"/radio-cover/{cid}.jpg" if cid and os.path.isfile(f"{RADIO_COVERS}/{cid}.jpg") else None
    return now


def radio_now():
    with urllib.request.urlopen(RADIO_NOW, timeout=3) as r:
        return with_cover(json.load(r))


class RadioTap:
    """The TV's copy of the stream. The TV's player starts on the first bit of audio, then stops and waits until it has
    10+ s in hand (measured 2026-11-13: 0.8 s of music, a 9 s gap). The station can only hand a new listener ~4 s at
    once, so vice-tv stays connected and keeps the last LAG seconds, sending them all the moment the TV connects:
    the TV plays LAG s behind the station, without the gap. Now playing is delayed to match (now_at)."""
    LAG = 20
    RATE = 32000   # bytes/s at 256 kbps

    def __init__(self):
        self.buf, self.size, self.clients, self.lock = collections.deque(), 0, set(), threading.Lock()
        self.hist = []   # [(time, now-playing)] when it changed, for the delayed copy
        threading.Thread(target=self.pump, daemon=True).start()
        threading.Thread(target=self.watch, daemon=True).start()

    def pump(self):
        while True:
            try:
                with urllib.request.urlopen(RADIO + "/vice-radio", timeout=15) as up:
                    while chunk := up.read1(8192):
                        with self.lock:
                            self.buf.append(chunk)
                            self.size += len(chunk)
                            while self.size > self.LAG * self.RATE:
                                self.size -= len(self.buf.popleft())
                            for q in list(self.clients):
                                try:
                                    q.put_nowait(chunk)
                                except queue.Full:   # a stuck client: drop it
                                    self.clients.discard(q)
            except Exception:  # noqa: BLE001  (station restarting: reconnect)
                pass
            with self.lock:
                self.buf.clear(); self.size = 0
            time.sleep(3)

    def watch(self):
        last = None
        while True:
            try:
                now = radio_now()
                key = (now.get("src"), now.get("artist"), now.get("title"))
                if key != last:
                    last = key
                    self.hist = (self.hist + [(time.time(), now)])[-30:]
            except (OSError, ValueError):
                pass
            time.sleep(2)

    def subscribe(self, seconds=None):
        q = queue.Queue(maxsize=400)
        with self.lock:
            head = b"".join(self.buf)
            if seconds is not None:   # a shorter head start (the newest `seconds`)
                head = head[-int(seconds * self.RATE):] if seconds > 0 else b""
            self.clients.add(q)
        return head, q

    def now_at(self):
        """What the TV is hearing: the now-playing of LAG s ago (the buffer's length, once it's full)."""
        lag = self.size / self.RATE
        past = [n for t, n in self.hist if t <= time.time() - lag]
        return with_cover(dict(past[-1])) if past else radio_now()


radio_tap = None


def serverinfo():
    """Sunshine's id for this PC, and the app it is streaming now (0 = none)."""
    try:
        xml = urllib.request.urlopen("http://127.0.0.1:47989/serverinfo", timeout=4).read().decode()
        cur = re.search(r"<currentgame>(\d+)", xml)
        return re.search(r"<uniqueid>([^<]+)", xml).group(1), int(cur.group(1)) if cur else 0
    except Exception:
        return None, 0


# ---------- last played ----------
def steam_last_played():
    """{steam app id: unix time last played}, from Steam's localconfig.vdf."""
    out = {}
    for f in glob.glob(f"{STEAM_USERDATA}/*/config/localconfig.vdf"):
        try:
            text = open(f, encoding="utf-8", errors="replace").read()
        except OSError:
            continue
        for m in re.finditer(r'"(\d+)"\s*\{((?:[^{}]|\{[^{}]*\})*?)\}', text):
            lp = re.search(r'"LastPlayed"\s+"(\d+)"', m.group(2))
            if lp:
                out[m.group(1)] = max(out.get(m.group(1), 0), int(lp.group(1)))
    return out


def cover_by_name(name, prefix):
    """Box art for a console game by its name, from the Steam store when the game is on Steam (most PS5 games
    are). Cached in covers/; returns the file name or None."""
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:60]
    fname = f"{prefix}-{slug}.jpg"
    out = os.path.join(COVERS, fname)
    if os.path.exists(out):
        return fname if os.path.getsize(out) else None
    os.makedirs(COVERS, exist_ok=True)
    import urllib.parse
    import urllib.request
    data = b""
    try:
        q = urllib.parse.quote(re.sub(r"[™®]", "", name))
        found = json.load(urllib.request.urlopen(f"https://store.steampowered.com/api/storesearch/?term={q}&cc=GB&l=en",
                                                 timeout=8)).get("items", [])
        if found:
            data = urllib.request.urlopen(f"https://cdn.akamai.steamstatic.com/steam/apps/{found[0]['id']}/header.jpg",
                                          timeout=8).read()
    except (OSError, ValueError, KeyError):
        return None  # try again next time
    with open(out, "wb") as f:
        f.write(data)  # empty file = not on Steam, don't look again
    return fname if data else None


def ps3_cover(game):
    """The game's own icon (ICON0) that webMAN keeps, copied off the PS3 into covers/."""
    import ftplib
    slug = re.sub(r"[^a-z0-9]+", "-", game.lower()).strip("-")[:60]
    fname = f"ps3-{slug}.png"
    out = os.path.join(COVERS, fname)
    if not os.path.exists(out):
        os.makedirs(COVERS, exist_ok=True)
        try:
            with ftplib.FTP(gaming.PS3_IP, timeout=5) as ftp, open(out + ".part", "wb") as f:
                ftp.login()
                ftp.retrbinary(f"RETR /dev_hdd0/tmp/wmtmp/{game}.PNG", f.write)
            os.replace(out + ".part", out)
        except (OSError, ftplib.Error):
            return None
    return fname


def psn_now():
    """What the PSN account is playing, from Home Assistant's PlayStation Network integration (one PSN login)."""
    return gaming.psn_playing()


def psn_icon(name, url):
    """The game's own PSN artwork (via HA), cached in covers/."""
    if not url:
        return None
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:60]
    fname = f"psn-{slug}.png"
    out = os.path.join(COVERS, fname)
    if not os.path.exists(out):
        import urllib.request
        os.makedirs(COVERS, exist_ok=True)
        try:
            data = urllib.request.urlopen(url, timeout=10).read()
        except OSError:
            return None
        with open(out, "wb") as f:
            f.write(data)
    return fname


def ha_last(kind):
    """The last game HA remembers for a console (sensor.ps5_last_game / sensor.ps3_last_played), so the TV and the
    HA panel always agree: {"name", "cover"} or None."""
    entity = "sensor.ps5_last_game" if kind == "ps5" else "sensor.ps3_last_played"
    try:
        name = cached("ha-" + kind, 30, lambda: gaming.ha(f"/api/states/{entity}", timeout=8)["state"])
    except Exception:  # noqa: BLE001  (HA down)
        return None
    if not name or name in ("unknown", "unavailable", "None"):
        return None
    fname = f"{kind}-{re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')[:60]}.png"
    return {"name": name, "cover": f"/covers/{fname}" if os.path.isfile(os.path.join(HA_COVERS, fname)) else None}


def ps5_info():
    """PS5 state plus the game it's running (remembered as the last played)."""
    reply = gaming._ask("SRCH * HTTP/1.1\n" + gaming.PROTO)
    state = gaming.ps5_state() if reply is None else ("on" if reply.startswith("HTTP/1.1 200") else
                                                      "standby" if " 620 " in reply.split("\n")[0] else "on")
    fields = dict(l.split(":", 1) for l in (reply or "").splitlines() if ":" in l)
    try:
        last = json.load(open(LAST_PLAYED))
    except (OSError, ValueError):
        last = {}
    name = fields.get("running-app-name", "").strip()  # PS4-style field; a PS5 doesn't send it
    if state == "on" and not name:
        g = cached("psn", 60, psn_now)
        if g.get("platform", "PS5").upper().startswith("PS5"):
            name = (g.get("name") or "").strip()
    if state == "on" and name and (last.get("ps5") or {}).get("name") != name:
        last["ps5"] = {"name": name, "cover": None}
        cover = psn_icon(name, cached("psn", 60, psn_now).get("icon")) or cover_by_name(name, "ps5")
        last["ps5"]["cover"] = f"/covers/{cover}" if cover else None
        with open(LAST_PLAYED, "w") as f:
            json.dump(last, f)
    mine = last.get("ps5") or {}
    theirs = ha_last("ps5")
    if theirs and not theirs["cover"] and mine.get("name") == theirs["name"]:
        theirs["cover"] = mine.get("cover")
    return {"state": state, "playing": name if state == "on" else None, "last": theirs or mine or None}


def games():
    with open(SUNSHINE_APPS) as f:
        apps = json.load(f).get("apps", [])
    out, taken = [], set()
    for i, a in enumerate(apps):
        aid = app_id(a["name"], a.get("image-path", ""), i, taken)
        taken.add(aid)
        cmds = " ".join([a.get("cmd", "")] + a.get("detached", []))
        m = re.search(r"steam://rungameid/(\d+)", cmds)
        kind = "game" if m else "bigpicture" if "bigpicture" in cmds else "desktop" if a["name"] == "Desktop" else "app"
        cover = steam_cover(m.group(1)) if m else None
        # other apps can bring their own 660x308 cover as covers/app-<name>.jpg (e.g. app-psp.jpg for PPSSPP)
        own = f"app-{re.sub(r'[^a-z0-9]+', '-', a['name'].lower()).strip('-')}.jpg"
        if not cover and os.path.isfile(os.path.join(COVERS, own)):
            cover = own
        # ?v=<file time>: the TV caches covers for an hour, so a redrawn cover (same name) shows at once
        ver = int(os.path.getmtime(os.path.join(COVERS, cover))) if cover else 0
        out.append({"name": a["name"], "app_id": int(aid), "kind": kind,
                    "cover": f"/covers/{cover}?v={ver}" if cover else None})
    # games first, then Big Picture and Desktop, as on the mock-up
    order = {"game": 0, "app": 1, "bigpicture": 2, "desktop": 3}
    played = steam_last_played()
    for g, a in zip(out, apps):
        m = re.search(r"steam://rungameid/(\d+)", " ".join([a.get("cmd", "")] + a.get("detached", [])))
        g["last_played"] = played.get(m.group(1), 0) if m else 0
    out.sort(key=lambda g: (order[g["kind"]], -g["last_played"]))
    uuid, running = serverinfo()
    return {"host_uuid": uuid, "running": running, "games": out}


# ---------- light ----------
def light(cmd):
    ok = (cmd in (["on"], ["off"])
          or (len(cmd) == 2 and cmd[0] == "white" and cmd[1].isdigit() and 2700 <= int(cmd[1]) <= 6500)
          or (len(cmd) == 2 and cmd[0] == "brightness" and cmd[1].isdigit() and 1 <= int(cmd[1]) <= 100)
          or (len(cmd) == 4 and cmd[0] == "color" and all(c.isdigit() and int(c) <= 255 for c in cmd[1:])))
    if not ok:
        return 400, {"ok": False, "error": "unknown light command"}
    try:
        r = subprocess.run([GOVEE, *cmd], capture_output=True, text=True, timeout=40)
    except subprocess.TimeoutExpired:
        return 504, {"ok": False, "error": "The light didn't answer"}
    if r.returncode:
        busy = "busy" in (r.stderr + r.stdout).lower() or "connect" in (r.stderr + r.stdout).lower()
        return 502, {"ok": False, "error": "The light is busy (the Govee app or Screen Sync may be connected)"
                     if busy else "The light didn't answer"}
    return 200, {"ok": True}


def free_sunshine():
    """An app left open in Sunshine with nobody connected (a quit Moonlight that didn't 'Quit session') blocks
    starting a different one. Restart Sunshine to clear it, unless someone is really streaming."""
    if gaming.sunshine_streaming():
        return 409, {"ok": False, "error": "Someone is streaming from the PC right now. Quit that first."}
    subprocess.run(["systemctl", "--user", "restart", gaming.SUNSHINE_UNIT], timeout=30)
    for _ in range(20):
        time.sleep(1)
        uuid, running = serverinfo()
        if uuid and not running:
            return 200, {"ok": True}
    return 504, {"ok": False, "error": "Sunshine didn't come back. Try again in a moment."}


def weather():
    """Home Assistant's weather.home (Met.no), so the TV and the HA panel say the same thing."""
    s = gaming.ha("/api/states/weather.home", timeout=8)
    return {"temp": s["attributes"].get("temperature"), "condition": s["state"]}


def ps3_info():
    """PS3 temperatures and the game webMAN last loaded, for the PS3 input's subtitle."""
    s = gaming.ps3_status()
    if not s:
        up = gaming.ps3_reachable()  # switched on, HEN not enabled yet
        return {"on": False, "up": up, "state": "Enable HEN" if up else "Off", "last": ha_last("ps3")}
    game = gaming.ps3_last_game()
    cover = ps3_cover(game) if game else None
    return {"on": True, "state": "On", **s, "game": game, "cover": f"/covers/{cover}" if cover else None}


def light_state():
    a = gaming.ha("/api/states/light.ceiling_light", timeout=8)
    at = a["attributes"]
    return {"on": a["state"] == "on", "pct": round((at.get("brightness") or 0) / 255 * 100) or None,
            "mode": at.get("color_mode"), "kelvin": at.get("color_temp_kelvin"), "rgb": at.get("rgb_color")}


def wake_ps5():
    if gaming.ps5_state() == "on":
        return {"ok": True, "state": "on"}
    try:
        gaming.wake_ps5()
    except Exception as e:
        return {"ok": False, "state": gaming.ps5_state(), "error": str(e)}
    for _ in range(15):
        time.sleep(2)
        if gaming.ps5_state() == "on":
            _cache.pop("ps5", None)
            return {"ok": True, "state": "on"}
    state = gaming.ps5_state()
    return {"ok": False, "state": state,
            "error": "The PS5 isn't answering. Waking only works from rest mode." if state == "off"
            else "The PS5 is still in rest mode. Try again in a moment."}


class Handler(BaseHTTPRequestHandler):
    server_version = "vice-tv/1"

    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (self.address_string(), fmt % args))

    def send_json(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.cors()
        self.end_headers()
        self.wfile.write(data)

    def cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.end_headers()

    def authorised(self):
        key = pairing_key()
        if not key:
            return True
        got = (self.headers.get("Authorization") or "").removeprefix("Bearer ").strip()
        if not got:
            m = re.search(r"[?&]key=([^&]+)", self.path)
            got = urllib.request.unquote(m.group(1)) if m else ""
        return hmac.compare_digest(got.encode(), key.encode())

    def do_GET(self):
        path = self.path.split("?")[0]
        if path.startswith("/covers/"):   # images: no key, they're only game art
            name = os.path.basename(path)
            f = os.path.join(COVERS, name)
            if not os.path.isfile(f):
                f = os.path.join(HA_COVERS, name)
            if not re.fullmatch(r"[\w.-]+\.(jpg|png)", name) or not os.path.isfile(f):
                return self.send_json(404, {"ok": False})
            data = open(f, "rb").read()
            self.send_response(200)
            self.send_header("Content-Type", "image/png" if data[:4] == b"\x89PNG" else "image/jpeg")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "max-age=3600")
            self.cors()
            self.end_headers()
            return self.wfile.write(data)
        if path == "/radio":   # the stream for the TV (LAN only): the last 20 s at once, then live (RadioTap)
            hm = re.search(r"[?&]head=(\d+)", self.path)
            head, q = radio_tap.subscribe(int(hm.group(1)) if hm else None)
            if not head and not hm:
                radio_tap.clients.discard(q)
                return self.send_json(503, {"ok": False, "error": "radio is off"})
            self.send_response(200)
            self.send_header("Content-Type", "audio/mpeg")
            self.send_header("Cache-Control", "no-store")
            self.cors()
            self.end_headers()
            try:
                self.wfile.write(head)
                while True:
                    self.wfile.write(q.get(timeout=15))
            except (OSError, queue.Empty):   # the TV stopped listening, or the station went quiet
                pass
            finally:
                radio_tap.clients.discard(q)
            return
        if path == "/api/radio":   # what's playing: no key, like the pictures
            try:
                if "delayed=1" in self.path:   # the TV while it plays: what it hears, 20 s behind the station
                    return self.send_json(200, {"ok": True, **radio_tap.now_at()})
                # listeners: is the TV playing the radio right now (the Discord bot's /radio only lets Shane skip then:
                # a skip changes the song for everyone listening)
                return self.send_json(200, {"ok": True, **cached("radio", 2, radio_now), "listeners": len(radio_tap.clients)})
            except (OSError, ValueError):
                return self.send_json(503, {"ok": False, "error": "radio is off"})
        m = re.fullmatch(r"/radio-cover/([0-9a-f]{16})\.jpg", path)
        if m:
            f = os.path.join(RADIO_COVERS, m.group(1) + ".jpg")
            if not os.path.isfile(f):
                return self.send_json(404, {"ok": False})
            data = open(f, "rb").read()
            self.send_response(200)
            self.send_header("Content-Type", "image/jpeg")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "max-age=86400")
            self.cors()
            self.end_headers()
            return self.wfile.write(data)
        m = re.fullmatch(r"/news-img/(640|1920)/([0-9a-f]{16})\.jpg", path)
        if m:   # images: no key, like the covers
            try:
                f = news_img(int(m.group(1)), m.group(2))
            except Exception:  # noqa: BLE001  (Rockstar unreachable: the TV falls back to the original)
                f = None
            if not f:
                return self.send_json(404, {"ok": False})
            data = open(f, "rb").read()
            self.send_response(200)
            self.send_header("Content-Type", "image/jpeg")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "max-age=86400")
            self.cors()
            self.end_headers()
            return self.wfile.write(data)
        if not self.authorised():
            return self.send_json(401, {"ok": False, "error": "pairing key needed"})
        if path == "/api/status":
            return self.send_json(200, {"ok": True, **cached("status", 30, homelab_status)})
        if path == "/api/ps5":
            return self.send_json(200, {"ok": True, **cached("ps5", 10, ps5_info)})
        if path == "/api/tv":   # what the TV shows, always filled in
            now = cached("tv", 15, gaming.tv_now) or {}
            on = now.get("power") == "on"
            return self.send_json(200, {"ok": True, "power": "On" if on else "Off",
                                        "showing": (now.get("app") or "Home") if on else "—"})
        if path == "/api/switch":  # Nintendo Switch on HDMI 2: awake or asleep (ping, like the bot and HA)
            return self.send_json(200, {"ok": True, "on": cached("switch", 20, gaming.switch_awake)})
        if path == "/api/ps3":
            return self.send_json(200, {"ok": True, **cached("ps3", 20, ps3_info)})
        if path == "/api/games":
            g = dict(cached("games", 60, games))
            g["running"] = serverinfo()[1]   # always fresh: is another device streaming right now?
            return self.send_json(200, {"ok": True, **g})
        if path == "/api/light":
            try:
                return self.send_json(200, {"ok": True, **light_state()})
            except Exception as e:  # noqa: BLE001
                return self.send_json(502, {"ok": False, "error": f"{type(e).__name__}: {e}"[:200]})
        if path == "/api/weather":
            try:
                return self.send_json(200, {"ok": True, **cached("weather", 300, weather)})
            except Exception as e:  # noqa: BLE001  (HA down: the TV falls back to Open-Meteo)
                return self.send_json(502, {"ok": False, "error": f"{type(e).__name__}: {e}"[:200]})
        if path == "/api/gta6":   # Rockstar's own GTA VI posts with photos and videos (same file the HA panel reads)
            try:
                with open(GTA6_FEED) as f:
                    items = json.load(f).get("items", [])
            except (OSError, ValueError):
                items = []
            # launch-day mode: GTA VI minutes played (HA sensor counting PSN "now playing"), 0 if HA doesn't answer
            try:
                played = cached("gta6-played", 60, lambda: float(gaming.ha("/api/states/sensor.gta_vi_minutes_played", timeout=8)["state"]))
            except Exception:  # noqa: BLE001
                played = 0
            # display-size copies next to each original (small: cards, photo strip; big: post picture, viewer)
            sized = lambda u: {"small": f"/news-img/640/{hashlib.sha1(u.encode()).hexdigest()[:16]}.jpg",  # noqa: E731
                               "big": f"/news-img/1920/{hashlib.sha1(u.encode()).hexdigest()[:16]}.jpg"} if u else {}
            items = [{**x, "image_sized": sized(x.get("image")),
                      "photos": [{**p, **sized(p.get("url"))} for p in x.get("photos", [])]} for x in items]
            return self.send_json(200, {"ok": True, "items": items, "played_min": played})
        if path == "/api/tv/woke":
            return self.send_json(200, {"ok": True, "woke": cached("tv-woke", 5, tv_woke)})
        if path == "/api/osd" and re.search(r"[?&]overlay=1", self.path):
            return self.send_json(200, osd_overlay())
        if path == "/api/osd":
            m = re.search(r"[?&]after=(-?\d+)", self.path)
            i = re.search(r"[?&]idle=(\d+)", self.path)
            return self.send_json(200, osd_get(int(m.group(1)) if m else -1, int(i.group(1)) if i else 0))
        if path == "/api/health":
            return self.send_json(200, {"ok": True})
        self.send_json(404, {"ok": False, "error": "no such endpoint"})

    def do_POST(self):
        if not self.authorised():
            return self.send_json(401, {"ok": False, "error": "pairing key needed"})
        n = int(self.headers.get("Content-Length") or 0)
        try:
            body = json.loads(self.rfile.read(n) or b"{}") if n else {}
        except ValueError:
            return self.send_json(400, {"ok": False, "error": "bad JSON"})
        path = self.path.split("?")[0]
        if path == "/api/ps5/wake":
            return self.send_json(200, wake_ps5())
        if path == "/api/radio/skip":   # next song (or back from a station visit); the station has the rules
            try:
                urllib.request.urlopen(urllib.request.Request(RADIO_NOW.replace("/now", "/skip"), data=b"", method="POST"), timeout=5).read()
            except OSError:
                return self.send_json(503, {"ok": False, "error": "radio is off"})
            _cache.pop("radio", None)
            return self.send_json(200, {"ok": True})
        if path == "/api/games/free":
            code, out = free_sunshine()
            return self.send_json(code, out)
        if path == "/api/light":
            code, out = light([str(c) for c in body.get("cmd", [])])
            return self.send_json(code, out)
        if path == "/api/osd":
            code, out = osd_post(body if isinstance(body, dict) else {})
            return self.send_json(code, out)
        if path == "/api/osd/clear":
            code, out = osd_clear(body if isinstance(body, dict) else {})
            return self.send_json(code, out)
        self.send_json(404, {"ok": False, "error": "no such endpoint"})


# ---------- Vice OSD (vice-layer-plan.md): cards on Vice Home, or over anything else through the overlay app ----------
# Vice Home polls every 2 s while it's on screen, so a poll in the last 6 s means it's showing. It also sends how
# long since the last remote press: after ~2 minutes LG's screensaver can cover Home while Home still counts as
# visible (seen 2026-11-14), so then nothing is queued either and the caller (HA) shows the TV's own toast.
OSD = collections.deque(maxlen=20)
OSD_STATE = {"seq": 0, "poll": 0.0, "idle": 0, "overlay_poll": 0.0, "overlay_open": 0.0}
OSD_IDLE_MAX = 110
OSD_LOCK = threading.Lock()
OSD_ICONS = {"server", "phone", "bell", "radio", "art"}
PC_LAN = "http://192.168.0.10:5401"  # the overlay runs on the TV, which reaches the PC on the LAN (fixed IP)


def tv_on():
    try:
        return cached("tv-on", 5, lambda: gaming.ha("/api/states/media_player.lg_tv", timeout=5)["state"]) == "on"
    except Exception:  # noqa: BLE001  (HA down)
        return False


def open_overlay():
    """Ask HA (which keeps a connection to the TV) to open the overlay app; it then polls for its cards. The TV's
    SSH is normally off, and couch-tv's /api/launch waits for an app to come to the front, which an overlay never does."""
    gaming.ha("/api/services/webostv/command", {
        "entity_id": "media_player.lg_tv", "command": "system.launcher/launch",
        "payload": {"id": "app.vice.osd", "params": {"vice": PC_LAN, "key": pairing_key() or ""}}}, timeout=8)


def osd_post(body):
    title = str(body.get("title") or "").strip()
    if not title:
        return 400, {"ok": False, "error": "title needed"}
    home = time.time() - OSD_STATE["poll"] <= 6
    if home and OSD_STATE["idle"] > OSD_IDLE_MAX:   # Home under the screensaver: let the caller use the toast
        return 200, {"ok": True, "shown": False}
    if not home and not tv_on():
        return 200, {"ok": True, "shown": False}
    item = {k: str(body.get(k) or "").strip()[:140] for k in ("line", "em", "sub", "art", "tag")}
    item["title"] = title[:80]
    item["icon"] = body.get("icon") if body.get("icon") in OSD_ICONS else "bell"
    item["dot"] = "bad" if body.get("dot") == "bad" else ""
    try:
        item["ttl"] = max(3, min(int(body.get("ttl") or 8), 30))
    except (TypeError, ValueError):
        item["ttl"] = 8
    item["to"] = "home" if home else "overlay"
    with OSD_LOCK:
        OSD_STATE["seq"] += 1
        item["id"], item["ts"] = OSD_STATE["seq"], time.time()
        OSD.append(item)
    # the overlay polls every second while it's open: only open it when it isn't (opening it twice in a row lost the
    # first cards, 2026-11-14), and not again while a launch is under way
    now = time.time()
    if not home and now - OSD_STATE["overlay_poll"] > 2 and now - OSD_STATE["overlay_open"] > 5:
        OSD_STATE["overlay_open"] = now
        try:
            open_overlay()
        except Exception as e:  # noqa: BLE001
            with OSD_LOCK:
                item["taken"] = True
            return 200, {"ok": True, "shown": False, "error": f"couldn't open the overlay: {e}"}
    if not home:
        threading.Timer(4, osd_rescue, (item,)).start()
    return 200, {"ok": True, "shown": True, "id": item["id"], "on": item["to"]}


OSD_CLEARS = collections.deque(maxlen=20)  # (tag, time): cards with that tag come off (e.g. the call was answered)


def osd_clear(body):
    tag = str(body.get("tag") or "").strip()
    if not tag:
        return 400, {"ok": False, "error": "tag needed"}
    with OSD_LOCK:
        for i in OSD:
            if i.get("tag") == tag:
                i["cleared"] = True
        OSD_CLEARS.append((tag, time.time()))
    return 200, {"ok": True}


def recent_clears():
    return sorted({t for t, ts in OSD_CLEARS if ts > time.time() - 30})


def osd_get(after, idle):
    with OSD_LOCK:
        OSD_STATE["poll"], OSD_STATE["idle"] = time.time(), idle
        items = [i for i in OSD if i["to"] == "home" and i["id"] > after and i["ts"] > time.time() - 30 and not i.get("cleared")]
        return {"ok": True, "items": items, "last": OSD_STATE["seq"], "clear": recent_clears()}


def tv_woke():
    """Did the TV come on in the last 3 minutes after being off for at least 150 s? HA's LG integration often reports
    'off' for 10-80 s while the TV is on (many times a day, 2026-11-15); those blips aren't a power-on."""
    import datetime
    now = datetime.datetime.now(datetime.timezone.utc)
    start = (now - datetime.timedelta(minutes=15)).strftime("%Y-%m-%dT%H:%M:%S")
    try:
        h = gaming.ha(f"/api/history/period/{start}?filter_entity_id=media_player.lg_tv&minimal_response&no_attributes", timeout=5)
    except Exception:  # noqa: BLE001  (HA down)
        return False
    h = h[0] if h else []
    if not h or h[-1].get("state") in ("off", "unavailable"):
        return False
    down = lambda x: x.get("state") in ("off", "unavailable")  # noqa: E731
    at = lambda x: datetime.datetime.fromisoformat(x["last_changed"])  # noqa: E731
    i = len(h) - 1
    while i >= 0 and not down(h[i]):
        i -= 1
    if i < 0 or (now - at(h[i + 1])).total_seconds() > 180:
        return False  # no off in the window, or it came on more than 3 minutes ago
    j = i
    while j > 0 and down(h[j - 1]):
        j -= 1
    return (at(h[i + 1]) - at(h[j])).total_seconds() >= 150


def osd_rescue(item):
    """Safety net: a card for the overlay still not taken 4 s later (the overlay was closing just as it came, or the
    launch didn't take) opens the overlay again."""
    with OSD_LOCK:
        if item.get("taken") or item.get("cleared"):
            return
    try:
        OSD_STATE["overlay_open"] = time.time()
        open_overlay()
    except Exception:  # noqa: BLE001
        pass


def osd_overlay():
    with OSD_LOCK:
        OSD_STATE["overlay_poll"] = time.time()
        items = [i for i in OSD if i["to"] == "overlay" and not i.get("taken") and not i.get("cleared") and i["ts"] > time.time() - 30]
        for i in items:
            i["taken"] = True
        return {"ok": True, "items": items, "clear": recent_clears()}


class QuietServer(ThreadingHTTPServer):
    def handle_error(self, request, client_address):
        # A client that leaves mid-reply (TV changing view, radio tab closed) is normal, not a traceback.
        if isinstance(sys.exc_info()[1], (BrokenPipeError, ConnectionResetError)):
            return
        super().handle_error(request, client_address)


if __name__ == "__main__":
    news_prepare()
    radio_covers()
    radio_tap = RadioTap()
    QuietServer(("0.0.0.0", PORT), Handler).serve_forever()
