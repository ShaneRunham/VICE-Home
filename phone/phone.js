// Vice Phone (2026-11-17): the Pixel's remote for the TV and the homelab, in the Vice look. Served by vice-tv at /phone/
// (~/tv-launcher/service/vice_tv.py). It talks only to vice-tv: its own /api/* (PS5, light, radio, OSD, /api/phone) and
// /bridge/api/* (passed to the couch-tv bridge: keys, apps, Ask, Watch). Replaced couch-tv's phone remote.
// The pairing key comes once as ?key=... and is kept in localStorage.
"use strict";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode: fine */ } } };

// ---------- key ----------
(function takeKey() {
  const m = location.search.match(/[?&]key=([^&]+)/);
  if (m) { store.set("vice.key", decodeURIComponent(m[1])); history.replaceState(null, "", location.pathname); }
})();
const KEY = () => store.get("vice.key", "");

// ---------- calls ----------
async function api(path, body, ms = 15000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(path, { method: body === undefined ? "GET" : "POST", signal: ctl.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY()}` }, body: body === undefined ? undefined : JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    if (r.status === 401) { askKey(); throw new Error("Needs the pairing key"); }
    if (!r.ok || d.ok === false) throw new Error(d.error || `Error ${r.status}`);
    return d;
  } catch (e) {
    throw e.name === "AbortError" ? new Error("No answer") : e;
  } finally { clearTimeout(t); }
}
const bridge = (p, body, ms) => api(`/bridge${p}`, body, ms);
const toast = (msg) => { const t = $("toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 2600); };
const run = (p, ok) => p.then((r) => { if (ok) toast(typeof ok === "function" ? ok(r) : ok); return r; }).catch((e) => { toast(e.message); });
const buzz = (ms = 8) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* no vibration */ } };

// ---------- icons (line icons, Lucide style) ----------
const ic = (p, w = 1.8) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const I = {
  remote: ic('<rect x="7" y="2" width="10" height="20" rx="5"/><circle cx="12" cy="8" r="2"/><path d="M12 14h.01M12 17h.01"/>'),
  watch: ic('<rect x="2" y="4" width="20" height="14" rx="2"/><path d="M10 9l5 2.5-5 2.5z" fill="currentColor"/><path d="M8 21h8"/>'),
  ask: ic('<path d="M21 12a8 8 0 0 1-11.8 7L4 20.5l1.5-5A8 8 0 1 1 21 12z"/><path d="M9 11h.01M12 11h.01M15 11h.01" stroke-width="2.6"/>'),
  contacts: ic('<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'),
  messages: ic('<path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-5 4V6a1 1 0 0 1 1-1z"/>'),
  radio: ic('<path d="M4.9 16.1C1 12.2 1 5.8 4.9 1.9M7.8 4.7a6.1 6.1 0 0 0-.8 7.5M16.2 4.8c2 2 2.3 5.1.8 7.5M19.1 1.9a10 10 0 0 1 0 14.1"/><circle cx="12" cy="9" r="2"/><path d="M8 22l4-11 4 11M9.5 18h5"/>'),
  wanted: ic('<path d="M12 2.6l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17.2l-5.9 3.2 1.3-6.5L2.5 9.4l6.6-.8z"/>'),
  map: ic('<path d="M14.1 5.6a2 2 0 0 0 1.8 0l3.7-1.9A1 1 0 0 1 21 4.6v12.8a1 1 0 0 1-.6.9l-4.5 2.3a2 2 0 0 1-1.8 0l-4.2-2.1a2 2 0 0 0-1.8 0l-3.7 1.9A1 1 0 0 1 3 19.4V6.6a1 1 0 0 1 .6-.9l4.5-2.3a2 2 0 0 1 1.8 0zM15 5.8v15M9 3.2v15"/>'),
  back: ic('<path d="M15 18l-6-6 6-6"/>', 2.2), home: ic('<path d="M3 11l9-8 9 8M5 10v10h14V10"/>'),
  playpause: ic('<path d="M5 5v14l8-7zM16 5v14M20 5v14"/>'), power: ic('<path d="M12 2v10M18.4 6.6a9 9 0 1 1-12.8 0"/>', 2.2),
  minus: ic('<path d="M5 12h14"/>', 2.4), plus: ic('<path d="M12 5v14M5 12h14"/>', 2.4),
  mute: ic('<path d="M11 5L6 9H2v6h4l5 4zM22 9l-6 6M16 9l6 6"/>'), phone: ic('<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>'),
  tv: ic('<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M17 2l-5 5-5-5"/>'),
  ps5: ic('<path d="M6 11h4M8 9v4M15 12h.01M18 10h.01"/><path d="M17.3 5H6.7a4 4 0 0 0-4 3.6C2.6 9.4 2 14.5 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.4-1.4A2 2 0 0 1 9.8 16h4.4a2 2 0 0 1 1.4.6L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.5-.6-6.6-.7-7.3A4 4 0 0 0 17.3 5z"/>'),
  nsw: ic('<rect x="3" y="4" width="8" height="16" rx="4"/><rect x="13" y="4" width="8" height="16" rx="4"/><circle cx="7" cy="9" r=".6"/><circle cx="17" cy="15" r=".6"/>'),
  pc: ic('<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M10 22v-4h4v4M9 6h.01M12 6h.01M15 6h.01M9 10h.01M12 10h.01M15 10h.01"/>'),
  light: ic('<path d="M9 18h6M10 22h4M15 14c.2-1 .7-1.7 1.5-2.5A5 5 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/>'),
  mic: ic('<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5"/>'),
};
const STAR = '<svg viewBox="0 0 24 24"><path d="M12 2.6l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17.2l-5.9 3.2 1.3-6.5L2.5 9.4l6.6-.8z"/></svg>';
const stars = (n, ev, cls = "stars") => `<span class="${cls}${n ? "" : " evading"}">` + [0, 1, 2, 3, 4].map((i) => `<i class="${i < (n || ev) ? "on" : ""}">${STAR}</i>`).join("") + "</span>";

// ---------- state ----------
const S = { now: null, ph: null, radio: null, apps: null, picture: null, open: null };
const ago = (t) => { const m = Math.max(0, Math.round((Date.now() / 1000 - t) / 60)); return m < 1 ? "just now" : m < 60 ? `${m} min` : m < 1440 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.floor(m / 1440)} days`; };
const mins = (m) => { const h = Math.floor(m / 60), r = Math.round(m % 60); return h ? `${h} h ${r} m` : `${r} min`; };

// ---------- home ----------
const APPS = [["remote", "Remote"], ["watch", "Watch"], ["ask", "Ask"], ["contacts", "Contacts"],
  ["messages", "Messages"], ["radio", "Radio"], ["wanted", "Wanted"], ["map", "Map"]];
$("grid").innerHTML = APPS.map(([id, name]) => `<div class="ico" data-open="${id}"><div class="t">${I[id]}</div>${name}<span class="badge" id="b-${id}" hidden></span></div>`).join("");
document.addEventListener("click", (e) => {
  const o = e.target.closest("[data-open]"); if (o) return open(o.dataset.open);
  if (e.target.closest("[data-back]")) return history.back();
  const d = e.target.closest("[data-do]"); if (d) return act(d.dataset.do, d.dataset.arg, d);
});
document.querySelectorAll("[data-back]").forEach((b) => { b.innerHTML = I.back; });

function clock() {  // like Vice Home: 12-hour, "am"/"pm" small (Android's own bar already shows the time)
  const d = new Date(), h = d.getHours() % 12 || 12, m = String(d.getMinutes()).padStart(2, "0");
  $("hclock").innerHTML = `${h}:${m}<small>${d.getHours() < 12 ? "am" : "pm"}</small>`;
  $("hdate").textContent = d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}
function drawBar() {
  const w = (S.ph && S.ph.wanted) || {};
  $("barStars").innerHTML = w.stars || w.evading ? stars(w.stars, w.evading) : "";
  const n = S.now, r = S.radio;
  $("barMid").textContent = n && n.power === "on" ? `TV · ${(n.app && n.app.name) || "On"}` : r && r.title ? `♪ ${r.title}` : "";
  const c = (w.crimes || []).length, b = $("b-wanted");
  b.hidden = !c; b.textContent = c;
  const line = w.stars ? `${stars(w.stars, 0)}<span>${esc((w.crimes[0] || {}).what || "Wanted")}</span>`
    : n && n.power === "on" ? `${esc(n.playing && n.playing.title ? `Playing ${n.playing.title}` : `TV on · ${(n.app && n.app.name) || "Home"}`)}` : "";
  if ($("hline")._h !== line) { $("hline")._h = line; $("hline").innerHTML = line; }
}

// ---------- opening and closing apps (Android back closes the app) ----------
function open(id) {
  if (id === "map") { location.href = "homeassistant://navigate/vice-map"; return; }
  const sec = document.querySelector(`.app[data-app="${id}"]`); if (!sec) return;
  if (S.open) document.querySelector(`.app[data-app="${S.open}"]`).classList.remove("show");
  sec.classList.add("show"); S.open = id; history.pushState({ app: id }, "");
  buzz(); draw[id] && draw[id](true);
}
window.addEventListener("popstate", () => {
  if ($("sheet").classList.contains("show")) { $("sheet").classList.remove("show"); if (S.open) history.pushState({ app: S.open }, ""); return; }
  if (S.open) { document.querySelector(`.app[data-app="${S.open}"]`).classList.remove("show"); S.open = null; }
});
function sheet(html) { $("pick").innerHTML = html; $("sheet").classList.add("show"); }
function closeSheet() { $("sheet").classList.remove("show"); }
$("sheet").addEventListener("click", (e) => { if (e.target === $("sheet")) closeSheet(); });
function askKey() {
  if ($("sheet").classList.contains("show")) return;
  sheet(`<h3>Pairing key</h3><p class="sub">Vice Phone needs the TV bridge's pairing key once (couch-tv config.json › bridge.pairing_key).</p>
    <input type="text" id="keyIn" autocomplete="off"><div class="done"><span class="btn go" data-do="savekey">Save</span></div>`);
}

const draw = {};

// ---------- Remote ----------
$("kBack").innerHTML = I.back; $("kHome").innerHTML = I.home; $("kPlay").innerHTML = I.playpause;
$("vDown").innerHTML = I.minus; $("vUp").innerHTML = I.plus; $("vMute").innerHTML = I.mute; $("pwr").innerHTML = I.power;
const key = (k) => { buzz(); bridge("/api/key", { key: k }).catch((e) => toast(e.message)); };
document.querySelectorAll("[data-key]").forEach((b) => b.addEventListener("click", () => key(b.dataset.key)));
document.querySelectorAll("[data-vol]").forEach((b) => b.addEventListener("click", () => {
  buzz(); bridge("/api/volume", { action: b.dataset.vol }).then((r) => { if (S.now) S.now.volume = r.volume; draw.remote(); }).catch((e) => toast(e.message));
}));
$("pwr").addEventListener("click", () => {
  const on = S.now && S.now.power === "on";
  buzz(20); toast(on ? "Turning the TV off" : "Waking the TV…");
  run(bridge("/api/power", { state: on ? "off" : "on" }, 40000)).then(poll);
});
draw.remote = () => {
  const n = S.now;
  const on = n && n.power === "on";
  $("pwr").classList.toggle("on", !!on);
  const v = n && n.volume && n.volume.known ? (n.volume.muted ? "Muted" : `Vol ${n.volume.level}`) : "";
  $("vlvl").textContent = v;
  const sl = n && n.sleep && n.sleep.ends ? ` · sleep in ${Math.max(1, Math.round((Date.parse(n.sleep.ends) - Date.now()) / 60000))} min` : "";
  $("tvline").innerHTML = !n ? "Asking the TV…" : n.waking ? "Waking the TV…" : on
    ? `<em>On</em> · ${esc((n.app && n.app.name) || "Home")}${n.playing && n.playing.title ? ` · ${esc(n.playing.title)}` : ""}${sl}` : "Off · tap power to wake it";
  const t = S.ph && S.ph.tv, src = (t && t.source) || "";
  const chips = ((t && t.sources) || []).map((x) => `<span class="chip${src === x ? " on" : ""}" data-do="input" data-arg="${esc(x)}">${esc(x === "PS5 Game Console" ? "PS5" : x === "Nintendo Switch" ? "Switch" : x === "Sky Box" ? "Sky" : x === "Vice Home" ? "Home" : x)}</span>`).join("");
  if ($("inputs")._h !== chips) { $("inputs")._h = chips; $("inputs").innerHTML = chips; }
  $("sleepBtn").textContent = n && n.sleep && n.sleep.ends ? "Sleep ✓" : "Sleep";
  $("sleepBtn").classList.toggle("on", !!(n && n.sleep && n.sleep.ends));
  $("picBtn").hidden = !(S.picture && S.picture.supported);
};

// the pad: swipe = move (hold to keep going), tap = OK, long press = OK held. Trackpad mode drives LG's pointer.
(function pad() {
  const p = $("pad"); let g = null, tp = store.get("vice.trackpad", false);
  const setMode = () => { p.classList.toggle("tp", tp); $("mode").classList.toggle("on", tp); $("padhint").textContent = tp ? "Drag to move the pointer · tap to click" : "Swipe to move · tap for OK"; };
  setMode();
  $("mode").addEventListener("click", () => { tp = !tp; store.set("vice.trackpad", tp); setMode(); buzz(); });
  const ripple = (x, y) => { const r = document.createElement("span"); r.className = "ripple"; const b = p.getBoundingClientRect();
    r.style.left = `${x - b.left}px`; r.style.top = `${y - b.top}px`; p.appendChild(r); setTimeout(() => r.remove(), 400); };
  let acc = { dx: 0, dy: 0 }, flushT = null;
  const flush = () => { flushT = null; if (!acc.dx && !acc.dy) return; const d = { dx: Math.round(acc.dx * 2.2), dy: Math.round(acc.dy * 2.2) }; acc = { dx: 0, dy: 0 };
    bridge("/api/pointer", d, 5000).catch(() => {}); };
  p.addEventListener("pointerdown", (e) => {
    p.setPointerCapture(e.pointerId);
    g = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, t: Date.now(), dir: null, moved: false, held: false };
    if (!tp) g.hold = setTimeout(() => { if (g && !g.dir) { g.held = true; buzz(25); bridge("/api/key", { key: "ok", hold: true }).catch(() => {}); } }, 550);
  });
  p.addEventListener("pointermove", (e) => {
    if (!g) return;
    if (tp) {
      acc.dx += e.clientX - g.lx; acc.dy += e.clientY - g.ly; g.lx = e.clientX; g.ly = e.clientY;
      if (Math.abs(e.clientX - g.x) + Math.abs(e.clientY - g.y) > 8) g.moved = true;
      if (!flushT) flushT = setTimeout(flush, 60);
      return;
    }
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.dir && Math.hypot(dx, dy) > 28) {
      clearTimeout(g.hold);
      g.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
      key(g.dir);
      g.rep = setTimeout(function again() { if (g && g.dir) { key(g.dir); g.rep = setTimeout(again, 170); } }, 420);
    }
  });
  const end = (e) => {
    if (!g) return;
    clearTimeout(g.hold); clearTimeout(g.rep);
    if (tp) { flush(); if (!g.moved) { ripple(e.clientX, e.clientY); buzz(); bridge("/api/pointer", { click: true }).catch(() => {}); } }
    else if (!g.dir && !g.held) { ripple(e.clientX, e.clientY); key("ok"); }
    g = null;
  };
  p.addEventListener("pointerup", end); p.addEventListener("pointercancel", () => { if (g) { clearTimeout(g.hold); clearTimeout(g.rep); } g = null; });
})();

