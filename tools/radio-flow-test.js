// Runs inside Vice Home on the TV (tveval.mjs): the whole Vice Radio flow with every player muted, driven by simulated
// remote keys. Returns what was seen at each step.
(async function () {
  var out = {}, sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var origPlay = HTMLMediaElement.prototype.play, realNow = Date.now;
  HTMLMediaElement.prototype.play = function () { this.muted = true; if (!this.id) window.__a = this; return origPlay.call(this); };
  var key = async function (c) { document.dispatchEvent(new KeyboardEvent("keydown", { keyCode: c, which: c, bubbles: true })); await sleep(350); };
  var $ = function (id) { return document.getElementById(id); };
  var state = function () {
    var t = $("radio-tile"), a = window.__a, v = $("bgvid");
    return { tile: t && t.textContent.replace(/\s+/g, " ").trim(), playingBadge: !!(t && t.querySelector(".live")),
      audioT: a ? +a.currentTime.toFixed(1) : null, audioPaused: a ? a.paused : null, bodyRadio: document.body.classList.contains("radio"),
      video: { paused: v.paused, src: v.getAttribute("src") }, info: ($("np") || {}).textContent, sheet: !$("sheet-radio").classList.contains("hidden"),
      nowview: !$("nowview").classList.contains("off"), toast: $("toast").classList.contains("show") ? $("toast").textContent : "" };
  };
  try {
    for (var i = 0; i < 8; i++) await key(38);          // up to the top bar
    await key(40);                                        // Favorites
    for (i = 0; i < 7; i++) await key(39);               // right to Vice Radio
    out.focused = document.querySelector(".f") && document.querySelector(".f").id;
    await key(13); await sleep(4000); out.playing = state();
    await sleep(4000); out.playing8s = state();
    await key(13); out.menu = state(); out.menuButtons = Array.prototype.map.call($("radio-btns").children, function (b) { return b.textContent; });
    var before = window.__a && window.__a.currentTime;
    await key(13); await sleep(2500); out.afterSkip = state();
    Date.now = function () { return realNow() + 4 * 60000; };
    await sleep(16000); out.idle = state(); out.nvTitle = $("nv-title").textContent; out.nvHint = $("nv-hint").textContent;
    await key(39); await sleep(2500); out.nowviewSkip = state();
    await key(40); out.afterKey = state();
    Date.now = realNow;
    await key(13); await key(39); await key(13); await sleep(3000); out.stopped = state();
    out.videoMovingAfterStop = (function (v) { var t = v.currentTime; return new Promise(function (r) { setTimeout(function () { r(+(v.currentTime - t).toFixed(1)); }, 1500); }); })($("bgvid"));
    out.videoMovingAfterStop = await out.videoMovingAfterStop;
  } catch (e) { out.error = String(e); }
  Date.now = realNow; HTMLMediaElement.prototype.play = origPlay;
  return out;
})()
