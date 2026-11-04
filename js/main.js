/* ==========================================================================
   MẪU 2 — STORYBOARD
   Một vòng rAF duy nhất. Camera bảng là hàm thuần của vị trí cuộn:
   đường lửa chỉ tiến khi cuộn xuống và lùi khi cuộn ngược.
   ========================================================================== */

(function () {
  'use strict';

  var W = window;
  var D = document;

  var reduceMQ = W.matchMedia('(prefers-reduced-motion: reduce)');
  var reduce = reduceMQ.matches;

  var board = D.getElementById('board');
  var tiltEl = D.getElementById('board-tilt');
  var navbar = D.querySelector('.navbar');
  var progressBar = D.getElementById('scroll-progress-bar');
  var flameHead = D.getElementById('flame-head');
  var flameGroup = D.getElementById('flame-segments');
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
    scenes: [],
    segments: []
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
    var k = 0.58;
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
      return { cam: overviewCam(), i: -1, pan: 0, u: 5, ignite: 1 };
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
    var fh = single ? vh - L.navH - 78 : Math.min(700, vh - L.navH - 56);

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
    tiltEl.style.setProperty('--tilt', '0deg');

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

    buildFlame();
    lastU = -1;
    dirty = true;
  }

  /* ------------------------------------------------------------ flame path */

  function buildFlame() {
    while (flameGroup.firstChild) { flameGroup.removeChild(flameGroup.firstChild); }
    L.segments = [];

    var grad = D.getElementById('flame-stroke');
    if (grad) {
      grad.setAttribute('gradientUnits', 'userSpaceOnUse');
      grad.setAttribute('x1', '0');
      grad.setAttribute('y1', '0');
      grad.setAttribute('x2', String(L.boardW));
      grad.setAttribute('y2', String(L.boardH));
    }

    for (var i = 0; i < frames.length - 1; i++) {
      var a = L.scenes[i];
      var b = L.scenes[i + 1];
      var down = b.y > a.y + 1;
      var right = b.x > a.x + 1;
      var p1;
      var p2;

      if (down) {
        p1 = { x: a.x + L.frameW / 2, y: a.y + L.frameH };
        p2 = { x: b.x + L.frameW / 2, y: b.y };
      } else if (right) {
        p1 = { x: a.x + L.frameW, y: a.y + L.frameH / 2 };
        p2 = { x: b.x, y: b.y + L.frameH / 2 };
      } else {
        p1 = { x: a.x, y: a.y + L.frameH / 2 };
        p2 = { x: b.x + L.frameW, y: b.y + L.frameH / 2 };
      }

      var d = 'M ' + p1.x + ' ' + p1.y + ' L ' + p2.x + ' ' + p2.y;
      var len = Math.abs(p2.x - p1.x) + Math.abs(p2.y - p1.y);

      var track = D.createElementNS(SVG_NS, 'path');
      track.setAttribute('d', d);
      track.setAttribute('class', 'flame-track');

      var litPath = D.createElementNS(SVG_NS, 'path');
      litPath.setAttribute('d', d);
      litPath.setAttribute('class', 'flame-lit');
      litPath.style.strokeDasharray = len + ' ' + len;
      litPath.style.strokeDashoffset = len;

      flameGroup.appendChild(track);
      flameGroup.appendChild(litPath);

      L.segments.push({ p1: p1, p2: p2, len: len, lit: litPath });
    }
  }

  function updateFlame(u) {
    if (!L.segments.length) { return; }
    if (Math.abs(u - lastU) < 0.0005) { return; }
    lastU = u;

    var n = L.segments.length;
    var total = 0;
    var i;
    for (i = 0; i < n; i++) { total += L.segments[i].len; }

    var reveal = clamp(u / n, 0, 1) * total;
    var acc = 0;
    var headX = L.segments[0].p1.x;
    var headY = L.segments[0].p1.y;
    var placed = false;

    for (i = 0; i < n; i++) {
      var s = L.segments[i];
      var local = clamp(reveal - acc, 0, s.len);
      s.lit.style.strokeDashoffset = (s.len - local);
      if (!placed) {
        if (reveal <= acc + s.len || i === n - 1) {
          var t = s.len ? clamp((reveal - acc) / s.len, 0, 1) : 0;
          headX = s.p1.x + (s.p2.x - s.p1.x) * t;
          headY = s.p1.y + (s.p2.y - s.p1.y) * t;
          placed = true;
        }
      }
      acc += s.len;
    }

    flameHead.setAttribute('cx', headX);
    flameHead.setAttribute('cy', headY);
    flameHead.style.opacity = reveal > 1 ? '1' : '0.55';
  }

  /* ------------------------------------------------------------- frame UI */

  function setActive(idx) {
    if (idx === activeIndex) { return; }
    activeIndex = idx;

    var coversLive = idx === -1;

    for (var i = 0; i < L.scenes.length; i++) {
      var s = L.scenes[i];
      var on = i === idx;
      s.el.classList.toggle('is-active', on);
      s.el.classList.toggle('is-lit', on);

      if (on) {
        s.body.removeAttribute('inert');
      } else {
        s.body.setAttribute('inert', '');
        s.body.style.transform = 'translate3d(0px, 0px, 0px)';
      }

      var cover = s.el.querySelector('.frame-cover');
      if (cover) {
        if (coversLive) { cover.removeAttribute('inert'); }
        else { cover.setAttribute('inert', ''); }
      }
    }

    if (idx === 1) { startMap(); }
  }

  function applyPan(idx, pan) {
    if (idx < 0 || !L.scenes[idx]) { return; }
    var body = L.scenes[idx].body;
    body.style.transform = 'translate3d(0px, ' + (-Math.round(pan * 100) / 100) + 'px, 0px)';
  }

  function applyGlow(idx, pan) {
    if (idx < 0 || !L.scenes[idx]) { return; }
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

  function applyCam(c) {
    var k = c.k;
    var round = Math.abs(k - 1) < 0.0006;
    var tx = round ? Math.round(c.tx) : Math.round(c.tx * 10) / 10;
    var ty = round ? Math.round(c.ty) : Math.round(c.ty * 10) / 10;
    board.style.transform =
      'translate3d(' + tx + 'px, ' + ty + 'px, 0) scale(' + (Math.round(k * 10000) / 10000) + ')';
    board.style.setProperty('--flame-w', (2.2 / k).toFixed(2));
    board.style.setProperty('--flame-r', (11 / k).toFixed(2) + 'px');
    tiltEl.style.setProperty('--tilt', (Math.round(c.tilt * 100) / 100) + 'deg');
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

    if (progressBar) {
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

  function startMap() {
    if (mapStarted) { return; }
    mapStarted = true;
    if (typeof W.initOriginMap === 'function') {
      try { W.initOriginMap(); } catch (err) { /* bản đồ không chặn nội dung */ }
    }
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
