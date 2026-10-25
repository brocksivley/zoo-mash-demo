/* Zoo Mash – screens around the levels: title (+ tappable penguin / sleepy bear / banana monkey), biome map (8 islands,
   progression: reaching tier 11 in a biome unlocks the next one), Zoopedia (+ fun-fact popup), scores, settings.
   Pure canvas/DOM, no libraries. game.js owns the level; this file only enters/leaves it through window.ZMGame. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const D = window.ZM_DATA, Art = window.ZMArt;
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
               set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  const LS_UNLOCK = 'zoomash.demo.unlockAll';
  const lsKey = (b, k) => 'zoomash.' + D[b].key + '.' + k;          // same keys game.js uses (forest = the v4 keys)
  const dprOf = () => Math.min(3, window.devicePixelRatio || 1);
  let W = innerWidth, H = innerHeight, u = 1, dpr = dprOf(), st = 0, sb = 0;
  function measure() {   // v6: size from the fixed screen box, not innerHeight (iOS 26 Safari runs the page under its toolbar; see vp.js)
    const v = (window.ZMVP.last = window.ZMVP.measure());
    W = v.W; H = v.H; st = v.st; sb = v.sb; dpr = dprOf(); u = Math.min(W / 440, H / 956);
    document.documentElement.style.fontSize = (10 * u) + 'px';
  }
  measure();
  const img = src => { const im = new Image(); im.src = src; return im; };
  const ready = im => im.complete && im.naturalWidth > 0;
  const SIGN = D.map(b => 'img/sign-' + b.key + '.png');
  // v6: warm every Zoopedia image (88 animal arts + 8 signs) shortly after boot and decode them, so the book never trickles in
  const signIms = [];
  let preloadDone = false;
  const preloadAll = new Promise(r => setTimeout(r, 60)).then(() => Promise.all([
    ...D.flatMap((x, b) => Array.from({ length: 11 }, (y, i) => Art.load(b, i + 1).catch(() => {}))),
    ...SIGN.map(u => { const im = new Image(); im.src = u; signIms.push(im); return im.decode ? im.decode().catch(() => {}) : new Promise(z => { im.onload = im.onerror = z; }); })
  ])).then(() => { preloadDone = true; });
  const LOCK_SVG = '<svg class="lockico" viewBox="0 0 12 14" shape-rendering="crispEdges"><g fill="#26292c"><rect x="3" y="0" width="6" height="2"/><rect x="2" y="1" width="2" height="6"/><rect x="8" y="1" width="2" height="6"/><rect x="0" y="6" width="12" height="8"/></g><rect x="1" y="7" width="10" height="6" fill="#e3e5e7"/><rect x="1" y="11" width="10" height="2" fill="#b4b8bc"/><rect x="5" y="8" width="2" height="3" fill="#26292c"/></svg>';

  // ---------- found / unlock state ----------
  const unlockAll = () => !!ls.get(LS_UNLOCK, false);
  const seenOf = b => new Set(ls.get(lsKey(b, 'seen'), []));
  const bestOf = b => ls.get(lsKey(b, 'best'), 0) | 0;
  function isFound(b, t) { return unlockAll() || seenOf(b).has(t); }
  function foundIn(b) { return unlockAll() ? 11 : [...seenOf(b)].filter(t => t >= 1 && t <= 11).length; }
  function foundCount() { let n = 0; for (let b = 0; b < D.length; b++) n += foundIn(b); return n; }
  // progression: Forest is always open; reaching the final tier (11) in a biome unlocks the next one. "Unlock all" opens everything.
  function unlockedB(b) { return b === 0 || unlockAll() || seenOf(b - 1).has(11); }

  const uaHide = new Set();                                            // v7.2: unlocked islands still waiting for their map reveal
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
  swU.addEventListener('click', () => { ls.set(LS_UNLOCK, !unlockAll()); syncUnlock(); if (cur === 'zoo') renderBook(); if (cur === 'map') { placeMap(); refreshPanel(); } if (cur === 'scores') renderScores(); });
  syncUnlock();

  // ---------- one animation loop for the decorative screens ----------
  let t0 = performance.now(), lastS = 0;
  function loop(t) {
    requestAnimationFrame(loop);                       // schedule first so one bad frame can never stop the loop
    const s = Math.max(0, (t - t0) / 1000);            // the first rAF stamp can precede t0 (negative time broke the bird frame)
    const dt = Math.min(0.1, Math.max(0, s - lastS)); lastS = s;
    if (cur === 'title') { if (!document.hidden && !TA.hold) TA.clock += dt; titleTick(); drawTitle(s); }
    else if (cur === 'map') drawIslands(s);
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
    drawCritters(g);
  }
  // ---------- title interactions (pixel sprites over the backdrop; coordinates in title-bg source px) ----------
  // Penguin: a tap = a ~0.6 s waddle; more than 5 taps inside 2 s = he tips over backwards, bounces, lies feet-up, and gets
  // up again after ~1.5 s (taps ignored meanwhile). Bear (v7): asleep the whole time (closed eyes + pixel Zs drifting up);
  // a tap startles him awake (!), he yawns, gets drowsy and dozes off again 3-5 s after the tap (taps ignored while awake;
  // no timer ever wakes him). Monkey: a tap raises a banana over his head and lowers it (~1.5 s; taps ignored while it plays). TA.clock only runs
  // while the title is visible, so nothing jumps when you come back to it.
  const penPlate = img('img/title-penguin-plate.png');
  const HIT = { penguin: [484, 655, 92, 140], bear: [578, 468, 142, 206], monkey: [30, 552, 96, 100] };
  const PEN = { x: 486, y: 660, w: 88, h: 130, foot: [531, 783], heel: [566, 783], plate: [482, 656] };
  const WADDLE = 0.6, FALL = { tip: 0.45, bounce: 0.35, lie: 1.5, up: 0.5 }, FALL_T = 2.8, MONK_DUR = 1.5;
  const BEAR = { startle: 1.0, yawnIn: 0.15, yawnHold: 0.8, yawnOut: 0.15, dozeMin: 3, dozeMax: 5, close: 0.4, zPeriod: 2.4, zGap: 0.8, fps: 6 };
  const TA = { clock: 0, pen: { mode: 'idle', t0: 0, taps: [], falls: 0, waddles: 0 }, bear: { mode: 'sleep', t0: 0, sleepAt: 0, sleep0: 0, taps: 0, ignored: 0, wakes: 0 }, monk: { mode: 'idle', t0: 0, raises: 0, ignored: 0 } };
  function titleTick() {
    const c = TA.clock, p = TA.pen, b = TA.bear, m = TA.monk;
    if (p.mode === 'waddle' && c - p.t0 >= WADDLE) p.mode = 'idle';
    if (p.mode === 'fall' && c - p.t0 >= FALL_T) p.mode = 'idle';
    if (b.mode === 'awake' && c >= b.sleepAt) { b.mode = 'sleep'; b.sleep0 = b.sleepAt; }
    if (m.mode === 'up' && c - m.t0 >= MONK_DUR) m.mode = 'idle';
  }
  function tapPenguin() {
    const p = TA.pen, c = TA.clock;
    if (p.mode === 'fall') return false;
    p.taps = p.taps.filter(x => c - x < 2); p.taps.push(c);
    if (p.taps.length > 5) { p.mode = 'fall'; p.t0 = c; p.taps = []; p.falls++; }
    else { p.mode = 'waddle'; p.t0 = c; p.waddles++; }
    return true;
  }
  // v7: a tap wakes the sleeping bear (startle -> yawn -> doze -> asleep again 3-5 s later, randomised); taps while awake are ignored
  let bearRng = Math.random;
  function tapBear() {
    const b = TA.bear, c = TA.clock; if (b.mode !== 'sleep') { b.ignored++; return false; }
    b.mode = 'awake'; b.t0 = c; b.sleepAt = c + BEAR.dozeMin + (BEAR.dozeMax - BEAR.dozeMin) * bearRng(); b.taps++; b.wakes++; return true;
  }
  function tapMonkey() { const m = TA.monk; if (m.mode !== 'idle') { m.ignored++; return false; } m.mode = 'up'; m.t0 = TA.clock; m.raises++; return true; }
  function hitAt(x, y) {
    if (!tl) return null; const sx = (x - tl.x0) / tl.s, sy = y / tl.s;
    for (const k in HIT) { const [hx, hy, hw, hh] = HIT[k]; if (sx >= hx && sx < hx + hw && sy >= hy && sy < hy + hh) return k; }
    return null;
  }
  function hitRect(k) { const [hx, hy, hw, hh] = HIT[k]; return tl ? { x: tl.x0 + hx * tl.s, y: hy * tl.s, w: hw * tl.s, h: hh * tl.s } : null; }
  $('title-cv').addEventListener('pointerdown', e => {
    if (cur !== 'title') return; const k = hitAt(e.clientX, e.clientY);
    if (k === 'penguin') tapPenguin(); else if (k === 'monkey') tapMonkey(); else if (k === 'bear') tapBear();
  });
  // v6: every critter move is a drawn pixel frame; nothing is rotated, skewed or scaled at draw time, positions are whole
  // source px and frames step at 6-8 fps. Bear + monkey frames are opaque patches of the backdrop region they cover (the
  // critter redrawn inside it: the bear's own arm, the monkey's own arm/banana/grin), drawn 1:1 over the backdrop
  // (tools/title_patches_v6.py). Penguin frames are drawn poses on a 3-px cell (tools/title_penguin_v6.py).
  const penSheet = img('img/title-penguin-v6.png?v=fd6'), bearSheet = img('img/title-bear-sleep-v7.png?v=fd7s'), monkSheet = img('img/title-monkey-v6.png?v=fd7');
  const PENF = { fw: 240, fh: 156, at: [90, 138], idx: { idle: 0, wl: 1, wr: 2, flail: 3, fall: 4, lie: 5, lie2: 6, lie3: 7 } };
  const BEARF = { w: 57, h: 57, x: 620, y: 538, idx: { closed: 0, half: 1, yawn1: 2, yawn: 3 } };   // face patches (tools/title_bear_sleep_v7.py)
  const MONKF = { w: 120, h: 120, x: 30, y: 520, idx: { low: 0, mid: 1, up: 2, up2: 3 } };
  // penguin sequences: [frame, dx, dy] per step
  const WAD_SEQ = [['wl', 0, -3], ['wr', 3, 0], ['wl', 3, -3], ['wr', 0, 0], ['idle', 0, 0]];       // 8 fps, 0.6 s
  const TIP_SEQ = [['flail', 0, -3], ['fall', 3, -9], ['fall', 3, -3], ['lie', 0, 0]];                // 8 fps, 0.45 s
  const BNC_SEQ = [['lie', 0, -6], ['lie', 0, -3], ['lie', 0, 0]];                                   // 8 fps, 0.35 s
  const UP_SEQ = [['fall', 3, -6], ['flail', 0, -6], ['flail', 0, 0], ['idle', 0, 0]];                // 8 fps, 0.5 s
  const stepAt = (seq, e, fps) => seq[Math.max(0, Math.min(seq.length - 1, Math.floor(e * fps)))];
  function penPose() {                     // {frame, dx, dy} while animating, or null at rest
    const p = TA.pen, e = TA.clock - p.t0; let st = null;
    if (p.mode === 'waddle') st = stepAt(WAD_SEQ, e, 8);
    else if (p.mode === 'fall') {
      const f = FALL;
      if (e < f.tip) st = stepAt(TIP_SEQ, e, 8);
      else if (e < f.tip + f.bounce) st = stepAt(BNC_SEQ, e - f.tip, 8);
      else if (e < f.tip + f.bounce + f.lie) {         // lying feet-up: little kicks at 6 fps that settle down
        const k = Math.floor((e - f.tip - f.bounce) * 6), kick = k < 6 ? ['lie2', 'lie3'][k % 2] : k % 3 === 0 && k < 8 ? 'lie3' : 'lie';
        st = [kick, 0, 0];
      } else st = stepAt(UP_SEQ, e - f.tip - f.bounce - f.lie, 8);
    }
    if (!st) return null;
    return { frame: st[0], dx: st[1], dy: st[2] };
  }
  // bear (v7): only his eyes (and, for the yawn, his mouth inside the muzzle) change; the patch frames are the v6 rest
  // pixels with those few cells repainted. Zs and the '!' are 3-px-cell pixel glyphs (cream, dark outline) on the backdrop's
  // cell phase, frame-stepped at 6 fps with stepped fades; nothing moves smoothly.
  const ZG = { 4: ['####', '..#.', '.#..', '####'], 5: ['#####', '...#.', '..#..', '.#...', '#####'], 6: ['######', '....#.', '...#..', '..#...', '.#....', '######'] };
  const BANG = { small: ['#', '#', '.', '#'], big: ['##', '##', '##', '..', '##'] };
  const GLYPH = { cell: 3, fill: '#fff4d6', line: '#2a1406', z0: [647, 499], bang: [653, 499] };   // anchors = bottom-left (x = 2 mod 3, y = 1 mod 3)
  function bearZs(age) {                  // Zs alive `age` s after he fell asleep: [{size, x, y, a, step}]
    const out = [], fps = BEAR.fps;
    for (let i = 0; i < 3; i++) {
      const t = age - i * BEAR.zGap; if (t < 0) continue;            // they start one by one, then loop
      const k = Math.floor((t % BEAR.zPeriod) * fps);                // 0..14
      const size = k < 5 ? 4 : k < 10 ? 5 : 6;
      out.push({ size, step: k, x: GLYPH.z0[0] + 3 * Math.floor(k * 5 / 14), y: GLYPH.z0[1] - 3 * Math.floor(k * 1.4),
        a: k === 0 ? 0.5 : k >= 14 ? 0.25 : k >= 13 ? 0.45 : k >= 12 ? 0.7 : 1 });
    }
    return out;
  }
  function bearPose() {                     // {phase, frame (null = his open rest eyes), bang, zs}
    const b = TA.bear, c = TA.clock, B = BEAR;
    if (b.mode === 'sleep') return { phase: 'asleep', frame: 'closed', bang: null, zs: bearZs(c - b.sleep0) };
    const e = c - b.t0, y0 = B.startle, y1 = y0 + B.yawnIn, y2 = y1 + B.yawnHold, y3 = y2 + B.yawnOut;
    if (e < y0) return { phase: 'startle', frame: null, bang: e < 1 / 8 ? 'small' : e < 0.9 ? 'big' : null, bangDy: e < 1 / 8 ? 0 : e < 0.25 ? -6 : -3, zs: [] };
    if (e < y3) return { phase: 'yawn', frame: e < y1 || e >= y2 ? 'yawn1' : 'yawn', bang: null, zs: [] };
    return { phase: 'doze', frame: c >= b.sleepAt - B.close ? 'closed' : 'half', bang: null, zs: [] };
  }
  function drawGlyph(g, rows, x, y, alpha) {   // (x, y) = bottom-left in backdrop px
    const C = GLYPH.cell, top = y - rows.length * C; g.globalAlpha = alpha;
    g.fillStyle = GLYPH.line;
    rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === '#') g.fillRect(x + i * C - C, top + j * C - C, 3 * C, 3 * C); }));
    g.fillStyle = GLYPH.fill;
    rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch === '#') g.fillRect(x + i * C, top + j * C, C, C); }));
    g.globalAlpha = 1;
  }
  // monkey: arm comes up from behind the TICKETS sign (8 fps), bobs the banana with a grin (6 fps), goes back down (8 fps)
  function monkPose() {                     // {frame} or null
    const m = TA.monk; if (m.mode !== 'up') return null;
    const e = TA.clock - m.t0, up = 3 / 8, down = MONK_DUR - 3 / 8;
    if (e < up) return { frame: ['low', 'mid', 'up'][Math.floor(e * 8)] };
    if (e < down) return { frame: ['up', 'up2'][Math.floor((e - up) * 6) % 2] };
    const k = Math.floor((e - down) * 8); return k < 3 ? { frame: ['up', 'mid', 'low'][k] } : null;
  }
  // v7.1 walk-on cat (not interactive): 2 s after the title opens it trots in from the left along the cobblestones, sits at
  // its spot for 2 s (looks around, ear twitch, tail flick), then scurries off to the right; repeats every 15 s (start to
  // start) and restarts from the 2 s delay each time the title is entered. Frames: 3-px-cell pixel poses (tools/title_cat_v71.py),
  // positions snapped to the backdrop's 3-px cell phase. The exit lane dips below the penguin's lowest pixel (y 786, any of
  // his frames) and stays above the PLAY text; if a viewport ever leaves no room for that, the cat is skipped there.
  const catSheet = img('img/title-cat-v71.png?v=fd73');
  const CATF = { fw: 120, fh: 90, foot: 84, idx: { walk0: 0, walk1: 1, walk2: 2, walk3: 3, sit0: 4, sit1: 5, sit2: 6, sit3: 7, sit4: 8, run0: 9, run1: 10, run2: 11, run3: 12 },
    runUp: 72, below: 3 };       // run frames: ink reaches 72 px above the foot line and 3 px (outline) below it
  // spotX/footY: Brock's circled spot (cat centred ~y 790); the run lane keeps the cat's top >= the penguin's lowest pixel + 6
  const CAT = { delay: 2, period: 15, inDur: 1.2, sit: 2, runV: 470, spotX: 282, footY: 830, laneMax: 880, penBot: 786, penGap: 6, drop: 120 };
  const SIT_SEQ = [['sit0', .5], ['sit1', .45], ['sit0', .2], ['sit2', .2], ['sit0', .15], ['sit3', .2], ['sit4', .15], ['sit0', .15]];
  const catReduce = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();
  let cat0 = 0;
  const snapX = v => Math.round((v - 2) / 3) * 3 + 2, snapY = v => Math.round((v - 1) / 3) * 3 + 1;
  function catLane() {                       // foot line of the exit run (source px). v7.1: the cat may pass BEHIND the PLAY text
    if (!tl) return null;                    // (the menu is a DOM layer above the title canvas, so PLAY stays readable and tappable);
    const lane = Math.floor((CAT.laneMax - 1) / 3) * 3 + 1;              // it must still never touch the penguin's pixels
    if (lane - CATF.runUp < CAT.penBot + CAT.penGap) return null;       // (backdrop coords are fixed, so this never triggers: 880-72 > 792)
    return lane;
  }
  function catPose() {                       // {frame, x, y (frame top-left, source px), phase} or null
    if (catReduce || !tl) return null;
    const t = TA.clock - cat0 - CAT.delay; if (t < 0) return null;
    const k = t % CAT.period, lane = catLane(); if (lane == null) return null;
    const L = -tl.x0 / tl.s, R = (W - tl.x0) / tl.s, half = CATF.fw / 2;
    const xIn0 = L - CATF.fw - 6, xSpot = CAT.spotX - half;
    if (k < CAT.inDur) {                     // trot in: walk cycle at 10 fps, easing to a stop over the last ~15%
      const u = k / CAT.inDur, e = u < .85 ? u / .85 * .92 : .92 + .08 * (1 - Math.pow(1 - (u - .85) / .15, 2));
      return { phase: 'in', frame: 'walk' + (Math.floor(k * 10) % 4), x: snapX(xIn0 + (xSpot - xIn0) * Math.min(1, e)), y: snapY(CAT.footY - CATF.foot) };
    }
    let e = k - CAT.inDur;
    if (e < CAT.sit) { let a = 0; for (const [f, d] of SIT_SEQ) { a += d; if (e < a) return { phase: 'sit', frame: f, x: snapX(xSpot), y: snapY(CAT.footY - CATF.foot) }; }
      return { phase: 'sit', frame: 'sit0', x: snapX(xSpot), y: snapY(CAT.footY - CATF.foot) }; }
    e -= CAT.sit;
    const dx = e * CAT.runV, x = xSpot + dx; if (x > R + 6) return null;
    const fy = CAT.footY + (lane - CAT.footY) * Math.min(1, dx / CAT.drop);   // dips to the lane in the first 120 px
    return { phase: 'run', frame: 'run' + (Math.floor(e * 12) % 4), x: snapX(x), y: snapY(fy - CATF.foot) };
  }
  let catCv = null;
  function drawCat(g) {
    const cp = catPose(); if (!cp || !ready(catSheet)) return;
    const i = CATF.idx[cp.frame];
    // soft pixel shadow under the paws (3-px cells), then the frame
    const fy = cp.y + CATF.foot, cx = cp.x + (cp.phase === 'sit' ? 58 : 52);   // centre of the ground contact (haunch->paws / hind->fore paws)
    g.fillStyle = 'rgba(16,8,3,.32)';
    const sw = cp.phase === 'sit' ? 18 : 24;
    g.fillRect(cx - sw * 1.5, fy - 1, sw * 3, 3); g.fillRect(cx - sw * 1.5 + 6, fy + 2, sw * 3 - 12, 3);
    // match the title's bottom darkening (buildTitle: 0 at 60% of the height -> .5 at the bottom) so the cat sits in the scene light
    if (!catCv) { catCv = document.createElement('canvas'); catCv.width = CATF.fw; catCv.height = CATF.fh; }
    const c = catCv.getContext('2d'); c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, CATF.fw, CATF.fh);
    c.imageSmoothingEnabled = false; c.drawImage(catSheet, i * CATF.fw, 0, CATF.fw, CATF.fh, 0, 0, CATF.fw, CATF.fh);
    const yc = (cp.y + CATF.fh / 2) * tl.s, a = Math.max(0, Math.min(.5, (yc - H * .6) / (H * .4) * .5));
    if (a > 0) { c.globalCompositeOperation = 'source-atop'; c.fillStyle = `rgba(10,5,2,${a.toFixed(3)})`; c.fillRect(0, 0, CATF.fw, CATF.fh); }
    g.drawImage(catCv, cp.x, cp.y);
  }
  function drawCritters(g) {
    if (!tl) return;
    g.save(); g.setTransform(dpr * tl.s, 0, 0, dpr * tl.s, dpr * tl.x0, 0); g.imageSmoothingEnabled = false;
    const mp = monkPose();
    if (mp && ready(monkSheet)) g.drawImage(monkSheet, MONKF.idx[mp.frame] * MONKF.w, 0, MONKF.w, MONKF.h, MONKF.x, MONKF.y, MONKF.w, MONKF.h);
    const bp = bearPose();
    if (bp.frame && ready(bearSheet)) g.drawImage(bearSheet, BEARF.idx[bp.frame] * BEARF.w, 0, BEARF.w, BEARF.h, BEARF.x, BEARF.y, BEARF.w, BEARF.h);
    for (const z of bp.zs) drawGlyph(g, ZG[z.size], z.x, z.y, z.a);
    if (bp.bang) drawGlyph(g, BANG[bp.bang], GLYPH.bang[0], GLYPH.bang[1] + bp.bangDy, 1);
    // penguin: while animating, the patch over his painted body is drawn first, then the pose frame
    const pp = penPose();
    if (pp && ready(penSheet) && ready(penPlate)) {
      g.drawImage(penPlate, PEN.plate[0], PEN.plate[1]);
      const i = PENF.idx[pp.frame];
      g.drawImage(penSheet, i * PENF.fw, 0, PENF.fw, PENF.fh, PEN.heel[0] - PENF.at[0] + pp.dx, PEN.heel[1] - PENF.at[1] + pp.dy, PENF.fw, PENF.fh);
    }
    drawCat(g);
    g.restore();
  }
  const tms = [...document.querySelectorAll('#title-menu .tm')];
  const selTm = b => tms.forEach(x => x.classList.toggle('sel', x === b));
  selTm(tms[0]);
  tms.forEach(b => {
    b.addEventListener('pointerenter', () => selTm(b)); b.addEventListener('pointerdown', () => selTm(b));
    b.addEventListener('click', () => { const go = b.dataset.go; if (go === 'settings') openSettings(); else if (go === 'zoo') openZoo({ from: 'title' }); else show(go); });
  });
  hooks.title = { enter() { selTm(tms[0]); if (!titleBg) buildTitle(); cat0 = TA.clock; } };

  // =====================================================================================
  // MAP
  // =====================================================================================
  // islands: base art + the biome animal drawn separately (hops when selected); sway groups = canopy/plant rects that shift by
  // whole source pixels, more at the top, never below their ground row. mode c = cleared then redrawn shifted, o = drawn over,
  // f = flag (columns wave up/down). an = animal offset, icon = the tier shown in the panel (the island's animal).
  const ISL = [
    { k: 'forest', sz: [415, 464], an: [110, 133], icon: 6, sway: [{ m: 'c', r: [[0, 0, 415, 186]] }] },
    { k: 'ocean', sz: [415, 470], an: [137, 162], icon: 4, sway: [{ m: 'c', r: [[20, 0, 212, 205]] }, { m: 'c', r: [[218, 15, 380, 210]] }] },
    { k: 'farm', sz: [415, 424], an: [155, 128], icon: 8, sway: [{ m: 'o', r: [[44, 130, 82, 178]] }, { m: 'o', r: [[104, 170, 142, 215]] }, { m: 'o', r: [[258, 165, 362, 210]] }] },
    { k: 'arctic', sz: [415, 485], an: [142, 128], icon: 7, sway: [{ m: 'c', r: [[45, 0, 178, 225]] }, { m: 'c', r: [[238, 0, 372, 225]] }] },
    { k: 'oriental', sz: [415, 472], an: [163, 137], icon: 10, sway: [{ m: 'c', r: [[205, 8, 378, 190]] }, { m: 'c', r: [[15, 120, 68, 225]] }, { m: 'c', r: [[335, 125, 395, 230]] }] },
    { k: 'savannah', sz: [415, 453], an: [133, 112], icon: 10, sway: [{ m: 'c', r: [[15, 0, 255, 98], [15, 98, 180, 175]] }, { m: 'c', r: [[248, 65, 375, 170]] }] },
    { k: 'jurassic', sz: [415, 465], an: [149, 150], icon: 7, sway: [{ m: 'c', r: [[50, 0, 200, 100], [95, 100, 140, 215]] }, { m: 'c', r: [[245, 15, 375, 120], [270, 120, 320, 215]] }] },
    { k: 'space', sz: [415, 462], an: [146, 115], icon: 1, sway: [{ m: 'f', r: [[101, 60, 160, 95]] }] },
  ];
  ISL.forEach(o => { o.base = img('img/island-' + o.k + '.png'); o.ani = img(o.k === 'forest' ? 'img/island-forest-raccoon.png' : 'img/island-' + o.k + '-animal.png');
    o.sway.forEach(gp => { gp.top = Math.min(...gp.r.map(r => r[1])); gp.g = Math.max(...gp.r.map(r => r[3])); }); });
  const islLocked = img('img/island-locked.png');
  let mapL = null, selected = -1, selT = 0, islCv = [], islSrc = [];
  function mapLayout() {
    const top = 60 * u + st, panelTop = H - sb - 12 * u - 94 * u;
    const A = 7 * u, hw = 18 * u, cliff = 12 * u, E = A + hw + cliff + 4;
    const iw = 98 * u, gap = 8 * u, sw = 64 * u, sh = sw / 1.215, sg = 4 * u;
    const fh = iw * ISL[0].sz[1] / ISL[0].sz[0], lh = iw * 355 / 426;
    // v7.1b (visual): island boxes are tight to their visible art (measured: <0.5% transparent margin), and hb is the header's visible
    // ink bottom (buttons + shadow). The empty sky header -> Forest treetops is a small G (~ the near-touching rhythm of the zig-zag rows),
    // the same G is left above the TAP AN ISLAND panel, and all the remaining height spreads the 8 rows evenly:
    //   y0 - 0.6*fh = hb + G,   y0 + 7*step + 0.5*lh = panelTop - G   =>   step = (avail - 2G - 0.6fh - 0.5lh) / 7
    const hb = st + 54 * u, avail = panelTop - hb, G = Math.max(8, 12 * u);
    const step = (avail - 2 * G - 0.6 * fh - 0.5 * lh) / 7;
    const y0 = hb + G + 0.6 * fh, MAP_SQ = 1, Y0 = y0, Y7 = y0 + 7 * step;
    const cx = W / 2, rows = [];
    for (let i = 0; i < 8; i++) {
      const left = i % 2 === 0, y = y0 + i * step;
      const icx = left ? cx - E - gap - iw / 2 : cx + E + gap + iw / 2;
      const scx = left ? icx - iw / 2 - sg - sw / 2 : icx + iw / 2 + sg + sw / 2;
      const un = mapUnl(i), h = un ? iw * ISL[i].sz[1] / ISL[i].sz[0] : lh, anchor = un ? 0.6 : 0.5;
      rows.push({ i, left, y, island: { x: icx - iw / 2, y: y - anchor * h, w: iw, h }, sign: { x: scx - sw / 2, y: y - sh / 2, w: sw, h: sh } });
    }
    return { top, panelTop, A, hw, cliff, E, cx, y0, step, rows, squeeze: MAP_SQ, span0: Y7 - Y0, gapG: G, hb, S: E + gap + 2 * u - hw, pathTop: y0 - step * 0.1, pathBot: panelTop + 30 };
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
    const box = $('map-items'); box.innerHTML = ''; islCv = []; islSrc = [];
    mapL.rows.forEach(r => buildRow(r, box));
  }
  function buildRow(r, box) {
      const b = r.i, unlocked = mapUnl(b);
      const isl = document.createElement('div'); isl.className = 'isl' + (unlocked ? '' : ' locked'); isl.dataset.biome = b; isl.setAttribute('role', 'button'); isl.setAttribute('aria-label', D[b].name + (unlocked ? '' : ' (locked)'));
      Object.assign(isl.style, { left: r.island.x + 'px', top: r.island.y + 'px', width: r.island.w + 'px', height: r.island.h + 'px' });
      if (unlocked) { const hc = document.createElement('canvas'); hc.className = 'halo'; isl.appendChild(hc); buildHalo(hc, r.island.w, r.island.h, b);
        const cv = document.createElement('canvas'); cv.className = 'art'; isl.appendChild(cv); fitCanvas(cv, r.island.w, r.island.h); islCv[b] = cv; isl.id = 'isl-' + ISL[b].k; }
      else { const im = document.createElement('img'); im.src = islLocked.src; im.alt = 'Locked'; isl.appendChild(im); }
      const sg = document.createElement('div'); sg.dataset.biome = b;
      Object.assign(sg.style, { left: r.sign.x + 'px', top: r.sign.y + 'px', width: r.sign.w + 'px', height: r.sign.h + 'px' });
      if (unlocked) { sg.className = 'sign'; const im = document.createElement('img'); im.src = SIGN[b]; im.alt = D[b].name; sg.appendChild(im); }
      else { sg.className = 'lsign'; sg.innerHTML = LOCK_SVG; sg.setAttribute('aria-label', D[b].name + ' (locked)'); }
      const tap = () => tapIsland(b, isl);
      isl.addEventListener('click', tap); sg.addEventListener('click', tap);
      box.appendChild(isl); box.appendChild(sg);
      if (unlocked && selected === b) isl.classList.add('sel');
  }
  // Selection halo: a chunky pixel-art gold outline that hugs the island's silhouette (trees + rock), fading outward
  // through dithered rings. Built once per layout from the island art's alpha; CSS only pulses its opacity (cheap on iOS).
  function buildHalo(cv, w, h, b) {
    const I = ISL[b], islForest = I.base, islRac = I.ani, RAC = { x: I.an[0], y: I.an[1] }, FOREST_GROUND = Math.max(...I.sway.map(gp => gp.g));
    if (!ready(islForest) || !ready(islRac)) { islForest.addEventListener('load', () => buildHalo(cv, w, h, b), { once: true }); islRac.addEventListener('load', () => buildHalo(cv, w, h, b), { once: true }); return; }
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
    if (ua) return;                                                     // v7: ignore taps while the unlock animation runs
    if (!unlockedB(b)) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); toast('LOCKED'); return; }   // v7.2: just LOCKED (no hint naming the previous biome)
    if (selected !== b) { selected = b; selT = performance.now(); }
    document.querySelectorAll('#map-items .isl').forEach(x => x.classList.toggle('sel', x === el));
    refreshPanel();
  }
  function refreshPanel() {
    const b = selected, on = b >= 0 && unlockedB(b);
    $('mp-empty').classList.toggle('hidden', on); $('mp-sel').classList.toggle('hidden', !on);
    if (on) {
      $('mp-name').textContent = D[b].name.toUpperCase();
      $('mp-best').textContent = bestOf(b).toLocaleString('en-US');
      $('mp-found').textContent = foundIn(b) + '/11';
      Art.draw($('mp-icon'), b, ISL[b].icon, 64 * u); $('mp-play').classList.add('pulse');
    }
  }
  $('mp-play').addEventListener('click', () => { const b = selected; if (b < 0 || !unlockedB(b)) return; selected = -1; show('game', { mode: 'new', biome: b }); });
  // Islands: plants sway (rows of canopy shift by whole source pixels), the animal hops when its island is selected; the rock never moves.
  function drawIslands(t) { for (let b = 0; b < ISL.length; b++) if (islCv[b]) drawIsland(b, t); }
  function drawIsland(b, t) {
    const I = ISL[b], base = I.base, ani = I.ani, cv = islCv[b];
    if (!cv || !ready(base) || !ready(ani)) return;
    const sw = base.naturalWidth, sh = base.naturalHeight;
    if (!islSrc[b]) { islSrc[b] = document.createElement('canvas'); islSrc[b].width = sw; islSrc[b].height = sh; }
    const s = islSrc[b].getContext('2d'); s.clearRect(0, 0, sw, sh);
    const on = selected === b, ts = on ? (performance.now() - selT) / 1000 : 0;
    const amp = on ? 3.2 : 1.0, band = 6;
    s.drawImage(base, 0, 0);
    I.sway.forEach((gp, gi) => {
      const sway = Math.sin(t * (on ? 2.6 : 1.4) + gi * 1.3 + b * 0.7);
      if (gp.m === 'f') {                                  // flag: columns ripple, the pole side stays put
        const [x0, y0, x1, y1] = gp.r[0]; s.clearRect(x0 + 2, y0, x1 - x0 - 2, y1 - y0);
        for (let x = x0 + 2; x < x1; x += 2) { const k = (x - x0) / (x1 - x0), dy = Math.round(Math.sin(t * (on ? 6 : 3) - (x - x0) * 0.22) * (on ? 3 : 1.5) * k);
          s.drawImage(base, x, y0, 2, y1 - y0, x, y0 + dy, 2, y1 - y0); }
        return;
      }
      if (gp.m === 'c') gp.r.forEach(([x0, y0, x1, y1]) => s.clearRect(x0, y0, x1 - x0, y1 - y0));
      gp.r.forEach(([x0, y0, x1, y1]) => {
        for (let y = y0; y < y1; y += band) {
          const k = Math.pow((gp.g - y) / Math.max(1, gp.g - gp.top), 1.25), dx = Math.round(amp * sway * k), hh = Math.min(band, y1 - y);
          s.drawImage(base, x0, y, x1 - x0, hh, x0 + dx, y, x1 - x0, hh);
        }
      });
    });
    // animal: when selected, a hop every 1.1 s with a little tilt
    let hop = 0, tilt = 0, sq = 1;
    if (on) { const p = (ts % 1.1) / 1.1; if (p < 0.42) { const q = p / 0.42; hop = Math.sin(Math.PI * q) * 14; tilt = Math.sin(Math.PI * 2 * q) * 0.09; } else if (p < 0.52) sq = 1 - 0.06 * Math.sin(Math.PI * (p - 0.42) / 0.1); }
    const rw = ani.naturalWidth, rh = ani.naturalHeight, fx = I.an[0] + rw / 2, fy = I.an[1] + rh;
    if (b === 0 || on) { s.save(); s.fillStyle = 'rgba(20,30,10,' + (0.28 - hop * 0.008).toFixed(3) + ')';
      s.beginPath(); s.ellipse(fx, fy - 6, rw * (0.36 - hop * 0.006), 7, 0, 0, 7); s.fill(); s.restore(); }
    s.save(); s.translate(fx, fy - Math.round(hop)); s.rotate(tilt); s.scale(1 / sq * (sq < 1 ? 1.02 : 1), sq);
    s.drawImage(ani, -rw / 2, -rh); s.restore();
    const g = cv.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(islSrc[b], 0, 0, cv.width, cv.height);
  }
  // ---- v7.2 map unlock. BIOME COMPLETE! only queues the unlock (localStorage 'zoomash.pendingUnlocks'); it plays the next time
  // the map opens: the camera eases in and spotlights the island (rest of the map dims) -> the padlock shakes, breaks and falls away ->
  // the island goes grey -> full colour with a burst -> the biome NAME pops up big -> the camera eases back out and the island settles
  // (selected, PLAY ready). ~3.6 s each, input blocked throughout, played once (cleared on completion), several play in order.
  const LS_PEND = 'zoomash.pendingUnlocks';
  const UA = { delay: .35, zin: [0, .7], shake: [.7, 1.5], brk: 1.5, color: [1.58, 2.15], name: [1.75, 3.0], zout: [2.9, 3.6], end: 3.6, gap: .3, Z: 1.75 };
  const padImg = img('img/padlock-v72.png'), nolockImg = img('img/island-locked-nolock.png');
  const PAD = { l: 156 / 426, t: 26 / 355, w: 114 / 426, h: 168 / 355 };   // padlock sprite inside island-locked.png
  let ua = null; const uaLog = [];
  function pendList() { const v = ls.get(LS_PEND, []); return Array.isArray(v) ? v.filter((b, i) => Number.isInteger(b) && b > 0 && b < D.length && v.indexOf(b) === i) : []; }
  function pendDrop(b) { ls.set(LS_PEND, pendList().filter(x => x !== b)); }
  function mapUnl(b) { return unlockedB(b) && !uaHide.has(b); }
  const ease = x => (x = Math.min(1, Math.max(0, x)), x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const span = (t, a) => Math.min(1, Math.max(0, (t - a[0]) / (a[1] - a[0])));
  function camera(dx, dy, sc) { [$('map-cv'), $('map-items')].forEach(e => { e.style.transformOrigin = '0 0'; e.style.transform = sc === 1 && !dx && !dy ? '' : `translate(${dx}px,${dy}px) scale(${sc})`; }); }
  // start the queue (called from map enter, after the map is built with the queued islands still drawn locked)
  function startUnlocks(q) {
    stopUnlock();
    const ov = document.createElement('div'); ov.id = 'ua-ov'; ov.setAttribute('aria-hidden', 'true');
    ov.innerHTML = '<div class="ua-vig"></div><canvas class="ua-fx"></canvas><div class="ua-name"><b></b><span>UNLOCKED!</span></div>';
    ['pointerdown', 'pointerup', 'click', 'touchstart', 'touchend'].forEach(ev => ov.addEventListener(ev, e => { e.stopPropagation(); e.preventDefault(); }, { passive: false }));
    $('scr-map').appendChild(ov);
    ua = { q: q.slice(), i: -1, b: -1, t0: 0, hold: null, ov, raf: 0, phase: 'wait', done: [] };
    nextUnlock(UA.delay);
    const tick = () => { if (!ua) return; ua.raf = requestAnimationFrame(tick); uaRender(); };
    ua.raf = requestAnimationFrame(tick);
  }
  function nextUnlock(delay) {
    ua.i++; if (ua.i >= ua.q.length) { endUnlocks(); return; }
    ua.b = ua.q[ua.i]; ua.t0 = performance.now() + delay * 1000; ua.prep = false; ua.swapped = false; ua.chunks = null; ua.phase = 'wait';
    uaLog.push({ b: ua.b, t: Date.now() });
  }
  function endUnlocks() {
    const last = ua && ua.done.length ? ua.done[ua.done.length - 1] : -1;
    stopUnlock();
    if (last >= 0 && cur === 'map') { selected = last; selT = performance.now(); document.querySelectorAll('#map-items .isl').forEach(x => x.classList.toggle('sel', +x.dataset.biome === last)); refreshPanel(); }
  }
  function stopUnlock() {
    if (!ua) return; cancelAnimationFrame(ua.raf); ua.ov.remove(); camera(0, 0, 1);
    const dirty = uaHide.size > 0; ua = null; uaHide.clear();
    document.querySelectorAll('#map-items .isl.lit').forEach(x => x.classList.remove('lit', 'unl'));
    if (dirty && cur === 'map') placeMap();                          // interrupted: still-pending islands go back to the real state
  }
  function uaRow(b) { return mapL && mapL.rows.find(r => r.i === b); }
  function uaFocus(b) {                                               // camera target, computed from the locked layout
    const r = uaRow(b); if (!r) return null;
    const x0 = Math.min(r.island.x, r.sign.x), x1 = Math.max(r.island.x + r.island.w, r.sign.x + r.sign.w);
    const y0 = Math.min(r.island.y, r.sign.y), y1 = Math.max(r.island.y + r.island.h, r.sign.y + r.sign.h);
    const fx = (x0 + x1) / 2, fy = (y0 + y1) / 2, Z = UA.Z;
    const cy = (mapL.hb + mapL.panelTop) / 2 - 18 * u;
    const cl = (v, lo) => Math.min(0, Math.max(lo, v));
    return { r, fx, fy, w: x1 - x0, h: y1 - y0, tx: cl(W / 2 - fx * Z, W - W * Z), ty: cl(cy - fy * Z, H - H * Z),
      icx: r.island.x + r.island.w / 2, icy: r.island.y + r.island.h * 0.42 };
  }
  function uaPrep() {                                                 // split the baked padlock off the grey island
    const b = ua.b, isl = document.querySelector(`#map-items .isl[data-biome="${b}"]`); ua.f = uaFocus(b);
    if (!isl || !ua.f) return false;
    const im = isl.querySelector('img'); if (im) im.src = nolockImg.src;
    const lk = document.createElement('img'); lk.className = 'ua-lock'; lk.src = padImg.src; lk.alt = '';
    Object.assign(lk.style, { left: PAD.l * 100 + '%', top: PAD.t * 100 + '%', width: PAD.w * 100 + '%', height: PAD.h * 100 + '%' });
    isl.appendChild(lk); ua.lock = lk; ua.isl = isl;
    const sg = document.querySelector(`#map-items .lsign[data-biome="${b}"]`); ua.sg = sg;
    const nm = ua.ov.querySelector('.ua-name'); nm.querySelector('b').textContent = D[b].name.toUpperCase();
    // name sits under the zoomed island, inside the safe map area
    const Z = UA.Z, f = ua.f, below = f.ty + (f.r.island.y + f.r.island.h) * Z + 6 * u;
    nm.style.top = Math.min(below, mapL.panelTop - 96 * u) + 'px';
    const fx = ua.ov.querySelector('.ua-fx'); fitCanvas(fx, W, H); ua.fxg = fx.getContext('2d'); ua.fxc = fx;
    ua.prep = true; return true;
  }
  function uaSwap() {                                                 // the island becomes the real (unlocked) island, grey at first
    const b = ua.b; uaHide.delete(b); mapL = mapLayout();
    const r = uaRow(b), box = $('map-items');
    box.querySelectorAll(`[data-biome="${b}"]`).forEach(e => e.remove());
    buildRow(r, box);
    const ni = box.querySelector(`.isl[data-biome="${b}"]`); if (ni) { ni.classList.add('lit', 'ua-grey'); ua.isl = ni; }
    const ns = box.querySelector(`.sign[data-biome="${b}"]`); if (ns) { ns.classList.add('ua-pop'); ua.sg = ns; }
    ua.lock = null; ua.swapped = true;
  }
  function uaSeek(t) { if (ua) ua.hold = t; uaRender(); }
  function uaRender() {
    if (!ua || ua.b < 0) return;
    const now = performance.now(), t = ua.hold != null ? ua.hold : (now - ua.t0) / 1000;
    if (t < 0) { ua.phase = 'wait'; return; }
    if (!ua.prep && !uaPrep()) { pendDrop(ua.b); nextUnlock(0); return; }
    const f = ua.f, Z = UA.Z;
    // camera: eased in, hold, eased out (focus travels in a straight line to its spot)
    const k = t < UA.zin[1] ? ease(span(t, UA.zin)) : t < UA.zout[0] ? 1 : 1 - ease(span(t, UA.zout));
    const sc = 1 + (Z - 1) * k, dx = f.tx * k, dy = f.ty * k; camera(dx, dy, sc);
    // spotlight: dim + vignette everywhere except a soft circle round the island
    const sx = dx + f.fx * sc, sy = dy + f.fy * sc, R = Math.max(f.w, f.h) * 0.62 * sc;
    ua.ov.querySelector('.ua-vig').style.background = `radial-gradient(circle ${Math.round(R * 1.5)}px at ${Math.round(sx)}px ${Math.round(sy)}px, rgba(6,10,30,0) 0, rgba(6,10,30,0) 62%, rgba(6,10,30,${(.74 * k).toFixed(3)}) 100%)`;
    // padlock shake (stepped, growing)
    if (ua.lock) {
      if (t >= UA.shake[0] && t < UA.brk) {
        const p = span(t, UA.shake), n = Math.floor((t - UA.shake[0]) * 22), s = n % 2 ? 1 : -1, amp = 1 + 6 * p * p;
        ua.lock.style.transform = `translate(${s * amp * 0.5}%, ${(n % 4 === 0 ? -1 : 0) * amp * 0.3}%) rotate(${s * (2 + 10 * p)}deg)`;
        if (ua.isl) ua.isl.style.transform = p > .5 ? `translateX(${(n % 2 ? .4 : -.4) * u}px)` : '';
      } else ua.lock.style.transform = '';
      if (t >= UA.brk) { ua.lock.style.visibility = 'hidden'; if (ua.isl) ua.isl.style.transform = ''; }
      else ua.lock.style.visibility = '';
    }
    if (t >= UA.color[0] && !ua.swapped) uaSwap();
    if (ua.swapped && ua.isl) { const p = span(t, UA.color); ua.isl.style.filter = p >= 1 ? '' : `grayscale(${(1 - p).toFixed(3)}) brightness(${(0.85 + 0.15 * p).toFixed(3)})`; }
    // name: pops in big, holds, fades as the camera pulls back
    const nm = ua.ov.querySelector('.ua-name'), np = (t - UA.name[0]) / 0.32;
    if (t < UA.name[0] || t > UA.name[1] + 0.35) nm.style.opacity = 0;
    else { const s = np < 1 ? [0.2, 0.7, 1.25, 1.3, 1.12, 1.0][Math.min(5, Math.floor(np * 6))] : 1; nm.style.opacity = t > UA.name[1] ? (1 - (t - UA.name[1]) / 0.35).toFixed(3) : 1; nm.style.transform = `translateX(-50%) scale(${s})`; }
    ua.phase = t < UA.zin[1] ? 'zoom-in' : t < UA.brk ? 'shake' : t < UA.color[1] ? 'break' : t < UA.zout[0] ? 'name' : t < UA.end ? 'zoom-out' : 'done';
    uaFx(t, dx, dy, sc);
    if (t >= UA.end && ua.hold == null) {
      const b = ua.b; ua.done.push(b); pendDrop(b);
      if (ua.isl) { ua.isl.style.filter = ''; ua.isl.style.transform = ''; ua.isl.classList.remove('ua-grey'); }
      camera(0, 0, 1); nextUnlock(UA.gap);
    }
  }
  // screen-space pixel fx: the padlock in tumbling pieces, a white flash, gold star burst
  function uaFx(t, dx, dy, sc) {
    const g = ua.fxg; if (!g) return; const cw = ua.fxc.width, ch = ua.fxc.height, k = cw / W; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cw, ch);
    if (t < UA.brk || t > UA.brk + 1.3) return;
    g.setTransform(k, 0, 0, k, 0, 0); g.imageSmoothingEnabled = false;
    const f = ua.f, r = f.r, s = t - UA.brk, q = Math.max(2, Math.round(3 * u * sc / 1.4));
    const hsh = n => { const v = Math.sin(n * 91.7 + 17.3) * 43758.5453; return v - Math.floor(v); };
    // padlock rect on screen (locked layout)
    const lx = dx + (r.island.x + PAD.l * r.island.w) * sc, ly = dy + (r.island.y + PAD.t * r.island.h) * sc, lw = PAD.w * r.island.w * sc, lh = PAD.h * r.island.h * sc;
    if (ready(padImg) && s < 1.2) {
      const nw = padImg.naturalWidth, nh = padImg.naturalHeight, cols = 2, rows = 3;
      for (let i = 0; i < cols * rows; i++) {
        const cx = i % cols, cy = (i / cols) | 0, vx = (cx - 0.5) * (60 + 70 * hsh(i)) * u * sc, vy = (-150 - 90 * hsh(i + 7) + cy * 30) * u * sc, gr = 900 * u * sc;
        const px = lx + (cx + .5) * lw / cols + vx * s, py = ly + (cy + .5) * lh / rows + vy * s + gr * s * s / 2, rot = (cx ? 1 : -1) * (2 + 4 * hsh(i + 3)) * s;
        g.save(); g.globalAlpha = Math.max(0, 1 - Math.max(0, s - 0.7) / 0.5); g.translate(Math.round(px), Math.round(py)); g.rotate(Math.round(rot * 4) / 4);
        g.drawImage(padImg, cx * nw / cols, cy * nh / rows, nw / cols, nh / rows, -lw / cols / 2, -lh / rows / 2, lw / cols, lh / rows); g.restore();
      }
    }
    const ix = dx + f.icx * sc, iy = dy + f.icy * sc;
    const P = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(Math.round(x / q) * q, Math.round(y / q) * q, w * q, h * q); };
    if (s < 0.16) { g.globalAlpha = 1 - s / 0.16; g.fillStyle = '#fff'; g.beginPath(); g.arc(lx + lw / 2, ly + lh / 2, (0.4 + s * 6) * lw, 0, 7); g.fill(); g.globalAlpha = 1; }
    const sb = s - (UA.color[0] - UA.brk); if (sb < 0) return;
    const star = (x, y, z, c) => { P(x, y, 1, 1, '#fff'); for (let i = 1; i <= z; i++) { P(x - i * q, y, 1, 1, c); P(x + i * q, y, 1, 1, c); P(x, y - i * q, 1, 1, c); P(x, y + i * q, 1, 1, c); } };
    const n = 20, Rm = Math.max(r.island.w, r.island.h) * sc;
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2 + hsh(i) * .3, rr = Rm * (0.3 + sb * 1.1 * (0.7 + hsh(i + 9) * 0.6)), step = Math.floor(sb * 12);
      if (sb > 0.6 && (i + step) % 2) continue;
      const z = sb < 0.25 ? 2 : sb < 0.6 ? 1 : 0, c = ['#ffd75e', '#fff3b0', '#ffb43a'][(i + step) % 3];
      g.globalAlpha = Math.max(0, 1 - Math.max(0, sb - 0.7) / 0.4); star(ix + Math.cos(a) * rr, iy + Math.sin(a) * rr * 0.8, (step + i) % 4 === 0 ? z + 1 : z, c);
    }
    g.globalAlpha = 1;
  }
  hooks.map = {
    enter(o) {
      selected = -1; stopUnlock();
      let q = pendList().filter(b => unlockedB(b));
      if (unlockAll()) { if (q.length) ls.set(LS_PEND, []); q = []; }           // everything is open anyway: nothing to reveal
      q.forEach(b => uaHide.add(b));
      placeMap();
      if (q.length) { refreshPanel(); startUnlocks(q); return; }
      if (o && o.focus >= 0 && unlockedB(o.focus)) { selected = o.focus; selT = performance.now(); placeMap(); }   // CHANGE BIOME: current biome pre-selected
      refreshPanel();
    },
    leave() { stopUnlock(); },
    back() { if (ua) return; show('title'); },
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
  // biome bookmark tabs (v6): themed cloth colour + a 9x9 multicolour pixel emblem each (auto dark outline); letters map to the
  // emblem palette, '.' is empty
  const TAB = {
    forest: ['#3f8a2e', ['...ggg...', '..gggGg..', '.ggggGGg.', '.gggGGGg.', 'ggggGGGGg', '.gGGGGGg.', '...bbb...', '...bbb...', '..bbbbb..'], { g: '#9fd46a', G: '#4f9a34', b: '#7a4a24' }],
    ocean: ['#1f8f98', ['.........', '..wwww..w', '.wwwwwwww', 'wkwwwwwww', 'wwwwwwwww', '.bbbbbb.b', '..bbbb...', '.........', 'c.cc.cc.c'], { w: '#ffd36b', b: '#ff9a3c', k: '#1a1010', c: '#bff4ee' }],
    farm: ['#c99a2e', ['....r....', '...rrr...', '..rrrrr..', '.rrrrrrr.', 'wwwwwwwww', '.rwwwwwr.', '.rwkkkwr.', '.rwkwkwr.', '.rrkkkrr.'], { r: '#d8402e', w: '#fff6e4', k: '#5a1a10' }],
    arctic: ['#3f8fc4', ['....w....', '.w..w..w.', '..w.w.w..', '...ccc...', 'wwwcwcwww', '...ccc...', '..w.w.w..', '.w..w..w.', '....w....'], { w: '#ffffff', c: '#bfe8ff' }],
    oriental: ['#c4362e', ['....y....', '...yyy...', '..rrrrr..', '.rrryrrr.', '.rryyyrr.', '.rrryrrr.', '..rrrrr..', '...yyy...', '....y....'], { y: '#ffd24a', r: '#ff5a3c' }],
    savannah: ['#df8a2a', ['...yyy...', '.........', 'GGGgggGGG', '.gggggggg', '..g.b.g..', '....b....', '....b....', '...bbb...', 'yyyyyyyyy'], { G: '#3f6a1e', g: '#6e9a2c', b: '#5a3214', y: '#ffe08a' }],
    dinosaurs: ['#5a4a42', ['y...y...y', 'oy..y..yo', '.oy.y.yo.', '..yyyyy..', '.yyyyyyy.', '.yyyyyyy.', '..yyyyy..', '...yyy...', '.........'], { y: '#ff8a2a', o: '#ffd08a' }],
    space: ['#2c2f7a', ['....w....', '...www...', '...wcw...', '...www...', '..rwwwr..', '.rrwwwrr.', '.r.yfy.r.', '....f....', '.........'], { w: '#f4f6ff', c: '#33e1ff', r: '#ff4a4a', y: '#ffd24a', f: '#ff8a2a' }],
  };
  const tabCol = b => (TAB[D[b].key] || ['#8a5a2a'])[0];
  // v7: a biome that is not unlocked yet (and Unlock-all is off) is never revealed in the Zoopedia, matching the map: its tab is
  // the map's locked-sign grey with the same padlock (dark shackle/outline, pale body, shaded base, keyhole), aria name 'Locked';
  // its pages say '???', show the grey padlock badge in place of the sign, and every animal is a '?' block. Arrows, swipes and
  // tabs still page through every biome. When a biome unlocks, the tab repaints themed the next time the book is shown.
  const TAB_LOCK = ['#8a8f94', ['...kkk...', '..k...k..', '..k...k..', '.kkkkkkk.', '.kwwwwwk.', '.kwwkwwk.', '.kwwkwwk.', '.ksssssk.', '.kkkkkkk.'],
    { k: '#26292c', w: '#e3e5e7', s: '#b4b8bc' }];
  const tabOf = i => unlockedB(i) ? (TAB[D[i].key] || ['#8a5a2a', [], {}]) : TAB_LOCK;
  const unlSig = () => D.map((x, i) => unlockedB(i) ? 1 : 0).join('');
  let tabSig = '';
  function syncTabs() {
    document.querySelectorAll('#tabs .tab').forEach((t, i) => { const un = unlockedB(i); t.setAttribute('aria-label', un ? D[i].name : 'Locked'); t.classList.toggle('locked', !un); });
  }
  function buildTabs() {
    const box = $('tabs'); if (box.childElementCount) return;
    D.forEach((bm, i) => {
      const t = document.createElement('button'); t.className = 'tab'; t.dataset.b = i; t.setAttribute('role', 'tab'); t.setAttribute('aria-label', bm.name);
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
    const single = !!o.single, tabH = o.tabs ? 22 : 0, rb = o.ribbon ? 10 : 0, SHX = 2, SHY = 3;
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
      // inactive tabs sit lower and dimmer; the open tab stands 6 px taller, brighter, with a lit rim and a cream top stitch
      const tb = o.tabs[i], [tx0, tx1] = tabX[i], ty0 = on ? 0 : 6, ty1 = by0 + 6;
      const [cr, cg, cb] = hexRGB(tb.col), dim = on ? 1.1 : .74, tw = tx1 - tx0;
      for (let y = ty0; y < ty1; y++) for (let x = tx0; x < tx1; x++) {
        if (lim && y >= lim[x]) continue;
        if (!inRR(x, y, tx0, ty0, tx1, ty1 + 4, 2)) continue;
        const ed = !inRR(x - 1, y, tx0, ty0, tx1, ty1 + 4, 2) || !inRR(x + 1, y, tx0, ty0, tx1, ty1 + 4, 2) || !inRR(x, y - 1, tx0, ty0, tx1, ty1 + 4, 2);
        if (ed) { if (on) pt(x, y, 24, 12, 4); else pt(x, y, 36, 20, 10); continue; }
        let k = dim * (y % 2 ? .93 : 1) * ((x + (y >> 1)) % 3 === 0 ? .96 : 1);
        if (y <= ty0 + 1) k *= on ? 1.35 : 1.15; else if (x === tx0 + 1) k *= on ? 1.25 : 1.1; else if (x === tx1 - 2) k *= .78;
        if (y >= Y0 + 2) k *= .86;
        pt(x, y, Math.min(255, cr * k), Math.min(255, cg * k), Math.min(255, cb * k));
      }
      for (let y = Math.max(ty0 + 2, Y0); y < ty1; y++) if (!lim || y < lim[tx1]) pt(tx1, y, 10, 4, 1, on ? 140 : 90);
      if (on) { for (let x = tx0 + 2; x < tx1 - 2; x += 2) pt(x, ty0 + 2, 255, 244, 210, 200); for (let y = ty0 + 4; y < Math.min(ty1, Y0 + 2); y += 2) { pt(tx0 + 2, y, 255, 244, 210, 120); pt(tx1 - 3, y, 255, 244, 210, 120); } }
      // emblem: 9x9 multicolour + auto outline; dimmed with the cloth when the tab is closed
      const gl = tb.glyph || [], pal = tb.gpal || {}, gx = tx0 + Math.floor((tw - 9) / 2), gy = ty0 + (on ? 5 : 4);
      const at = (xx, yy) => yy >= 0 && yy < gl.length && xx >= 0 && xx < 9 && gl[yy][xx] && gl[yy][xx] !== '.';
      const ek = on ? 1 : .8;
      for (let yy = -1; yy <= 9; yy++) for (let xx = -1; xx <= 9; xx++) {
        if (at(xx, yy)) { const [r, g2, b2] = hexRGB(pal[gl[yy][xx]] || '#fff6dc'); pt(gx + xx, gy + yy, r * ek, g2 * ek, b2 * ek); }
        else if (at(xx - 1, yy) || at(xx + 1, yy) || at(xx, yy - 1) || at(xx, yy + 1)) pt(gx + xx, gy + yy, 20, 10, 4, on ? 235 : 190);
        else if (at(xx - 1, yy - 1)) pt(gx + xx, gy + yy, 0, 0, 0, 70);
      }
    };
    if (o.tabs) {
      const n = o.tabs.length, gap = 1, x0 = X0 + 6, span = X1 - 6 - x0, tw = Math.floor((span - gap * (n - 1)) / n);
      const off = Math.floor((span - (tw * n + gap * (n - 1))) / 2);
      for (let i = 0; i < n; i++) { const tx0 = x0 + off + i * (tw + gap); tabX.push([tx0, tx0 + tw]); tabRects.push({ x: tx0 * P, y: 0, w: (tw + gap) * P, h: (by0 + 2) * P }); paintTab(put, i, false); }
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
      // v6: synchronous when the art is already loaded (preloaded at boot), so a page is complete the moment it is built
      let im = Art.loaded(b, t); if (!im || !im.complete) { try { im = await Art.load(b, t); } catch (e) { return; } }
      src = document.createElement('canvas'); src.width = src.height = n; const g = src.getContext('2d');
      const k = Math.max(1, Math.ceil(n / im.naturalWidth)), up = document.createElement('canvas'); up.width = im.naturalWidth * k; up.height = im.naturalHeight * k;
      const ug = up.getContext('2d'); ug.imageSmoothingEnabled = false; ug.drawImage(im, 0, 0, up.width, up.height);
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(up, 0, 0, n, n);
      plates.set(tag, src); if (plates.size > 72) plates.delete(plates.keys().next().value);
    }
    if (cv.dataset.tag !== tag) return;
    cv.width = cv.height = n; const g = cv.getContext('2d'); g.clearRect(0, 0, n, n); g.drawImage(src, 0, 0); cv.dataset.ok = '1';
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
    const tabs = D.map((bm, i) => { const tb = tabOf(i); return { col: tb[0], glyph: tb[1], gpal: tb[2] }; });
    tabSig = unlSig(); syncTabs();
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
    measureNames();
    zooBuilt = true;
  }
  // v7: every Zoopedia name uses the SAME font size. Names wrap to at most two lines: multi-word names at the space, and the
  // eight long dinosaur names at a syllable (soft hyphen, e.g. COMPSO-/GNATHUS, DILOPHO-/SAURUS). The size is the one that fits
  // the longest resulting line (9 characters: CLOWNFISH / JELLYFISH) in a cell, measured with the real pixel font.
  const HYPH = { COMPSOGNATHUS: 'COMPSO|GNATHUS', PTERODACTYL: 'PTERO|DACTYL', DILOPHOSAURUS: 'DILOPHO|SAURUS', STEGOSAURUS: 'STEGO|SAURUS',
    TRICERATOPS: 'TRICERA|TOPS', ANKYLOSAURUS: 'ANKYLO|SAURUS', SPINOSAURUS: 'SPINO|SAURUS', BRACHIOSAURUS: 'BRACHIO|SAURUS' };
  const nameText = n => n.toUpperCase().split(' ').map(w => (HYPH[w] || w).replace('|', '\u00ad')).join(' ');
  const NAME_MAXL = Math.max(...D.flatMap(b => b.animals.flatMap(a => nameText(a.n).split(/[ \u00ad]/).map((x, i, arr) => x.length + (/\u00ad/.test(nameText(a.n)) && i === 0 ? 1 : 0)))));
  let nmEm = 0.885, nmCell = 0;             // glyph advance (em) of the pixel font; cell width (px) - measured per layout
  function measureNames() {
    const pg = $('pg-l'); if (!pg) return;
    const sp = document.createElement('span'); sp.className = 'nm'; sp.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;letter-spacing:0;font-size:20px'; sp.textContent = 'MMMMMMMMMM';
    pg.appendChild(sp); const w = sp.getBoundingClientRect().width; sp.remove(); if (w > 0) nmEm = w / 200;
    const pw = pg.getBoundingClientRect().width; if (pw > 0) nmCell = (pw - 28 * u - 10 * u) / 2;
  }
  const nameFz = cd => { const cell = nmCell > 0 ? Math.max(cd * 0.9, nmCell) : cd; return Math.floor(Math.min(13 * u, cell * 0.96 / (NAME_MAXL * nmEm)) * 10) / 10; };
  function spot(b, t, locked) {
    const d = document.createElement('div'); d.className = 'spot';
    const c = document.createElement('div'); c.className = 'circ'; d.appendChild(c);
    const cap = document.createElement('div'); cap.className = 'cap'; d.appendChild(cap);
    const no = document.createElement('div'); no.className = 'no'; no.textContent = 'No.' + String(b * 11 + t).padStart(2, '0'); cap.appendChild(no);
    const n = document.createElement('div'); n.className = 'nm'; cap.appendChild(n);
    const a = D[b].animals[t - 1], cd = parseFloat(getComputedStyle($('book')).getPropertyValue('--cd')) || 84;
    if (!locked && isFound(b, t)) {
      const cv = document.createElement('canvas'); c.appendChild(cv);
      d.classList.add('found'); d.dataset.tier = t; n.textContent = nameText(a.n);
      plateWaits.push(drawPlate(cv, b, t, cd * .86));
      d.addEventListener('click', () => { if (!flipping && !swiped) openPopup(b, t); });
      d.setAttribute('role', 'button'); d.setAttribute('aria-label', a.n);
    } else {
      d.classList.add('unfound');            // locked: a plain solid block with a '?', never the animal's shape
      const q = document.createElement('div'); q.className = 'lockc'; q.textContent = '?'; c.appendChild(q);
      n.textContent = '???'; n.classList.add('lk'); d.setAttribute('aria-label', 'Not found yet');
    }
    n.style.fontSize = nameFz(cd) + 'px'; n.style.letterSpacing = '0';   // v7: one size for every name (fits the longest word)
    return d;
  }
  // fill one page of biome b: heading, then left = pasted-in biome sign + tiers 1-5, right = tiers 6-11; page number at the foot
  function fillPage(el, b, side) {
    el.innerHTML = '';
    if (!unlockedB(b)) {                                                 // v7: locked biome - nothing about it is revealed
      el.classList.add('lockedb');
      const hd = document.createElement('div'); hd.className = 'pghead'; hd.innerHTML = '<span></span>'; hd.firstChild.textContent = side === 'l' ? '???' : 'FIELD NOTES'; el.appendChild(hd);
      if (side === 'l') {
        // the sign slot becomes a grey plate the same size as the '?' plates, with the map's padlock centred in it
        const sd = document.createElement('div'); sd.className = 'spot unfound locksign'; sd.setAttribute('role', 'img'); sd.setAttribute('aria-label', 'Locked');
        sd.innerHTML = '<div class="circ"><div class="lockpad">' + LOCK_SVG + '</div></div><div class="cap"><div class="no">&nbsp;</div><div class="nm lk">&nbsp;</div></div>';
        el.appendChild(sd);
        for (let t = 1; t <= 5; t++) el.appendChild(spot(b, t, true));
        // hidden copy of the tier-1 caption so the plate stack (and so its circle) sits exactly level with the '?' plates
        const c1 = el.querySelector('.spot:not(.locksign) .cap');
        if (c1) { const g = c1.cloneNode(true); g.setAttribute('aria-hidden', 'true'); sd.replaceChild(g, sd.querySelector('.cap')); }
      } else for (let t = 6; t <= 11; t++) el.appendChild(spot(b, t, true));
      const pn = document.createElement('div'); pn.className = 'pgno'; pn.textContent = '- ' + (b * 2 + (side === 'l' ? 1 : 2)) + ' -'; el.appendChild(pn);
      return;
    }
    const hd = document.createElement('div'); hd.className = 'pghead'; hd.innerHTML = '<span></span>';
    hd.firstChild.textContent = side === 'l' ? D[b].name.toUpperCase() : 'FIELD NOTES'; el.appendChild(hd);
    if (side === 'l') {
      // v7: the sign sits in a plate-height box above an invisible copy of the tier-1 caption, so its centre lines up with the
      // centre of the tier-1 picture plate beside it (whatever that caption's height)
      const sd = document.createElement('div'); sd.className = 'spot signspot'; const sb = document.createElement('div'); sb.className = 'sbox';
      const si = document.createElement('img'); si.src = SIGN[b]; si.alt = D[b].name; sb.appendChild(si); sd.appendChild(sb); el.appendChild(sd);
      plateWaits.push(si.decode ? si.decode().catch(() => {}) : new Promise(r => { si.onload = si.onerror = r; }));
      const s1 = spot(b, 1), cc = s1.querySelector('.cap').cloneNode(true); cc.classList.add('ghost'); cc.setAttribute('aria-hidden', 'true'); sd.appendChild(cc);
      el.appendChild(s1); for (let t = 2; t <= 5; t++) el.appendChild(spot(b, t));
    } else for (let t = 6; t <= 11; t++) el.appendChild(spot(b, t));
    const pn = document.createElement('div'); pn.className = 'pgno'; pn.textContent = '- ' + (b * 2 + (side === 'l' ? 1 : 2)) + ' -'; el.appendChild(pn);
  }
  function syncNav() {
    $('zoo-n').textContent = foundCount();   // v7: x/88 lives only on the plank above the book (header badge removed)
    $('zoo-prev').disabled = $('zoo-cl').disabled = zb === 0; $('zoo-next').disabled = $('zoo-cr').disabled = zb === D.length - 1;
    $('book').dataset.biome = unlockedB(zb) ? D[zb].key : 'locked';
    document.querySelectorAll('#tabs .tab').forEach((t, i) => { t.classList.toggle('on', i === zb); t.setAttribute('aria-selected', i === zb); });
    if (zGeo) zGeo.drawActive($('book-tab'), zb);
  }
  // v6 page cache: each page (biome, side) is built once and then *moved* between the spread, the turning leaf and back, so a
  // turn never rebuilds DOM mid-animation (the v5 glitch: fresh <img>s + async plate canvases popping in during the turn).
  // Entries carry a `ready` promise (plates painted + sign decoded); a turn waits for it (max 450 ms) under the input lock.
  let plateWaits = [];
  const pgCache = new Map(); let pgKey = '';
  function pageKeyNow() {
    return [unlockAll() ? 1 : 0, D.map((x, b) => [...seenOf(b)].sort((p, q) => p - q).join(',')).join('/'),
      getComputedStyle($('book')).getPropertyValue('--cd').trim(), dpr, W, H].join('|');
  }
  function getPage(b, side) {
    const k = pageKeyNow(); if (k !== pgKey) { pgCache.clear(); pgKey = k; }
    const id = b + side; let e = pgCache.get(id);
    if (!e) {
      const el = document.createElement('div'); el.className = 'pgw'; plateWaits = [];
      fillPage(el, b, side);
      e = { el, b, side, ready: Promise.all(plateWaits).then(() => true) }; e.ready.then(() => { e.done = true; });
      e.done = [...el.querySelectorAll('.spot.found canvas')].every(c => c.dataset.ok === '1') && [...el.querySelectorAll('img')].every(i => i.complete && i.naturalWidth > 0);
      plateWaits = []; pgCache.set(id, e);
    }
    return e;
  }
  const mount = (host, e) => { if (host.firstChild !== e.el || host.childNodes.length !== 1) host.replaceChildren(e.el); };
  function preloadNear(b) { [b - 1, b + 1].forEach(x => { if (x >= 0 && x < D.length) { getPage(x, 'l'); getPage(x, 'r'); Art.preload(x); } }); }
  function renderBook() {
    if (flipping) return;
    if (cur === 'zoo' && tabSig && tabSig !== unlSig()) zooLayout();   // v7: unlock state changed (e.g. Unlock-all): repaint the tabs
    mount($('pg-l'), getPage(zb, 'l')); mount($('pg-r'), getPage(zb, 'r')); syncNav();
    preloadNear(zb);
  }
  let flipping = false, swiped = false, pend = null, zTarget = 0, turnLog = [];
  const FLIP_MS = 620, READY_MAX = 450;
  function flipTo(nb) {
    if (nb < 0 || nb >= D.length) return;
    if (flipping) { pend = nb; return; }                              // locked: remember the latest wish, play it next
    if (nb === zb) return;
    flipping = true; pend = null; zTarget = nb;
    const need = [getPage(nb, 'l'), getPage(nb, 'r')], t0 = performance.now();
    Promise.race([Promise.all(need.map(e => e.ready)), new Promise(r => setTimeout(r, READY_MAX))]).then(() => turn(nb, performance.now() - t0));
  }
  function turn(nb, waited) {
    const dir = nb > zb ? 1 : -1, leaf = $('leaf'), sp = $('spread'), pl = $('pg-l'), pr = $('pg-r');
    const front = leaf.querySelector('.front'), back = leaf.querySelector('.back');
    const src = dir > 0 ? pr : pl, r = src.getBoundingClientRect(), sr = sp.getBoundingClientRect();
    const eFront = getPage(zb, dir > 0 ? 'r' : 'l'), eBack = getPage(nb, dir > 0 ? 'l' : 'r'), eUnder = getPage(nb, dir > 0 ? 'r' : 'l');
    turnLog.push({ from: zb, to: nb, waited: Math.round(waited), ready: [eBack.done, eUnder.done] }); if (turnLog.length > 40) turnLog.shift();
    // the leaf takes the page being turned (moved, not copied); its back is the new spread's facing page
    front.className = 'face front page ' + (dir > 0 ? 'right' : 'left'); mount(front, eFront);
    back.className = 'face back page ' + (dir > 0 ? 'left' : 'right'); mount(back, eBack);
    mount(src, eUnder);                                                  // the page underneath already shows the new spread
    Object.assign(leaf.style, { left: (r.left - sr.left) + 'px', top: (r.top - sr.top) + 'px', width: r.width + 'px', height: r.height + 'px',
      transformOrigin: dir > 0 ? '0 50%' : '100% 50%', transition: 'none', transform: 'rotateY(0deg)' });
    leaf.style.setProperty('--fd', FLIP_MS + 'ms'); sp.style.setProperty('--fd', FLIP_MS + 'ms');
    leaf.classList.remove('hidden', 'go', 'half'); sp.classList.add('turning');
    void leaf.offsetWidth;
    leaf.classList.add('go');
    zb = nb; syncNav();
    // two explicit halves: 0 -> 90deg (front shows), then the faces swap at the edge-on midpoint and 90 -> 180deg (back shows).
    // The swap is done by class, so nothing depends on backface-visibility behaving inside a 3D transform.
    const A = dir > 0 ? -180 : 180;
    let done = false, an = null;
    const finish = () => {
      if (done) return; done = true;
      mount(dir > 0 ? pl : pr, eBack);                                   // the leaf's back page lands on the spread (moved)
      leaf.classList.add('hidden'); leaf.classList.remove('go', 'half'); sp.classList.remove('turning');
      if (an) try { an.cancel(); } catch (e) {}
      leaf.style.transform = 'none'; front.replaceChildren(); back.replaceChildren(); flipping = false;
      preloadNear(zb);
      if (pend !== null && pend !== zb) { const p = pend; pend = null; flipTo(p); } else pend = null;
    };
    if (leaf.animate) {
      an = leaf.animate([{ transform: 'rotateY(0deg)', easing: 'cubic-bezier(.5,0,.9,.55)' }, { transform: 'rotateY(' + A / 2 + 'deg)', easing: 'cubic-bezier(.1,.45,.5,1)' },
        { transform: 'rotateY(' + A + 'deg)' }], { duration: FLIP_MS, fill: 'forwards' });
      const half = () => { if (done) return; leaf.classList.toggle('half', (an.currentTime || 0) >= FLIP_MS / 2); requestAnimationFrame(half); };
      requestAnimationFrame(half);
      an.finished.then(finish, finish);
      const guard = () => { if (done) return; if (an.playState === 'paused') setTimeout(guard, 500); else finish(); }; setTimeout(guard, FLIP_MS * 4);
    } else {
      leaf.style.transition = 'transform ' + FLIP_MS + 'ms linear'; leaf.style.transform = 'rotateY(' + A + 'deg)';
      setTimeout(() => { if (!done) leaf.classList.add('half'); }, FLIP_MS / 2); setTimeout(finish, FLIP_MS + 30);
    }
  }
  const flip = dir => { const base = pend !== null ? pend : flipping ? zTarget : zb; flipTo(Math.max(0, Math.min(D.length - 1, base + dir))); };
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
    enter() {
      zooLayout(); renderBook();
      // never show a half-painted spread: if anything is still loading (cold cache), hold the pages hidden and reveal them all at once
      const need = [getPage(zb, 'l'), getPage(zb, 'r')];
      if (!need.every(e => e.done)) {
        const sp = $('spread'); sp.classList.add('zwait');
        Promise.race([Promise.all(need.map(e => e.ready)), new Promise(r => setTimeout(r, 2000))]).then(() => sp.classList.remove('zwait'));
      }
    },
    back() { if (zooFrom === 'game') show('game', 'resume'); else show('title'); },
  };

  // ---------- fun-fact page ----------
  let popB = 0, popT = 1, popOpen = false;
  function openPopup(b, t) {
    popB = b; popT = t; const a = D[b].animals[t - 1], el = $('popup');
    $('pop-name').textContent = a.n.toUpperCase();
    $('pop-name').style.fontSize = a.n.length > 10 ? (3.8 * 10 / a.n.length) + 'rem' : '';
    $('pop-sign').src = SIGN[b]; $('pop-sign').alt = D[b].name;
    $('pop-tier').textContent = 'No.' + String(b * 11 + t).padStart(2, '0') + ' \u00b7 TIER ' + t + '/11';   // v7: same No. label as the book / new-animal card
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
      const un = unlockedB(i), row = document.createElement('div'); row.className = 'srow' + (un ? '' : ' locked'); row.dataset.biome = b.key;
      const sg = document.createElement('div'); sg.className = 'sg';
      if (un) sg.innerHTML = '<img src="' + SIGN[i] + '" alt="' + b.name + '">';
      else sg.innerHTML = '<div class="lsign">' + LOCK_SVG + '</div>';
      const v = document.createElement('div'); v.className = 'sv';
      const best = bestOf(i);
      const nmEl = document.createElement('div'); nmEl.className = 'sn';
      nmEl.innerHTML = '<b>' + b.name + '</b><small>' + (un ? 'BEST SCORE' : 'LOCKED') + '</small>';
      v.innerHTML = un ? '<b>' + best.toLocaleString('en-US') + '</b>' : '<b>—</b>';
      row.appendChild(sg); row.appendChild(nmEl); row.appendChild(v); list.appendChild(row);
    });
  }
  hooks.scores = { enter: renderScores, back() { show('title'); } };

  // =====================================================================================
  // v7 HUD: SCORE, NEXT, BEST, pause, settings are spread with space-evenly (equal gaps + side margins). The stat font is fitted
  // once per viewport width for the worst case (6-digit score AND best, e.g. 'SCORE 123,456') so the gaps stay >= HUD_GAP px
  // and never change as the score grows; capped at 15 px, in 0.5 px steps.
  const HUD_GAP = 6, HUD_MAX = 15, hudCv = document.createElement('canvas').getContext('2d');
  let hudFs = HUD_MAX;
  function fitHud() {
    const st = document.querySelector('#topbar .stat'); if (!st) return;
    const cs = getComputedStyle(st), fam = cs.fontFamily || 'monospace', wt = cs.fontWeight || '400';
    hudCv.font = wt + ' 20px ' + fam;
    const per20 = Math.max(hudCv.measureText('SCORE 123,456').width, hudCv.measureText('BEST 123,456').width);
    const nx = $('next').getBoundingClientRect().width || 72, btn = [...document.querySelectorAll('#topbar .iconbtn')].reduce((a, b) => a + (b.getBoundingClientRect().width || 30), 0);
    const room = (innerWidth - nx - btn - HUD_GAP * 6) / 2 - 2;        // -2: the 2 px pixel outline (text-shadow) on each stat
    hudFs = Math.max(9, Math.min(HUD_MAX, Math.floor(room / per20 * 20 * 2) / 2));
    document.documentElement.style.setProperty('--hudfs', hudFs + 'px');
  }
  fitHud(); if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitHud);
  addEventListener('resize', fitHud);
  hooks.game = { enter(o) { requestAnimationFrame(fitHud); if (o && typeof o === 'object') window.ZMGame.enter(o.mode || 'new', o.biome); else window.ZMGame.enter(o || 'new'); } };
  let rzT;
  addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(() => {
    const w0 = W, h0 = H; measure(); titleBg = null; islSrc = [];
    if (cur === 'title') buildTitle();
    else if (cur === 'map') {
      if (ua) { if (W !== w0 || H !== h0) hooks.map.enter(); }             // v7.2: a real size change restarts an unfinished reveal (pending flags kept); spurious resize events are ignored
      else { placeMap(); refreshPanel(); }
    }
    else if (cur === 'zoo') { zooLayout(); renderBook(); } else if (cur === 'scores') renderScores();
    if (popOpen) openPopup(popB, popT);
  }, 140); });

  window.ZMUI = { get unlockAnim() { return ua ? { b: ua.b, phase: ua.phase, i: ua.i, queue: ua.q.slice(), done: ua.done.slice(), t: ua.hold != null ? ua.hold : (performance.now() - ua.t0) / 1000 } : null; }, get unlockLog() { return uaLog.slice(); }, unlockSeek: uaSeek, unlockRelease() { if (ua) { ua.t0 = performance.now() - (ua.hold || 0) * 1000; ua.hold = null; } }, get pendingUnlocks() { return pendList(); }, UA,
    get hudFs() { return hudFs; }, fitHud, go: show, openZoo, toast, get screen() { return cur; }, openPopup, closePopup, get popupOpen() { return popOpen; }, isFound, foundCount, get flipping() { return flipping; }, get preloaded() { return preloadDone; }, preloadAll, get turnLog() { return turnLog.slice(); }, get spread() { return zb; }, flipTo: b => flipTo(b),
    unlocked: unlockedB, foundIn, get mapSelected() { return selected; }, get mapLayout() { return mapL; },
    title: { get clock() { return TA.clock; }, get penguin() { return { mode: TA.pen.mode, taps: TA.pen.taps.length, falls: TA.pen.falls, waddles: TA.pen.waddles, pose: penPose() }; },
      get bear() { return Object.assign({ pose: bearPose() }, TA.bear); }, get monkey() { return Object.assign({ pose: monkPose() }, TA.monk); }, hitRect, hitAt, timing: { WADDLE, FALL_T, MONK_DUR, BEAR }, bearRng(fn) { bearRng = fn || Math.random; }, glyph: GLYPH,
      // test/screenshot helpers: freeze the title clock and step it by hand
      hold(v) { TA.hold = !!v; }, setClock(c) { TA.clock = c; titleTick(); }, frames: { pen: PENF, bear: BEARF, monk: MONKF, cat: CATF }, cat: { get pose() { return catPose(); }, get lane() { return catLane(); }, get t0() { return cat0; }, CAT, reduce: catReduce } } };
  // #play-<biome> (e.g. #play-ocean) starts that biome directly
  const playOpt = () => { const m = /^#play-(\w+)$/.exec(location.hash), b = m ? D.findIndex(x => x.key === m[1] || ISL[D.indexOf(x)].k === m[1]) : 0; return { mode: 'new', biome: Math.max(0, b) }; };
  const routeOf = () => /^#play-\w+$/.test(location.hash) ? 'game' : ({ '#play': 'game', '#map': 'map', '#zoo': 'zoo', '#zoopedia': 'zoo', '#scores': 'scores' }[location.hash] || 'title');
  const route = routeOf();
  show(route, route === 'game' ? playOpt() : undefined);
  addEventListener('hashchange', () => { const r = routeOf(); if (r === cur) return; if (popOpen) closePopup(true); $('settings').classList.add('hidden'); if (r === 'zoo') openZoo({ from: 'title' }); else show(r, r === 'game' ? playOpt() : undefined); });
  requestAnimationFrame(loop);
})();
