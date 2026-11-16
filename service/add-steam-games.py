#!/usr/bin/env python3
"""Add each installed Steam game to Sunshine's apps.json (so Moonlight, and the Vice TV home's Play on PC row,
can start it directly). Skips Proton, runtimes and tools, and games already listed. Backs apps.json up first.
Sunshine reads apps.json at start: restart it afterwards (not while someone is streaming)."""
import glob, json, os, re, shutil, subprocess, time
HOME = os.path.expanduser("~")
STEAM = f"{HOME}/.var/app/com.valvesoftware.Steam/.local/share/Steam"
APPS = f"{HOME}/.config/sunshine/apps.json"
COVERS = f"{HOME}/.config/sunshine/covers"
SKIP = re.compile(r"proton|steam linux runtime|steamworks|redistributable|sdk", re.I)

data = json.load(open(APPS))
have = {m.group(1) for a in data["apps"] for m in [re.search(r"rungameid/(\d+)", json.dumps(a))] if m}
added = []
for acf in sorted(glob.glob(f"{STEAM}/steamapps/appmanifest_*.acf")):
    text = open(acf, encoding="utf-8", errors="replace").read()
    appid = re.search(r'"appid"\s+"(\d+)"', text).group(1)
    name = re.search(r'"name"\s+"([^"]+)"', text).group(1)
    if SKIP.search(name) or appid in have:
        continue
    d = f"{STEAM}/appcache/librarycache/{appid}"
    art = glob.glob(f"{d}/library_600x900.jpg") + glob.glob(f"{d}/*/library_capsule.jpg") + glob.glob(f"{d}/library_header.jpg")
    entry = {"name": name, "detached": [f"setsid flatpak run com.valvesoftware.Steam steam://rungameid/{appid}"],
             "auto-detach": "true", "wait-all": "true"}
    if art:
        os.makedirs(COVERS, exist_ok=True)
        png = f"{COVERS}/{appid}.png"
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", art[0], png], check=True)
        entry["image-path"] = png
    data["apps"].append(entry)
    added.append(name)

if added:
    shutil.copy(APPS, f"{APPS}.bak-{time.strftime('%Y%m%d-%H%M%S')}")
    json.dump(data, open(APPS, "w"), indent=2)
print("added:", ", ".join(added) if added else "nothing new")
