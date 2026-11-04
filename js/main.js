/* ==========================================================================
   MẪU 2 — STORYBOARD
   Một vòng rAF duy nhất. Camera bảng là hàm thuần của vị trí cuộn:
   đường lửa chỉ tiến khi cuộn xuống và lùi khi cuộn ngược.
   ========================================================================== */

(function () {
  'use strict';

  document.documentElement.classList.add('js');

  var W = window;
  var D = document;

  var reduceMQ = W.matchMedia('(prefers-reduced-motion: reduce)');
  var reduce = reduceMQ.matches;

  var board = D.getElementById('board');
  var tiltEl = D.getElementById('board-tilt');
  var navbar = D.querySelector('.navbar');
  var progressBar = D.getElementById('scroll-progress-bar');
  var flameHead = D.getElementById('flame-head');
  var heroStage = D.getElementById('hero-stage');
  var boardToggle = D.getElementById('board-toggle');

  var frames = Array.prototype.slice.call(D.querySelectorAll('.frame'));
  var steps = Array.prototype.slice.call(D.querySelectorAll('.step'));

  var SCENES = ['hero', 'origins', 'challenge', 'core', 'evolution', 'epilogue'];
  var COL_OF = [0, 1, 1, 0, 0, 1];
  var ROW_OF = [0, 0, 1, 1, 2, 2];
  var SVG_NS = 'http://www.w3.org/2000/svg';

  var L = {
    vw: 0,
    vh: 0,
    navH: 0,
    frameW: 0,
    frameH: 0,
    boardW: 0,
    boardH: 0,
    timing: { entry: 0, holdA: 0, holdB: 0, exit: 0 },
    scenes: []
  };

  var activeIndex = -2;
  var overview = false;
  var tween = null;
  var camNow = null;
  var dirty = true;
  var visible = true;
  var rafId = 0;
  var lastY = -1e9;
  var lastW = -1;
  var lastU = -1;
  var lastProgY = -1e9;
  var moved = false;
  var mapStarted = false;
  var overviewAnchor = 0;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  function lerpCam(a, b, t) {
    return {
      k: a.k + (b.k - a.k) * t,
      tx: a.tx + (b.tx - a.tx) * t,
      ty: a.ty + (b.ty - a.ty) * t,
      tilt: a.tilt + (b.tilt - a.tilt) * t
    };
  }

  /* ---------------------------------------------------------------- camera */

  function focusCam(i, pan) {
    var s = L.scenes[i];
    var topGap = Math.max(L.navH + 14, Math.round((L.vh - L.frameH) / 2));
    return {
      k: 1,
      tx: Math.round((L.vw - L.frameW) / 2) - s.x,
      ty: topGap - s.y,
      tilt: 0
    };
  }

  function bridgeCam(i, j) {
    var a = L.scenes[i];
    var b = L.scenes[j];
    var k = 0.78;
    var cx = (a.x + b.x) / 2 + L.frameW / 2;
    var cy = (a.y + b.y) / 2 + L.frameH / 2;
    return { k: k, tx: L.vw / 2 - cx * k, ty: L.vh / 2 - cy * k, tilt: 6 };
  }

  function overviewCam() {
    var pad = 26;

    if (L.single) {
      /* Một cột trên điện thoại: phóng vừa chiều ngang, neo quanh khung đang xem. */
      var km = Math.min((L.vw - pad * 2) / L.boardW, 1) * 0.58;
      var anchor = L.scenes[overviewAnchor] || L.scenes[0];
      var cy = anchor ? anchor.y + L.frameH / 2 : L.boardH / 2;
      var top = L.navH + 12;
      var ty = Math.round(top + (L.vh - top) / 2 - cy * km);
      var maxTy = Math.round(top);
      var minTy = Math.round(top + (L.vh - top) - L.boardH * km);
      if (ty > maxTy) { ty = maxTy; }
      if (ty < minTy) { ty = minTy; }
      return { k: km, tx: Math.round((L.vw - L.boardW * km) / 2), ty: ty, tilt: 8 };
    }

    var k = Math.min(
      (L.vw - pad * 2) / L.boardW,
      (L.vh - L.navH - pad * 2) / L.boardH,
      1
    );
    return {
      k: k,
      tx: Math.round((L.vw - L.boardW * k) / 2),
      ty: Math.round(L.navH + (L.vh - L.navH - L.boardH * k) / 2),
      tilt: 9
    };
  }

  /* ----------------------------------------------------------- the timeline */

  function stateAt(y) {
    if (overview) {
      return { cam: overviewCam(), i: -1, pan: 0, u: Math.max(0, overviewAnchor), ignite: 1 };
    }

    var n = L.scenes.length;
    var idx = 0;
    var i;

    for (i = 0; i < n; i++) {
      if (y >= L.scenes[i].top - 1) { idx = i; }
    }

    var s = L.scenes[idx];
    var o = y - s.top;
    var t = L.timing;
    var A = t.entry;
    var B = A + t.holdA;
    var C = B + s.pan;
    var D = C + t.holdB;
    var E = D + s.exitH;

    var cam;
    var pan = 0;
    var u = idx;
    var ignite = 1;

    if (o < A) {
      var p = reduce ? 1 : easeOut(clamp(o / Math.max(1, A), 0, 1));
      var from = idx === 0 ? overviewCam() : bridgeCam(idx - 1, idx);
      cam = lerpCam(from, focusCam(idx, 0), p);
      if (idx === 0) { ignite = p; }
    } else if (o < B) {
      cam = focusCam(idx, 0);
    } else if (o < C) {
      pan = ((o - B) / Math.max(1, C - B)) * s.pan;
      cam = focusCam(idx, pan);
    } else if (o < D) {
      pan = s.pan;
      cam = focusCam(idx, s.pan);
    } else if (idx < n - 1) {
      pan = s.pan;
      var q = clamp((o - D) / Math.max(1, E - D), 0, 1);
      if (reduce) {
        cam = focusCam(idx, s.pan);
        u = idx + 1;
      } else {
        cam = lerpCam(focusCam(idx, s.pan), bridgeCam(idx, idx + 1), easeOut(q));
        u = idx + easeInOut(q);
      }
    } else {
      pan = s.pan;
      cam = focusCam(idx, s.pan);
    }

    if (reduce) { u = 5; }

    return { cam: cam, i: idx, pan: pan, u: u, ignite: ignite };
  }

  /* --------------------------------------------------------------- measure */

  function measure() {
    var vw = Math.round(W.innerWidth);
    var vh = Math.round(W.innerHeight);
    var single = vw < 900;

    L.vw = vw;
    L.vh = vh;
    L.single = single;
    L.navH = navbar ? Math.round(navbar.getBoundingClientRect().height) : 76;

    var fw = single ? Math.min(vw - 32, 720) : Math.min(1080, vw - 96);
    var fh = single ? vh - L.navH - 104 : Math.min(700, vh - L.navH - 56);

    L.frameW = Math.round(Math.max(280, fw));
    L.frameH = Math.round(Math.max(400, fh));

    var gap = single ? 64 : 120;
    var margin = single ? 18 : 120;
    var rows = single ? 6 : 3;

    L.boardW = single ? L.frameW + margin * 2 : L.frameW * 2 + margin * 2 + gap;
    L.boardH = L.frameH * rows + margin * 2 + gap * (rows - 1);

    var root = D.documentElement;
    root.style.setProperty('--frame-w', L.frameW + 'px');
    root.style.setProperty('--frame-h', L.frameH + 'px');
    root.style.setProperty('--board-w', L.boardW + 'px');
    root.style.setProperty('--board-h', L.boardH + 'px');
    root.style.setProperty('--nav-h', L.navH + 'px');

    /* Đo trong hệ toạ độ bảng chưa biến đổi. */
    board.style.transform = 'none';
    tiltEl.style.transform = 'rotateX(0deg)';
    board.classList.add('is-measuring');

    var i;
    for (i = 0; i < frames.length; i++) {
      var f = frames[i];
      var col = single ? 0 : COL_OF[i];
      var row = single ? i : ROW_OF[i];
      var x = margin + col * (L.frameW + gap);
      var y = margin + row * (L.frameH + gap);
      f.style.left = x + 'px';
      f.style.top = y + 'px';
      L.scenes[i] = L.scenes[i] || {};
      L.scenes[i].x = x;
      L.scenes[i].y = y;
      L.scenes[i].el = f;
      L.scenes[i].body = f.querySelector('.frame-body');
      L.scenes[i].body.style.transform = 'none';
    }

    for (i = 0; i < frames.length; i++) {
      var sc = L.scenes[i];
      var bodyRect = sc.body.getBoundingClientRect();
      sc.pan = Math.max(0, sc.body.offsetHeight - L.frameH);
      sc.glow = Array.prototype.map.call(
        sc.body.querySelectorAll('[data-glow]'),
        function (el) {
          var r = el.getBoundingClientRect();
          return { el: el, top: r.top - bodyRect.top, h: r.height };
        }
      );
    }

    var entry = Math.round(vh * 0.55);
    var holdA = Math.round(vh * 0.16);
    var holdB = Math.round(vh * 0.14);
    var exit = Math.round(vh * 0.5);
    L.timing = { entry: entry, holdA: holdA, holdB: holdB, exit: exit };

    var top = 0;
    for (i = 0; i < steps.length; i++) {
      var sc2 = L.scenes[i];
      var isLast = i === steps.length - 1;
      var exitH = isLast ? Math.round(vh * 0.3) : exit;
      var h = entry + holdA + sc2.pan + holdB + exitH + (isLast ? vh : 0);
      steps[i].style.height = h + 'px';
      sc2.exitH = exitH;
      sc2.top = top;
      top += h;
    }

    board.classList.remove('is-measuring');

    buildFlame();
    lastU = -1;
    lastCam = '';
    lastPanIdx = -99;
    lastGlowKey = '';
    dirty = true;
  }

  /* ------------------------------------------------------------ flame path */

  function buildFlame() {
    var n = L.scenes.length;
    var pts = [];
    var i;

    for (i = 0; i < n; i++) {
      pts.push({
        x: L.scenes[i].x + L.frameW / 2,
        y: L.scenes[i].y + L.frameH / 2
      });
    }

    var radius = Math.round(L.frameH * 0.18);
    var d = 'M ' + pts[0].x + ' ' + pts[0].y;

    for (i = 1; i < n - 1; i++) {
      var a = pts[i - 1];
      var p = pts[i];
      var b = pts[i + 1];
      var d1x = p.x === a.x ? 0 : (p.x > a.x ? 1 : -1);
      var d1y = p.y === a.y ? 0 : (p.y > a.y ? 1 : -1);
      var d2x = b.x === p.x ? 0 : (b.x > p.x ? 1 : -1);
      var d2y = b.y === p.y ? 0 : (b.y > p.y ? 1 : -1);
      var l1 = Math.abs(p.x - a.x) + Math.abs(p.y - a.y);
      var l2 = Math.abs(b.x - p.x) + Math.abs(b.y - p.y);
      var rr = Math.min(radius, l1 / 2, l2 / 2);
      d += ' L ' + (p.x - d1x * rr) + ' ' + (p.y - d1y * rr);
      d += ' Q ' + p.x + ' ' + p.y + ' ' + (p.x + d2x * rr) + ' ' + (p.y + d2y * rr);
    }

    d += ' L ' + pts[n - 1].x + ' ' + pts[n - 1].y;

    var track = D.getElementById('flame-track');
    var halo = D.getElementById('flame-halo');
    var lit = D.getElementById('flame-lit');
    var grad = D.getElementById('flame-stroke');

    if (!track || !lit) { return; }

    track.setAttribute('d', d);
    if (halo) { halo.setAttribute('d', d); }
    lit.setAttribute('d', d);

    if (grad) {
      grad.setAttribute('gradientUnits', 'userSpaceOnUse');
      grad.setAttribute('x1', '0');
      grad.setAttribute('y1', '0');
      grad.setAttribute('x2', String(L.boardW));
      grad.setAttribute('y2', String(L.boardH));
    }

    L.flameLen = track.getTotalLength();

    /* Mốc độ dài tại tâm từng khung, để ánh sáng tới đúng khung. */
    var samples = [];
    var steps = 480;
    for (i = 0; i <= steps; i++) {
      var sl = L.flameLen * i / steps;
      var sp = track.getPointAtLength(sl);
      samples.push({ l: sl, x: sp.x, y: sp.y });
    }

    L.stops = pts.map(function (c) {
      var best = 0;
      var bd = Infinity;
      for (var q = 0; q < samples.length; q++) {
        var dx = samples[q].x - c.x;
        var dy = samples[q].y - c.y;
        var dd = dx * dx + dy * dy;
        if (dd < bd) { bd = dd; best = samples[q].l; }
      }
      return best;
    });

    L.samples = samples;
    L.stops[0] = 0;
    L.stops[n - 1] = L.flameLen;
    lit.style.strokeDasharray = L.flameLen + ' ' + L.flameLen;
    if (halo) { halo.style.strokeDasharray = L.flameLen + ' ' + L.flameLen; }
    lastU = -1;
    lastK = -1;
    setFlameWidth(1);
  }

  function updateFlame(u) {
    if (!L.flameLen || !L.stops) { return; }
    if (Math.abs(u - lastU) < 0.0005) { return; }
    lastU = u;

    var n = L.stops.length - 1;
    var f = clamp(u, 0, n);
    var i = Math.min(Math.floor(f), n - 1);
    var t = f - i;
    var len = L.stops[i] + (L.stops[i + 1] - L.stops[i]) * t;

    var lit = D.getElementById('flame-lit');
    var halo = D.getElementById('flame-halo');
    var head = D.getElementById('flame-head');
    var core = D.getElementById('flame-core');

    var off = (L.flameLen - len).toFixed(1);
    lit.style.strokeDashoffset = off;
    if (halo) { halo.style.strokeDashoffset = off; }

    var pt = sampleAt(len);
    head.setAttribute('cx', pt.x.toFixed(1));
    head.setAttribute('cy', pt.y.toFixed(1));
    head.style.opacity = len > 4 ? '1' : '0.35';
    if (core) {
      core.setAttribute('cx', pt.x.toFixed(1));
      core.setAttribute('cy', pt.y.toFixed(1));
      core.style.opacity = len > 4 ? '1' : '0.35';
    }
  }

  function sampleAt(len) {
    var s = L.samples;
    if (!s || !s.length) { return { x: 0, y: 0 }; }
    var lo = 0;
    var hi = s.length - 1;
    while (hi - lo > 1) {
      var mid = (lo + hi) >> 1;
      if (s[mid].l < len) { lo = mid; } else { hi = mid; }
    }
    var a = s[lo];
    var b = s[hi];
    var t = b.l > a.l ? (len - a.l) / (b.l - a.l) : 0;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  /* ------------------------------------------------------------- frame UI */

  function setActive(idx) {
    if (idx === activeIndex) { return; }

    var prev = activeIndex >= 0 && L.scenes[activeIndex] ? L.scenes[activeIndex] : null;
    var next = idx >= 0 && L.scenes[idx] ? L.scenes[idx] : null;
    activeIndex = idx;

    if (prev && prev !== next) {
      prev.el.classList.remove('is-active');
      prev.el.classList.remove('is-lit');
      prev.body.style.transform = 'translate3d(0px, 0px, 0px)';
      var pc = prev.el.querySelector('.frame-cover');
      if (pc) { pc.setAttribute('inert', ''); }
    }

    if (next) {
      next.el.classList.add('is-active');
      next.el.classList.add('is-lit');
      var nc = next.el.querySelector('.frame-cover');
      if (nc) { nc.setAttribute('inert', ''); }
    }

    /* Từ toàn cảnh bước vào một cảnh: khóa lại các ảnh bìa. */
    if (prev === null && idx >= 0) {
      for (var k = 0; k < L.scenes.length; k++) {
        var ck = L.scenes[k].el.querySelector('.frame-cover');
        if (ck) { ck.setAttribute('inert', ''); }
      }
    }

    /* Chế độ toàn cảnh: mọi ảnh bìa bấm được. */
    if (idx === -1) {
      for (var i = 0; i < L.scenes.length; i++) {
        var s2 = L.scenes[i];
        s2.el.classList.remove('is-active');
        s2.el.classList.remove('is-lit');
        var c2 = s2.el.querySelector('.frame-cover');
        if (c2) { c2.removeAttribute('inert'); }
      }
    }

    if (idx >= 0) {
      W.setTimeout(function () { warmNext(idx); }, 900);
    }
  }

  var warmed = {};

  function warmScene(idx) {
    if (warmed[idx] || !L.scenes[idx]) { return; }
    warmed[idx] = true;
    var imgs = L.scenes[idx].body.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      var el = imgs[i];
      if (!el.getAttribute('src') || el.getAttribute('data-warm') === '1') { continue; }
      el.setAttribute('data-warm', '1');
      el.loading = 'eager';
      if (el.decode) { el.decode().catch(function () {}); }
    }
  }

  /* Nạp và giải mã trước ảnh của cảnh kế, để lúc chuyển cảnh không bị khựng. */
  function warmNext(idx) {
    warmScene(idx + 1);
    warmScene(idx + 2);
  }

  var lastPanIdx = -99;
  var lastPanVal = -1;

  function applyPan(idx, pan) {
    if (idx < 0 || !L.scenes[idx]) { return; }
    if (idx === lastPanIdx && Math.abs(pan - lastPanVal) < 0.3) { return; }
    lastPanIdx = idx;
    lastPanVal = pan;
    var body = L.scenes[idx].body;
    body.style.transform = 'translate3d(0px, ' + (-Math.round(pan * 100) / 100) + 'px, 0px)';
  }

  var lastGlowKey = '';

  function applyGlow(idx, pan) {
    if (idx < 0 || !L.scenes[idx]) { return; }
    var gk = idx + '|' + Math.round(pan / 24);
    if (gk === lastGlowKey) { return; }
    lastGlowKey = gk;
    var s = L.scenes[idx];
    var top = pan + 30;
    var bottom = pan + L.frameH - 20;
    for (var i = 0; i < s.glow.length; i++) {
      var g = s.glow[i];
      var lit = g.top < bottom && g.top + g.h > top;
      if (g.el.classList.contains('is-lit') !== lit) {
        g.el.classList.toggle('is-lit', lit);
      }
    }
  }

  var lastTilt = -1;
  var lastK = -1;

  function setFlameWidth(k) {
    var w = 2.4 / k;
    var track = D.getElementById('flame-track');
    var halo = D.getElementById('flame-halo');
    var lit = D.getElementById('flame-lit');
    var head = D.getElementById('flame-head');
    var core = D.getElementById('flame-core');
    if (track) { track.setAttribute('stroke-width', (w * 0.75).toFixed(2)); }
    if (halo) { halo.setAttribute('stroke-width', (w * 3.6).toFixed(2)); }
    if (lit) { lit.setAttribute('stroke-width', (w * 1.7).toFixed(2)); }
    if (head) { head.setAttribute('r', (w * 5.2).toFixed(2)); }
    if (core) { core.setAttribute('r', (w * 1.6).toFixed(2)); }
  }

  var lastCam = '';

  function applyCam(c) {
    var k = c.k;
    var round = Math.abs(k - 1) < 0.0006;
    var tx = round ? Math.round(c.tx) : Math.round(c.tx * 10) / 10;
    var ty = round ? Math.round(c.ty) : Math.round(c.ty * 10) / 10;
    var sig = tx + '|' + ty + '|' + (Math.round(k * 10000) / 10000);

    if (sig !== lastCam) {
      lastCam = sig;
      board.style.transform =
        'translate3d(' + tx + 'px, ' + ty + 'px, 0) scale(' + (Math.round(k * 10000) / 10000) + ')';
    }

    if (c.tilt !== lastTilt) {
      lastTilt = c.tilt;
      tiltEl.style.transform = 'rotateX(' + (Math.round(c.tilt * 100) / 100) + 'deg)';
    }

    if (Math.abs(k - lastK) > 0.04) {
      lastK = k;
      setFlameWidth(k);
    }
  }

  /* ---------------------------------------------------------------- render */

  function render(now) {
    if (!L.scenes.length) { return; }

    var y = W.scrollY;
    var st = stateAt(y);
    var vis = st.i === 0 && y < 2 && !overview ? -1 : st.i;

    setActive(vis);
    applyPan(vis, st.pan);
    applyGlow(vis, st.pan);

    if (heroStage) {
      heroStage.style.setProperty('--ignite', String(st.ignite));
    }

    updateFlame(st.u);

    var cam = st.cam;

    if (tween) {
      var t = clamp((now - tween.t0) / tween.dur, 0, 1);
      cam = lerpCam(tween.from, cam, easeInOut(t));
      if (t >= 1) { tween = null; }
    }
    applyCam(cam);
    camNow = cam;

    var boardEl = board;
    if (overview !== boardEl.classList.contains('is-overview')) {
      boardEl.classList.toggle('is-overview', overview);
    }

    if (progressBar && Math.abs(y - lastProgY) > 2) {
      lastProgY = y;
      var max = D.documentElement.scrollHeight - L.vh;
      var p = max > 0 ? clamp(y / max, 0, 1) : 0;
      progressBar.style.width = (p * 100).toFixed(2) + '%';
    }

    lastY = y;
    lastW = W.innerWidth;
    dirty = false;
  }

  function tick(now) {
    rafId = 0;
    if (!visible) { return; }
    if (dirty || tween || W.innerWidth !== lastW || Math.abs(W.scrollY - lastY) > 0.4) {
      render(now);
    }
    rafId = W.requestAnimationFrame(tick);
  }

  /* ------------------------------------------------------------ navigation */

  function scrollToScene(index, instant) {
    if (!L.scenes[index]) { return; }
    if (overview) { overview = false; }
    var target = index === 0 ? 0 : L.scenes[index].top + L.timing.entry + 2;
    W.scrollTo({
      top: Math.round(target),
      behavior: instant || reduce ? 'auto' : 'smooth'
    });
  }

  function sceneIndexFromHash() {
    var id = decodeURIComponent((W.location.hash || '').replace(/^#/, ''));
    return SCENES.indexOf(id);
  }

  function setOverview(on) {
    if (on === overview) { return; }
    if (on && activeIndex >= 0) { overviewAnchor = activeIndex; }
    overview = on;
    if (!camNow) { dirty = true; return; }
    tween = reduce ? null : { from: camNow, t0: performance.now(), dur: 520 };
    dirty = true;
    if (on) {
      W.requestAnimationFrame(function () {
        if (activeIndex !== -1) { setActive(-1); }
      });
    }
  }

  D.addEventListener('click', function (e) {
    var hit = e.target.closest ? e.target.closest('[data-goto]') : null;
    if (hit) {
      e.preventDefault();
      var n = parseInt(hit.getAttribute('data-goto'), 10);
      if (!isNaN(n)) {
        if (W.location.hash !== '#' + SCENES[n]) {
          W.history.pushState(null, '', '#' + SCENES[n]);
        }
        scrollToScene(n);
      }
      return;
    }

    var a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!a) { return; }
    var id = (a.getAttribute('href') || '').slice(1);
    var idx = SCENES.indexOf(id);
    if (idx < 0) { return; }
    e.preventDefault();
    if (W.location.hash !== '#' + id) {
      W.history.pushState(null, '', '#' + id);
    }
    scrollToScene(idx);
  });

  W.addEventListener('hashchange', function () {
    var idx = sceneIndexFromHash();
    if (idx >= 0) { scrollToScene(idx); }
  });

  W.addEventListener('popstate', function () {
    var idx = sceneIndexFromHash();
    if (idx >= 0) { scrollToScene(idx); }
  });

  if (boardToggle) {
    boardToggle.addEventListener('click', function () {
      setOverview(!overview);
    });
  }

  /* Tab vào nội dung của cảnh khác thì đưa camera tới cảnh đó. */
  D.addEventListener('focusin', function (e) {
    var frame = e.target.closest ? e.target.closest('.frame') : null;
    if (!frame || !L.scenes.length) { return; }
    for (var i = 0; i < L.scenes.length; i++) {
      if (L.scenes[i].el === frame) {
        if (i !== activeIndex) { scrollToScene(i); }
        return;
      }
    }
  });

  D.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !overview) {
      setOverview(true);
    }
  });

  function markMoved() { moved = true; }

  W.addEventListener('wheel', markMoved, { passive: true });
  W.addEventListener('touchstart', markMoved, { passive: true });
  W.addEventListener('pointerdown', markMoved, { passive: true });
  W.addEventListener('keydown', markMoved, { passive: true });

  W.addEventListener('scroll', function () {
    if (overview) {
      overview = false;
      tween = camNow && !reduce ? { from: camNow, t0: performance.now(), dur: 420 } : null;
      dirty = true;
    }
  }, { passive: true });

  /* ------------------------------------------------------------------- map */

  function refreshMap() {
    if (typeof W.refreshOriginMap === 'function') {
      try { W.refreshOriginMap(); } catch (err) { /* bản đồ không chặn nội dung */ }
    }
  }

  function startMap() {
    if (mapStarted) { return; }
    mapStarted = true;
    if (typeof W.initOriginMap === 'function') {
      try { W.initOriginMap(); } catch (err) { /* bản đồ không chặn nội dung */ }
    }
    W.setTimeout(refreshMap, 260);
    W.setTimeout(refreshMap, 700);
  }

  /* -------------------------------------------------------------- language */

  function initLanguageSelector() {
    var selector = D.getElementById('language-select');
    if (!selector) { return; }

    var publishedUrl = 'https://musual-moncra.github.io/SVTHM-Storyboard.github.io/';
    var currentUrl = /^https?:$/.test(W.location.protocol) ? W.location.href : publishedUrl;
    var sourceUrl = currentUrl.indexOf('translate.google.') !== -1 ? publishedUrl : currentUrl;
    var parsedSource = new URL(sourceUrl);
    var currentLanguage = parsedSource.searchParams.get('int_lang');
    if (['en', 'ja', 'ko', 'zh-CN'].indexOf(currentLanguage) !== -1) { selector.value = currentLanguage; }
    parsedSource.searchParams.delete('int_lang');
    var originalUrl = parsedSource.href;

    selector.addEventListener('change', function () {
      var language = selector.value;
      if (language === 'vi') {
        W.location.assign(originalUrl);
        return;
      }

      var translatedSource = new URL(originalUrl);
      translatedSource.searchParams.set('int_lang', language);
      var translatorUrl = new URL('https://translate.google.com/translate');
      translatorUrl.searchParams.set('sl', 'vi');
      translatorUrl.searchParams.set('tl', language);
      translatorUrl.searchParams.set('u', translatedSource.href);
      W.location.assign(translatorUrl.href);
    });
  }

  /* ------------------------------------------------------------- lifecycle */

  function onResize() {
    measure();
    refreshMap();
    if (!moved) {
      var idx = sceneIndexFromHash();
      if (idx >= 0) { scrollToScene(idx, true); }
    }
    render(performance.now());
  }

  var resizeTimer = 0;
  W.addEventListener('resize', function () {
    W.clearTimeout(resizeTimer);
    resizeTimer = W.setTimeout(onResize, 140);
  });

  D.addEventListener('visibilitychange', function () {
    visible = !D.hidden;
    if (visible) {
      lastY = -1e9;
      dirty = true;
      if (!rafId) { rafId = W.requestAnimationFrame(tick); }
    } else {
      if (rafId) { W.cancelAnimationFrame(rafId); rafId = 0; }
    }
  });

  if (reduceMQ.addEventListener) {
    reduceMQ.addEventListener('change', function (ev) {
      reduce = ev.matches;
      dirty = true;
    });
  }

  function boot() {
    initLanguageSelector();
    measure();

    var idx = sceneIndexFromHash();
    if (idx >= 0) { scrollToScene(idx, true); }

    render(performance.now());
    rafId = W.requestAnimationFrame(tick);

    /* Bản đồ chỉ dựng một lần, lúc trang đã rảnh, để không khựng giữa lúc chuyển cảnh. */
    W.setTimeout(startMap, 1200);

    /* Giải mã trước ảnh của hai cảnh kế trong lúc người xem còn ở cảnh đầu. */
    W.setTimeout(function () {
      warmScene(1);
      warmScene(2);
    }, 2500);

    /* Trình duyệt tự nhảy tới #id sau khi tải; chỉnh lại đúng điểm đọc. */
    function reanchor() {
      var i = sceneIndexFromHash();
      if (!moved && i >= 0) { scrollToScene(i, true); }
    }

    if (idx >= 0) {
      W.requestAnimationFrame(function () { W.requestAnimationFrame(reanchor); });
      W.addEventListener('load', reanchor);
      W.setTimeout(reanchor, 400);
      W.setTimeout(reanchor, 1200);
    }
  }

  if (D.readyState === 'loading') {
    D.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  if (D.fonts && D.fonts.ready && D.fonts.ready.then) {
    D.fonts.ready.then(function () {
      measure();
      var idx2 = sceneIndexFromHash();
      if (!moved && idx2 >= 0) { scrollToScene(idx2, true); }
      render(performance.now());
    });
  }
}());
