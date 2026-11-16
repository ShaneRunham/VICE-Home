// TEST BUILD ONLY: frame times for 600 ms after each key press, sent to the PC logger, and a
// runtime switch of CSS variants (class on <html>) read from the logger on start and on resume.
(function () {
  var LOG = (window.COUCH_WEBOS || {}).log; if (!LOG) return;
  function post(k, d) { try { var x = new XMLHttpRequest(); x.open("POST", LOG + "/" + k); x.setRequestHeader("Content-Type", "text/plain"); x.send(JSON.stringify(d)); } catch (e) {} }
  function variant() {
    var x = new XMLHttpRequest(); x.open("GET", LOG + "/variant?" + Date.now());
    x.onload = function () { document.documentElement.className = x.responseText.trim(); post("variant", { v: x.responseText.trim() }); };
    x.send();
  }
  variant();
  document.addEventListener("visibilitychange", function () { if (!document.hidden) variant(); });
  document.addEventListener("webOSRelaunch", variant);
  var last = 0, win = null;
  (function f(t) {
    if (win && last) { win.iv.push(t - last); if (t - win.t0 > 600) { var iv = win.iv; post("key", { v: document.documentElement.className, k: win.k, n: iv.length, max: Math.round(Math.max.apply(null, iv)), over20: iv.filter(function (x) { return x > 20; }).length, over35: iv.filter(function (x) { return x > 35; }).length, first: Math.round(win.first) }); win = null; } }
    last = t; requestAnimationFrame(f);
  })(performance.now());
  document.addEventListener("keydown", function (e) {
    var t0 = performance.now(); win = { t0: t0, k: e.keyCode, iv: [], first: 0 };
    var w = win; requestAnimationFrame(function () { requestAnimationFrame(function () { w.first = performance.now() - t0; }); });
  }, true);
})();