$("type").addEventListener("click", () => sheet(`<h3>Type on the TV</h3><p class="sub">Goes into the search box that's open on the TV.</p>
  <input type="text" id="typeIn" autocomplete="off" enterkeyhint="send"><div class="done"><span class="btn go" data-do="type">Send</span></div>`));
$("appsBtn").addEventListener("click", async () => {
  sheet(`<h3>Apps</h3><div class="sub">Loading…</div>`);
  try { if (!S.apps) S.apps = (await bridge("/api/apps")).apps.filter((a) => a.installed !== false && !["settings", "home"].includes(a.id)); }
  catch (e) { return sheet(`<h3>Apps</h3><p class="sub">${esc(e.message)}</p>`); }
  sheet(`<h3>Apps</h3><div class="appgrid">${S.apps.map((a) => `<div class="a" data-do="launch" data-arg="${esc(a.id)}" style="background:${esc(a.colour || "#2a2733")}">${esc(a.name)}</div>`).join("")}</div>`);
});
$("sleepBtn").addEventListener("click", () => {
  const ends = S.now && S.now.sleep && S.now.sleep.ends;
  sheet(`<h3>Sleep timer</h3><p class="sub">${ends ? `The TV turns off at ${new Date(ends).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}.` : "Pauses, then turns the TV off."}</p>
    <div class="chips">${[15, 30, 60, 90].map((m) => `<span class="chip" data-do="sleep" data-arg="${m}">${m} min</span>`).join("")}${ends ? '<span class="chip" data-do="sleep" data-arg="0">Cancel</span>' : ""}</div>`);
});
$("picBtn").addEventListener("click", () => {
  const p = S.picture || {};
  sheet(`<h3>Picture</h3><div class="chips">${(p.modes || []).map((m) => `<span class="chip${p.mode === m.id ? " on" : ""}" data-do="picture" data-arg="${esc(m.id)}">${esc(m.name)}</span>`).join("")}</div>`);
});

// ---------- Watch ----------
draw.watch = async (first) => {
  if (first) $("watch").innerHTML = '<p class="empty">Loading…</p>';
  let d;
  try { d = await bridge("/api/recs"); } catch (e) { $("watch").innerHTML = `<p class="empty">${esc(e.message)}</p>`; return; }
  const card = (x, act, arg, sub) => `<div class="poster" data-do="${act}" data-arg="${esc(arg)}"><div class="p" style="background-image:url('${esc(x.poster || "")}')"></div><h5>${esc(x.title)}</h5><p>${esc(sub)}</p></div>`;
  const cont = (d.continue || []).map((x) => card(x, "resume", x.id, x.season ? `S${x.season} E${x.episode}${x.app ? " · " + x.app.name : ""}` : (x.app && x.app.name) || ""));
  const picks = (d.picks || []).map((x) => card(x, "play", JSON.stringify({ title: x.title, service: x.service }), x.reason || x.year || ""));
  $("watch").innerHTML = `<div class="label">Keep watching</div>${cont.length ? `<div class="shelf">${cont.join("")}</div>` : '<p class="empty">Nothing on the go. Shows you play from here or Ask land here.</p>'}
    <div class="label">Picks for you</div>${picks.length ? `<div class="shelf">${picks.join("")}</div>` : '<p class="empty">No picks yet: they come from what you watch.</p>'}`;
};

// ---------- Ask (Claude through the bridge) ----------
const askLog = store.get("vice.ask", []);
function drawAsk() {
  $("askLog").innerHTML = (askLog.length ? "" : '<div class="msg note">Ask for anything to watch: "put on the latest Bluey", "something funny on Netflix".</div>') +
    askLog.map((m, i) => `<div class="msg ${m.me ? "me" : "them"}">${m.wait ? '<span class="typing"><i></i><i></i><i></i></span>' : esc(m.text)}${
      !m.me && m.options && m.options.length && i === askLog.length - 1 ? `<div class="opts">${m.options.map((o) => `<span class="chip" data-do="askopt" data-arg="${esc(o.text)}">${esc(o.label)}</span>`).join("")}</div>` : ""}</div>`).join("");
  $("askLog").scrollTop = 1e6;
}
draw.ask = () => drawAsk();
async function ask(text) {
  if (!text.trim()) return;
  askLog.push({ me: true, text }); askLog.push({ wait: true }); drawAsk();
  let r;
  try { r = await bridge("/api/ask", { text }, 100000); } catch (e) { r = { say: `Couldn't ask: ${e.message}` }; }
  askLog.pop(); askLog.push({ text: r.say || r.reply || "Done.", options: r.options || [] });
  while (askLog.length > 40) askLog.shift();
  store.set("vice.ask", askLog.filter((m) => !m.wait)); drawAsk(); buzz(15);
}
$("askForm").addEventListener("submit", (e) => { e.preventDefault(); const t = $("askText").value; $("askText").value = ""; ask(t); });
(function mic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return;
  const m = $("askMic"); m.hidden = false; m.innerHTML = I.mic;
  m.addEventListener("click", () => {
    const r = new SR(); r.lang = "en-GB"; r.interimResults = false; m.classList.add("rec"); buzz();
    r.onresult = (e) => { const t = e.results[0][0].transcript; ask(t); };
    r.onend = () => m.classList.remove("rec"); r.onerror = () => m.classList.remove("rec");
    r.start();
  });
})();

