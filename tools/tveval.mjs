// Run JavaScript inside Vice Home on the TV through its web inspector (port 9998, developer-installed app).
// Usage: node tveval.mjs '<expression>' [timeout ms]   (awaits promises; prints the JSON result)
const [expr, ms = "20000"] = process.argv.slice(2);
const list = await (await fetch("http://192.168.0.108:9998/json")).json();
const page = list.find((t) => (t.url || "").includes("app.couchtv.home"));
if (!page) { console.error("Vice Home isn't open on the TV"); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
const timer = setTimeout(() => { console.error("timeout"); process.exit(2); }, +ms);
ws.addEventListener("message", (m) => {
  const d = JSON.parse(m.data);
  if (d.id !== 1) return;
  clearTimeout(timer);
  const r = d.result || {};
  if (r.exceptionDetails) console.log("EXCEPTION", JSON.stringify(r.exceptionDetails).slice(0, 500));
  else console.log(JSON.stringify(r.result && r.result.value));
  ws.close(); process.exit(0);
});
ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression: expr, awaitPromise: true, returnByValue: true } }));
