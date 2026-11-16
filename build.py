#!/usr/bin/env python3
"""Build the Vice TV home as an LG app: couch-tv's LG packer (lg/build.py) with ~/tv-launcher/vice as the web
page and the app title "Vice Home". Same app id as couch-tv (app.couchtv.home), so it replaces it on the TV.

    ~/couch-tv/.venv/bin/python ~/tv-launcher/build.py [--apps tv]     -> ~/couch-tv/build/lg/app.couchtv.home_*.ipk
"""
import json, os, shutil, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__))
COUCH = os.path.expanduser("~/couch-tv")
sys.path.insert(0, os.path.join(COUCH, "lg"))
os.chdir(COUCH)
import build  # noqa: E402  (couch-tv's lg/build.py)

tmp = tempfile.mkdtemp(prefix="vice-lg-")
shutil.copytree(os.path.join(COUCH, "lg", "app"), os.path.join(tmp, "app"))
info_path = os.path.join(tmp, "app", "appinfo.json")
info = json.load(open(info_path))
info["title"] = "Vice Home"
info["bgColor"] = "#0d0a14"
json.dump(info, open(info_path, "w"), indent=2)
build.WEB = os.path.join(HERE, "vice")
build.HERE = tmp
sys.argv = [sys.argv[0], "--bridge", "http://192.168.0.10:5400", "--tv", "lounge"] + sys.argv[1:]
try:
    build.main()
finally:
    shutil.rmtree(tmp)