// ---------- Contacts (the devices) ----------
const CONTACTS = [
  { id: "tv", name: "LG TV", icon: "tv", line: (p) => p.tv.on ? `<em>On</em> · ${esc(p.tv.source || "")}` : "Off", on: (p) => p.tv.on },
  { id: "ps5", name: "PS5", icon: "ps5", line: (p) => p.ps5.on ? `<em>${p.ps5.playing ? "Playing " + esc(p.ps5.playing) : "On"}</em>` : `Rest mode${p.ps5.last && p.ps5.last !== "unknown" ? " · last " + esc(p.ps5.last) : ""}`, on: (p) => p.ps5.on },
  { id: "switch", name: "Nintendo Switch", icon: "nsw", line: (p) => (p.switch.on ? "<em>Awake</em>" : "Asleep") + (p.switch.minutes > 0 ? ` · today ${mins(p.switch.minutes)}` : ""), on: (p) => p.switch.on },
  { id: "pc", name: "PC (fedora)", icon: "pc", line: (p) => p.pc.cpu == null ? "No readings" : `CPU <em>${Math.round(p.pc.cpu)}%</em> · memory <em>${Math.round(p.pc.ram)}%</em>${p.pc.temp != null ? ` · ${Math.round(p.pc.temp)}°C` : ""}`, on: () => true },
  { id: "light", name: "Ceiling light", icon: "light", line: (p) => p.light.on ? `<em>On</em> · ${p.light.pct}%` : "Off", on: (p) => p.light.on },
];
const crimeOf = { tv: ["tv_ssh"], ps5: ["psn"] };
draw.contacts = () => {
  const p = S.ph; if (!p) { $("contacts").innerHTML = '<p class="empty">Asking Home Assistant…</p>'; return; }
  const crimes = (p.wanted && p.wanted.crimes) || [];
  const h = `<div class="list">${CONTACTS.map((c) => {
    const bad = crimes.find((x) => (crimeOf[c.id] || []).includes(x.key));
    return `<div class="row${c.on(p) ? " on" : ""}${bad ? " bad" : ""}" data-do="contact" data-arg="${c.id}"><div class="av">${I[c.icon]}</div>
      <div class="t"><h4>${c.name}</h4><p>${bad ? esc(bad.what) : c.line(p)}</p></div><span class="go">${I.phone}</span></div>`; }).join("")}</div>`;
  if ($("contacts")._h !== h) { $("contacts")._h = h; $("contacts").innerHTML = h; }
};
function contact(id) {
  const p = S.ph || {}; const c = CONTACTS.find((x) => x.id === id);
  const head = `<h3>${c.name}</h3><p class="sub">${p.tv ? c.line(p) : ""}</p>`;
  let b = "";
  if (id === "tv") b = `<div class="chips"><span class="btn${p.tv.on ? "" : " go"}" data-do="tvpower">${p.tv.on ? "Turn off" : "Turn on"}</span><span class="btn" data-do="openapp" data-arg="remote">Open Remote</span></div>`;
  if (id === "ps5") b = `<div class="chips">${p.ps5.on ? '<span class="btn" data-do="ha" data-arg="ps5_rest">Rest mode</span><span class="btn" data-do="input" data-arg="PS5 Game Console">Put it on the TV</span>' : '<span class="btn go" data-do="ha" data-arg="ps5_on">Wake it</span>'}</div>`;
  if (id === "switch") b = p.switch.on ? '<div class="chips"><span class="btn go" data-do="ha" data-arg="switch_tv">Put it on the TV</span></div>' : '<p class="sub">It can\'t be woken over the network: press HOME on a Joy-Con.</p>';
  if (id === "pc") b = `<div class="chips"><span class="btn" data-do="ha" data-arg="pc_lock">Lock PC</span><span class="btn" data-do="ha" data-arg="pc_vscode">Open VS Code</span></div>`;
  if (id === "light") b = `<div class="chips"><span class="btn${p.light.on ? "" : " go"}" data-do="light" data-arg="${p.light.on ? "off" : "on"}">${p.light.on ? "Turn off" : "Turn on"}</span></div>` + (p.light.on
    ? `<input type="range" id="bri" min="1" max="100" value="${p.light.pct}" style="--p:${p.light.pct}%"><div class="chips">${[["Warm", 2700], ["Neutral", 4000], ["Cool", 6500]].map(([n, k]) =>
      `<span class="chip${p.light.mode === "color_temp" && Math.abs((p.light.kelvin || 0) - k) < 400 ? " on" : ""}" data-do="white" data-arg="${k}">${n}</span>`).join("")}</div>` : "");
  sheet(head + b + '<div class="done"><span class="btn" data-do="close">Done</span></div>');
  const r = $("bri");
  if (r) { r.oninput = () => r.style.setProperty("--p", `${r.value}%`);
    r.onchange = () => run(api("/api/light", { cmd: ["brightness", r.value] }), `Light ${r.value}%`); }
}

