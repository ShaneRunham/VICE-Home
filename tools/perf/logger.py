# Receives the TEST build's posts on 127.0.0.1:5409 (reached from the TV through ssh -R). variant.txt = CSS classes.
import http.server, json, os, sys, time
D = os.path.dirname(os.path.abspath(__file__))
class H(http.server.BaseHTTPRequestHandler):
    def _cors(self): self.send_header("Access-Control-Allow-Origin", "*")
    def do_GET(self):
        v = open(os.path.join(D, "variant.txt")).read().strip() if os.path.exists(os.path.join(D, "variant.txt")) else ""
        self.send_response(200); self._cors(); self.send_header("Content-Type", "text/plain"); self.end_headers(); self.wfile.write(v.encode())
    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length") or 0)).decode("utf-8", "replace")
        kind = self.path.strip("/").split("?")[0]
        if kind != "dom":
            with open(os.path.join(D, "log.jsonl"), "a") as f: f.write(json.dumps({"t": time.time(), "kind": kind, "body": body[:2000]}) + "\n")
        self.send_response(204); self._cors(); self.end_headers()
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer(("127.0.0.1", 5409), H).serve_forever()
