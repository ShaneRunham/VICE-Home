// Runs inside Vice Home on the TV (tveval.mjs). Muted MSE playback of the radio for 20 s: audio stalls, and whether the
// video wallpaper keeps moving at the same time. Returns a log.
(async function () {
  var HEAD = window.__head || 3, t0 = Date.now(), log = [], v = document.getElementById("bgvid");
  var vice = (window.COUCH_WEBOS && window.COUCH_WEBOS.bridge || "").replace(/:5400\/?$/, ":5401");
  var a = new Audio(); a.muted = true;
  ["playing", "waiting", "stalled", "error", "ended"].forEach(function (n) { a.addEventListener(n, function () { log.push("a:" + n + "@" + (Date.now() - t0)); }); });
  var ms = new MediaSource(); a.src = URL.createObjectURL(ms);
  await new Promise(function (r) { ms.addEventListener("sourceopen", r, { once: true }); });
  var sb = ms.addSourceBuffer("audio/mpeg"), q = [], busy = false, stop = false, bytes = 0;
  var pump = function () { if (busy || !q.length || sb.updating) return; busy = true; sb.appendBuffer(q.shift()); };
  sb.addEventListener("updateend", function () { busy = false; pump(); });
  var res = await fetch(vice + "/radio?head=" + HEAD);
  var rd = res.body.getReader();
  (async function () { while (!stop) { var x = await rd.read(); if (x.done) break; bytes += x.value.length; q.push(x.value); pump(); } })();
  a.play().then(function () { log.push("a:play-ok@" + (Date.now() - t0)); }, function (e) { log.push("a:play-fail " + e); });
  var la = 0, lv = v.currentTime, stuckA = 0, stuckV = 0, vStart = v.currentTime;
  await new Promise(function (r) {
    var iv = setInterval(function () {
      if (a.currentTime === la && a.currentTime > 0) stuckA++; la = a.currentTime;
      if (v.currentTime === lv) stuckV++; lv = v.currentTime;
      if (Date.now() - t0 > 20000) { clearInterval(iv); r(); }
    }, 250);
  });
  stop = true; try { rd.cancel(); } catch (e) {}
  var out = { log: log, audioPlayed: +a.currentTime.toFixed(1), audioStuckTicks: stuckA, videoMoved: +(v.currentTime - vStart).toFixed(1),
    videoStuckTicks: stuckV, videoPaused: v.paused, bufferedAhead: a.buffered.length ? +(a.buffered.end(0) - a.currentTime).toFixed(1) : 0, bytes: bytes };
  a.pause(); a.removeAttribute("src"); a.load();
  return out;
})()
