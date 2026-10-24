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
  const titleIm = img('img/title-bg.jpg?v=fd4');
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
      if (unlocked) { const hc = document.createElement('canvas'); hc.className = 'halo'; isl.appendChild(hc); buildHalo(hc, r.island.w, r.island.h);
        islCv = document.createElement('canvas'); islCv.className = 'art'; isl.appendChild(islCv); fitCanvas(islCv, r.island.w, r.island.h); isl.id = 'isl-forest'; }
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
  // Selection halo: a chunky pixel-art gold outline that hugs the island's silhouette (trees + rock), fading outward
  // through dithered rings. Built once per layout from the island art's alpha; CSS only pulses its opacity (cheap on iOS).
  function buildHalo(cv, w, h) {
    if (!ready(islForest) || !ready(islRac)) { islForest.addEventListener('load', () => buildHalo(cv, w, h), { once: true }); islRac.addEventListener('load', () => buildHalo(cv, w, h), { once: true }); return; }
    const q = Math.max(2, Math.round(2.4 * u)), R = 7, pad = R * q;            // q = CSS px per halo pixel
    const gw = Math.ceil(w / q) + 2 * R, gh = Math.ceil(h / q) + 2 * R;
    const sw = islForest.naturalWidth, sh = islForest.naturalHeight;
    const m = document.createElement('canvas'); m.width = gw; m.height = gh; const mg = m.getContext('2d');
    mg.imageSmoothingEnabled = true;
    const ox = R, oy = R, dw = w / q, dh = h / q;
    for (const dx of [-3.2, 0, 3.2]) mg.drawImage(islForest, 0, 0, sw, FOREST_GROUND, ox + dx * dw / sw, oy, dw, FOREST_GROUND * dh / sh);   // canopy at both sway extremes
    mg.drawImage(islForest, 0, FOREST_GROUND, sw, sh - FOREST_GROUND, ox, oy + FOREST_GROUND * dh / sh, dw, (sh - FOREST_GROUND) * dh / sh);
    mg.drawImage(islRac, ox + RAC.x * dw / sw, oy + (RAC.y - 16) * dh / sh, islRac.naturalWidth * dw / sw, islRac.naturalHeight * dh / sh);   // raccoon incl. hop
    const a = mg.getImageData(0, 0, gw, gh).data, N = gw * gh, dist = new Int16Array(N).fill(-1), Q = [];
    for (let i = 0; i < N; i++) if (a[i * 4 + 3] > 60) { dist[i] = 0; Q.push(i); }
    for (let k = 0; k < Q.length; k++) { const i = Q[k], x = i % gw, y = (i / gw) | 0, d = dist[i]; if (d >= R) continue;
      for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) { const nx = x + ddx, ny = y + ddy; if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue; const j = ny * gw + nx; if (dist[j] < 0) { dist[j] = d + 1; Q.push(j); } } }
    const g = cv.getContext('2d'); cv.width = gw; cv.height = gh;
    Object.assign(cv.style, { left: -pad + 'px', top: -pad + 'px', width: gw * q + 'px', height: gh * q + 'px' });
    const RING = [null, 'rgba(255,250,200,1)', 'rgba(255,222,90,1)', 'rgba(255,196,50,.92)', 'rgba(255,176,40,.62)', 'rgba(255,170,40,.40)', 'rgba(255,160,40,.24)', 'rgba(255,150,40,.12)'];
    for (let i = 0; i < N; i++) { const d = dist[i]; if (d < 1) continue; const x = i % gw, y = (i / gw) | 0;
      if (d >= 5 && (x + y) % 2) continue;                                       // dither the soft outer rings
      g.fillStyle = RING[d]; g.fillRect(x, y, 1, 1); }
    // the island body itself gets a warm wash so the gold reads as light, not just a sticker outline
    for (let i = 0; i < N; i++) if (dist[i] === 0) { const x = i % gw, y = (i / gw) | 0; g.fillStyle = 'rgba(255,214,90,.55)'; g.fillRect(x, y, 1, 1); }
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
      t.addEventListener('click', () => flipTo(i)); box.appendChild(t);
    });
  }
  // ---------- the physical book: one pixel-art painter for the open Zoopedia spread and the single fun-fact page ----------
  // Everything static (hardcover with thickness + brass corners, desk shadow, cloth divider tabs, stacked page edges, curved
  // aged pages with gutter valley, ribbon) is painted once per layout into a small canvas shown at BK.P CSS px per pixel.
  const BK = { P: 2 };
  const hsh = (x, y, s) => { let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  function inRR(x, y, x0, y0, x1, y1, r) {             // inside rounded rect [x0,x1) x [y0,y1)
    if (x < x0 || y < y0 || x >= x1 || y >= y1) return false;
    const qx = x < x0 + r ? x0 + r : x >= x1 - r ? x1 - r - 1 : x, qy = y < y0 + r ? y0 + r : y >= y1 - r ? y1 - r - 1 : y;
    const dx = x - qx, dy = y - qy; return dx * dx + dy * dy <= r * r + r * 0.5;
  }
  const hexRGB = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  function paintBook(cv, Wc, Hc, o) {
    const P = BK.P, cw0 = Math.max(40, Math.floor(Wc / P)), cw = o.single ? cw0 : cw0 - (1 - cw0 % 2), ch = Math.max(40, Math.floor(Hc / P));
    cv.width = cw; cv.height = ch; cv.style.width = cw * P + 'px'; cv.style.height = ch * P + 'px';
    const g = cv.getContext('2d'), im = g.createImageData(cw, ch), d = im.data;
    const single = !!o.single, tabH = o.tabs ? 15 : 0, rb = o.ribbon ? 10 : 0, SHX = 2, SHY = 3;
    const X0 = 0, Y0 = tabH, X1 = cw - SHX - 1, Y1 = ch - Math.max(SHY + 2, rb), RAD = 4, TH = 3, K = 5;
    const bx0 = X0 + (single ? 10 : 6), bx1 = X1 - 6, by0 = Y0 + 5, by1 = Y1 - TH - 4;
    const cx = single ? bx0 : Math.round((bx0 + bx1) / 2);
    const Lx0 = bx0 + K, Rx1 = bx1 - K, T = by0 + 1, B = by1 - K, G0 = single ? .88 : .68;
    const put = (x, y, r, gg, b, a) => {
      if (x < 0 || y < 0 || x >= cw || y >= ch) return; const i = (y * cw + x) * 4;
      if (a === undefined || a >= 255) { d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = 255; return; }
      const na = a / 255, ea = d[i + 3] / 255, oa = na + ea * (1 - na); if (!oa) return;
      d[i] = (r * na + d[i] * ea * (1 - na)) / oa; d[i + 1] = (gg * na + d[i + 1] * ea * (1 - na)) / oa; d[i + 2] = (b * na + d[i + 2] * ea * (1 - na)) / oa; d[i + 3] = oa * 255;
    };
    const shade = (x, y, k) => { const i = (y * cw + x) * 4; d[i] *= k; d[i + 1] *= k; d[i + 2] *= k; };
    // --- 1. desk shadow + hardcover (leather, bevel, tooled gold line, thickness band, brass corners)
    const inCov = (x, y) => inRR(x, y, X0, Y0, X1, Y1, RAD);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      if (!inCov(x, y)) {
        if (inRR(x - SHX, y - SHY, X0, Y0, X1, Y1, RAD)) put(x, y, 20, 9, 3, 150);
        else if (inRR(x - SHX - 1, y - SHY - 2, X0, Y0, X1, Y1, RAD + 1) && (x + y) % 2 === 0) put(x, y, 20, 9, 3, 80);
        continue;
      }
      const edge = !inCov(x - 1, y) || !inCov(x + 1, y) || !inCov(x, y - 1) || !inCov(x, y + 1);
      const ctl = (x - X0) + (y - Y0), ctr = (X1 - 1 - x) + (y - Y0), cbl = (x - X0) + (Y1 - 1 - y), cbr = (X1 - 1 - x) + (Y1 - 1 - y);
      const cn = Math.min(ctl, ctr, cbl, cbr);
      if (edge) { put(x, y, 30, 11, 4); continue; }
      if (cn <= 9) {                                    // brass corner protectors
        if (cn >= 9) put(x, y, 86, 52, 10);
        else if (cn >= 7) put(x, y, 168, 122, 34);
        else { const hi = cn <= 2 ? 1.12 : 1, n = 1 + (hsh(x, y, 9) - .5) * .1; put(x, y, Math.min(255, 226 * hi * n), Math.min(255, 182 * hi * n), 86 * hi * n); }
        continue;
      }
      if (y >= Y1 - TH) {                               // board thickness: the cover's edge seen from above
        if (y === Y1 - TH) put(x, y, 40, 15, 6); else { const n = 1 + (hsh(x, y, 4) - .5) * .12; put(x, y, 84 * n, 36 * n, 16 * n); }
        continue;
      }
      const n = 1 + (hsh(x, y, 3) - .5) * .16 + Math.sin(x * .23 + Math.sin(y * .11) * 2.2) * .04 + Math.sin(y * .17 + x * .05) * .03;
      let r = 112 * n, gg = 47 * n, b = 23 * n;
      if (!inCov(x, y - 2)) { r += 30; gg += 14; b += 8; } else if (!inCov(x - 2, y)) { r += 16; gg += 7; b += 4; }
      else if (!inCov(x + 2, y)) { r *= .8; gg *= .8; b *= .8; } else if (y === Y1 - TH - 1) { r *= .72; gg *= .72; b *= .72; }
      const tooled = inRR(x, y, X0 + 2, Y0 + 2, X1 - 2, Y1 - TH - 2, RAD - 1) && !inRR(x, y, X0 + 3, Y0 + 3, X1 - 3, Y1 - TH - 3, RAD - 2);
      if (tooled && ((x + y) >> 1) % 2 === 0) { r = 196; gg = 142; b = 82; }
      put(x, y, r, gg, b);
    }
    // --- 2. cloth divider tabs (between cover and pages, so the pages cover their roots); the open one is drawn on an overlay
    const tabRects = [], tabX = [];
    const paintTab = (pt, i, on, lim) => {
      const tb = o.tabs[i], [tx0, tx1] = tabX[i], ty0 = on ? 0 : 3, ty1 = by0 + 6;
      const [cr, cg, cb] = hexRGB(tb.col), dim = on ? 1.04 : .8, tw = tx1 - tx0;
      for (let y = ty0; y < ty1; y++) for (let x = tx0; x < tx1; x++) {
        if (lim && y >= lim[x]) continue;
        if (!inRR(x, y, tx0, ty0, tx1, ty1 + 4, 2)) continue;
        const ed = !inRR(x - 1, y, tx0, ty0, tx1, ty1 + 4, 2) || !inRR(x + 1, y, tx0, ty0, tx1, ty1 + 4, 2) || !inRR(x, y - 1, tx0, ty0, tx1, ty1 + 4, 2);
        if (ed) { pt(x, y, 36, 20, 10); continue; }
        let k = dim * (y % 2 ? .93 : 1) * ((x + (y >> 1)) % 3 === 0 ? .96 : 1);
        if (y <= ty0 + 1) k *= 1.22; else if (x === tx0 + 1) k *= 1.12; else if (x === tx1 - 2) k *= .8;
        if (y >= Y0 + 2) k *= .86;
        pt(x, y, Math.min(255, cr * k), Math.min(255, cg * k), Math.min(255, cb * k));
      }
      for (let y = Math.max(ty0 + 2, Y0); y < ty1; y++) if (!lim || y < lim[tx1]) pt(tx1, y, 10, 4, 1, 90);
      if (on) for (let x = tx0 + 2; x < tx1 - 2; x += 2) pt(x, ty0 + 3, 255, 240, 200, 130);
      const gl = tb.glyph || [], gx = tx0 + Math.floor((tw - 7) / 2), gy = ty0 + 5;
      gl.forEach((row, yy) => [...row].forEach((c, xx) => { if (c === 'X') pt(gx + xx + 1, gy + yy + 1, 0, 0, 0, 110); }));
      gl.forEach((row, yy) => [...row].forEach((c, xx) => { if (c === 'X') pt(gx + xx, gy + yy, 255, 246, 220); }));
    };
    if (o.tabs) {
      const n = o.tabs.length, gap = 1, x0 = X0 + 9, span = X1 - 9 - x0, tw = Math.floor((span - gap * (n - 1)) / n);
      const off = Math.floor((span - (tw * n + gap * (n - 1))) / 2);
      for (let i = 0; i < n; i++) { const tx0 = x0 + off + i * (tw + gap); tabX.push([tx0, tx0 + tw]); tabRects.push({ x: tx0 * P, y: 0, w: tw * P, h: (by0 + 2) * P }); paintTab(put, i, false); }
    }
    // --- 3. pages: K stacked sheets offset outward + down under the top sheet; the top sheet is curved and shaded
    const topOff = s => s < .7 ? 2 * (1 - s / .7) ** 2 : 5 * ((s - .7) / .3) ** 2;      // s: 0 outer edge .. 1 spine
    const botOff = s => s < .62 ? 0 : 4 * ((s - .62) / .38) ** 2;
    const sOf = (L, x, oo) => L ? (x - (Lx0 - oo)) / Math.max(1, cx - 1 - (Lx0 - oo)) : ((Rx1 - 1 + oo) - x) / Math.max(1, (Rx1 - 1 + oo) - cx);
    const layer = (x, y) => {
      if (x < cx && single) return -1; const L = x < cx;
      for (let oo = 0; oo <= K + 1; oo++) {
        if (L ? x < Lx0 - oo : x > Rx1 - 1 + oo) continue;
        const s = Math.min(1, Math.max(0, sOf(L, x, oo)));
        if (y >= T + oo + Math.round(topOff(s)) && y < B + oo - Math.round(botOff(s))) return oo;
      }
      return -1;
    };
    const R0 = rng(o.seed || 5), fox = [];
    for (let i = 0; i < 16; i++) fox.push([bx0 + R0() * (bx1 - bx0), by0 + R0() * (by1 - by0), .7 + R0() * 1.5, R0()]);
    const lay = new Int8Array(cw * ch).fill(-1);
    for (let y = by0 - 1; y < Y1; y++) for (let x = bx0 - 1; x <= bx1 + 1; x++) lay[y * cw + x] = layer(x, y);
    const LA = (x, y) => (x < 0 || y < 0 || x >= cw || y >= ch) ? -1 : lay[y * cw + x];
    for (let y = by0 - 1; y < Y1; y++) for (let x = bx0 - 1; x <= bx1 + 1; x++) {
      const l = LA(x, y);
      if (l < 0) { if (LA(x, y + 1) === 0) put(x, y, 60, 36, 14); continue; }   // dark line above the top edge
      if (l > 0) {
        if (l === K + 1) put(x, y, 58, 34, 14);
        else if (l % 2) { const k = 1 - l * .025; put(x, y, 238 * k, 222 * k, 182 * k); }
        else put(x, y, 168, 134, 90);
        continue;
      }
      const L = x < cx, s = Math.min(1, Math.max(0, sOf(L, x, 0)));
      const dt = y - (T + Math.round(topOff(s))), db = (B - Math.round(botOff(s))) - 1 - y, dout = L ? x - Lx0 : Rx1 - 1 - x;
      const e = Math.min(dt, db, dout);
      let k = 1 + (hsh(x, y, 1) - .5) * .045, add = 0;
      if (hsh(x, y, 2) < .012) k *= .93;
      if (s > G0) { const q = Math.round(((s - G0) / (1 - G0)) ** 2 * 7) / 7; k *= 1 - .52 * q; }
      else if (s > G0 - .28) add = 7;
      if (s < .035) k *= .94;
      const vg = e < 1 ? .83 : e < 2 ? .9 : e < 4 ? .945 : e < 8 ? .972 : 1;
      let r = (241 + add) * k * vg, gg = (224 + add) * k * vg, b = (182 + add) * k * vg * (vg < 1 ? vg : 1);
      for (const [fx, fy, fr, fa] of fox) { const dd = (x - fx) ** 2 + (y - fy) ** 2; if (dd < fr * fr && (fa > .5 || (x + y) % 2)) { r = r * .9 + 196 * .1 - 4; gg = gg * .88 + 160 * .12 - 6; b = b * .8 + 104 * .2 - 8; } }
      if ((L && x === cx - 1) || (!L && x === cx)) { r = 78; gg = 48; b = 22; }
      else if ((L && x === cx - 2) || (!L && x === cx + 1)) { r *= .66; gg *= .64; b *= .6; }
      put(x, y, r, gg, b);
    }
    // --- 4. ribbon bookmark: lies in the gutter, slips out over the bottom page edges and the cover onto the desk
    if (o.ribbon) {
      const ys = B - 18, ye = ch - 2;
      for (let y = ys; y <= ye; y++) {
        const bend = y > Y1 - 3 ? Math.min(3, Math.floor((y - (Y1 - 3)) / 2)) : 0, rx = cx + 2 + bend, end = ye - y;
        for (let i = -1; i <= 4; i++) {
          const x = rx + i;
          if (end < 3 && i >= 1 && i <= 2 && end < 3 - Math.abs(i - 1.5) * 2 + 1.5) continue;   // V-cut tail
          if (i === -1 || i === 4) { put(x, y, 60, 10, 12); continue; }
          const c = i === 0 ? [218, 76, 62] : i === 3 ? [122, 22, 26] : [178, 38, 42], k = y % 3 === 0 ? .92 : 1;
          put(x, y, c[0] * k, c[1] * k, c[2] * k);
        }
        if (y > Y1 - TH - 2) put(rx + 5, y + 1, 10, 4, 1, 100);
      }
    }
    g.putImageData(im, 0, 0);
    // page bitmaps (just the top sheet) for the turning leaf's faces
    const crop = (x0, x1) => {
      const c = document.createElement('canvas'); c.width = x1 - x0; c.height = B - T; const cg = c.getContext('2d'), ci = cg.createImageData(c.width, c.height);
      for (let y = T; y < B; y++) for (let x = x0; x < x1; x++) if (lay[y * cw + x] === 0) { const i = (y * cw + x) * 4, j = ((y - T) * c.width + x - x0) * 4; ci.data[j] = d[i]; ci.data[j + 1] = d[i + 1]; ci.data[j + 2] = d[i + 2]; ci.data[j + 3] = 255; }
      cg.putImageData(ci, 0, 0); return 'url(' + c.toDataURL() + ')';
    };
    // overlay painter for the open tab: taller + brighter, clipped just above the page edge in every column
    const lim = new Int16Array(cw).fill(ch);
    for (let x = 0; x < cw; x++) for (let y = 0; y < Y1; y++) if (lay[y * cw + x] >= 0 || lay[(y + 1) * cw + x] === 0) { lim[x] = y; break; }
    const drawActive = (cv2, i) => {
      cv2.width = cw; cv2.height = ch; cv2.style.width = cw * P + 'px'; cv2.style.height = ch * P + 'px';
      if (!o.tabs || i < 0) return; const g2 = cv2.getContext('2d'), i2 = g2.createImageData(cw, by0 + 8), d2 = i2.data;
      const pt = (x, y, r, gg, b, a) => { if (x < 0 || y < 0 || x >= cw || y >= by0 + 8) return; const j = (y * cw + x) * 4; const na = (a === undefined ? 255 : a) / 255, ea = d2[j + 3] / 255, oa = na + ea * (1 - na); if (!oa) return;
        d2[j] = (r * na + d2[j] * ea * (1 - na)) / oa; d2[j + 1] = (gg * na + d2[j + 1] * ea * (1 - na)) / oa; d2[j + 2] = (b * na + d2[j + 2] * ea * (1 - na)) / oa; d2[j + 3] = oa * 255; };
      paintTab(pt, i, true, lim); g2.putImageData(i2, 0, 0);
    };
    const box = (x0, x1) => ({ x: x0 * P, y: T * P, w: (x1 - x0) * P, h: (B - T) * P });
    return { P, drawActive, L: single ? null : box(Lx0, cx), R: box(cx, Rx1), tabs: tabRects, urlL: o.crops && !single ? crop(Lx0, cx) : '', urlR: o.crops ? crop(cx, Rx1) : '',
      pad: { l: cx * P, r: (cw - Rx1) * P, t: T * P, b: (ch - B) * P } };
  }
  // field-guide illustrations: the bare sprite (no badge circle), crisp at the device ratio (only ever drawn for found animals)
  const plates = new Map();
  async function drawPlate(cv, b, t, css) {
    const n = Math.max(8, Math.round(css * dpr)), tag = b + ':' + t + ':' + n;
    cv.dataset.tag = tag; cv.style.width = cv.style.height = css + 'px';
    let src = plates.get(tag);
    if (!src) {
      let im; try { im = await Art.load(b, t); } catch (e) { return; }
      src = document.createElement('canvas'); src.width = src.height = n; const g = src.getContext('2d');
      const k = Math.max(1, Math.ceil(n / im.naturalWidth)), up = document.createElement('canvas'); up.width = im.naturalWidth * k; up.height = im.naturalHeight * k;
      const ug = up.getContext('2d'); ug.imageSmoothingEnabled = false; ug.drawImage(im, 0, 0, up.width, up.height);
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(up, 0, 0, n, n);
      plates.set(tag, src); if (plates.size > 72) plates.delete(plates.keys().next().value);
    }
    if (cv.dataset.tag !== tag) return;
    cv.width = cv.height = n; const g = cv.getContext('2d'); g.clearRect(0, 0, n, n); g.drawImage(src, 0, 0);
  }
  let zGeo = null;
  function zooLayout() {
    drawWood($('zoo-cv')); buildTabs();
    BK.P = Math.max(2, Math.round(2.2 * u));
    const navH = 70 * u, navBot = 22 * u + sb, cntTop = 72 * u + st, cntH = 40 * u;
    $('zoo-nav').style.bottom = navBot + 'px'; $('zoo-count').style.top = cntTop + 'px';
    const book = $('book'), regTop = cntTop + cntH + 4 * u, regBot = H - (navBot + navH + 6 * u);
    const bw = W - 16 * u, bh = Math.min(regBot - regTop, bw * 1.5);
    const bt = regTop + Math.max(0, (regBot - regTop - bh) / 2);
    Object.assign(book.style, { left: 8 * u + 'px', right: 'auto', width: bw + 'px', top: bt + 'px', height: bh + 'px', bottom: 'auto' });
    const tabs = D.map((bm, i) => ({ col: tabCol(i), glyph: (TAB[bm.key] || [0, []])[1] }));
    zGeo = paintBook($('book-cv'), bw, bh, { tabs, ribbon: true, crops: true, seed: 5 });
    book.style.left = Math.round((W - parseFloat($('book-cv').style.width)) / 2) + 'px';
    book.style.setProperty('--pgL', zGeo.urlL); book.style.setProperty('--pgR', zGeo.urlR);
    const place = (el, r) => Object.assign(el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
    place($('pg-l'), zGeo.L); place($('pg-r'), zGeo.R);
    document.querySelectorAll('#tabs .tab').forEach((t, i) => place(t, zGeo.tabs[i]));
    const cs = 46 * u, cl = $('zoo-cl'), cr = $('zoo-cr');
    place(cl, { x: zGeo.L.x, y: zGeo.L.y + zGeo.L.h - cs, w: cs, h: cs }); place(cr, { x: zGeo.R.x + zGeo.R.w - cs, y: zGeo.R.y + zGeo.R.h - cs, w: cs, h: cs });
    // entry frame size: two columns per page, three rows under the heading
    const pw = zGeo.L.w - 28 * u, ph = zGeo.L.h - 40 * u - 34 * u;
    const cd = Math.max(40 * u, Math.min((pw - 10 * u) / 2, ph / 3 - 46 * u));
    book.style.setProperty('--cd', cd + 'px');
    zooBuilt = true;
  }
  function spot(b, t) {
    const d = document.createElement('div'); d.className = 'spot';
    const c = document.createElement('div'); c.className = 'circ'; d.appendChild(c);
    const cap = document.createElement('div'); cap.className = 'cap'; d.appendChild(cap);
    const no = document.createElement('div'); no.className = 'no'; no.textContent = 'No.' + String(b * 11 + t).padStart(2, '0'); cap.appendChild(no);
    const n = document.createElement('div'); n.className = 'nm'; cap.appendChild(n);
    const a = D[b].animals[t - 1], cd = parseFloat(getComputedStyle($('book')).getPropertyValue('--cd')) || 84;
    if (isFound(b, t)) {
      const cv = document.createElement('canvas'); c.appendChild(cv);
      d.classList.add('found'); d.dataset.tier = t; n.textContent = a.n.toUpperCase();
      drawPlate(cv, b, t, cd * .86);
      d.addEventListener('click', () => { if (!flipping && !swiped) openPopup(b, t); });
      d.setAttribute('role', 'button'); d.setAttribute('aria-label', a.n);
    } else {
      d.classList.add('unfound');            // locked: a plain solid block with a '?', never the animal's shape
      const q = document.createElement('div'); q.className = 'lockc'; q.textContent = '?'; c.appendChild(q);
      n.textContent = '???'; n.classList.add('lk'); d.setAttribute('aria-label', 'Not found yet');
    }
    const lw = Math.max(...n.textContent.split(' ').map(x => x.length)), fz = Math.min(13 * u, cd / (lw * 1.12)); if (fz < 13 * u) { n.style.fontSize = fz + 'px'; n.style.letterSpacing = '0'; }
    return d;
  }
  // fill one page of biome b: heading, then left = pasted-in biome sign + tiers 1-5, right = tiers 6-11; page number at the foot
  function fillPage(el, b, side) {
    el.innerHTML = '';
    const hd = document.createElement('div'); hd.className = 'pghead'; hd.innerHTML = '<span></span>';
    hd.firstChild.textContent = side === 'l' ? D[b].name.toUpperCase() : 'FIELD NOTES'; el.appendChild(hd);
    if (side === 'l') {
      const sd = document.createElement('div'); sd.className = 'spot signspot'; const si = document.createElement('img'); si.src = SIGN[b]; si.alt = D[b].name; sd.appendChild(si); el.appendChild(sd);
      for (let t = 1; t <= 5; t++) el.appendChild(spot(b, t));
    } else for (let t = 6; t <= 11; t++) el.appendChild(spot(b, t));
    const pn = document.createElement('div'); pn.className = 'pgno'; pn.textContent = '- ' + (b * 2 + (side === 'l' ? 1 : 2)) + ' -'; el.appendChild(pn);
  }
  function syncNav() {
    $('zoo-n').textContent = foundCount();
    $('zoo-prev').disabled = $('zoo-cl').disabled = zb === 0; $('zoo-next').disabled = $('zoo-cr').disabled = zb === D.length - 1;
    $('book').dataset.biome = D[zb].key;
    document.querySelectorAll('#tabs .tab').forEach((t, i) => { t.classList.toggle('on', i === zb); t.setAttribute('aria-selected', i === zb); });
    if (zGeo) zGeo.drawActive($('book-tab'), zb);
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
  function fitFact(b, t) { // big illustration + large text; shrink the picture first, then the text, if a long fact would overflow
    const f = $('pop-fact'), card = document.querySelector('#popup .card'), max = $('popup').clientHeight - 28 * u, P = BK.P = Math.max(2, Math.round(2.2 * u));
    card.style.padding = (6 * P) + 'px ' + (14 * P) + 'px ' + (17 * P) + 'px ' + (10 * P) + 'px';
    let bs = 170, fs = 1.6;
    const apply = () => { drawPlate($('pop-badge'), b, t, bs * u); f.style.fontSize = fs + 'rem'; };
    apply();
    while (card.offsetHeight > max && bs > 110) { bs -= 10; apply(); }
    while (card.offsetHeight > max && fs > 1.25) { fs -= 0.05; apply(); }
    paintBook(card.querySelector('.pbg'), card.offsetWidth, card.offsetHeight, { single: true, seed: 9 + t });
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