// ---------- Messages (to the TV, as a Vice OSD card) ----------
const msgs = store.get("vice.msgs", []);
draw.messages = () => {
  $("msgLog").innerHTML = (msgs.length ? "" : '<div class="msg note">Whatever you send pops up on the TV as a Vice card.</div>') +
    msgs.map((m) => `<div class="msg me">${esc(m.text)}</div><div class="msg note">${m.shown === "card" ? "Shown on the TV" : m.shown === "toast" ? "Shown on the TV (pop-up)" : m.shown === true ? "Shown on the TV" : m.err ? esc(m.err) : "The TV is off: not shown"} · ${new Date(m.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</div>`).join("");
  $("msgLog").scrollTop = 1e6;
};
$("msgForm").addEventListener("submit", async (e) => {
  e.preventDefault(); const text = $("msgText").value.trim(); if (!text) return; $("msgText").value = "";
  const m = { text, at: Date.now() }; msgs.push(m);
  try { m.shown = (await api("/api/phone/act", { act: "message", arg: text }, 20000)).shown; }
  catch (err) { m.err = err.message; }
  while (msgs.length > 50) msgs.shift(); store.set("vice.msgs", msgs); draw.messages(); buzz(15);
});

// ---------- Radio ----------
draw.radio = () => {
  const r = S.radio, a = $("audio"), here = !a.paused;
  if (!r) { $("radio").innerHTML = `<div class="cover">${I.radio}</div><h2>Off air</h2><p class="by">Vice Radio isn't playing.</p>`; return; }
  const from = r.src === "local" ? `Your music${r.album ? " · " + r.album : ""}` : r.station || "Internet radio";
  const h = `<div class="cover" style="${r.cover ? `background-image:url('${esc(r.cover)}')` : ""}">${r.cover ? "" : I.radio}</div>
    <h2>${esc(r.title || "On air")}</h2><p class="by">${esc(r.artist || "")}</p><p class="from">${esc(from)}</p>
    <div class="btns"><span class="btn${here ? " on" : " go"}" data-do="listen">${here ? "Stop listening" : "Listen here"}</span><span class="btn" data-do="skip">${r.src === "live" ? "Back to my music" : "Skip song"}</span></div>`;
  if ($("radio")._h !== h) { $("radio")._h = h; $("radio").innerHTML = h; }
};

