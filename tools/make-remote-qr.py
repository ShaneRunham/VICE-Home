#!/usr/bin/env python3
"""Makes vice/img/remote-qr.svg: a QR code that opens the phone remote already paired
(http://192.168.0.10:5400/?pair=<bridge.pairing_key>). Shown on Vice Home's Settings page.
Re-run (with couch-tv's venv: ~/couch-tv/.venv/bin/python) and rebuild if the pairing key or the PC's address changes."""
import json, os, segno

HOME = os.path.expanduser("~")
key = (json.load(open(f"{HOME}/couch-tv/config.json")).get("bridge") or {}).get("pairing_key", "")
url = "http://192.168.0.10:5400/" + (f"?pair={key}" if key else "")
out = f"{HOME}/tv-launcher/vice/img/remote-qr.svg"
segno.make(url, error="m").save(out, scale=8, border=2, dark="#141414", light="#ffffff")
print("wrote", out)
