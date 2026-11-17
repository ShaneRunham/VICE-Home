// Vice TV home: Luma's look, couch-tv's brains. Runs inside couch-tv's LG app (lg/build.py packs it
// in place of couch-tv's own home). Talks to two things on the PC:
//   the couch-tv bridge (port 5400): Ask Claude
//   vice-tv (port 5401, ~/tv-launcher/service): homelab line, PS5, light, Play on PC
// Apps and inputs open on the TV itself through webOS's applicationManager.
(function () {
  "use strict";
  var S = window.COUCH_WEBOS || {};
  var CFG = window.COUCH_CONFIG || {};
  var Q = location.search;
  function param(k) { var m = Q.match(new RegExp("[?&]" + k + "=([^&]+)")); return m ? decodeURIComponent(m[1]) : ""; }
  var BRIDGE = (param("api") || S.bridge || "").replace(/\/+$/, "");
  var VICE = BRIDGE.replace(/:5400$/, ":5401");
  var KEY = S.key || param("key");
  var TV = S.tv || param("tv");
  var NAME = (CFG.people && CFG.people[0] && CFG.people[0].name) || "Shane";
  var H24 = !CFG.home || CFG.home.clock !== "12h";
  var $ = function (id) { return document.getElementById(id); };
  var shown = {};  // what each line last showed: rewriting the same text still costs a layout and repaint on the TV
  function put(id, h) { if (shown[id] !== h) { shown[id] = h; $(id).innerHTML = h; } }

  // ---------- icons (lucide, ISC; PlayStation from simple-icons, CC0; as bundled with Luma) ----------
  function ic(d, fill) {
    return '<svg viewBox="0 0 24 24" ' + (fill ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"') + ">" + d + "</svg>";
  }
  var I = {
    cloud: ic('<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>'),
    sun: ic('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>'),
    moon: ic('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>'),
    part: ic('<path d="M12 2v2M4.93 4.93l1.41 1.41M20 12h2M19.07 4.93l-1.41 1.41M15.947 12.65a4 4 0 0 0-5.925-4.128"/><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"/>'),
    rain: ic('<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 14v6M8 14v6M12 16v6"/>'),
    snow: ic('<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M8 15h.01M8 19h.01M12 17h.01M12 21h.01M16 15h.01M16 19h.01"/>'),
    fog: ic('<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 17H7M17 21H9"/>'),
    storm: ic('<path d="M6 16.326A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.973"/><path d="m13 12-3 5h4l-3 5"/>'),
    ps: ic('<path d="M8.984 2.596v17.547l3.915 1.261V6.688c0-.69.304-1.151.794-.991.636.18.76.814.76 1.505v5.875c2.441 1.193 4.362-.002 4.362-3.152 0-3.237-1.126-4.675-4.438-5.827-1.307-.448-3.728-1.186-5.39-1.502zm4.656 16.241l6.296-2.275c.715-.258.826-.625.246-.818-.586-.192-1.637-.139-2.357.123l-4.205 1.5V14.98l.24-.085s1.201-.42 2.913-.615c1.696-.18 3.785.03 5.437.661 1.848.601 2.04 1.472 1.576 2.072-.465.6-1.622 1.036-1.622 1.036l-8.544 3.107V18.86zM1.807 18.6c-1.9-.545-2.214-1.668-1.352-2.32.801-.586 2.16-1.052 2.16-1.052l5.615-2.013v2.313L4.205 17c-.705.271-.825.632-.239.826.586.195 1.637.15 2.343-.12L8.247 17v2.074c-.12.03-.256.044-.39.073-1.939.331-3.996.196-6.038-.479z"/>', true),
    hdmi: ic('<path d="M22 9a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h1l2 2h12l2-2h1a1 1 0 0 0 1-1Z"/><path d="M7.5 12h9"/>'),
    monitor: ic('<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8M12 17v4"/>'),
    play: ic('<path d="M10 7.75a.75.75 0 0 1 1.142-.638l3.664 2.249a.75.75 0 0 1 0 1.278l-3.664 2.25a.75.75 0 0 1-1.142-.64z"/><path d="M12 17v4M8 21h8"/><rect x="2" y="3" width="20" height="14" rx="2"/>'),
    bulb: ic('<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6M10 22h4"/>'),
    sparkles: ic('<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4M22 5h-4"/>'),
    gear: ic('<path d="M20 7h-9M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>'),
    refresh: ic('<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>'),
    tv: ic('<rect width="20" height="15" x="2" y="7" rx="2"/><path d="m17 2-5 5-5-5"/>'),
    eyeoff: ic('<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/>'),
    sky: '<svg class="logo sky" viewBox="0 4.65 24 14.7" fill="currentColor"><path d="M7.387 13.656c0 1.423-.933 2.454-2.823 2.675-1.35.147-3.337-.025-4.294-.148-.025-.147-.074-.343-.074-.49 0-1.252.663-1.522 1.3-1.522.664 0 1.694.123 2.455.123.834 0 1.104-.295 1.104-.565 0-.368-.343-.515-1.006-.638l-1.767-.343C.785 12.453 0 11.423 0 10.343c0-1.325.933-2.454 2.798-2.65 1.398-.148 3.116.024 4.049.122.024.172.049.32.049.491 0 1.252-.663 1.522-1.276 1.522-.491 0-1.227-.099-2.086-.099-.884 0-1.227.246-1.227.54 0 .32.343.442.883.54l1.718.32c1.742.294 2.479 1.3 2.479 2.527m3.092 1.521c0 .761-.295 1.203-1.792 1.203-.196 0-.368-.025-.54-.05V6.22c0-.76.27-1.57 1.767-1.57.196 0 .393.024.565.049zm6.085 3.927c.197.098.59.22 1.105.245.859.025 1.325-.319 1.693-1.08L24 7.913a2.5 2.5 0 0 0-.957-.22c-.589 0-1.399.122-1.914 1.325l-1.497 3.534-2.945-4.81c-.196-.05-.662-.148-1.006-.148-1.03 0-1.62.393-2.233 1.031l-2.871 3.141 2.306 3.632c.418.663.982 1.006 1.89 1.006.589 0 1.104-.147 1.325-.245l-2.773-4.196 1.963-2.086 3.24 5.08Z"/></svg>',  // device wordmarks (simple-icons, CC0), viewBoxes cropped to the lettering so they sit centred
    ps5: '<svg class="logo ps5" viewBox="0 9.425 24 5.15" fill="currentColor"><path d="M10.4499 14.56905a1.38287 1.38287 0 001.38287-1.38287v-2.37841a.83315.83315 0 01.83416-.83315h2.68403a.03732.03732 0 00.03631-.03732V9.4612a.03631.03631 0 00-.0363-.0363H12.1172a1.38287 1.38287 0 00-0.12768 1.38286v2.38043a.83416.83416 0 01-.83315.83415H7.25347a.03631.03631 0 00-.03631.03632v.47608a.03631.03631 0 00.03631.03631zm6.04488-3.21156V9.4612a.03631.03631 0 01.0363-.0363h7.30772a.03732.03732 0 01.03732.0363v.47609a.03833.03833 0 01-.03732.03732h-6.20929a.03631.03631 0 00-.0363.03631v1.2356a.3954.3954 0 00.3964.39741h4.62267a1.46457 1.46457 0 010 2.9251h-6.0812a.03631.03631 0 01-.0363-.0363v-.47407a.03631.03631 0 01.0363-.03632h5.53047a.91586.91586 0 10-.00706-1.8307h-4.72656a.83315.83315 0 01-.83315-.83416m-10.84608.28645a.83466.83466 0 000-1.66932H.03654a.03732.03732 0 01-.03632-.03732V9.4612a.03631.03631 0 01.03632-.0363h6.1528a1.38388 1.38388 0 010 2.76673H1.9328a.83315.83315 0 00-.83315.83416v1.51299a.03631.03631 0 01-.03631.0363H.03654a.03631.03631 0 01-.03632-.04034v-1.51298a1.38287 1.38287 0 011.38388-1.37783Z"/></svg>',
    nswitch: '<svg class="logo nswitch" viewBox="0 0 24 24" fill="currentColor"><path d="M14.176 24h3.674c3.376 0 6.15-2.774 6.15-6.15V6.15C24 2.775 21.226 0 17.85 0H14.1c-.074 0-.15.074-.15.15v23.7c-.001.076.075.15.226.15zm4.574-13.199c1.351 0 2.399 1.125 2.399 2.398 0 1.352-1.125 2.4-2.399 2.4-1.35 0-2.4-1.049-2.4-2.4-.075-1.349 1.05-2.398 2.4-2.398zM11.4 0H6.15C2.775 0 0 2.775 0 6.15v11.7C0 21.226 2.775 24 6.15 24h5.25c.074 0 .15-.074.15-.149V.15c.001-.076-.075-.15-.15-.15zM9.676 22.051H6.15c-2.326 0-4.201-1.875-4.201-4.201V6.15c0-2.326 1.875-4.201 4.201-4.201H9.6l.076 20.102zM3.75 7.199c0 1.275.975 2.25 2.25 2.25s2.25-.975 2.25-2.25c0-1.273-.975-2.25-2.25-2.25s-2.25.977-2.25 2.25z"/></svg>',  // Simple Icons
    ps3: '<svg class="logo ps3" viewBox="0 9.43 24 5.14" fill="currentColor"><path d="M15.362 9.433h-3.148c-.97 0-1.446.6-1.446 1.38v2.365c0 .483-.228.83-.71.83H7.304a.035.035 0 00-.035.035v.47c0 .02.01.032.03.032h3.11c.97 0 1.45-.597 1.45-1.377v-2.363c0-.484.224-.832.71-.832h2.781c.02 0 .04-.014.04-.033v-.475c0-.02-.02-.035-.04-.035zm-9.266 0H.038c-.022 0-.038.017-.038.035v.477c0 .02.016.036.038.036h5.694c.48 0 .71.347.71.83s-.228.83-.71.83H1.228c-.7 0-1.227.586-1.227 1.365v1.513c0 .02.02.037.04.037h1.03c.02 0 .04-.016.04-.037v-1.513c0-.48.28-.82.68-.82H6.1c.97 0 1.444-.594 1.444-1.374 0-.778-.473-1.38-1.442-1.38zm17.453 2.498a.04.04 0 010-.056c.3-.25.45-.627.45-1.062 0-.778-.474-1.38-1.446-1.38h-6.057c-.02 0-.036.018-.036.038v.475c0 .02.02.04.04.04h5.7c.48 0 .715.35.715.83s-.23.83-.712.83h-5.7c-.02 0-.036.02-.036.04v.48c0 .02.016.033.037.033h5.7c.63.007.71.62.71.93v.06c0 .485-.23.833-.71.833h-5.7c-.02 0-.036.015-.036.034v.477c0 .02.015.037.036.037h6.05c.973 0 1.446-.645 1.446-1.38v-.057c0-.47-.15-.916-.45-1.19z"/></svg>',
    radio: ic('<path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/>'),
    music: ic('<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>'),
    pause: ic('<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>', true),
    grid: ic('<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>')
  };
  window.VICE_TV_ICON = I.tv;
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  // ---------- talking to the TV and the PC ----------
  var held = [];
  function luna(uri, params, done) {
    var b;
    try { b = new PalmServiceBridge(); } catch (e) { if (done) done(null); return false; }
    held.push(b);
    b.onservicecallback = function (msg) {
      held.splice(held.indexOf(b), 1);
      var r = null; try { r = JSON.parse(msg); } catch (e) {}
      if (done) done(r);
    };
    try { b.call(uri, JSON.stringify(params || {})); } catch (e) { held.splice(held.indexOf(b), 1); if (done) done(null); }
    return true;
  }
  function launch(id, params, label) {
    var p = { id: id }; if (params) p.params = params;
    var ok = luna("luna://com.webos.applicationManager/launch", p, function (r) {
      if (!r || !r.returnValue) toast("Couldn't open " + (label || id) + (r && r.errorText ? ": " + r.errorText : ""));
    });
    if (!ok) toast("Would open " + (label || id) + " (not on the TV)");
  }
  function http(method, url, body, done, timeout) {
    var x = new XMLHttpRequest();
    x.open(method, url);
    x.timeout = timeout || 8000;
    if (KEY) x.setRequestHeader("Authorization", "Bearer " + KEY);
    if (body) x.setRequestHeader("Content-Type", "application/json");
    x.onload = function () { var r = null; try { r = JSON.parse(x.responseText); } catch (e) {} done(x.status, r); };
    x.onerror = x.ontimeout = function () { done(0, null); };
    x.send(body ? JSON.stringify(body) : null);
  }
  var toastT;
  function toast(t) {
    var el = $("toast"); el.textContent = t; el.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(function () { el.classList.remove("show"); }, 3500);
  }

  // ---------- clock, greeting, weather ----------
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function tick() {
    var d = new Date(), h = d.getHours();
    put("clock", H24 ? pad(h) + ":" + pad(d.getMinutes()) : ((h % 12) || 12) + ":" + pad(d.getMinutes()) + (h < 12 ? " am" : " pm"));
    put("date", pad(d.getDate()) + "." + pad(d.getMonth() + 1) + "." + d.getFullYear());
    // GTA VI countdown (release 19 Nov 2026, midnight local); gone after launch day (same as the HA panel)
    var days = Math.round((new Date(2026, 10, 19) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
    // launch-day mode: from 19 Nov "out now" for a week, and your play time as soon as there is some (same as the HA panel)
    var text = days > 1 ? "GTA VI in <b>" + days + " days</b>" : days === 1 ? "GTA VI <b>tomorrow</b>"
      : gtaPlayed > 0 ? "GTA VI · <b>" + playtime(gtaPlayed) + "</b> played" : days >= -6 ? "GTA VI <b>out now</b>" : "";
    if (shown.gta !== text) {
      put("gta", text);
      var g = document.querySelectorAll(".gta");
      for (var i = 0; i < g.length; i++) g[i].style.display = text ? "" : "none";
    }
    put("greet", esc(h < 5 ? "Still up, " + NAME + "?" : h < 12 ? "Good morning, " + NAME : h < 18 ? "Good afternoon, " + NAME : "Good evening, " + NAME));
  }
  var WX = [[0, "Clear", "sun"], [1, "Mostly clear", "part"], [2, "Partly cloudy", "part"], [3, "Overcast", "cloud"], [45, "Fog", "fog"], [48, "Fog", "fog"],
    [51, "Drizzle", "rain"], [53, "Drizzle", "rain"], [55, "Drizzle", "rain"], [56, "Freezing drizzle", "rain"], [57, "Freezing drizzle", "rain"],
    [61, "Light rain", "rain"], [63, "Rain", "rain"], [65, "Heavy rain", "rain"], [66, "Freezing rain", "rain"], [67, "Freezing rain", "rain"],
    [71, "Light snow", "snow"], [73, "Snow", "snow"], [75, "Heavy snow", "snow"], [77, "Snow grains", "snow"], [80, "Showers", "rain"], [81, "Showers", "rain"],
    [82, "Heavy showers", "rain"], [85, "Snow showers", "snow"], [86, "Snow showers", "snow"], [95, "Thunderstorm", "storm"], [96, "Thunderstorm", "storm"], [99, "Thunderstorm", "storm"]];
  var HAWX = { sunny: ["Sunny", "sun"], "clear-night": ["Clear", "moon"], partlycloudy: ["Partly cloudy", "part"], cloudy: ["Cloudy", "cloud"],
    fog: ["Fog", "fog"], rainy: ["Rain", "rain"], pouring: ["Heavy rain", "rain"], snowy: ["Snow", "snow"], "snowy-rainy": ["Sleet", "snow"],
    hail: ["Hail", "rain"], lightning: ["Thunder", "storm"], "lightning-rainy": ["Thunderstorms", "storm"], windy: ["Windy", "cloud"],
    "windy-variant": ["Windy", "cloud"], exceptional: ["Unusual weather", "cloud"] };
  function showWx(icon, temp, label) {
    var w = CFG.weather || { place: "London" };
    put("wx", I[icon] + "<span>" + esc(w.place) + '</span><span class="sep">·</span><b>' + Math.round(temp) + "°C</b><span>" + esc(label) + "</span>");
  }
  // Home Assistant's weather (through vice-tv) first, so the TV and the HA panel say the same; Open-Meteo if that fails
  function weather() {
    if (!VICE) return openMeteo();
    http("GET", VICE + "/api/weather", null, function (code, r) {
      var m = r && r.ok && r.temp != null && HAWX[r.condition];
      if (m) showWx(m[1], r.temp, m[0]); else openMeteo();
    });
  }
  function openMeteo() {
    var w = CFG.weather || { lat: 51.5072, lon: -0.1276, place: "London", timezone: "Europe/London" };
    var x = new XMLHttpRequest();
    x.open("GET", "https://api.open-meteo.com/v1/forecast?latitude=" + w.lat + "&longitude=" + w.lon + "&current=temperature_2m,weather_code,is_day&timezone=" + encodeURIComponent(w.timezone || "auto"));
    x.timeout = 8000;
    x.onload = function () {
      try {
        var c = JSON.parse(x.responseText).current, m = WX[0];
        for (var i = 0; i < WX.length; i++) if (WX[i][0] === c.weather_code) m = WX[i];
        var icon = (m[2] === "sun" || m[2] === "part") && !c.is_day ? "moon" : m[2];
        showWx(icon, c.temperature_2m, c.weather_code === 0 && c.is_day ? "Sunny" : m[1]);
      } catch (e) {}
    };
    x.send();
  }

  // ---------- homelab line ----------
  function lab() {
    if (!VICE) return put("lab", "");
    http("GET", VICE + "/api/status", null, function (code, r) {
      if (code !== 200 || !r) put("lab", '<span class="dot off"></span><span>PC offline</span>');
      else put("lab", (r.stars || r.evading ? wantedStars(r.stars || 0, r.evading || 0)  // the stars replace the dot
               : '<span class="dot' + (r.good ? "" : " bad") + '"></span>') + "<span>" + esc(r.line) + "</span>");
    });
  }
  // Wanted Level (2026-11-16, ~/homelab/discord-bot/wanted.py): five stars before the line while wanted; as it clears
  // ("evading") the last level flashes for ~2 minutes. Nothing when it's clean.
  var STAR = '<svg viewBox="0 0 24 24"><path d="M12 2.6l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17.2l-5.9 3.2 1.3-6.5L2.5 9.4l6.6-.8z"/></svg>';
  function wantedStars(n, evading) {
    var lit = n || evading;
    if (!lit) return "";
    var h = '<span class="wanted' + (n ? "" : " evading") + '">';
    for (var i = 0; i < 5; i++) h += '<i class="' + (i < lit ? "on" : "") + '">' + STAR + "</i>";
    return h + "</span>";
  }

  // ---------- Vice Radio: the PC's 80s station (~/homelab/radio), relayed by vice-tv ----------
  // OK on the Favorites tile plays it here; the info line shows the song; after 1 idle minute on Home (or "Now playing" in the tile's menu) the
  // now-playing view takes the screen (any key brings Home back).
  var radio = { now: null, audio: null, key: "", idle: Date.now(), view: false };
  function radioCover() { var n = radio.now; return n && n.cover ? VICE + n.cover : ""; }
  // "Still They Ride (2022 Remaster)" -> "Still They Ride": the tags only crowd the screen
  function clean(t) { return String(t || "").replace(/\s*[([][^)\]]*remaster[^)\]]*[)\]]/ig, "").replace(/\s+-\s+[^-]*remaster.*$/i, ""); }
  function radioSource(n) { return !n ? "" : n.src === "local" ? "Your music" : n.station || "Internet radio"; }
  function radioTile() {
    var t = document.createElement("div"); t.className = "tile radio"; t.id = "radio-tile";
    // OK plays it; while it plays, OK opens a small menu: Skip song / Stop
    t._act = function () { if (radio.audio || radio.retry) openRadioMenu(); else toggleRadio(); };
    t._h = null; drawRadioTile(t); return t;
  }
  // The tile shows what's on the station even when the TV isn't playing it: the album cover fills it (like the art on
  // the other favourites), with "VICE RADIO", the song and the artist on a shade at the bottom; "Playing" while on.
  // Station visits have no cover: a dark tile with the radio icon and the station's name.
  function drawRadioTile(t) {
    t = t || $("radio-tile"); if (!t) return;
    var n = radio.now || {}, c = radioCover(), on = !!radio.audio || !!radio.retry;
    var title = clean(n.title), sub = n.title ? (n.artist || radioSource(n)) : "";
    var h = [c, on, title, sub].join("|");
    if (t._h === h) return;
    t._h = h;
    t.innerHTML = (c ? '<div class="art"></div>' : '<div class="noart">' + I.radio + "</div>") + '<div class="shade"></div>' +
      (on ? '<span class="live">' + I.pause + "Playing</span>" : "") +
      '<div class="txt"><span class="k">Vice Radio</span>' + (title ? "<b>" + esc(title) + "</b><i>" + esc(sub) + "</i>" : "<b>" + esc(radioSource(n) || "80s, all day") + "</b>") + "</div>";
    if (c) t.firstChild.style.backgroundImage = "url(" + JSON.stringify(c) + ")";
    t.classList.toggle("on", on);
  }
  // This TV can't play the video wallpaper and the radio stream together: the audio takes the media player and the
  // video freezes (and stayed frozen after the radio stopped). While the radio plays, the wallpaper is the still
  // artwork drifting slowly (CSS, no decoder); when it stops, the video reloads and plays again.
  function radioOn() { return !!(radio.audio || radio.retry); }
  function wallForRadio(on) {
    var v = $("bgvid");
    if (document.body.classList.contains("radio") === on) return;
    document.body.classList.toggle("radio", on);
    // on: release the video completely (not just pause), so the TV's media player is free before the audio starts
    if (on) { try { v.pause(); v.removeAttribute("src"); v.load(); } catch (e) {} }
    else { try { v.src = "wall.mp4"; v.load(); if (!document.hidden) v.play(); } catch (e) {} }
  }
  function dropPlayer(a) {  // drops the stream, not just the sound
    a.onerror = a.onended = a.onplaying = null;
    var u = a.src;
    try { if (a.stopStream) a.stopStream(); a.pause(); a.removeAttribute("src"); a.load(); } catch (e) {}
    if (u && u.indexOf("blob:") === 0) try { URL.revokeObjectURL(u); } catch (e) {}
  }
  function stopRadio(msg) {
    var a = radio.audio; radio.audio = null; clearTimeout(radio.retry); radio.retry = null;
    if (a) dropPlayer(a);
    if (msg) toast(msg);
    hideNowView(); showRadio(); wallForRadio(false);
  }
  function toggleRadio() {
    if (!VICE) return toast("Vice Radio needs the PC");
    if (radio.audio || radio.retry) { clearTimeout(radio.retry); radio.retry = null; return stopRadio(); }
    // the wallpaper first, the audio half a second later: done together, the TV switched its media player while the
    // music had just begun (a second of music, a 1-2 s gap, then music again)
    radio.tries = 0; wallForRadio(true); radio.retry = setTimeout(startRadio, 600); showRadio();
  }
  // The player. A plain <audio src=stream> on this TV plays ~1 s, then waits until it has 10+ s in hand (a 9 s gap,
  // measured 2026-11-13). Fed through Media Source Extensions instead (fetch the stream, append the pieces), it plays
  // in 0.7 s with a 3 s head start and never stalls: no 20 s delay, so skips are heard at once. The plain player stays
  // as a fallback (with vice-tv's 20 s head start).
  function joinBytes(list) {
    var n = 0, i, out; for (i = 0; i < list.length; i++) n += list[i].length;
    out = new Uint8Array(n); n = 0; for (i = 0; i < list.length; i++) { out.set(list[i], n); n += list[i].length; }
    return out;
  }
  function msePlayer(url, lost) {
    var a = new Audio(), ms = new MediaSource(), ctl = window.AbortController ? new AbortController() : null;
    var q = [], sb = null, dead = false;
    var fail = function () { if (!dead) { dead = true; lost(); } };
    var pump = function () {
      if (dead || !sb || sb.updating || !q.length) return;
      try {
        // keep memory flat: drop what played more than a minute ago
        if (a.currentTime > 120 && sb.buffered.length && sb.buffered.start(0) < a.currentTime - 90) return sb.remove(0, a.currentTime - 60);
        sb.appendBuffer(q.length > 1 ? joinBytes(q.splice(0)) : q.shift());
      } catch (e) { fail(); }
    };
    a.src = URL.createObjectURL(ms);
    ms.addEventListener("sourceopen", function () {
      try { sb = ms.addSourceBuffer("audio/mpeg"); } catch (e) { return fail(); }
      sb.addEventListener("updateend", pump);
      fetch(url, ctl ? { signal: ctl.signal } : {}).then(function (res) {
        if (!res.ok || !res.body) return fail();
        var rd = res.body.getReader();
        (function next() {
          rd.read().then(function (x) { if (dead) return; if (x.done) return fail(); q.push(x.value); pump(); next(); }, fail);
        })();
      }, fail);
    });
    a.onerror = fail;
    a.stopStream = function () { dead = true; try { if (ctl) ctl.abort(); } catch (e) {} };
    return a;
  }
  // if the stream drops (Wi-Fi, the station restarting) it reconnects, up to 3 times in a row
  function startRadio() {
    radio.retry = null;
    var a, lost = function () {
      if (radio.audio !== a) return;
      if (++radio.tries > 3) return stopRadio("Vice Radio isn't answering");
      dropPlayer(a);
      radio.audio = null; radio.retry = setTimeout(startRadio, 2000);
    };
    if (window.MediaSource && MediaSource.isTypeSupported("audio/mpeg")) a = msePlayer(VICE + "/radio?head=3", lost);
    else { a = new Audio(); a.preload = "none"; a.src = VICE + "/radio"; a.onerror = lost; a.onended = lost; }
    a.onplaying = function () { if (radio.audio === a) radio.tries = 0; };
    radio.audio = a; radio.idle = Date.now();
    wallForRadio(true);
    try { var p = a.play(); if (p && p.catch) p.catch(function () { if (radio.audio === a) stopRadio("Vice Radio couldn't start"); }); } catch (e) {}
    readRadio(); showRadio();
  }
  function readRadio() {
    if (!VICE) return;
    // the fallback player hears the station ~20 s late (vice-tv's head start): it asks for what it hears
    var late = radio.audio && !radio.audio.stopStream;
    http("GET", VICE + "/api/radio" + (late ? "?delayed=1" : ""), null, function (code, r) {
      radio.now = code === 200 && r && r.ok ? r : null;
      var k = radio.now ? [radio.now.src, radio.now.artist, radio.now.title, radio.now.cover].join("|") : "";
      if (k !== radio.key) {
        // a new song while the radio plays on the TV: a Vice OSD card (the now-playing view already shows it)
        if (radio.key && radio.now && radio.now.title && radioOn() && !radio.view)
          osd({ art: radioCover(), icon: "radio", title: clean(radio.now.title), line: "Vice Radio", em: radio.now.artist || radioSource(radio.now), ttl: 6 });
        radio.key = k; showRadio();
      }
    });
  }
  function showRadio() {
    drawRadioTile();
    var n = radio.now, text = radio.audio && n && n.title ? I.music + "<b>" + esc(n.artist || radioSource(n)) + "</b><span>" + esc(clean(n.title)) + "</span>" : "";
    if (shown.np !== text) {
      put("np", text);
      var g = document.querySelectorAll(".np");
      for (var i = 0; i < g.length; i++) g[i].style.display = text ? "" : "none";
    }
    if (radio.view) drawNowView();
  }
  function drawNowView() {
    var n = radio.now || {}, c = radioCover(), art = $("nv-art");
    var h = c + "|" + n.title;
    if (art._h === h) return;
    art._h = h;
    art.innerHTML = c ? '<img alt="">' : I.radio;
    if (c) art.firstChild.src = c;
    $("nv-src").textContent = "Vice Radio · " + radioSource(n);
    $("nv-title").textContent = clean(n.title) || "Vice Radio";
    $("nv-artist").textContent = n.artist || "";
    $("nv-album").textContent = n.src === "local" ? clean(n.album) : "";
    $("nv-hint").textContent = n.src === "live" ? "→ Back to my music" : "→ Skip";
  }
  function openRadioMenu() {
    var n = radio.now || {}, b = $("radio-btns"); b.innerHTML = "";
    $("radio-note").textContent = n.title ? clean(n.title) + (n.artist ? " · " + n.artist : "") : "";
    [["Now playing", function () { closeSheet(); showNowView(); }],
     [n.src === "live" ? "Back to my music" : "Skip song", function () { closeSheet(); skipRadio(); }],
     ["Stop", function () { closeSheet(); toggleRadio(); }]].forEach(function (x) {
      var e = document.createElement("span"); e.className = "btn"; e.textContent = x[0]; e._act = x[1]; b.appendChild(e);
    });
    openSheet("radio");
  }
  // the whole station skips (it's Shane's own): the next song fades in over the usual 6 s; on a station visit it
  // goes back to his music
  function skipRadio() {
    if (!VICE) return;
    http("POST", VICE + "/api/radio/skip", null, function (code) {
      if (code !== 200) return toast("Vice Radio isn't answering");
      toast(radio.now && radio.now.src === "live" ? "Back to your music" : "Skipping");
      setTimeout(readRadio, 1500);
    });
  }
  function showNowView() {
    if (radio.view) return;
    radio.view = true; drawNowView(); $("nowview").classList.remove("off"); document.body.classList.add("np");
  }
  function checkIdle() {
    if (radio.view || !radio.audio || tab !== "home" || sheet || viewer || Date.now() - radio.idle < 60000) return;
    showNowView();
  }
  function hideNowView() { if (!radio.view) return; radio.view = false; $("nowview").classList.add("off"); document.body.classList.remove("np"); }

  // ---------- apps ----------
  var HIDE = /^(com\.webos\.|com\.palm\.|com\.lge\.|com\.palmdts\.|app\.couchtv\.|tld\.my\.customlauncher$|com\.ecklf\.luma$|org\.webosbrew\.safeupdate$|org\.webosbrew\.custom-screensaver$|shortcut)/;
  var FAVS = ["org.xbmc.kodi", "com.limelight.webos", "youtube.leanback.v4", "bbc.iplayer.3.0", "netflix", "com.disney.disneyplus-prod"];
  var TILES = { "org.xbmc.kodi": 1, "com.limelight.webos": 1, "youtube.leanback.v4": 1, "bbc.iplayer.3.0": 1, "netflix": 1, "com.disney.disneyplus-prod": 1,
    "com.c5.accedo.app": 1, "com.miniclip.eightballpool": 1, "amazon.alexa.view": 1, "com.theadelab.amclient-lg": 1, "com.apple.applemusic": 1,
    "com.apple.appletv": 1, "bbc.sounds.1.0": 1, "com.channel4.ondemand": 1 };
  // dark tiles with the logo in white, like Netflix and Disney+ (white tiles stood out, 2026-11-16)
  var LOGOS = { "com.itvx.app": ["itvx", "#17161d"], "now.tv": ["now-tv", "#17161d"], "amazon": ["prime-video", "#0f171e"], "ui30": ["rakuten-tv", "#17161d"] };
  var BAKED = window.COUCH_WEBOS_LOGOS || {}, MAP = window.COUCH_WEBOS_APPS || {};
  var allApps = [];
  function readApps() {
    var list = [];
    try { list = JSON.parse(localStorage.getItem("couch.webos.apps") || "[]"); } catch (e) {}
    var seen = {};
    allApps = list.filter(function (a) { if (!a || !a.id || seen[a.id]) return false; seen[a.id] = 1; return true; });
  }
  function iconSrc(a) {
    // icons saved into the package at build time (lg/build.py --apps tv) first: the TV's own icon paths fail on some TVs
    if (BAKED[a.id]) return "logos/" + a.id + ".png";
    for (var pkg in MAP) if (BAKED[pkg] && (MAP[pkg].ids || []).indexOf(a.id) >= 0) return "logos/" + pkg + ".png";
    return !a.icon ? null : /^[a-z]+:/.test(a.icon) ? a.icon : "file://" + a.icon;
  }
  function appTile(a, wide) {
    var t = document.createElement("div");
    t.className = "tile" + (wide ? " wide" : "");
    if (TILES[a.id]) t.innerHTML = '<img class="full" src="img/' + a.id + '.png" alt="">';
    else if (LOGOS[a.id]) { t.style.background = LOGOS[a.id][1]; t.innerHTML = '<div class="mid"><img class="logo white" src="brand/' + LOGOS[a.id][0] + '.svg" alt=""></div>'; }
    else {
      var s = iconSrc(a); t.className += " ico";
      t.innerHTML = '<div class="mid">' + (s ? '<img class="icon" src="' + esc(s) + '" alt="" onerror="this.outerHTML=window.VICE_TV_ICON">' : I.tv) + "</div>";
      var im = t.querySelector("img.icon");
      if (im && s in tints) paintTile(t, im, tints[s]);
      else if (im) im.onload = function () { tints[s] = tileColour(im); paintTile(t, im, tints[s]); };
    }
    t._act = function () { launch(a.id, null, appName(a.title)); };
    return t;
  }
  // Square-icon apps: if the icon has a plain background (LG apps, Homebrew), the tile takes that colour so the
  // icon reads like a banner; full-art icons (Fruit Ninja) sit on a blurred copy of themselves.
  var tints = {};  // icon -> its tile colour, "" for a blurred copy
  function paintTile(t, im, c) {
    if (c) { t.style.background = c; t.className += " flat"; } else blurBg(t, im);
  }
  function tileColour(im) {
    try {
      var n = 32, c = document.createElement("canvas"); c.width = c.height = n;
      var x = c.getContext("2d"); x.drawImage(im, 0, 0, n, n);
      var d = x.getImageData(0, 0, n, n).data, px = [], x0 = n, y0 = n, x1 = -1, y1 = -1;
      for (var yy = 0; yy < n; yy++) for (var xx = 0; xx < n; xx++) if (d[(yy * n + xx) * 4 + 3] > 200) {
        x0 = Math.min(x0, xx); y0 = Math.min(y0, yy); x1 = Math.max(x1, xx); y1 = Math.max(y1, yy);
      }
      var w = x1 - x0, h = y1 - y0, a = Math.max(1, Math.round(w * 0.06));
      for (var k = 0.3; k <= 0.7; k += 0.02) [[x0 + w * k, y0 + a], [x0 + w * k, y1 - a], [x0 + a, y0 + h * k], [x1 - a, y0 + h * k]].forEach(function (p) {
        var i = (Math.round(p[1]) * n + Math.round(p[0])) * 4; if (d[i + 3] > 200) px.push([d[i], d[i + 1], d[i + 2]]);
      });  // the middle of each side of the visible icon, inside its rounded corners
      if (px.length < 20) return "";
      var m = null, best = 0;  // the commonest colour: plain-background icons share it along all four sides
      px.forEach(function (q) {
        var c = px.filter(function (r) { return Math.abs(r[0] - q[0]) + Math.abs(r[1] - q[1]) + Math.abs(r[2] - q[2]) < 36; }).length;
        if (c > best) { best = c; m = q; }
      });
      var white = Math.min(m[0], m[1], m[2]) > 225;
      if (best < px.length * (white ? 0.35 : 0.6)) return "";  // a white square with a coloured glyph still counts as white
      if (white) m = [255, 255, 255];  // near-white is white (downscaling tints it)
      return "rgb(" + m.map(Math.round).join(",") + ")";
    } catch (e) { return ""; }
  }
  function blurBg(t, im) {
    var b = document.createElement("div"); b.className = "blur"; b.style.backgroundImage = "url(" + JSON.stringify(im.src) + ")";
    t.insertBefore(b, t.firstChild);
  }
  // apps Shane has hidden from the Apps page (Settings > Hide apps), kept on the TV
  var hidden = [], hideTile = null;
  try { hidden = JSON.parse(localStorage.getItem("vice.hidden") || "[]"); } catch (e) {}
  function openHide() {
    var box = $("apps-list"), row; box.innerHTML = "";
    allApps.filter(function (a) { return !HIDE.test(a.id); })
      .sort(function (a, b) { return appName(a.title).toLowerCase() < appName(b.title).toLowerCase() ? -1 : 1; })
      .forEach(function (a, i) {
        if (i % 5 === 0) { row = document.createElement("div"); row.className = "prow"; box.appendChild(row); }
        var el = document.createElement("span"); el.className = "btn" + (hidden.indexOf(a.id) >= 0 ? " off" : "");
        el.textContent = appName(a.title);
        el._act = function () {
          var k = hidden.indexOf(a.id);
          if (k >= 0) hidden.splice(k, 1); else hidden.push(a.id);
          el.classList.toggle("off", k < 0);
          try { localStorage.setItem("vice.hidden", JSON.stringify(hidden)); } catch (e) {}
          drawGrid();
        };
        row.appendChild(el);
      });
    openSheet("apps");
  }
  // "ITVX - fresh, free streaming" -> "ITVX", "Tubi: Free Movies & TV" -> "Tubi", "5" -> "Channel 5"
  function appName(t) { t = String(t || "").replace(/ - .*$/, "").replace(/: .*$/, ""); return t === "5" ? "Channel 5" : t; }
  function byId(id) { for (var i = 0; i < allApps.length; i++) if (allApps[i].id === id) return allApps[i]; return null; }
  function drawFavs() {
    var row = $("row-fav"); row.innerHTML = "";
    FAVS.forEach(function (id) { var a = byId(id) || { id: id, title: id }; row.appendChild(appTile(a)); });
    row.appendChild(radioTile());
  }
  function drawGrid() {
    var g = $("grid"); g.innerHTML = "";
    var shown = allApps.filter(function (a) { return !HIDE.test(a.id) && hidden.indexOf(a.id) < 0; });
    shown.sort(function (a, b) {
      var fa = FAVS.indexOf(a.id), fb = FAVS.indexOf(b.id);
      if (fa >= 0 || fb >= 0) return (fa < 0 ? 99 : fa) - (fb < 0 ? 99 : fb);
      return appName(a.title).toLowerCase() < appName(b.title).toLowerCase() ? -1 : 1;
    });
    shown.forEach(function (a) {
      var c = document.createElement("div"); c.className = "cell";
      var t = appTile(a); c.appendChild(t);
      var s = document.createElement("span"); s.textContent = appName(a.title); c.appendChild(s);
      c._act = t._act; t._act = null;
      g.appendChild(c);
    });
  }

  // ---------- inputs (PS5 wakes first) ----------
  var ps5 = "unknown", waking = false, ps3 = null, nsw = null, ps5Now = null, ps5Last = null;
  function drawInputs() {
    var row = $("row-inputs"); row.innerHTML = "";
    allApps.filter(function (a) { return /^com\.webos\.app\.hdmi\d$/.test(a.id) && !/home theat|sound ?bar|arc/i.test(a.title); })
      .sort(function (a, b) { return a.id < b.id ? -1 : 1; })
      .forEach(function (a) {
        var n = a.id.slice(-1), isPs5 = /ps5|playstation 5/i.test(a.title), isPs3 = /ps3|playstation 3/i.test(a.title), isSwitch = /switch|nintendo/i.test(a.title);
        var c = document.createElement("div"); c.className = "card";
        var sub = esc(a.title);
        if (isPs5) sub = waking ? "PS5 · <em>Waking up…</em>" : ps5 === "standby" ? "PS5 · Rest mode · <em>OK to wake</em>" : ps5 === "off" ? "PS5 · Off" : ps5 === "on" ? (ps5Now ? "PS5 · <em>" + esc(ps5Now) + "</em>" : "PS5 · On") : sub;
        if (isPs5 && !waking && !ps5Now && ps5Last && ps5Last.name) sub += '<br><span class="last">Last: ' + esc(ps5Last.name) + "</span>";
        if (isPs3 && ps3) sub = ps3.on ? "PS3 · " + ps3.cpu + "° / " + ps3.rsx + "°" + (ps3.game ? " · <em>" + esc(ps3.game) + "</em>" : "") : ps3.up ? "PS3 · On · <em>enable HEN</em>" : "PS3 · Off";
        if (isPs3 && ps3 && !ps3.on && ps3.last && ps3.last.name) sub += '<br><span class="last">Last: ' + esc(ps3.last.name) + "</span>";
        if (isSwitch && nsw !== null) sub = nsw ? "Switch · <em>On</em>" : "Switch · Asleep";
        // one fixed logo per input (same rule as the HA panel): PS5, PS3, Switch, Sky, else a plain HDMI icon
        var logo = isPs5 ? I.ps5 : isPs3 ? I.ps3 : isSwitch ? I.nswitch : /sky/i.test(a.title) ? I.sky : /ps\d|playstation/i.test(a.title) ? I.ps : I.hdmi;
        c.innerHTML = '<div class="ic">' + logo + '</div><div><h4>HDMI ' + n + "</h4><p>" + sub + "</p></div>";
        c._act = isPs5 ? function () { openPs5(a); } : function () { launch(a.id, null, "HDMI " + n); };
        row.appendChild(c);
      });
  }
  function readPs5() {
    if (!VICE) return;
    http("GET", VICE + "/api/ps5", null, function (code, r) {
      if (!r || !r.state) return;
      var key = JSON.stringify([r.state, r.playing, r.last]);
      if (key !== readPs5.key) { readPs5.key = key; ps5 = r.state; ps5Now = r.playing || null; ps5Last = r.last || null; redraw(drawInputs); }
    });
  }
  function readSwitch() {
    if (!VICE) return;
    http("GET", VICE + "/api/switch", null, function (code, r) {
      if (r && r.ok && r.on !== nsw) { nsw = r.on; redraw(drawInputs); }
    });
  }
  function readPs3() {
    if (!VICE) return;
    http("GET", VICE + "/api/ps3", null, function (code, r) {
      if (r && r.ok && JSON.stringify(r) !== JSON.stringify(ps3)) { ps3 = r; redraw(drawInputs); }
    });
  }
  function openPs5(a) {
    if (ps5 === "on" || !VICE) return launch(a.id, null, "the PS5");
    waking = true; redraw(drawInputs);
    http("POST", VICE + "/api/ps5/wake", {}, function (code, r) {
      waking = false;
      if (r && r.ok) { ps5 = "on"; redraw(drawInputs); launch(a.id, null, "the PS5"); }
      else { if (r && r.state) ps5 = r.state; redraw(drawInputs); toast((r && r.error) || "Couldn't reach the PC to wake the PS5"); }
    }, 40000);
  }

  // ---------- Play on PC ----------
  var pc = null;
  function readGames() {
    if (!VICE) return drawPc();
    http("GET", VICE + "/api/games", null, function (code, r) { pc = r && r.ok ? r : null; drawPc(); });
  }
  function drawPc() {
    var row = $("row-pc"); row.innerHTML = "";
    if (!pc || !pc.games || !pc.games.length) {
      $("pc-note").textContent = "";
      row.innerHTML = '<div class="empty">The PC isn\'t answering.</div>';
      return;
    }
    $("pc-note").textContent = "Streams from the PC with Moonlight";
    // no Desktop tile on the TV (Shane, 2026-11-13); Sunshine keeps the app for other devices
    pc.games.filter(function (g) { return g.kind !== "desktop"; }).forEach(function (g) {
      var t = document.createElement("div");
      var art = g.cover ? VICE + g.cover : g.kind === "bigpicture" || g.kind === "desktop" ? "img/pc-" + g.kind + ".png" : null;
      if (art) { t.className = "tile wide game"; t.innerHTML = '<img class="full" src="' + art + '" alt="">'; }
      else t.innerHTML = '<div class="mid">' + (g.kind === "desktop" ? I.monitor : I.play) + esc(g.kind === "bigpicture" ? "Big Picture" : g.name) + "</div>", t.className = "tile";
      t._act = function () {
        if (!pc.host_uuid) return toast("Sunshine isn't running on the PC");
        // Sunshine runs one app at a time: if another device is streaming something else, the TV would join that
        http("GET", VICE + "/api/games", null, function (code, r) {
          var running = r && r.running;
          var go = function () { launch("com.limelight.webos", { host_uuid: pc.host_uuid, host_app_id: g.app_id }, "Moonlight"); };
          if (!running || running === g.app_id) return go();
          var other = (r.games || []).filter(function (x) { return x.app_id === running; })[0];
          toast("Closing " + (other ? other.name : "the last session") + " on the PC…");
          http("POST", VICE + "/api/games/free", {}, function (c2, r2) {
            if (r2 && r2.ok) go(); else toast((r2 && r2.error) || "Couldn't reach the PC");
          }, 40000);
        });
      };
      row.appendChild(t);
    });
  }

  // ---------- GTA VI news: Rockstar Newswire posts with their photos and videos (vice-tv /api/gta6, written by
  // the bot's rockstar_news.py). OK on a card opens the post: Play video (YouTube app), Read on Rockstar (browser),
  // and its photos, each one full screen with OK. ----------
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function day(iso) { var d = iso ? iso.split("-") : null; return d ? +d[2] + " " + MONTHS[+d[1] - 1] : ""; }
  function media(x) { return x.videos.length ? "Video" : x.photos.length > 1 ? x.photos.length + " photos" : ""; }
  var newsTile = null, gtaPlayed = 0, gtaKey = "";
  // vice-tv's display-size copy of a news picture (Rockstar's are 3840x2160), the original if vice-tv can't make it
  function pic(sized, orig) {
    var src = sized && VICE ? VICE + sized : orig;
    return 'src="' + esc(src) + '"' + (src !== orig ? ' onerror="this.onerror=null;this.src=' + esc(JSON.stringify(orig)) + '"' : "");
  }
  function playtime(m) { m = Math.round(m); return m < 60 ? m + " min" : Math.floor(m / 60) + " h" + (m % 60 ? " " + (m % 60) + " m" : ""); }
  // "New" badges, remembered on the TV: a post is new from when it first appears until it's opened (or 3 days)
  function loadSeen() { try { return JSON.parse(localStorage.getItem("vice.gta6.seen")); } catch (e) { return null; } }
  function saveSeen(st) { try { localStorage.setItem("vice.gta6.seen", JSON.stringify(st)); } catch (e) {} }
  function readGta() {
    if (!VICE) return;
    http("GET", VICE + "/api/gta6", null, function (code, r) {
      var row = $("row-gta"), items = r && r.ok ? r.items : [];
      if (r && r.ok) { gtaPlayed = r.played_min || 0; tick(); }
      if (!items.length && row.children.length) return;  // keep what's shown if the PC doesn't answer
      var key = JSON.stringify(items.slice(0, 4));
      if (key === gtaKey) return;  // same posts: leave the row (and the focus on it) alone
      gtaKey = key;
      var keep = cur && cur.parentNode === row ? kids(row).indexOf(cur) : -1;
      row.innerHTML = "";
      document.querySelector(".gta-news").classList.toggle("hidden", !items.length);
      var st = loadSeen(), now = Date.now(), first = !st;
      st = st || { first: {}, opened: {} };
      items.forEach(function (x) { if (!(x.id in st.first)) st.first[x.id] = first ? 0 : now; });  // first start: nothing is "new"
      saveSeen(st);
      items.slice(0, 4).forEach(function (x) {  // four fit the row; the rows don't scroll sideways
        var t = document.createElement("div"), m = media(x);
        var isNew = !st.opened[x.id] && st.first[x.id] > 0 && now - st.first[x.id] < 3 * 864e5;
        t.className = "tile news";
        t.innerHTML = (x.image ? '<img class="full" ' + pic((x.image_sized || {}).small, x.image) + ' alt="">' : "") + '<div class="shade"></div>' +
          (isNew ? '<span class="new">NEW</span>' : "") +
          '<div class="txt"><p class="src">' + esc(day(x.date)) + (m ? " · " + m : "") + '</p><p class="hl">' + esc(x.title) + "</p></div>";
        t._act = function () {
          var s2 = loadSeen(); if (s2) { s2.opened[x.id] = 1; saveSeen(s2); }
          var b = t.querySelector(".new"); if (b) b.parentNode.removeChild(b);
          newsTile = t; openNews(x);
        };
        row.appendChild(t);
      });
      if (keep >= 0) focus(row.children[Math.min(keep, row.children.length - 1)]);
    });
  }
  function openNews(x) {
    var hero = x.image ? [(x.image_sized || {}).big, x.image] : x.photos[0] ? [x.photos[0].big, x.photos[0].url] : [null, ""];
    $("news-hero").onerror = hero[0] ? function () { this.onerror = null; this.src = hero[1]; } : null;
    $("news-hero").src = hero[0] && VICE ? VICE + hero[0] : hero[1];
    $("news-meta").textContent = (day(x.date) + " · Rockstar Newswire").toUpperCase();
    $("news-title").textContent = x.title;
    $("news-sub").textContent = x.subtitle || "";
    var btns = $("news-btns"); btns.innerHTML = "";
    var add = function (label, icon, act) {
      var b = document.createElement("span"); b.className = "btn"; b.innerHTML = (icon || "") + esc(label); b._act = act; btns.appendChild(b);
    };
    // leaving for YouTube or the browser closes the post, so you come back to the home screen
    var play = function (v) { return function () { closeSheet(); launch("youtube.leanback.v4", { contentTarget: "https://www.youtube.com/tv?v=" + v }, "YouTube"); }; };
    x.videos.forEach(function (v, i) { add(x.videos.length > 1 ? "Play video " + (i + 1) : "Play video", I.play, play(v)); });
    // a single photo is the big picture already: a button shows it full screen instead of a lone thumbnail
    if (x.photos.length <= 1) add("View picture", null, function () { openViewer(x.photos.length ? x.photos : [{ url: hero[1], big: hero[0], alt: x.title }], 0); });
    add("Read on Rockstar", null, function () { closeSheet(); launch("com.webos.app.browser", { target: x.url }, "the browser"); });
    var ph = $("news-photos"); ph.innerHTML = "";
    if (x.videos.length > 1) x.videos.forEach(function (v) {  // one video: the Play video button is enough
      var t = document.createElement("div"); t.className = "ph vid";
      t.innerHTML = '<img src="https://i.ytimg.com/vi/' + esc(v) + '/hqdefault.jpg" alt="Video">';
      t._act = play(v);
      ph.appendChild(t);
    });
    if (x.photos.length > 1) x.photos.slice(0, 16).forEach(function (p, i) {
      var t = document.createElement("div"); t.className = "ph";
      t.innerHTML = '<img ' + pic(p.small, p.url) + ' alt="' + esc(p.alt || "") + '">';
      t._act = function () { openViewer(x.photos, i); };
      ph.appendChild(t);
    });
    openSheet("news");
  }
  // full-screen photo: left/right for the next one, back or OK to close
  var viewer = null;
  function openViewer(list, i) { viewer = { list: list, i: i }; showPhoto(); $("viewer").classList.remove("hidden"); }
  function showPhoto() {
    var p = viewer.list[viewer.i];
    var im = $("viewer-img");
    im.onerror = p.big ? function () { im.onerror = null; im.src = p.url; } : null;
    im.src = p.big && VICE ? VICE + p.big : p.url; $("viewer-alt").textContent = p.alt || ""; $("viewer-n").textContent = (viewer.i + 1) + " / " + viewer.list.length;
  }
  function closeViewer() { viewer = null; $("viewer").classList.add("hidden"); }

  // ---------- settings tab ----------
  function drawSettings() {
    var row = $("row-set"); row.innerHTML = "";
    [["TV settings", I.gear, function () { launch("com.palm.app.settings", null, "TV settings"); }],
     ["All inputs", I.hdmi, function () { launch("com.webos.app.inputcommon", null, "the input list"); }],
     ["Homebrew Channel", I.grid, function () { launch("org.webosbrew.hbchannel", null, "Homebrew Channel"); }],
     ["Hide apps", I.eyeoff, function () { hideTile = this; openHide(); }],
     ["Reload home", I.refresh, function () { location.replace("boot.html"); }]
    ].forEach(function (s) {
      var t = document.createElement("div"); t.className = "tile";
      t.innerHTML = '<div class="mid">' + s[1] + esc(s[0]) + "</div>"; t._act = s[2]; row.appendChild(t);
    });
    var host = (BRIDGE || "").replace(/^https?:\/\//, "");
    // Vice Phone (2026-11-17): the code opens it on the tailnet, already paired (tools/make-remote-qr.py)
    $("about").innerHTML = '<img class="qr" src="img/remote-qr.svg" alt=""><div><b>Vice Phone</b>' +
      "<span>Point your phone's camera at the code to open the remote, already paired. Needs Tailscale on the phone.</span>" +
      "<span>" + (host ? "Bridge connected" : "Bridge not connected") + (param("offline") ? " · the PC isn't answering, so this is the offline copy" : "") + "</span></div>";
  }

  // ---------- light ----------
  // the same choices as the HA panel's light card (~/homelab/home-assistant/config/www/vice-panel)
  var LIGHT = [
    ["light-a", [["On", ["on"]], ["Off", ["off"]], ["Warm", ["white", "2700"]], ["Neutral", ["white", "4000"]], ["Cool", ["white", "6500"]]]],
    ["light-b", [["#ff4d6d", ["color", "255", "77", "109"], "Pink"], ["#9b5cff", ["color", "155", "92", "255"], "Purple"],
                 ["#3fa9ff", ["color", "63", "169", "255"], "Blue"], ["#ff9a3c", ["color", "255", "154", "60"], "Orange"]]],
    ["light-c", [["25%", ["brightness", "25"]], ["50%", ["brightness", "50"]], ["75%", ["brightness", "75"]], ["100%", ["brightness", "100"]]]]
  ];
  function drawLight() {
    LIGHT.forEach(function (r) {
      var row = $(r[0]); row.innerHTML = "";
      r[1].forEach(function (b) {
        var el = document.createElement("span");
        if (b[0][0] === "#") { el.className = "sw"; el.style.background = b[0]; }
        else { el.className = "btn"; el.textContent = b[0]; }
        el._cmd = b[1];
        el._act = function () { sendLight(b[1], b[2] || b[0]); };
        row.appendChild(el);
      });
    });
  }
  function sendLight(cmd, label) {
    if (!VICE) return toast("The PC isn't connected");
    $("light-note").textContent = label + "…";
    http("POST", VICE + "/api/light", { cmd: cmd }, function (code, r) {
      if (r && r.ok) readLight(); else $("light-note").textContent = (r && r.error) || "Couldn't reach the PC";
    }, 45000);
  }
  // what HA last sent the bulb: "On · 80% · Warm", and that choice marked
  function readLight() {
    if (!VICE) return;
    http("GET", VICE + "/api/light", null, function (code, r) {
      if (!r || !r.ok) return;
      var tone = "";
      LIGHT.forEach(function (row) {
        kids($(row[0])).forEach(function (el) {
          var c = el._cmd, on = false;
          if (c[0] === "on") on = r.on; else if (c[0] === "off") on = !r.on;
          else if (r.on && c[0] === "white") on = r.mode === "color_temp" && Math.abs(r.kelvin - c[1]) < 400;
          else if (r.on && c[0] === "color") on = r.mode !== "color_temp" && !!r.rgb && r.rgb.join(",") === c.slice(1).join(",");
          else if (r.on && c[0] === "brightness") on = Math.abs(r.pct - c[1]) < 3;
          el.classList.toggle("on", on);
          if (on && (c[0] === "white" || c[0] === "color")) tone = el.textContent || ({ "255,77,109": "Pink", "155,92,255": "Purple", "63,169,255": "Blue", "255,154,60": "Orange" })[c.slice(1).join(",")];
        });
      });
      $("light-note").textContent = r.on ? "On" + (r.pct ? " · " + r.pct + "%" : "") + (tone ? " · " + tone : "") : "Off";
    });
  }

  // ---------- Ask Claude ----------
  var asking = false;
  function ask(text) {
    text = (text || "").trim();
    if (!text || asking) return;
    if (!BRIDGE || param("offline")) { $("ask-out").textContent = "The PC isn't answering, so Claude can't help right now."; return; }
    asking = true;
    var out = $("ask-out"); out.className = "reply wait"; out.textContent = "Thinking…";
    $("ask-quick").innerHTML = "";
    http("POST", BRIDGE + "/api/ask", TV ? { text: text, tv: TV } : { text: text }, function (code, r) {
      asking = false;
      out.className = "reply";
      if (code === 409) { out.textContent = "Ask is switched off on the PC."; return; }
      if (!r) { out.textContent = "Couldn't reach Claude on the PC."; return; }
      out.textContent = r.say || r.reply || r.error || "Done.";
      (r.options || []).forEach(function (o) {
        var b = document.createElement("span"); b.className = "btn"; b.textContent = o.label;
        b._act = function () { ask(o.text); }; $("ask-quick").appendChild(b);
      });
      $("ask-in").value = ""; askLen = 0;
      if (sheet === "ask") focus(rows()[ (r.options || []).length ? 1 : 0 ][0]);
    }, 120000);
  }

  // ---------- tabs, sheets and focus ----------
  var tab = "home", sheet = null, cur = null;
  var tabs = Array.prototype.slice.call(document.querySelectorAll(".tab"));
  // A tab's page shows when focus rests on it (or on OK), not while passing over it: going right from Home to the
  // JARVIS or light button used to flip through Apps and Settings and leave you there (2026-11-12 inspection).
  var tabT, tabEntry = "home";
  tabs.forEach(function (t) {
    t._act = function () { clearTimeout(tabT); showTab(t.dataset.tab); };
    t._onfocus = function () { clearTimeout(tabT); tabT = setTimeout(function () { if (cur === t) showTab(t.dataset.tab); }, 350); };
  });
  // the round buttons belong to whichever page you came from
  function backToEntry() { clearTimeout(tabT); if (tab !== tabEntry) showTab(tabEntry); }
  $("btn-ask").innerHTML = I.sparkles; $("btn-ask")._act = function () { openSheet("ask"); }; $("btn-ask")._onfocus = backToEntry;
  $("btn-light").innerHTML = I.bulb; $("btn-light")._act = function () { openSheet("light"); }; $("btn-light")._onfocus = backToEntry;
  $("ask-go")._act = function () { ask($("ask-in").value); };
  $("ask-in")._act = function () { $("ask-in").focus(); };
  // LG's voice typing (hold the AI button while the box has the keyboard) drops the whole sentence in at once:
  // send it by itself. Letters typed one at a time still wait for Enter.
  var askLen = 0, askT;
  $("ask-in").addEventListener("input", function () {
    var v = $("ask-in").value, jump = v.length - askLen; askLen = v.length;
    clearTimeout(askT);
    if (jump >= 4) askT = setTimeout(function () { ask($("ask-in").value); }, 800);
  });

  function showTab(name) {
    if (tab === name) return;
    tab = name;
    tabs.forEach(function (t) { t.classList.toggle("on", t.dataset.tab === name); });
    ["home", "apps", "settings"].forEach(function (n) { $("page-" + n).classList.toggle("hidden", n !== name); });
    document.body.className = "tab-" + name + (radioOn() ? " radio" : "");  // keeps the radio wallpaper
  }
  function openSheet(name) {
    sheet = name; $("sheet-" + name).classList.remove("hidden");
    if (name === "light") readLight();
    if (name === "ask") setTimeout(function () { try { $("ask-in").focus(); } catch (e) {} }, 300);  // keyboard up, ready for voice
    focus(rows()[0][0]);
  }
  function closeSheet() {
    var was = sheet; sheet = null; $("sheet-" + was).classList.add("hidden");
    try { $("ask-in").blur(); } catch (e) {}
    focus($("btn-" + was) || (was === "news" && newsTile) || (was === "radio" && $("radio-tile")) || hideTile);
  }
  function kids(el) { return el ? Array.prototype.slice.call(el.children) : []; }
  function rows() {
    if (sheet === "apps") return kids($("apps-list")).map(kids);
    if (sheet === "light") return [kids($("light-a")), kids($("light-b")), kids($("light-c"))];
    if (sheet === "radio") return [kids($("radio-btns"))];
    if (sheet === "ask") return [[$("ask-in"), $("ask-go")], kids($("ask-quick"))].filter(function (r) { return r.length; });
    if (sheet === "news") { var ph = kids($("news-photos")), r2 = [kids($("news-btns"))]; for (var j = 0; j < ph.length; j += 8) r2.push(ph.slice(j, j + 8)); return r2; }
    var r = [tabs.concat([$("btn-ask"), $("btn-light")])];
    if (tab === "home") r.push(kids($("row-fav")), kids($("row-inputs")), kids($("row-pc")).filter(function (e) { return e._act; }), kids($("row-gta")));
    if (tab === "apps") { var c = kids($("grid")); for (var i = 0; i < c.length; i += 6) r.push(c.slice(i, i + 6)); }
    if (tab === "settings") r.push(kids($("row-set")));
    return r.filter(function (x, i) { return i === 0 || x.length; });
  }
  function where(el) {
    var r = rows();
    for (var i = 0; i < r.length; i++) { var j = r[i].indexOf(el); if (j >= 0) return [i, j, r]; }
    return [-1, -1, r];
  }
  function focus(el) {
    if (!el) return;
    if (!sheet && (!cur || where(cur)[0] !== 0) && where(el)[0] === 0) tabEntry = tab;  // entering the top bar
    if (cur) cur.classList.remove("f");
    cur = el; el.classList.add("f");
    if (el._onfocus) el._onfocus();
    var w = where(el);
    if (tab === "home" && !sheet) {
      var news = el.parentNode === $("row-gta");
      document.body.classList.toggle("deep", w[0] >= 3 || news);  // deep also hides the greeting
      document.body.classList.toggle("deeper", news);
    }
    if (tab === "apps" && !sheet) $("grid").style.transform = "translateY(" + (-Math.max(0, w[0] - 3) * 240) + "px)";
  }
  function centre(el) { var b = el.getBoundingClientRect(); return b.left + b.width / 2; }
  function move(dx, dy) {
    var w = where(cur), r = w[2];
    if (w[0] < 0) return focus(r[1] ? r[1][0] : r[0][0]);
    if (dx) { var row = r[w[0]], j = w[1] + dx; if (j >= 0 && j < row.length) focus(row[j]); return; }
    var i = w[0] + dy;
    if (i < 0 || i >= r.length) return;
    var x = centre(cur), best = r[i][0], bd = 1e9;
    if (i === 0 && !sheet) best = tabs.filter(function (t) { return t.dataset.tab === tab; })[0];
    else r[i].forEach(function (e) { var d = Math.abs(centre(e) - x); if (d < bd) { bd = d; best = e; } });
    focus(best);
  }
  function back() {
    if (sheet) return closeSheet();
    var w = where(cur);
    if (w[0] > 1) return focus(w[2][1][0]);
    if (w[0] === 1) return focus(tabs.filter(function (t) { return t.dataset.tab === tab; })[0]);
    if (tab !== "home") { showTab("home"); focus(tabs[0]); }
  }
  document.addEventListener("keydown", function (e) {
    var k = e.keyCode, typing = document.activeElement === $("ask-in");
    radio.idle = Date.now();
    if (document.body.classList.contains("ident")) { e.preventDefault(); endIdent(); return; }  // any key skips the Ident
    if (radio.view) {  // → skips the song; any other key only brings Home back
      e.preventDefault();
      if (e.keyCode === 39) skipRadio(); else hideNowView();
      return;
    }
    if (viewer) {
      if (k === 37 && viewer.i > 0) { viewer.i--; showPhoto(); }
      else if (k === 39 && viewer.i < viewer.list.length - 1) { viewer.i++; showPhoto(); }
      else if (k === 13 || k === 27 || k === 461 || e.key === "Escape") closeViewer();
      e.preventDefault(); return;
    }
    if (typing) {
      if (k === 13) { e.preventDefault(); ask($("ask-in").value); return; }
      // back closes the JARVIS sheet at once (on the TV the first back only hides LG's keyboard; this used to
      // need a third press). Up/down still leave the box for the Ask button.
      if (k === 27 || k === 461 || e.key === "Escape") { e.preventDefault(); closeSheet(); return; }
      if (k !== 38 && k !== 40) return;
      $("ask-in").blur();
    }
    if (k === 37) move(-1, 0); else if (k === 39) move(1, 0);
    else if (k === 38) move(0, -1); else if (k === 40) move(0, 1);
    else if (k === 13) { if (cur && cur._act) cur._act(); }
    else if (k === 27 || k === 461 || e.key === "Escape") back();
    else return;
    e.preventDefault();
  });

  // ---------- start, and refresh when the TV comes back to the home ----------
  function redraw(draw) {
    var keep = cur ? where(cur) : null;
    draw();
    if (keep && keep[0] >= 0 && !document.body.contains(cur)) {
      var r = rows()[keep[0]]; if (r && r.length) focus(r[Math.min(keep[1], r.length - 1)]);
    }
  }
  // Coming back to the home (Home button, leaving an app) used to rebuild every tile and lose the focus: now only
  // when the TV's app list changed. The clock catches up at once (timers are slowed while another app is in front).
  var appsKey = null;
  function refresh() {
    readApps();
    var k = JSON.stringify(allApps);
    if (k !== appsKey) { appsKey = k; redraw(function () { drawFavs(); drawInputs(); drawGrid(); drawSettings(); }); }
    tick(); weather(); lab(); readPs5(); readPs3(); readSwitch(); readGames(); readGta();
    var v = $("bgvid"); if (v.paused && !radioOn()) try { v.play(); } catch (e) {}
  }
  // another app or input in front: the wallpaper stops (frees the TV's video decoder) until the home shows again
  document.addEventListener("visibilitychange", function () { if (document.hidden) try { $("bgvid").pause(); } catch (e) {} });
  function every(ms, fn) { setInterval(function () { if (!document.hidden) fn(); }, ms); }

  // ---------- Vice Ident (vice-layer-plan.md): plays when the TV comes on, not on every Home press ----------
  // "Comes on" = HA saw the TV go from off to on in the last 3 minutes (vice-tv /api/tv/woke; Shane wants it at every
  // power-on, 2026-11-14), or Home hasn't been on screen for an hour (vice.seen, saved every minute while it shows).
  var IDENT_GAP = 3600000, identT = [];
  function seen() { try { localStorage.setItem("vice.seen", String(Date.now())); } catch (e) {} }
  function lastSeen() { try { return +localStorage.getItem("vice.seen") || 0; } catch (e) { return 0; } }
  // Home stays on screen while vice-tv answers (hiding it meant a black blink on every return to Home, 2026-11-15);
  // a yes cuts straight to the Ident, unless a key was pressed meanwhile.
  function identCheck() {
    if (param("noident")) return;
    var played = 0; try { played = +localStorage.getItem("vice.identAt") || 0; } catch (e) {}
    if (Date.now() - played < 240000) return;  // once per power-on: not again when Home comes back soon after
    if (Date.now() - lastSeen() >= IDENT_GAP || !VICE) return ident();
    var asked = Date.now();
    http("GET", VICE + "/api/tv/woke", null, function (code, r) {
      if (r && r.woke && radio.idle <= asked && Date.now() - asked < 1500 && !document.hidden) ident();
    }, 1500);
  }
  function ident() {
    try { localStorage.setItem("vice.identAt", String(Date.now())); } catch (e) {}
    var b = document.body;
    b.classList.add("ident-cut", "ident", "ident-1"); void b.offsetWidth; b.classList.remove("ident-cut");
    if (!radioOn()) jingle();  // silent while Vice Radio plays
    identT = [setTimeout(function () { b.classList.remove("ident-1"); }, 700),  // the date, greeting and info line
              setTimeout(endIdent, 2200)];                                     // then the top bar and rows
  }
  // The jingle needs the TV's media player, like the radio (see wallForRadio): the video is released first (the
  // Ident shows the still wallpaper meanwhile), the sound starts 600 ms later, and the video comes back when it ends.
  function jingle() {
    var v = $("bgvid"), a = new Audio("ident.mp3");
    try { v.pause(); v.removeAttribute("src"); v.load(); } catch (e) {}
    var back = function () {
      a.onended = a.onerror = null;
      if (!radioOn() && !v.getAttribute("src")) try { v.src = "wall.mp4"; v.load(); if (!document.hidden) v.play(); } catch (e) {}
    };
    a.onended = a.onerror = back;
    setTimeout(function () { try { var p = a.play(); if (p && p.catch) p.catch(back); } catch (e) { back(); } }, 600);
  }
  function endIdent() { identT.forEach(clearTimeout); document.body.classList.remove("ident", "ident-1"); osdNext(); }

  // ---------- Vice OSD (vice-layer-plan.md): pop-ups, top right, one at a time, waiting for the Ident ----------
  // From vice-tv (HA sends homelab problems etc. there; it only queues them while Home is on screen) and from here
  // (Vice Radio's new song). Same form as an Inputs card: icon or art, title, a line with a white part, a grey line.
  var OSD_IC = {
    server: ic('<rect width="20" height="8" x="2" y="2" rx="2"/><rect width="20" height="8" x="2" y="14" rx="2"/><path d="M6 6h.01M6 18h.01"/>'),
    phone: ic('<rect width="14" height="20" x="5" y="2" rx="2"/><path d="M12 18h.01"/>'),
    bell: ic('<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>'),
    radio: I.radio
  };
  var osdQ = [], osdOn = false, osdAfter = null, osdCur = null, osdDone = null;
  function osd(o) { osdQ.push(o); osdNext(); }
  // a tag cleared (e.g. the call was answered): drop those cards, and take the one showing off now
  function osdClear(tags) {
    if (!tags || !tags.length) return;
    osdQ = osdQ.filter(function (o) { return !o.tag || tags.indexOf(o.tag) < 0; });
    if (osdCur && osdCur.tag && tags.indexOf(osdCur.tag) >= 0 && osdDone) osdDone();
  }
  function osdNext() {
    if (osdOn || !osdQ.length || document.body.classList.contains("ident")) return;
    var o = osdQ.shift(), el = $("osd");
    el.innerHTML = '<div class="ic">' + (o.art ? '<div class="bl"></div><img alt="">' : OSD_IC[o.icon] || OSD_IC.bell) + "</div>" +
      "<div><h4>" + esc(o.title) + "</h4><p>" + (o.dot === "bad" ? '<span class="dot bad"></span>' : "") + esc(o.line) +
      (o.em ? (o.line ? " · " : "") + "<em>" + esc(o.em) + "</em>" : "") + (o.sub ? '<br><span class="last">' + esc(o.sub) + "</span>" : "") + "</p></div>";
    if (o.art) { el.querySelector(".bl").style.backgroundImage = 'url("' + o.art + '")'; el.querySelector("img").src = o.art; }
    el.classList.toggle("ours", o.accent === "pink");  // Vice Football: our goal
    osdOn = true; osdCur = o; el.classList.add("show");
    var t = setTimeout(osdDone = function () {
      clearTimeout(t); osdDone = null; osdCur = null;
      el.classList.remove("show");
      setTimeout(function () { osdOn = false; osdNext(); }, 400);
    }, (o.ttl || 8) * 1000);
  }
  function readOsd() {
    if (!VICE) return;
    // idle = seconds since the last remote press: after ~2 minutes LG's screensaver may cover Home without hiding
    // it, so vice-tv stops queueing (HA then uses the TV's own toast)
    var idle = Math.round((Date.now() - (radio.idle || 0)) / 1000);
    http("GET", VICE + "/api/osd?after=" + (osdAfter == null ? -1 : osdAfter) + "&idle=" + idle, null, function (code, r) {
      if (!r || !r.ok) return;
      if (osdAfter != null) (r.items || []).forEach(function (o) { if (o.art && o.art.charAt(0) === "/") o.art = VICE + o.art; osd(o); });
      osdAfter = r.last;
      osdClear(r.clear);
    });
  }
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { endIdent(); seen(); } else { radio.idle = Date.now(); identCheck(); seen(); }  // coming back = activity
  });
  // The TV keeps a saved copy of the bridge's settings (couch.configjs, read by config.js before this file runs).
  // Refresh it from the bridge on every start, so a change in config.json (like the 12-hour clock) reaches the TV.
  function readConfig() {
    if (!BRIDGE || param("offline")) return;
    var x = new XMLHttpRequest();
    x.open("GET", BRIDGE + "/tv/config.js");
    x.timeout = 8000;
    x.onload = function () {
      if (x.status !== 200 || x.responseText.indexOf("COUCH_CONFIG") < 0) return;
      try { localStorage.setItem("couch.configjs", x.responseText); } catch (e) {}
      try {
        (0, eval)(x.responseText);
        CFG = window.COUCH_CONFIG || CFG;
        NAME = (CFG.people && CFG.people[0] && CFG.people[0].name) || NAME;
        H24 = !CFG.home || CFG.home.clock !== "12h";
        tick();
      } catch (e) {}
    };
    x.send();
  }
  function start() {
    identCheck(); seen(); every(60000, seen);
    readOsd(); every(2000, readOsd);
    readConfig();
    (function next() { tick(); setTimeout(next, 60000 - (Date.now() % 60000) + 50); })();  // the clock changes exactly on the minute
    drawLight(); refresh();
    every(30000, lab); every(30000, readPs5); every(30000, readPs3); every(30000, readSwitch); every(15 * 60000, weather); every(10 * 60000, readGta);
    readRadio(); every(10000, readRadio); every(5000, checkIdle);
    focus($("row-fav").children[0] || tabs[0]);
    if (param("tab")) { showTab(param("tab")); focus(tabs.filter(function (t) { return t.dataset.tab === tab; })[0]); }  // preview only
    if (param("row")) setTimeout(function () { focus(rows()[+param("row")][0]); }, 1500);  // preview only
    // ask the bridge for the TV's apps on every start, so renamed inputs and new apps show up (the saved list was
    // only fetched on the first start, and HDMI 2 stayed "PS3" after it became the Switch, 2026-11-16)
    var first = !allApps.length;
    if (BRIDGE) http("GET", BRIDGE + "/api/webos/apps" + (TV ? "?tv=" + TV : ""), null, function (code, r) {
      if (!r || !r.apps) return;
      var json = JSON.stringify(r.apps);
      if (json === localStorage.getItem("couch.webos.apps")) return;
      try { localStorage.setItem("couch.webos.apps", json); } catch (e) {}
      refresh(); if (first) focus($("row-fav").children[0]);
    });
  }
  window.tv = { resume: function () { refresh(); } };
  start();
})();