// ---------- Wanted ----------
draw.wanted = () => {
  const w = (S.ph && S.ph.wanted) || { stars: 0, crimes: [] };
  const h = `${stars(w.stars, w.evading, "stars bigstars")}<p class="wsub">${w.stars ? `Wanted · ${w.crimes.length} on the rap sheet` : w.evading ? "Evading…" : "No heat. All quiet."}</p>
    <div class="list">${w.crimes.map((c) => `<div class="row bad"><div class="av">${I.wanted}</div><div class="t"><h4>${esc(c.what)}</h4><p>${"★".repeat(c.stars)} · ${ago(c.since)}</p></div></div>`).join("")}</div>
    <div class="chips" style="margin-top:18px"><span class="btn go" data-do="openapp" data-arg="map">Open Vice Map</span></div>`;
  if ($("wanted")._h !== h) { $("wanted")._h = h; $("wanted").innerHTML = h; }
};

// ---------- actions ----------
function act(a, arg, el) {
  buzz();
  switch (a) {
    case "close": return closeSheet();
    case "savekey": store.set("vice.key", $("keyIn").value.trim()); closeSheet(); return poll();
    case "openapp": closeSheet(); return open(arg);
    case "input": return run(api("/api/phone/act", { act: "input", arg }), `TV: ${el.textContent}`).then(() => setTimeout(pollPhone, 1500));
    case "ha": return run(api("/api/phone/act", { act: arg }, 35000), { ps5_on: "Waking the PS5", ps5_rest: "PS5: rest mode", switch_tv: "TV: Switch",
      pc_lock: "Locking the PC", pc_vscode: "Opening VS Code" }[arg]).then(() => { closeSheet(); setTimeout(pollPhone, 1500); });
    case "tvpower": closeSheet(); return $("pwr").click();
    case "type": { const t = $("typeIn").value; closeSheet(); return run(bridge("/api/text", { text: t }), "Sent to the TV"); }
    case "launch": closeSheet(); return run(bridge("/api/launch", { app: arg }, 30000), `Opening ${el.textContent}`);
    case "sleep": closeSheet(); return run(bridge("/api/sleep", { minutes: +arg }), +arg ? `TV off in ${arg} min` : "Sleep timer off").then(poll);
    case "picture": closeSheet(); return run(bridge("/api/picture", { mode: arg }, 20000), "Picture changed");
    case "resume": toast("Opening…"); return run(bridge("/api/continue/open", { id: arg }, 60000), (r) => r.note || `Playing ${r.title || ""}`);
    case "play": toast("Finding it…"); return run(bridge("/api/play", JSON.parse(arg), 60000), (r) => r.note || `Playing ${r.title || ""}`);
    case "askopt": return ask(arg);
    case "contact": return contact(arg);
    case "light": return run(api("/api/light", { cmd: [arg] }), arg === "on" ? "Light on" : "Light off").then(() => { closeSheet(); setTimeout(pollPhone, 800); });
    case "white": return run(api("/api/light", { cmd: ["white", arg] }), el.textContent).then(() => setTimeout(() => { pollPhone().then(() => contact("light")); }, 800));
    case "skip": return run(api("/api/radio/skip", {}), "Skipping").then(() => setTimeout(pollRadio, 1500));
    case "listen": {
      const au = $("audio");
      if (!au.paused) { au.pause(); au.removeAttribute("src"); au.load(); }
      else { au.src = "/radio?head=3"; au.play().catch(() => toast("Couldn't start the radio")); }
      return setTimeout(draw.radio, 50);
    }
  }
}

