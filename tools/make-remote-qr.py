#!/usr/bin/env python3
"""Makes vice/img/remote-qr.svg: a QR code that opens Vice Phone already paired
(https://fedora.tailnet.ts.net:8449/phone/?key=<bridge.pairing_key>; since 2026-11-17, was couch-tv's remote on
:5400). HTTPS on the tailnet, so the phone can install it as an app. Shown on Vice Home's Settings page.
Re-run (with couch-tv's venv: ~/couch-tv/.venv/bin/python) and rebuild if the pairing key or the PC's address changes."""
import json, os, segno

HOME = os.path.expanduser("~")
key = (json.load(open(f"{HOME}/couch-tv/config.json")).get("bridge") or {}).get("pairing_key", "")
url = "https://fedora.tailnet.ts.net:8449/phone/" + (f"?key={key}" if key else "")
out = f"{HOME}/tv-launcher/vice/img/remote-qr.svg"
segno.make(url, error="m").save(out, scale=8, border=2, dark="#141414", light="#ffffff")
print("wrote", out)
