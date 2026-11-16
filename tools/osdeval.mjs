// node eval.mjs '<expr>'  -> runs in the app.vice.osd overlay page on the TV (web inspector port 9998)
const [expr] = process.argv.slice(2);
const list = await (await fetch("http://192.168.0.108:9998/json")).json();
const page = list.find((t) => (t.url || "").includes("app.vice.osd"));
if (!page) { console.log("overlay not open; pages:", list.map((t) => t.url).join(" | ")); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
ws.addEventListener("message", (m) => { const d = JSON.parse(m.data); if (d.id !== 1) return; console.log(JSON.stringify(d.result.result ? d.result.result.value : d.result)); process.exit(0); });
ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression: expr, returnByValue: true, awaitPromise: true } }));
setTimeout(() => { console.log("timeout"); process.exit(2); }, 10000);
