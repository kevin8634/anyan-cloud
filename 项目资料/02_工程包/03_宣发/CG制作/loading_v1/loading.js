/* ==========================================================================
   暗岩传说：深渊回响 · 载入画面 v1（古钟纹章 N1）
   零依赖，单个 rAF 循环；页面不可见 / 组件结束时自动停。
   API（挂在 window.AnyanLoader）：
     show(opts?)            挂载（已有静态 #anyan-loader 标记则直接接管）
     setProgress(p, tip?)   p: 0..1（>1 视为百分数）；显示值单调递增、平滑追赶
     setStage(text)         进度条左侧小字（如 "角色模型 · 2/5"）
     setTip(tip)            tip: {en, zh} | "中文" ；手动换一条提示
     finish(cb?)            走满 → 钟体一震 + 强光声环 → 淡出 → 移除 → cb()；返回 Promise
     destroy()              立即移除
     state()                调试：{shown, target, done, reducedMotion}
   ========================================================================== */
(function (global) {
  'use strict';

  var DEFAULT_TIPS = [
    { en: 'The bell has stopped.', zh: '钟，停了。' },
    { en: 'Before the tide recedes, the bell will not fall silent.', zh: '潮水退去之前，钟声不会停。' },
    { en: 'Stone remembers the tide. The tower remembers names.', zh: '石头记得潮水，钟楼记得名字。' },
    { en: 'What rings in the abyss always rings back.', zh: '深渊里响起的，终会回响。' },
    { en: 'Roll through the red circle \u2014 for an instant, nothing can touch you.', zh: '地上出现红圈时翻滚——翻滚的一瞬间无敌。' },
    { en: 'The camp smith tempers, salvages, and sells potions.', zh: '营地铁匠可以强化、分解装备，也卖药水。' },
    { en: 'A boss grows fiercer in its final phase. Keep a roll in reserve.', zh: '首领进入最后阶段时会更加凶猛，留好翻滚和药水。' },
    { en: 'Listen. Something beneath the bell is listening back.', zh: '听。钟下面，也有东西在听。' }
  ];

  // LOGO 内关键位置（相对 1536×1024 原图的比例）
  var GOLD_X0 = 0.275, GOLD_X1 = 0.735;   // 「深渊回响」金字左右范围 → 点亮前沿扫过的区间
  var RING_CX = 0.5, RING_CY = 0.68;       // 声波环中心：钟口沿
  var RING_R0 = 0.40, RING_R1 = 0.74;      // 起始/终止半径（LOGO 宽度比例）
  var RING_FLAT = 0.26;                    // 椭圆纵横比（俯视透视）

  var MARKUP =
    '<div class="al-bg"></div>' +
    '<div class="al-stage">' +
      '<div class="al-logo" aria-hidden="true">' +
        '<canvas class="al-ring"></canvas>' +
        '<img class="al-base" alt="" src="{A}n1_base.webp">' +
        '<img class="al-glow" alt="" src="{A}n1_glow.webp">' +
        '<img class="al-gold" alt="" src="{A}n1_gold.webp">' +
        '<img class="al-hot"  alt="" src="{A}n1_glow.webp">' +
      '</div>' +
      '<div class="al-barwrap">' +
        '<div class="al-bar"><div class="al-track"><div class="al-fill"></div></div><div class="al-head"></div></div>' +
        '<div class="al-meta"><span class="al-stagetxt">正在接收资源…</span><span class="al-pct">0%</span></div>' +
      '</div>' +
      '<div class="al-tip" aria-live="polite"><div class="al-tip-en"></div><div class="al-tip-zh"></div></div>' +
    '</div>' +
    '<div class="al-vig"></div><div class="al-flash"></div><canvas class="al-fx"></canvas>';

  var S = null;   // 运行时状态

  function q(root, sel) { return root.querySelector(sel); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function now() { return (global.performance && performance.now) ? performance.now() : Date.now(); }

  function makeDot(r, g, b) {   // 预渲染发光点精灵，绘制时只 drawImage
    var c = document.createElement('canvas'); c.width = c.height = 32;
    var x = c.getContext('2d'), gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,250,230,1)');
    gr.addColorStop(0.18, 'rgba(' + r + ',' + g + ',' + b + ',0.95)');
    gr.addColorStop(0.5, 'rgba(' + r + ',' + g + ',' + b + ',0.25)');
    gr.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
    x.fillStyle = gr; x.fillRect(0, 0, 32, 32); return c;
  }

  function show(opts) {
    opts = opts || {};
    if (S && S.alive) return api;
    var root = opts.root ? (typeof opts.root === 'string' ? document.querySelector(opts.root) : opts.root) : document.getElementById('anyan-loader');
    var A = opts.assetBase != null ? opts.assetBase : 'assets/';
    if (!root) {
      root = document.createElement('div'); root.id = 'anyan-loader';
      root.setAttribute('role', 'status'); root.setAttribute('aria-label', '加载中');
      document.body.appendChild(root);
    }
    if (!q(root, '.al-logo')) root.innerHTML = MARKUP.replace(/\{A\}/g, A);
    if (opts.zIndex != null) root.style.zIndex = opts.zIndex;

    var mq = global.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    var rm = !!(opts.reducedMotion != null ? opts.reducedMotion : (mq && mq.matches));
    if (rm) root.classList.add('al-rm');

    S = {
      alive: true, root: root, rm: rm,
      logo: q(root, '.al-logo'), ring: q(root, '.al-ring'), fx: q(root, '.al-fx'),
      fill: q(root, '.al-fill'), pct: q(root, '.al-pct'), stageEl: q(root, '.al-stagetxt'),
      tip: q(root, '.al-tip'), tipEn: q(root, '.al-tip-en'), tipZh: q(root, '.al-tip-zh'),
      bar: q(root, '.al-bar'),
      tips: opts.tips || DEFAULT_TIPS, tipIdx: -1, tipTimer: 0, tipInterval: opts.tipInterval || 4600,
      target: 0, shown: 0, lastShown: 0, done: false, finishing: false,
      t0: now(), last: now(), raf: 0, ringAcc: 0, rings: [], embers: [], sparks: [], tollRing: null,
      dpr: Math.min(global.devicePixelRatio || 1, 2), geo: null,
      dotEmber: makeDot(255, 128, 36), dotSpark: makeDot(255, 196, 92), lastPct: -1
    };
    S.mobile = Math.min(innerWidth, innerHeight) < 600;
    if (S.mobile) S.dpr = Math.min(S.dpr, 1.5);
    S.ctxR = S.ring.getContext('2d'); S.ctxF = S.fx.getContext('2d');

    measure();
    S.onResize = function () { measure(); };
    addEventListener('resize', S.onResize);
    S.onVis = function () { if (!document.hidden && S && S.alive && !S.raf) { S.last = now(); S.raf = requestAnimationFrame(loop); } };
    document.addEventListener('visibilitychange', S.onVis);

    // 提示轮播
    if (opts.autoTips !== false) {
      nextTip(true);
      S.tipTimer = setInterval(function () { nextTip(false); }, S.tipInterval);
    }
    // 初始余烬
    if (!rm) for (var i = 0; i < emberCount(); i++) S.embers.push(newEmber(true));
    paint(0);
    S.raf = requestAnimationFrame(loop);
    return api;
  }

  function emberCount() { return S.mobile ? 34 : 64; }

  function measure() {
    if (!S) return;
    var dpr = S.dpr, W = innerWidth, H = innerHeight;
    var fw = Math.round(W * dpr), fh = Math.round(H * dpr);
    if (S.fx.width !== fw || S.fx.height !== fh) { S.fx.width = fw; S.fx.height = fh; }
    var lr = S.logo.getBoundingClientRect();
    // getBoundingClientRect 含 transform（浮现时有 scale），用 offset 尺寸更稳
    var lw = S.logo.offsetWidth, lh = S.logo.offsetHeight;
    var cx = lr.left + lr.width / 2, cy = lr.top + lr.height / 2;
    var rw = Math.round(lw * 1.6 * dpr), rh = Math.round(lh * 1.6 * dpr);
    if (S.ring.width !== rw || S.ring.height !== rh) { S.ring.width = rw; S.ring.height = rh; }
    var br = S.bar.getBoundingClientRect();
    S.geo = { W: W, H: H, lw: lw, lh: lh, lx: cx - lw / 2, ly: cy - lh / 2, bx: br.left + 2, by: br.top + br.height / 2, bw: br.width - 4 };
  }

  function newEmber(scatter) {
    var g = S.geo, lw = g.lw;
    // 主要从钟口下方与画面底部升起
    var fromBell = Math.random() < 0.55;
    var x = fromBell ? g.lx + lw * (0.2 + Math.random() * 0.6) : Math.random() * g.W;
    var y = fromBell ? g.ly + g.lh * (0.72 + Math.random() * 0.15) : g.H + 10;
    if (scatter) y = Math.random() * g.H;
    return { x: x, y: y, vx: (Math.random() - 0.5) * 8, vy: -(10 + Math.random() * 26), s: 0.6 + Math.random() * 1.7,
      life: 0, max: 5 + Math.random() * 7, ph: Math.random() * 6.28, fl: 3 + Math.random() * 6 };
  }

  function nextTip(first) {
    if (!S || !S.tips.length) return;
    var i = S.tips.length > 1 ? (S.tipIdx + 1 + Math.floor(Math.random() * (S.tips.length - 1))) % S.tips.length : 0;
    if (first) i = 0;
    S.tipIdx = i; setTip(S.tips[i], first);
  }

  function setTip(tip, instant) {
    if (!S) return api;
    if (typeof tip === 'string') tip = { en: '', zh: tip };
    var apply = function () {
      S.tipEn.textContent = tip.en || ''; S.tipZh.textContent = tip.zh || '';
      S.tipEn.style.display = tip.en ? '' : 'none';
      S.tip.classList.remove('al-swap');
      if (!instant) S.tip.classList.add('al-shown');
    };
    if (instant) { apply(); return api; }
    S.tip.classList.add('al-swap'); S.tip.classList.remove('al-shown');
    setTimeout(apply, 480);
    return api;
  }

  function setProgress(p, tip) {
    if (!S) return api;
    p = +p || 0; if (p > 1.0001) p /= 100;
    S.target = Math.max(S.target, clamp(p, 0, 1));
    if (tip) setTip(tip);
    return api;
  }
  function setStage(text) { if (S && S.stageEl) S.stageEl.textContent = text || ''; return api; }

  function paint(p) {
    var r = S.root.style;
    r.setProperty('--al-p', p.toFixed(4));
    r.setProperty('--al-edge', ((GOLD_X0 + (GOLD_X1 - GOLD_X0) * p) * 100).toFixed(2) + '%');
    var pc = Math.floor(p * 100 + 1e-6);
    if (pc !== S.lastPct) { S.lastPct = pc; S.pct.textContent = pc + '%'; }
  }

  // ---------------- 主循环 ----------------
  function loop() {
    if (!S || !S.alive) return;
    if (document.hidden) { S.raf = 0; return; }
    var t = now(), dt = Math.min((t - S.last) / 1000, 0.05); S.last = t;
    // 平滑追赶，单调递增
    var tgt = S.finishing ? 1 : S.target;
    var k = S.rm ? 1 : 1 - Math.pow(0.0025, dt);       // ≈ 每秒追上 99.75%
    var minStep = S.finishing ? dt * 0.9 : 0;          // finish 时保证 1 秒内走满
    S.lastShown = S.shown;
    S.shown = Math.min(tgt, Math.max(S.shown + (tgt - S.shown) * k, S.shown + Math.min(minStep, tgt - S.shown)));
    paint(S.shown);
    if (t - (S.lastMeasure || 0) > 1000) { S.lastMeasure = t; measure(); }   // 字体/布局晚到时校正
    drawRings(dt, t);
    drawFx(dt, t);
    S.raf = requestAnimationFrame(loop);
  }

  function drawRings(dt, t) {
    var c = S.ctxR, cw = S.ring.width, ch = S.ring.height, g = S.geo, dpr = S.dpr;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cw, ch);
    var p = S.shown, lw = g.lw * dpr;
    var ox = cw / 2 + (RING_CX - 0.5) * lw, oy = ch / 2 + (RING_CY - 0.5) * g.lh * dpr;
    c.globalCompositeOperation = 'lighter';
    if (S.rm) {   // 静态：一圈随进度变亮的环
      ellipse(c, ox, oy, lw * 0.5, 0.10 + 0.25 * p, 1.4 * dpr, 1);
      return;
    }
    // 生成间隔随进度从 2.8s 缩到 1.2s
    if (!S.done) {
      S.ringAcc += dt;
      var period = 2.8 - 1.6 * p;
      if (S.ringAcc >= period) { S.ringAcc = 0; S.rings.push({ a: 0, life: 3.6 + Math.random() * 0.6, w: 0.8 + Math.random() * 0.6 }); }
    }
    for (var i = S.rings.length - 1; i >= 0; i--) {
      var R = S.rings[i]; R.a += dt / R.life;
      if (R.a >= 1) { S.rings.splice(i, 1); continue; }
      var e = 1 - Math.pow(1 - R.a, 2.2);          // 先快后慢
      var rx = lw * (RING_R0 + (RING_R1 - RING_R0) * e);
      var al = Math.pow(1 - R.a, 1.5) * Math.min(1, R.a * 5) * (0.32 + 0.5 * p);
      ellipse(c, ox, oy, rx, al, R.w * dpr, 1);
    }
    // 终声环（强光）
    var T = S.tollRing;
    if (T) {
      T.a += dt / 1.5;
      if (T.a < 1) {
        var e2 = 1 - Math.pow(1 - T.a, 3);
        var rx2 = lw * (0.36 + 0.52 * e2);
        ellipse(c, ox, oy, rx2, Math.pow(1 - T.a, 2) * Math.min(1, T.a * 10), (1.2 + 1.6 * (1 - T.a)) * dpr, 2);
        ellipse(c, ox, oy, rx2 * 0.86, Math.pow(1 - T.a, 2.4) * 0.5, 1 * dpr, 1);   // 紧随的第二道青绿余波
      }
    }
  }
  // 椭圆声波环：宽而淡的外晕 + 细亮芯；mode 2 = 金白强光
  function grad(c, y, ry, rgb, a) {   // 前（下）亮后（上）暗，暗示声环绕到钟后
    var g = c.createLinearGradient(0, y - ry, 0, y + ry);
    g.addColorStop(0, 'rgba(' + rgb + ',' + (a * 0.22) + ')');
    g.addColorStop(0.5, 'rgba(' + rgb + ',' + (a * 0.6) + ')');
    g.addColorStop(1, 'rgba(' + rgb + ',' + a + ')');
    return g;
  }
  function ellipse(c, x, y, rx, al, w, mode) {
    var ry = rx * RING_FLAT, ph = rx * 0.013;     // 轻微起伏的声波轮廓（不是死板的正椭圆）
    c.beginPath();
    for (var i = 0; i <= 72; i++) {
      var th = i / 72 * Math.PI * 2, k = 1 + 0.010 * Math.sin(5 * th + ph) + 0.006 * Math.sin(9 * th - ph * 1.7);
      var px = x + Math.cos(th) * rx * k, py = y + Math.sin(th) * ry * k;
      if (i) c.lineTo(px, py); else c.moveTo(px, py);
    }
    if (mode === 2) {
      c.strokeStyle = 'rgba(255,170,70,' + (al * 0.10) + ')'; c.lineWidth = w * 14; c.stroke();
      c.strokeStyle = 'rgba(255,200,110,' + (al * 0.22) + ')'; c.lineWidth = w * 5; c.stroke();
      c.strokeStyle = 'rgba(255,244,215,' + (al * 0.85) + ')'; c.lineWidth = w; c.stroke();
    } else {
      c.strokeStyle = grad(c, y, ry, '30,170,150', al * 0.16); c.lineWidth = w * 9; c.stroke();
      c.strokeStyle = grad(c, y, ry, '60,210,185', al * 0.35); c.lineWidth = w * 3; c.stroke();
      c.strokeStyle = grad(c, y, ry, '150,250,230', al * 0.9); c.lineWidth = w; c.stroke();
    }
  }

  function drawFx(dt, t) {
    var c = S.ctxF, g = S.geo, dpr = S.dpr;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, S.fx.width, S.fx.height);
    if (S.rm) return;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.globalCompositeOperation = 'lighter';
    var p = S.shown, time = t / 1000;
    // 余烬
    var es = S.embers, glowK = 0.45 + 0.55 * p;
    for (var i = 0; i < es.length; i++) {
      var E = es[i]; E.life += dt;
      if (E.life > E.max || E.y < -20) { es[i] = newEmber(false); continue; }
      E.x += (E.vx + Math.sin(time * 0.9 + E.ph) * 9) * dt; E.y += E.vy * dt;
      var fade = Math.min(1, E.life / 1.2) * Math.min(1, (E.max - E.life) / 2);
      var fl = 0.65 + 0.35 * Math.sin(time * E.fl + E.ph);
      var sz = E.s * 7;
      c.globalAlpha = clamp(fade * fl * glowK * 0.85, 0, 1);
      c.drawImage(S.dotEmber, E.x - sz / 2, E.y - sz / 2, sz, sz);
    }
    // 进度条末端火星
    var dp = S.shown - S.lastShown;
    if (t - S.t0 > 1500 && S.shown > 0.002 && S.shown < 0.999) {   // 进度条淡入后才出火星
      var rate = (S.mobile ? 10 : 18) + dp * 2400;                 // 推进越快火星越多
      var n = rate * dt + Math.random() * 0.5;
      var hx = g.bx + g.bw * S.shown, hy = g.by;
      for (var j = 0; j < Math.floor(n); j++) {
        if (S.sparks.length > 90) break;
        S.sparks.push({ x: hx - Math.random() * 3, y: hy + (Math.random() - 0.5) * 4,
          vx: -10 + Math.random() * 60, vy: -30 - Math.random() * 70, life: 0, max: 0.35 + Math.random() * 0.55, s: 0.5 + Math.random() });
      }
    }
    var sp = S.sparks;
    for (var k = sp.length - 1; k >= 0; k--) {
      var P = sp[k]; P.life += dt;
      if (P.life > P.max) { sp.splice(k, 1); continue; }
      P.vy += 160 * dt; P.x += P.vx * dt; P.y += P.vy * dt;
      var a = 1 - P.life / P.max, s2 = (2 + P.s * 4) * (0.5 + a * 0.5);
      c.globalAlpha = a;
      c.drawImage(S.dotSpark, P.x - s2 / 2, P.y - s2 / 2, s2, s2);
    }
    c.globalAlpha = 1;
  }

  // ---------------- 结束 ----------------
  function finish(cb) {
    if (!S || !S.alive) { if (cb) cb(); return Promise.resolve(); }
    if (S.finishPromise) { if (cb) S.finishPromise.then(cb); return S.finishPromise; }
    var st = S;
    st.finishing = true;
    st.finishPromise = new Promise(function (resolve) {
      var waitFull = function () {
        if (!st.alive) return resolve();
        if (st.shown < 0.999) return setTimeout(waitFull, 40);
        st.done = true; paint(1); setStage(st.doneText || '就绪');
        st.root.classList.add('al-done', 'al-toll');
        st.tollRing = { a: 0 };
        // 余烬一次性被声浪推散
        if (!st.rm) st.embers.forEach(function (E) { E.vy -= 40 + Math.random() * 60; E.vx += (E.x - st.geo.W / 2) * 0.08; });
        setTimeout(function () {
          st.root.classList.add('al-out');
          setTimeout(function () { destroy(st); resolve(); }, 1150);
        }, st.rm ? 500 : 1150);
      };
      waitFull();
    });
    if (cb) st.finishPromise.then(cb);
    return st.finishPromise;
  }

  function destroy(st) {
    st = st || S; if (!st) return;
    st.alive = false;
    if (st.raf) cancelAnimationFrame(st.raf);
    clearInterval(st.tipTimer);
    removeEventListener('resize', st.onResize);
    document.removeEventListener('visibilitychange', st.onVis);
    if (!st.keep && st.root && st.root.parentNode) st.root.parentNode.removeChild(st.root);
    if (S === st) S = null;
  }

  var api = {
    show: show, setProgress: setProgress, setStage: setStage, setTip: setTip, finish: finish,
    destroy: function () { destroy(S); },
    state: function () { return S ? { shown: S.shown, target: S.target, done: S.done, reducedMotion: S.rm } : null; },
    /** demo 用：finish 后不移除 DOM（便于重播） */
    _keepDom: function (v) { if (S) S.keep = !!v; },
    TIPS: DEFAULT_TIPS
  };
  global.AnyanLoader = api;
})(window);
