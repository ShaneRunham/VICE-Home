# Build the TEST ipk: ~/tv-launcher/vice + probe.js + variant CSS, logging to http://127.0.0.1:5409 (TV side of ssh -R)
import os, shutil, sys, runpy
D = os.path.dirname(os.path.abspath(__file__))
web = os.path.join(D, "web")
shutil.rmtree(web, ignore_errors=True)
shutil.copytree(sys.argv[1], web)
shutil.copy(os.path.join(D, "probe.js"), web)
h = open(os.path.join(web, "index.html")).read().replace('<script src="vice.js"></script>', '<script src="vice.js"></script>\n<script src="probe.js"></script>')
open(os.path.join(web, "index.html"), "w").write(h)
with open(os.path.join(web, "vice.css"), "a") as f: f.write(open(os.path.join(D, "variants.css")).read())
src = open(os.path.expanduser("~/tv-launcher/build.py")).read().replace('os.path.join(HERE, "vice")', repr(web))
sys.argv = ["build.py", "--apps", "tv", "--log-url", "http://127.0.0.1:5409"]
exec(compile(src, os.path.expanduser("~/tv-launcher/build.py"), "exec"), {"__file__": os.path.expanduser("~/tv-launcher/build.py"), "__name__": "__main__"})
