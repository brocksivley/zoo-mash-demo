/* Zoo Mash – screens around the Forest level: title, biome map, Zoopedia (+ fun-fact popup), scores, settings.
   Pure canvas/DOM, no libraries. game.js owns the level; this file only enters/leaves it through window.ZMGame. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const D = window.ZM_DATA, Art = window.ZMArt;
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
               set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  const LS_UNLOCK = 'zoomash.demo.unlockAll', LS_BEST = 'zoomash.forest.best', LS_SEEN = 'zoomash.forest.seen';
  const dprOf = () => Math.min(3, window.devicePixelRatio || 1);
  let W = innerWidth, H = innerHeight, u = 1, dpr = dprOf(), st = 0, sb = 0;
  function measure() {
    W = innerWidth; H = innerHeight; dpr = dprOf(); u = Math.min(W / 440, H / 956);
    document.documentElement.style.fontSize = (10 * u) + 'px';
    const p = document.createElement('div');
    p.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)';
    document.body.appendChild(p); const cs = getComputedStyle(p); st = parseFloat(cs.paddingTop) || 0; sb = parseFloat(cs.paddingBottom) || 0; p.remove();
  }
  measure();
  const img = src => { const im = new Image(); im.src = src; return im; };
  const ready = im => im.complete && im.naturalWidth > 0;
  const SIGN = D.map(b => 'img/sign-' + b.key + '.png');
  const LOCK_SVG = '<svg class="lockico" viewBox="0 0 12 14" shape-rendering="crispEdges"><g fill="#26292c"><rect x="3" y="0" width="6" height="2"/><rect x="2" y="1" width="2" height="6"/><rect x="8" y="1" width="2" height="6"/><rect x="0" y="6" width="12" height="8"/></g><rect x="1" y="7" width="10" height="6" fill="#e3e5e7"/><rect x="1" y="11" width="10" height="2" fill="#b4b8bc"/><rect x="5" y="8" width="2" height="3" fill="#26292c"/></svg>';

  // ---------- found / unlock state ----------
  const unlockAll = () => !!ls.get(LS_UNLOCK, false);
  const forestSeen = () => new Set(ls.get(LS_SEEN, []));
  function isFound(b, t) { return unlockAll() || (b === 0 && forestSeen().has(t)); }
  function foundCount() { if (unlockAll()) return 88; return [...forestSeen()].filter(t => t >= 1 && t <= 11).length; }

  // ---------- toast ----------
  let toastT;
  function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), 1300); }

  // ---------- screens ----------
  const scr = { title: $('scr-title'), map: $('scr-map'), zoo: $('scr-zoo'), scores: $('scr-scores'), game: $('app') };
  const hooks = {};
  let cur = null, hideT = {};
  function show(name, opt) {
    if (cur === name) return;
    const prev = cur; cur = name;
    if (!prev) Object.keys(scr).forEach(k => scr[k].classList.toggle('hidden', k !== name));
    if (prev === 'game') window.ZMGame.leave();
    closePopup(true);
    const el = scr[name];
    clearTimeout(hideT[name]);
    el.classList.remove('hidden'); el.style.zIndex = 3;
    if (prev) { el.classList.add('fade'); void el.offsetWidth; requestAnimationFrame(() => el.classList.remove('fade')); }
    if (hooks[name] && hooks[name].enter) hooks[name].enter(opt);
    if (prev) {
      const p = scr[prev]; p.style.zIndex = 2;
      hideT[prev] = setTimeout(() => { if (cur !== prev) { p.classList.add('hidden'); if (hooks[prev] && hooks[prev].leave) hooks[prev].leave(); } }, 180);
    }
    document.body.dataset.screen = name;
  }
  function openSettings() { $('settings').classList.remove('hidden'); syncUnlock(); }
  document.querySelectorAll('.gearbtn').forEach(b => { if (b.id !== 'gear') b.addEventListener('click', openSettings); });
  document.querySelectorAll('.screen .back').forEach(b => b.addEventListener('click', () => hooks[cur] && hooks[cur].back && hooks[cur].back()));
  // the settings DONE button is also handled by game.js (it unpauses the level)
  $('s-close').addEventListener('click', () => { $('settings').classList.add('hidden'); });
  const swU = $('s-unlockall');
  function syncUnlock() { const on = unlockAll(); swU.classList.toggle('on', on); swU.setAttribute('aria-checked', on); }
  swU.addEventListener('click', () => { ls.set(LS_UNLOCK, !unlockAll()); syncUnlock(); if (cur === 'zoo') renderBook(); if (cur === 'map') refreshPanel(); });
  syncUnlock();

  // ---------- one animation loop for the decorative screens ----------
  let t0 = performance.now();
  function loop(t) {
    requestAnimationFrame(loop);                       // schedule first so one bad frame can never stop the loop
    const s = Math.max(0, (t - t0) / 1000);            // the first rAF stamp can precede t0 (negative time broke the bird frame)
    if (cur === 'title') drawTitle(s);
    else if (cur === 'map') drawForestIsland(s);
  }

  // ---------- helpers ----------
  function fitCanvas(cv, cssW, cssH, scaleDown) {
    // scaleDown: canvas pixel = `scaleDown` CSS px (for pixel-art backdrops), else device res
    if (scaleDown) { cv.width = Math.ceil(cssW / scaleDown); cv.height = Math.ceil(cssH / scaleDown); cv.style.width = cv.width * scaleDown + 'px'; cv.style.height = cv.height * scaleDown + 'px'; cv.classList.add('px'); }
    else { cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr); cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px'; }
    return cv.getContext('2d');
  }
  function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909), (s >>>= 0) / 4294967296)); }
  // Wood-table backdrop (pixel art: 1 canvas px = 2 CSS px)
  function drawWood(cv) {
    const g = fitCanvas(cv, W, H, 2), w = cv.width, h = cv.height, R = rng(7);
    const ph = Math.max(14, Math.round(h / 16));
    const cols = ['#7a4a24', '#83522a', '#71431f', '#7e4e27'];
    for (let p = 0, y = 0; y < h; p++, y += ph) {
      g.fillStyle = cols[p % 4]; g.fillRect(0, y, w, ph);
      for (let i = 0; i < w * ph / 18; i++) { g.fillStyle = R() < .5 ? 'rgba(50,25,8,.22)' : 'rgba(170,110,60,.18)'; g.fillRect((R() * w) | 0, y + 1 + ((R() * (ph - 2)) | 0), 2 + ((R() * 6) | 0), 1); }
      g.fillStyle = '#3b2010'; g.fillRect(0, y + ph - 1, w, 1); g.fillStyle = '#9a6536'; g.fillRect(0, y, w, 1);
      const off = (R() * w) | 0; g.fillStyle = '#3b2010'; g.fillRect(off, y, 1, ph);
      for (let k = 0; k < 2; k++) { const kx = (R() * w) | 0, ky = y + 3 + ((R() * (ph - 6)) | 0); g.fillStyle = 'rgba(45,22,6,.45)'; g.fillRect(kx, ky, 3, 2); g.fillRect(kx + 1, ky - 1, 1, 4); }
    }
  }

  // =====================================================================================
  // TITLE
  // =====================================================================================
  const titleIm = img('img/title-bg.jpg?v=fd2');
  const LAMPS = [[122, 250], [598, 250], [118, 418], [605, 418]];   // top lanterns on both pillars + the two wall lamps
  let titleBg = null, tl = null;
  function buildTitle() {
    const cv = $('title-cv'); fitCanvas(cv, W, H);
    if (!ready(titleIm)) return;
    // fit to width (cropping at most ~12% of the width) and top-anchor; cobblestones are mirrored to fill below
    const s = Math.min(W * 1.12 / 720, Math.max(W / 720, H * 0.9 / 1280));
    const iw = 720 * s, ih = 1280 * s, x0 = (W - iw) / 2;
    tl = { s, x0, y0: 0, ih };
    const k = Math.max(1, Math.min(3, Math.floor(s * dpr)));          // sharp-bilinear: integer NN blow-up, then smooth fit
    const nn = document.createElement('canvas'); nn.width = 720 * k; nn.height = 1280 * k;
    const ng = nn.getContext('2d'); ng.imageSmoothingEnabled = false; ng.drawImage(titleIm, 0, 0, nn.width, nn.height);
    const bg = document.createElement('canvas'); bg.width = cv.width; bg.height = cv.height;
    const g = bg.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(nn, x0, 0, iw, ih);
    if (ih < H) { // mirrored strip of cobblestones below the picture
      const need = H - ih, srcH = need / s;
      g.save(); g.translate(0, ih * 2); g.scale(1, -1);
      g.drawImage(nn, 0, (1280 - srcH) * k, 720 * k, srcH * k, x0, ih - need, iw, need); g.restore();
    }
    const gr = g.createLinearGradient(0, H * 0.6, 0, H); gr.addColorStop(0, 'rgba(10,5,2,0)'); gr.addColorStop(1, 'rgba(10,5,2,.5)');
    g.fillStyle = gr; g.fillRect(0, H * 0.6, W, H * 0.4);
    titleBg = bg; nn.width = nn.height = 0;
  }
  titleIm.onload = () => { buildTitle(); };
  const BIRD = [['X.....X', '.X...X.', '..XXX..', '...X...'], ['.......', '..XXX..', '.XX.XX.', 'X.....X']];
  function drawBird(g, x, y, f, p, col) {
    g.fillStyle = col; const rows = BIRD[f];
    for (let r = 0; r < rows.length; r++) for (let c = 0; c < 7; c++) if (rows[r][c] === 'X') g.fillRect(Math.round(x) + c * p, Math.round(y) + r * p, p, p);
  }
  function drawTitle(t) {
    const cv = $('title-cv'), g = cv.getContext('2d');
    if (!titleBg) { buildTitle(); if (!titleBg) return; }
    g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(titleBg, 0, 0);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // lantern flicker
    g.save(); g.globalCompositeOperation = 'lighter';
    LAMPS.forEach(([lx, ly], i) => {
      const x = tl.x0 + lx * tl.s, y = ly * tl.s, r = 34 * tl.s * (1 + 0.06 * Math.sin(t * 7.3 + i * 2));
      const a = 0.16 + 0.06 * Math.sin(t * 11 + i * 1.7) + 0.04 * Math.sin(t * 23.7 + i);
      const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(255,190,90,${a.toFixed(3)})`); gr.addColorStop(1, 'rgba(255,150,40,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    });
    g.restore();
    // birds far away in the sky (pixel sprites on a 2px grid)
    const P = 2, dur = 16, ph = (t % dur) / dur;
    const bx = -30 + ph * (W + 60), by = H * 0.095 + Math.sin(t * 1.6) * 6;
    drawBird(g, Math.round(bx / P) * P, Math.round(by / P) * P, Math.floor(t * 5) % 2, P, '#3b1d0c');
    const ph2 = ((t + 7) % 22) / 22, bx2 = W + 20 - ph2 * (W + 50), by2 = H * 0.15 + Math.sin(t * 1.3 + 1) * 4;
    drawBird(g, Math.round(bx2), Math.round(by2), Math.floor(t * 4 + 1) % 2, 1, 'rgba(70,35,14,.8)');
  }
  const tms = [...document.querySelectorAll('#title-menu .tm')];
  const selTm = b => tms.forEach(x => x.classList.toggle('sel', x === b));
  selTm(tms[0]);
  tms.forEach(b => {
    b.addEventListener('pointerenter', () => selTm(b)); b.addEventListener('pointerdown', () => selTm(b));
    b.addEventListener('click', () => { const go = b.dataset.go; if (go === 'settings') openSettings(); else if (go === 'zoo') openZoo({ from: 'title' }); else show(go); });
  });
  hooks.title = { enter() { selTm(tms[0]); if (!titleBg) buildTitle(); } };

  // =====================================================================================
  // MAP
  // =====================================================================================
  const islForest = img('img/island-forest.png'), islRac = img('img/island-forest-raccoon.png'), islLocked = img('img/island-locked.png');
  const RAC = { x: 110, y: 133 };                  // raccoon layer offset inside island-forest.png
  const FOREST_GROUND = 186;                        // rows above this are tree canopy (sway); below is the island (still)
  let mapL = null, selected = -1, selT = 0, islCv = null, islSrc = null;
  function mapLayout() {
    const top = 60 * u + st, panelTop = H - sb - 12 * u - 94 * u;
    const A = 7 * u, hw = 18 * u, cliff = 12 * u, E = A + hw + cliff + 4;
    const iw = 98 * u, gap = 8 * u, sw = 64 * u, sh = sw / 1.215, sg = 4 * u;
    const fh = iw * (islForest.naturalHeight || 464) / (islForest.naturalWidth || 415), lh = iw * (islLocked.naturalHeight || 355) / (islLocked.naturalWidth || 426);
    const y0 = top + 18 * u + 0.6 * fh, y7 = panelTop - 10 * u - lh * 0.5, step = (y7 - y0) / 7;
    const cx = W / 2, rows = [];
    for (let i = 0; i < 8; i++) {
      const left = i % 2 === 0, y = y0 + i * step;
      const icx = left ? cx - E - gap - iw / 2 : cx + E + gap + iw / 2;
      const scx = left ? icx - iw / 2 - sg - sw / 2 : icx + iw / 2 + sg + sw / 2;
      const h = i === 0 ? fh : lh, anchor = i === 0 ? 0.6 : 0.5;
      rows.push({ i, left, y, island: { x: icx - iw / 2, y: y - anchor * h, w: iw, h }, sign: { x: scx - sw / 2, y: y - sh / 2, w: sw, h: sh } });
    }
    return { top, panelTop, A, hw, cliff, E, cx, y0, step, rows, S: E + gap + 2 * u - hw, pathTop: y0 - step * 0.1, pathBot: panelTop + 30 };
  }
  // pixel-art sky, clouds and the chunky 3D cliff-edge path (1 canvas px = 2 CSS px)
  function drawMapBg() {
    const cv = $('map-cv'), g = fitCanvas(cv, W, H, 2), w = cv.width, h = cv.height, P = 2, R = rng(42);
    const L = mapL;
    const sky = ['#3f9be6', '#4aa4ea', '#56adee', '#62b6f1', '#6fbff3', '#7cc8f5', '#8bd0f7', '#99d8f8'];
    for (let y = 0; y < h; y++) { const k = y / h * (sky.length - 1), i = Math.floor(k), f = k - i;
      for (let x = 0; x < w; x++) { const c = (f > 0.5 ? ((x + y) % 2 === 0 || f > 0.75) : (f > 0.25 && (x + y) % 4 === 0)) ? sky[Math.min(i + 1, sky.length - 1)] : sky[i]; g.fillStyle = c; g.fillRect(x, y, 1, 1); } }
    // clouds in the gaps beside the islands
    const cloud = (cx, cy, s) => {
      const blobs = [[0, 0, 1], [-1.1, .35, .72], [1.15, .3, .78], [.5, -.45, .7], [-.55, -.3, .6]];
      const pts = new Set();
      for (const [bx, by, br] of blobs) { const rr = br * s; for (let y = -rr; y <= rr; y++) for (let x = -rr; x <= rr; x++) if (x * x + y * y <= rr * rr && by * s + y < s * .55) pts.add(Math.round(cx + bx * s + x) + ',' + Math.round(cy + by * s + y)); }
      for (const p of pts) { const [x, y] = p.split(',').map(Number); g.fillStyle = y > cy + s * .25 ? '#d3e9fa' : '#ffffff'; g.fillRect(x, y, 1, 1); }
      for (const p of pts) { const [x, y] = p.split(',').map(Number); if (!pts.has(x + ',' + (y + 1))) { g.fillStyle = '#b7d9f3'; g.fillRect(x, y, 1, 1); } }
    };
    L.rows.forEach((r, i) => { const opp = !r.left, ox = opp ? (L.cx - L.E - 40 * u) : (L.cx + L.E + 40 * u), oy = r.y + L.step * 0.02;
      if (i % 2 === 0 || i === 3) cloud(Math.round((ox + (opp ? -30 : 30) * u * (i % 3 === 0 ? 1 : .2)) / P), Math.round(oy / P), Math.round((8 + (i % 3) * 2) * u)); });
    cloud(Math.round((W - 30 * u) / P), Math.round((L.top + 6 * u) / P), Math.round(6 * u));
    // ---- winding path: smooth S-curves that swing out to touch each island in turn (dirt top, grass rim, 3D rock cliff walls) ----
    // Rendered from a distance field around the centre-line, so the road keeps the same chunky width through every bend.
    const hw = Math.round(L.hw / P), C = Math.round(L.cliff / P), D = 3, cx = L.cx / P, y0 = L.y0 / P, step = L.step / P, S = L.S / P;
    const ys = Math.floor(L.pathTop / P), ye = Math.min(h - 1, Math.ceil(L.pathBot / P));
    const shape = c => c * (1.5 - 0.5 * c * c);                       // flattens the turn at each island, steeper in between
    const cAt = y => { const t = (y - y0) / step; if (t >= 0) return cx - S * shape(Math.cos(Math.PI * t));
      const k = Math.min(1, -t / 0.1); return cx - S - S * 1.3 * k * k; };   // lead-in: the road starts tucked behind the Forest island
    L.curve = y => (cAt(y / P)) * P;                                  // CSS-px centre-line, used by tests
    const CX = new Float32Array(h + 8); for (let y = 0; y < h + 8; y++) CX[y] = cAt(Math.max(ys, y));
    const RR = hw + C + 2;
    // nearest distance from (x,y) to the centre-line segment set starting at ys (rounded cap at the top end)
    const dist = (x, y) => { let best = 1e9; const a = Math.max(ys, Math.floor(y - RR)), b2 = Math.min(ye, Math.ceil(y + RR));
      for (let yy = a; yy <= b2; yy++) { const dx = x - CX[yy], dy = y - yy, d = dx * dx + dy * dy; if (d < best) best = d; }
      return Math.sqrt(best); };
    const top = new Uint8Array(w * h), wall = new Uint8Array(w * h), dT = new Float32Array(w * h).fill(99), dW = new Float32Array(w * h).fill(99);
    const jit = []; for (let y = 0; y < h; y++) jit.push([R() < .22 ? 1 : 0, R() < .22 ? 1 : 0, R() < .3 ? 1 : 0, R() < .3 ? 1 : 0]);
    for (let y = Math.max(0, ys - 1); y <= Math.min(h - 1, ye + D + 1); y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x, left = x < CX[y];
        const dt = dist(x, y); dT[i] = dt;
        if (y >= ys - 0 && dt <= hw + 0.5 - (left ? jit[y][0] : jit[y][1])) { top[i] = 1; continue; }
        const dw = dist(x, y - D); dW[i] = dw;
        const jb = jit[(y >> 2) % h];
        if (dw <= hw + C + 0.5 - (left ? jb[2] : jb[3])) wall[i] = left ? 1 : 2;
      }
    }
    const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && (top[y * w + x] || wall[y * w + x]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!solid(x, y)) {
      if (solid(x - 3, y - 2) && !solid(x - 1, y)) { g.fillStyle = 'rgba(20,60,110,.30)'; g.fillRect(x, y, 1, 1); }
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) { g.fillStyle = '#2b1a0d'; g.fillRect(x, y, 1, 1); }
    }
    // stone-block cliff faces, like the island undersides (courses follow the bends)
    const lit = ['#c19663', '#a77c4e', '#8c653e', '#5a3d26'], shd = ['#93704a', '#7a5a3a', '#634730', '#3e2a1a'];
    const bh = 4, hsh = []; for (let i = 0; i < 400; i++) hsh.push(R());
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x, k = wall[i]; if (!k) continue;
      const left = k === 1, pal = left ? lit : shd;
      const lu = Math.max(0, Math.round(hw + C - dW[i]));               // 0 at the outer edge
      const row = Math.floor((y + (left ? 0 : 2)) / bh), ry = (y + (left ? 0 : 2)) % bh;
      const split = 2 + ((hsh[(row * 2 + (left ? 0 : 1)) % 400] * 3) | 0);
      let c;
      if (ry === bh - 1 || lu === split) c = pal[3];
      else if (ry === 0 || lu === split + 1) c = pal[0];
      else c = hsh[(row * 7 + lu * 3 + (left ? 1 : 5)) % 400] < .5 ? pal[1] : pal[2];
      if (lu === 0) c = pal[3];
      const above = (y > 0 && top[i - w]) || (y > 1 && top[i - 2 * w]);
      if (above && hsh[(x * 11 + y) % 400] < .7) c = hsh[(x * 5) % 400] < .5 ? '#3f7d24' : '#2f6a1c';   // grass hanging over the lip
      g.fillStyle = c; g.fillRect(x, y, 1, 1); }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (!top[i]) continue;
      const e = hw - dT[i], capE = y - ys;                               // e: distance in from the road edge
      const e1 = e < 1.3 || !top[i - 1] || !top[i + 1] || !top[i - w], e2 = e < 2.3 || !top[i - 2 * w], e3 = e < 3.3;
      let c;
      if (e1) c = x > CX[y] ? '#3f7d24' : '#4f9a30';
      else if (e2) c = R() < .7 ? '#5fa83a' : '#6cb840';
      else if (e3) c = R() < .35 ? '#5fa83a' : '#b98c52';
      else { const v = R(); c = v < .1 ? '#b98c52' : v < .18 ? '#e2bf84' : v < .21 ? '#a07a48' : '#d2a868'; }
      g.fillStyle = c; g.fillRect(x, y, 1, 1); }
    for (let y = ys + 4; y < ye; y += 3) {
      const c = CX[y], ok = (px, wd) => { for (let q = -1; q <= wd; q++) for (let r = -1; r <= 1; r++) { const i = (y + r) * w + px + q; if (!top[i] || dT[i] > hw - 4) return false; } return true; };
      if (R() < .4) { const px = Math.round(c - hw + 4 + R() * (2 * hw - 8)); if (ok(px, 2)) { g.fillStyle = '#8f8a84'; g.fillRect(px, y, 2, 1); g.fillStyle = '#c9c4bc'; g.fillRect(px, y - 1, 1, 1); g.fillStyle = '#a07a48'; g.fillRect(px, y + 1, 2, 1); } }
      if (R() < .3) { const px = Math.round(c - hw + 4 + R() * (2 * hw - 8)); if (ok(px, 3)) { g.fillStyle = '#b98c52'; g.fillRect(px, y, 3, 1); } }
    }
  }
  function placeMap() {
    mapL = mapLayout(); drawMapBg();
    const box = $('map-items'); box.innerHTML = '';
    mapL.rows.forEach(r => {
      const b = r.i, unlocked = b === 0;
      const isl = document.createElement('div'); isl.className = 'isl' + (unlocked ? '' : ' locked'); isl.dataset.biome = b; isl.setAttribute('role', 'button'); isl.setAttribute('aria-label', D[b].name + (unlocked ? '' : ' (locked)'));
      Object.assign(isl.style, { left: r.island.x + 'px', top: r.island.y + 'px', width: r.island.w + 'px', height: r.island.h + 'px' });
      if (unlocked) { islCv = document.createElement('canvas'); isl.appendChild(islCv); fitCanvas(islCv, r.island.w, r.island.h); isl.id = 'isl-forest'; }
      else { const im = document.createElement('img'); im.src = islLocked.src; im.alt = 'Locked'; isl.appendChild(im); }
      const sg = document.createElement('div'); sg.dataset.biome = b;
      Object.assign(sg.style, { left: r.sign.x + 'px', top: r.sign.y + 'px', width: r.sign.w + 'px', height: r.sign.h + 'px' });
      if (unlocked) { sg.className = 'sign'; const im = document.createElement('img'); im.src = SIGN[b]; im.alt = D[b].name; sg.appendChild(im); }
      else { sg.className = 'lsign'; sg.innerHTML = LOCK_SVG; sg.setAttribute('aria-label', D[b].name + ' (locked)'); }
      const tap = () => tapIsland(b, isl);
      isl.addEventListener('click', tap); sg.addEventListener('click', tap);
      box.appendChild(isl); box.appendChild(sg);
      if (b === 0 && selected === 0) isl.classList.add('sel');
    });
  }
  function tapIsland(b, el) {
    if (b !== 0) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); toast('LOCKED'); return; }
    if (selected !== 0) { selected = 0; selT = performance.now(); }
    el.classList.add('sel'); refreshPanel();
  }
  function refreshPanel() {
    const on = selected === 0;
    $('mp-empty').classList.toggle('hidden', on); $('mp-sel').classList.toggle('hidden', !on);
    if (on) {
      $('mp-best').textContent = (ls.get(LS_BEST, 0) | 0).toLocaleString('en-US');
      $('mp-found').textContent = (unlockAll() ? 11 : [...forestSeen()].length) + '/11';
      Art.draw($('mp-icon'), 0, 6, 64 * u); $('mp-play').classList.add('pulse');
    }
  }
  $('mp-play').addEventListener('click', () => { selected = -1; show('game', 'new'); });
  // Forest island: trees sway (whole rows of canopy shift by whole source pixels), raccoon hops; the island itself never moves.
  function drawForestIsland(t) {
    if (!islCv || !ready(islForest) || !ready(islRac)) return;
    const sw = islForest.naturalWidth, sh = islForest.naturalHeight;
    if (!islSrc) { islSrc = document.createElement('canvas'); islSrc.width = sw; islSrc.height = sh; }
    const s = islSrc.getContext('2d'); s.clearRect(0, 0, sw, sh);
    const on = selected === 0, ts = on ? (performance.now() - selT) / 1000 : 0;
    const amp = on ? 3.2 : 1.0, sway = Math.sin(t * (on ? 2.6 : 1.4));
    const band = 6;
    for (let y = 0; y < FOREST_GROUND; y += band) {
      const k = Math.pow((FOREST_GROUND - y) / FOREST_GROUND, 1.25), dx = Math.round(amp * sway * k);
      const hh = Math.min(band, FOREST_GROUND - y);
      s.drawImage(islForest, 0, y, sw, hh, dx, y, sw, hh);
    }
    s.drawImage(islForest, 0, FOREST_GROUND, sw, sh - FOREST_GROUND, 0, FOREST_GROUND, sw, sh - FOREST_GROUND);
    // raccoon: idle breathing; when selected, a hop every 1.1 s with a little tilt
    let hop = 0, tilt = 0, sq = 1;
    if (on) { const p = (ts % 1.1) / 1.1; if (p < 0.42) { const q = p / 0.42; hop = Math.sin(Math.PI * q) * 14; tilt = Math.sin(Math.PI * 2 * q) * 0.09; } else if (p < 0.52) sq = 1 - 0.06 * Math.sin(Math.PI * (p - 0.42) / 0.1); }
    const rw = islRac.naturalWidth, rh = islRac.naturalHeight, fx = RAC.x + rw / 2, fy = RAC.y + rh;
    s.save(); s.fillStyle = 'rgba(20,30,10,' + (0.28 - hop * 0.008).toFixed(3) + ')';
    s.beginPath(); s.ellipse(fx, fy - 6, rw * (0.36 - hop * 0.006), 7, 0, 0, 7); s.fill(); s.restore();
    s.save(); s.translate(fx, fy - Math.round(hop)); s.rotate(tilt); s.scale(1 / sq * (sq < 1 ? 1.02 : 1), sq);
    s.drawImage(islRac, -rw / 2, -rh); s.restore();
    const g = islCv.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, islCv.width, islCv.height);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(islSrc, 0, 0, islCv.width, islCv.height);
  }
  hooks.map = {
    enter() { selected = -1; placeMap(); refreshPanel(); },
    back() { show('title'); },
  };

  // =====================================================================================
  // ZOOPEDIA
  // =====================================================================================
  let zb = 0, zooFrom = 'title', zooBuilt = false;
  // pixel textures for parchment and leather (generated once, used as CSS backgrounds)
  function tex(seed, base, specks) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), R = rng(seed);
    g.fillStyle = base; g.fillRect(0, 0, 64, 64);
    for (const [col, n, sz] of specks) for (let i = 0; i < n; i++) { g.fillStyle = col; g.fillRect((R() * 64) | 0, (R() * 64) | 0, sz === 2 ? 1 + ((R() * 2) | 0) : 1, 1); }
    return 'url(' + c.toDataURL() + ')';
  }
  document.documentElement.style.setProperty('--parch', tex(7, '#f4e5c3', [['#efdcb3', 260, 2], ['#f8ecd0', 160, 2], ['#e6d0a2', 60, 1], ['#dcc391', 14, 1]]));
  document.documentElement.style.setProperty('--leather', tex(11, '#6a2c16', [['#5e2612', 300, 2], ['#773419', 220, 2], ['#4e1e0c', 70, 1], ['#86401f', 30, 1]]));
  // biome bookmark tabs: colour + a tiny pixel glyph each
  const TAB = {
    forest: ['#3f8a2e', ['...X...', '..XXX..', '.XXXXX.', '..XXX..', '.XXXXX.', 'XXXXXXX', '...X...']],
    ocean: ['#2f7fc6', ['.......', '.XX....', 'X..X..X', '....XX.', '.XX....', 'X..X..X', '....XX.']],
    farm: ['#c99a2e', ['...X...', '..XXX..', '.XXXXX.', 'XX...XX', '.X.X.X.', '.X...X.', '.XXXXX.']],
    arctic: ['#5fb2d9', ['X..X..X', '.X.X.X.', '..XXX..', 'XXXXXXX', '..XXX..', '.X.X.X.', 'X..X..X']],
    oriental: ['#c4362e', ['..XXX..', '.XXXXX.', 'XX.X.XX', 'XX.X.XX', 'XX.X.XX', '.XXXXX.', '...X...']],
    savannah: ['#df8a2a', ['XXXXXXX', '.XXXXX.', '...X...', '...X...', '...X...', '..XXX..', '.......']],
    dinosaurs: ['#5f8a2a', ['X..X..X', 'X..X..X', '.X.X.X.', '..XXX..', '.XXXXX.', '.XXXXX.', '..XXX..']],
    space: ['#46379a', ['...X...', '...X...', 'XXXXXXX', '.XXXXX.', '..XXX..', '.XX.XX.', 'X.....X']],
  };
  const tabCol = b => (TAB[D[b].key] || ['#8a5a2a'])[0];
  function buildTabs() {
    const box = $('tabs'); if (box.childElementCount) return;
    D.forEach((bm, i) => {
      const t = document.createElement('button'); t.className = 'tab'; t.dataset.b = i; t.setAttribute('role', 'tab'); t.setAttribute('aria-label', bm.name);
      const [col, gl] = TAB[bm.key] || ['#8a5a2a', []]; t.style.setProperty('--tc', col);
      const cv = document.createElement('canvas'); cv.width = 9; cv.height = 9; const g = cv.getContext('2d');
      gl.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === 'X') { g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(x + 1, y + 2, 1, 1); } }));
      gl.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === 'X') { g.fillStyle = '#fff6dc'; g.fillRect(x + 1, y + 1, 1, 1); } }));
      t.appendChild(cv); t.addEventListener('click', () => flipTo(i)); box.appendChild(t);
    });
  }
  function zooLayout() {
    drawWood($('zoo-cv')); buildTabs();
    const navH = 70 * u, navBot = 22 * u + sb, cntTop = 72 * u + st, cntH = 40 * u, tabsH = 28 * u;
    const nav = $('zoo-nav'); nav.style.bottom = navBot + 'px';
    const book = $('book');
    const pageW = (W - 24 * u - 30 * u - 20 * u) / 2 - 14 * u;     // inner width of one page (cover, stacks, page padding)
    const cd = Math.min(84 * u, pageW / 2 - 6 * u);
    const rowH = cd + 34 * u;                                      // circle + two-line name
    const want = 3 * rowH + 2 * 6 * u + 38 * u + 52 * u;           // rows + gaps + page padding + cover/stacks
    const regTop = cntTop + cntH + 12 * u + tabsH, regBot = H - (navBot + navH + 34 * u);
    const bh = Math.min(regBot - regTop, want * 1.3), cd2 = bh < want ? Math.max(40 * u, cd - (want - bh) / 3) : cd;
    const bt = regTop + Math.max(0, (regBot - regTop - bh) / 2);
    book.style.top = bt + 'px'; book.style.height = bh + 'px'; book.style.bottom = 'auto';
    $('zoo-count').style.top = (bt - tabsH - cntH - 12 * u) + 'px';
    book.style.setProperty('--cd', cd2 + 'px');
    zooBuilt = true;
  }
  function spot(b, t) {
    const d = document.createElement('div'); d.className = 'spot';
    const c = document.createElement('div'); c.className = 'circ'; d.appendChild(c);
    const n = document.createElement('div'); n.className = 'nm'; d.appendChild(n);
    const a = D[b].animals[t - 1];
    if (isFound(b, t)) {
      d.classList.add('found'); d.dataset.tier = t; n.textContent = a.n.toUpperCase();
      const cv = document.createElement('canvas'); c.appendChild(cv);
      const cd = parseFloat(getComputedStyle($('book')).getPropertyValue('--cd')) || 84;
      Art.draw(cv, b, t, cd);
      d.addEventListener('click', () => { if (!flipping && !swiped) openPopup(b, t); });
      d.setAttribute('role', 'button'); d.setAttribute('aria-label', a.n);
    } else { d.classList.add('unfound'); c.innerHTML = '<div class="lockc">?</div>'; n.textContent = 'LOCKED'; n.classList.add('lk'); }
    const lw = Math.max(...n.textContent.split(' ').map(x => x.length)); if (lw > 7) { n.style.fontSize = (1.25 * 7 / lw) + 'rem'; n.style.letterSpacing = '0'; }
    return d;
  }
  // fill one page of biome b: left = sign + tiers 1-5, right = tiers 6-11, page number at the foot
  function fillPage(el, b, side) {
    el.innerHTML = '';
    if (side === 'l') {
      const sd = document.createElement('div'); sd.className = 'spot signspot'; const si = document.createElement('img'); si.src = SIGN[b]; si.alt = D[b].name; sd.appendChild(si); el.appendChild(sd);
      for (let t = 1; t <= 5; t++) el.appendChild(spot(b, t));
    } else for (let t = 6; t <= 11; t++) el.appendChild(spot(b, t));
    const pn = document.createElement('div'); pn.className = 'pgno'; pn.textContent = b * 2 + (side === 'l' ? 1 : 2); el.appendChild(pn);
  }
  function syncNav() {
    $('zoo-n').textContent = foundCount();
    $('zoo-prev').disabled = $('zoo-cl').disabled = zb === 0; $('zoo-next').disabled = $('zoo-cr').disabled = zb === D.length - 1;
    $('book').dataset.biome = D[zb].key;
    document.querySelectorAll('#tabs .tab').forEach((t, i) => { t.classList.toggle('on', i === zb); t.setAttribute('aria-selected', i === zb); });
  }
  function renderBook() {
    fillPage($('pg-l'), zb, 'l'); fillPage($('pg-r'), zb, 'r'); syncNav();
    if (zb + 1 < D.length) Art.preload(zb + 1);
    if (zb > 0) Art.preload(zb - 1);
  }
  // copy a rendered page (canvases included) onto a leaf face
  function copyPage(src, dst, side) {
    dst.className = 'face ' + dst.classList[1] + ' page ' + (side === 'l' ? 'left' : 'right');
    dst.innerHTML = src.innerHTML;
    const a = src.querySelectorAll('canvas'), c = dst.querySelectorAll('canvas');
    c.forEach((cv, i) => { const o = a[i]; if (!o) return; cv.width = o.width; cv.height = o.height; cv.style.cssText = o.style.cssText; try { cv.getContext('2d').drawImage(o, 0, 0); } catch (e) {} });
  }
  let flipping = false, swiped = false;
  const FLIP_MS = 620;
  function flipTo(nb) {
    if (nb === zb || nb < 0 || nb >= D.length || flipping) return;
    const dir = nb > zb ? 1 : -1, leaf = $('leaf'), sp = $('spread'), pl = $('pg-l'), pr = $('pg-r');
    const front = leaf.querySelector('.front'), back = leaf.querySelector('.back');
    const src = dir > 0 ? pr : pl, r = src.getBoundingClientRect(), sr = sp.getBoundingClientRect();
    flipping = true;
    // the leaf starts as a copy of the page being turned; its back is the new spread's facing page
    copyPage(src, front, dir > 0 ? 'r' : 'l');
    const tmp = document.createElement('div'); fillPage(tmp, nb, dir > 0 ? 'l' : 'r');
    back.className = 'face back page ' + (dir > 0 ? 'left' : 'right'); back.innerHTML = ''; while (tmp.firstChild) back.appendChild(tmp.firstChild);
    fillPage(dir > 0 ? pr : pl, nb, dir > 0 ? 'r' : 'l');               // the page underneath already shows the new spread
    Object.assign(leaf.style, { left: (r.left - sr.left) + 'px', top: (r.top - sr.top) + 'px', width: r.width + 'px', height: r.height + 'px',
      transformOrigin: dir > 0 ? '0 50%' : '100% 50%', transition: 'none', transform: 'rotateY(0deg)' });
    leaf.style.setProperty('--fd', FLIP_MS + 'ms'); sp.style.setProperty('--fd', FLIP_MS + 'ms');
    leaf.classList.remove('hidden', 'go'); sp.classList.add('turning');
    void leaf.offsetWidth;
    leaf.classList.add('go');
    leaf.style.transition = 'transform ' + FLIP_MS + 'ms cubic-bezier(.42,.02,.3,1)';
    leaf.style.transform = 'rotateY(' + (dir > 0 ? -180 : 180) + 'deg)';
    zb = nb; syncNav();
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      fillPage(dir > 0 ? pl : pr, nb, dir > 0 ? 'l' : 'r');
      leaf.classList.add('hidden'); leaf.classList.remove('go'); sp.classList.remove('turning');
      front.innerHTML = ''; back.innerHTML = ''; flipping = false;
      if (zb + 1 < D.length) Art.preload(zb + 1);
    };
    // end exactly when the turn's transition finishes (Web Animations, iOS 13.4+); plain timer otherwise
    requestAnimationFrame(() => {
      const an = leaf.getAnimations ? leaf.getAnimations().find(x => x.transitionProperty === 'transform') : null;
      if (an && an.finished) { an.finished.then(finish, finish); setTimeout(finish, FLIP_MS * 8); }
      else setTimeout(finish, FLIP_MS + 30);
    });
  }
  const flip = dir => flipTo(zb + dir);
  $('zoo-prev').addEventListener('click', () => flip(-1));
  $('zoo-next').addEventListener('click', () => flip(1));
  $('zoo-cl').addEventListener('click', () => flip(-1));
  $('zoo-cr').addEventListener('click', () => flip(1));
  $('zoo-menu').addEventListener('click', () => show('title'));
  // swipe to turn (touch); a swipe never opens a fun fact
  { const sp = $('spread'); let sx = 0, sy = 0, tracking = false;
    sp.addEventListener('touchstart', e => { const t = e.touches[0]; sx = t.clientX; sy = t.clientY; tracking = e.touches.length === 1; swiped = false; }, { passive: true });
    sp.addEventListener('touchmove', e => { if (!tracking) return; const t = e.touches[0]; if (Math.abs(t.clientX - sx) > 12) swiped = true; }, { passive: true });
    sp.addEventListener('touchend', e => { if (!tracking) return; tracking = false; const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.abs(dx) > 40 * u && Math.abs(dx) > Math.abs(dy) * 1.3) { swiped = true; flip(dx < 0 ? 1 : -1); setTimeout(() => { swiped = false; }, 60); } else swiped = false; });
  }
  addEventListener('keydown', e => { if (cur !== 'zoo' || popOpen) return; if (e.key === 'ArrowRight') flip(1); else if (e.key === 'ArrowLeft') flip(-1); });
  function openZoo(o) { zooFrom = (o && o.from) || 'title'; show('zoo'); }
  hooks.zoo = {
    enter() { zooLayout(); renderBook(); },
    back() { if (zooFrom === 'game') show('game', 'resume'); else show('title'); },
  };

  // ---------- fun-fact page ----------
  let popB = 0, popT = 1, popOpen = false;
  function openPopup(b, t) {
    popB = b; popT = t; const a = D[b].animals[t - 1], el = $('popup');
    $('pop-name').textContent = a.n.toUpperCase();
    $('pop-name').style.fontSize = a.n.length > 10 ? (3.8 * 10 / a.n.length) + 'rem' : '';
    $('pop-sign').src = SIGN[b]; $('pop-sign').alt = D[b].name;
    $('pop-tier').textContent = 'TIER ' + t + '/11';
    $('pop-fact').innerHTML = '<b>FUN FACT</b>'; $('pop-fact').appendChild(document.createTextNode(a.f));
    document.querySelector('#popup .card').style.setProperty('--tc', tabCol(b));
    if (!popOpen) { el.classList.remove('hidden'); el.classList.add('fade'); void el.offsetWidth; requestAnimationFrame(() => el.classList.remove('fade')); popOpen = true; }
    fitFact(b, t);
  }
  function fitFact(b, t) { // big badge + large text; shrink the badge first, then the text, if a long fact would overflow
    const f = $('pop-fact'), card = document.querySelector('#popup .card'), max = $('popup').clientHeight - 28 * u;
    let bs = 190, fs = 1.6;
    const apply = () => { Art.draw($('pop-badge'), b, t, bs * u); f.style.fontSize = fs + 'rem'; };
    apply();
    while (card.offsetHeight > max && bs > 120) { bs -= 10; apply(); }
    while (card.offsetHeight > max && fs > 1.25) { fs -= 0.05; apply(); }
  }
  function closePopup(instant) {
    const el = $('popup'); if (!popOpen) return; popOpen = false;
    if (instant === true) { el.classList.add('hidden'); return; }
    el.classList.add('fade'); setTimeout(() => { if (!popOpen) el.classList.add('hidden'); }, 170);
  }
  $('pop-x').addEventListener('click', () => closePopup());
  $('popup').addEventListener('click', e => { if (e.target === $('popup')) closePopup(); });
  addEventListener('keydown', e => { if (e.key === 'Escape') { if (popOpen) closePopup(); else if (!$('settings').classList.contains('hidden')) $('s-close').click(); } });

  // =====================================================================================
  // SCORES
  // =====================================================================================
  function renderScores() {
    drawWood($('scores-cv'));
    const list = $('score-list'); list.style.top = (76 * u + st) + 'px'; list.style.bottom = (20 * u + sb) + 'px'; list.innerHTML = '';
    D.forEach((b, i) => {
      const row = document.createElement('div'); row.className = 'srow' + (i === 0 ? '' : ' locked'); row.dataset.biome = b.key;
      const sg = document.createElement('div'); sg.className = 'sg';
      if (i === 0) sg.innerHTML = '<img src="' + SIGN[i] + '" alt="' + b.name + '">';
      else sg.innerHTML = '<div class="lsign">' + LOCK_SVG + '</div>';
      const v = document.createElement('div'); v.className = 'sv';
      const best = ls.get(LS_BEST, 0) | 0;
      const nmEl = document.createElement('div'); nmEl.className = 'sn';
      nmEl.innerHTML = '<b>' + b.name + '</b><small>' + (i === 0 ? 'BEST SCORE' : 'LOCKED') + '</small>';
      v.innerHTML = i === 0 ? '<b>' + best.toLocaleString('en-US') + '</b>' : '<b>—</b>';
      row.appendChild(sg); row.appendChild(nmEl); row.appendChild(v); list.appendChild(row);
    });
  }
  hooks.scores = { enter: renderScores, back() { show('title'); } };

  // =====================================================================================
  hooks.game = { enter(mode) { window.ZMGame.enter(mode || 'new'); } };
  let rzT;
  addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(() => {
    measure(); titleBg = null; islSrc = null;
    if (cur === 'title') buildTitle(); else if (cur === 'map') { placeMap(); refreshPanel(); } else if (cur === 'zoo') { zooLayout(); renderBook(); } else if (cur === 'scores') renderScores();
    if (popOpen) openPopup(popB, popT);
  }, 140); });

  window.ZMUI = { go: show, openZoo, toast, get screen() { return cur; }, openPopup, closePopup, get popupOpen() { return popOpen; }, isFound, foundCount, get flipping() { return flipping; }, get spread() { return zb; }, flipTo: b => flipTo(b) };
  const routeOf = () => ({ '#play': 'game', '#map': 'map', '#zoo': 'zoo', '#zoopedia': 'zoo', '#scores': 'scores' }[location.hash] || 'title');
  const route = routeOf();
  show(route, route === 'game' ? 'new' : undefined);
  addEventListener('hashchange', () => { const r = routeOf(); if (r === cur) return; if (popOpen) closePopup(true); $('settings').classList.add('hidden'); if (r === 'zoo') openZoo({ from: 'title' }); else show(r, r === 'game' ? 'new' : undefined); });
  requestAnimationFrame(loop);
})();