// ---------- keeping up to date ----------
async function poll() {
  try { S.now = await bridge("/api/now"); } catch (e) { S.now = null; }
  drawBar(); if (S.open === "remote") draw.remote();
}
async function pollPhone() {
  try { S.ph = await api("/api/phone"); } catch (e) { /* HA down: keep the last */ }
  drawBar(); if (S.open && ["contacts", "wanted", "remote"].includes(S.open)) draw[S.open]();
}
async function pollRadio() {
  try { const r = await (await fetch("/api/radio", { cache: "no-store" })).json(); S.radio = r.ok ? r : null; } catch (e) { S.radio = null; }
  if (S.radio && S.radio.cover && S.radio.cover.charAt(0) !== "/" && !/^https?:/.test(S.radio.cover)) S.radio.cover = "/" + S.radio.cover;
  drawBar(); if (S.open === "radio") draw.radio();
}
clock(); setInterval(clock, 10000);
if (!KEY()) askKey();
poll(); pollPhone(); pollRadio();
bridge("/api/picture").then((p) => { S.picture = p; }).catch(() => {});
setInterval(() => { if (!document.hidden) poll(); }, 3000);
setInterval(() => { if (!document.hidden) pollPhone(); }, 6000);
setInterval(() => { if (!document.hidden) pollRadio(); }, 10000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) { poll(); pollPhone(); pollRadio(); } });
$("audio").addEventListener("pause", () => S.open === "radio" && draw.radio());
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
