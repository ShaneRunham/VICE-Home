// Profile Vice Home in headless Brave with a slowed CPU: frame times and paint/raster/layout cost
// while a fixed key script moves focus around. Usage: node prof.mjs <app dir> <label> [cpuRate]
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const [dir, label, rateArg] = process.argv.slice(2);
const RATE = +(rateArg || 6);
const PORT = 9333 + Math.floor(Math.random() * 500);
const prof = mkdtempSync(path.join(path.dirname(new URL(import.meta.url).pathname), "profile-"));
const url = "file://" + path.resolve(dir) + "/index.html?api=" + encodeURIComponent("http://127.0.0.1:5400") + "&tv=lounge";
const br = spawn("brave-browser", ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`,
  "--window-size=1920,1080", "--autoplay-policy=no-user-gesture-required", "--no-first-run", "--hide-scrollbars", "about:blank"],
  { detached: true, stdio: "ignore" });
// kill the browser and delete its profile: left in tools/perf, Brave's own extension scripts failed CI's
// "node --check" over every .js (2026-11-16)
const kill = () => { try { process.kill(-br.pid, "SIGKILL"); } catch (e) {} try { rmSync(prof, { recursive: true, force: true }); } catch (e) {} };
process.on("exit", kill);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let tgt;
for (let i = 0; i < 50 && !tgt; i++) {
  await sleep(200);
  try { tgt = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((t) => t.type === "page"); } catch (e) {}
}
const ws = new WebSocket(tgt.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const wait = {}; const events = []; let traceDone;
ws.addEventListener("message", (m) => {
  const d = JSON.parse(m.data);
  if (d.id && wait[d.id]) { wait[d.id](d.result); delete wait[d.id]; }
  else if (d.method === "Tracing.dataCollected") events.push(...d.params.value);
  else if (d.method === "Tracing.tracingComplete") traceDone();
});
const cmd = (method, params = {}) => new Promise((r) => { const i = ++id; wait[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });

await cmd("Page.enable");
await cmd("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
await cmd("Page.navigate", { url });
await sleep(6000);  // data, images, video settle
await cmd("Emulation.setCPUThrottlingRate", { rate: RATE });

const key = async (code, gap) => {
  if (!code) return sleep(gap);
  const k = { 37: "ArrowLeft", 38: "ArrowUp", 39: "ArrowRight", 40: "ArrowDown", 13: "Enter", 27: "Escape" }[code];
  await cmd("Input.dispatchKeyEvent", { type: "rawKeyDown", windowsVirtualKeyCode: code, key: k, code: k });
  await cmd("Input.dispatchKeyEvent", { type: "keyUp", windowsVirtualKeyCode: code, key: k, code: k });
  await sleep(gap);
};
// frame recorder inside the page
await cmd("Runtime.evaluate", { expression: `window.__f=[];(function l(t){__f.push(t);requestAnimationFrame(l)})(performance.now());` });
await cmd("Tracing.start", { categories: "devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,blink,cc,gpu,viz", transferMode: "ReportEvents" });
const L = 37, R = 39, U = 38, D = 40, OK = 13, BK = 27;
const script = process.env.IDLE ? [[40, 10000]].slice(0,0).concat([[0,10000]]) : [
  // home: along favourites, down through every row (deep, deeper), back up
  [R, 250], [R, 250], [R, 250], [R, 250], [R, 250], [L, 250], [L, 250], [L, 250], [L, 250], [L, 250],
  [D, 450], [R, 250], [R, 250], [D, 450], [R, 250], [D, 500], [R, 250], [U, 500], [U, 450], [U, 450],
  // held key: fast repeat along favourites
  [R, 90], [R, 90], [R, 90], [R, 90], [R, 90], [L, 90], [L, 90], [L, 90], [L, 90], [L, 400],
  // to Apps (rests on the tab), into the grid and down so it scrolls
  [U, 300], [R, 700], [D, 350], [R, 200], [R, 200], [R, 200], [D, 350], [D, 350], [D, 350], [D, 350], [D, 350], [U, 350], [U, 350],
  // light sheet open/close, back home
  [BK, 300], [BK, 600], [R, 200], [R, 200], [R, 200], [R, 700], [OK, 600], [BK, 600], [L, 200], [L, 200], [L, 200], [L, 700], [D, 600],
];
const t0 = Date.now();
for (const [c, g] of script) await key(c, g);
await sleep(800);
const span = Date.now() - t0;
const f = (await cmd("Runtime.evaluate", { expression: "JSON.stringify(__f)", returnByValue: true })).result.value;
const done = new Promise((r) => (traceDone = r));
await cmd("Tracing.end");
await done;

// frame stats from rAF
const ts = JSON.parse(f); const iv = [];
for (let i = 1; i < ts.length; i++) iv.push(ts[i] - ts[i - 1]);
iv.sort((a, b) => a - b);
const pct = (p) => iv[Math.min(iv.length - 1, Math.floor(iv.length * p))].toFixed(1);
const janky = iv.filter((x) => x > 25).length, long = iv.filter((x) => x > 50).length;
// main-thread + raster cost from the trace
const sum = {}; const names = ["Paint", "RasterTask", "Layout", "UpdateLayoutTree", "PrePaint", "Layerize", "UpdateLayer", "CompositeLayers", "FunctionCall", "EventDispatch", "DecodeImage", "ImageDecodeTask", "ParseHTML"];
for (const e of events) if (e.ph === "X" && names.includes(e.name)) sum[e.name] = (sum[e.name] || 0) + (e.dur || 0) / 1000;
const out = { label, cpuRate: RATE, seconds: span / 1000, frames: ts.length, fps: +(ts.length / (span / 1000)).toFixed(1),
  p50: pct(0.5), p90: pct(0.9), p99: pct(0.99), max: iv[iv.length - 1].toFixed(0), over25ms: janky, over50ms: long,
  ms: Object.fromEntries(Object.entries(sum).map(([k, v]) => [k, Math.round(v)])) };
console.log(JSON.stringify(out));
writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), label + ".json"), JSON.stringify(out, null, 1));
ws.close(); kill(); process.exit(0);
