#!/usr/bin/env python3
"""Build the Vice OSD overlay app (app.vice.osd) with couch-tv's LG packer:
    ~/couch-tv/.venv/bin/python ~/tv-launcher/osd-overlay/build.py   -> ~/couch-tv/build/lg/app.vice.osd_<version>_all.ipk
Vice Home's own vice.css and Inter font are copied in, so the card is exactly Vice Home's."""
import json
import os
import shutil
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
VICE = os.path.join(HERE, "..", "vice")
sys.path.insert(0, os.path.expanduser("~/couch-tv/lg"))
import build  # noqa: E402  (couch-tv's lg/build.py)

stage = tempfile.mkdtemp()
for f in ("appinfo.json", "index.html", "icon.png"):
    shutil.copy(os.path.join(HERE, f), stage)
for f in ("vice.css", "inter-latin.woff2"):
    shutil.copy(os.path.join(VICE, f), stage)
info = json.load(open(os.path.join(stage, "appinfo.json")))
out = os.path.expanduser(f"~/couch-tv/build/lg/{info['id']}_{info['version']}_all.ipk")
os.makedirs(os.path.dirname(out), exist_ok=True)
build.pack_python(stage, info, out)
shutil.rmtree(stage)
print(out)
