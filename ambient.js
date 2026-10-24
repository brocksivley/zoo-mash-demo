/* Zoo Mash v5 – subtle ambient backdrop animations, one set per biome.
   Drawn on #amb, a low-res canvas laid exactly over the #bg backdrop (cover, bottom-aligned), on the backdrop's own
   3-source-px pixel grid (240 x 427 art px), behind the game canvas, so it never covers animals and never touches physics.
   Every layer is a pure function of the ambient clock `t`; the clock only advances while the game is running
   (not paused, not game over, tab visible), so pausing freezes every layer in place. */
(function () {
  'use strict';
  const AW = 240, AH = 427;
  const cv = document.createElement('canvas'); cv.id = 'amb'; cv.width = AW; cv.height = AH; cv.setAttribute('aria-hidden', 'true');
  const bgEl = document.getElementById('bg'); bgEl.parentNode.insertBefore(cv, bgEl.nextSibling);
  const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  let key = null, t = 0, running = false, layers = [], bgArt = null, auroraMask = null, drawnAt = -1, frames = 0;

  // ---- helpers ----
  const fr = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }; // stable hash 0..1
  const px = (x, y, w, h, c, a) => { g.globalAlpha = a == null ? 1 : a; g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w || 1, h || 1); };
  function disc(cx, cy, r, c, a) { // chunky pixel disc
    g.globalAlpha = a; g.fillStyle = c; cx = Math.round(cx); cy = Math.round(cy);
    for (let dy = -r; dy <= r; dy++) { const w = Math.round(Math.sqrt(r * r - dy * dy + r * 0.6)); g.fillRect(cx - w, cy + dy, 2 * w + 1, 1); }
  }
  function sprite(rows, x, y, pal, a, flip) { // rows: strings, '.' = clear, other chars index pal
    g.globalAlpha = a == null ? 1 : a; x = Math.round(x); y = Math.round(y);
    for (let j = 0; j < rows.length; j++) { const r = rows[j];
      for (let i = 0; i < r.length; i++) { const ch = r[i]; if (ch === '.') continue; g.fillStyle = pal[ch]; g.fillRect(flip ? x + r.length - 1 - i : x + i, y + j, 1, 1); } }
  }
  function line(x0, y0, x1, y1, c, a, w) { // Bresenham, w = 1 or 2
    g.globalAlpha = a; g.fillStyle = c; x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy;
    for (;;) { g.fillRect(x0, y0, w || 1, w || 1); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
  }
  // a once-every-`period` event: returns progress 0..1 while active, else -1. `first` = start time of the first one.
  function event(period, dur, first) { const c = t - first; if (c < 0) return -1; const p = c % period; return p < dur ? p / dur : -1; }
  const cycleNo = (period, first) => Math.floor((t - first) / period);

  // ---- per-biome layers ----
  const L = {
    forest: [
      { name: 'squirrel', draw() { // runs out along a pine bough from the trunk, flicks its tail, runs back; every ~25 s
        const p = event(25, 4.4, 4); if (p < 0) return;
        const side = cycleNo(25, 4) % 2, path = side ? [212, 77, 175, 83] : [24, 72, 62, 83];
        const T = p * 4.4; let k, dir;
        if (T < 1.6) { k = T / 1.6; dir = 1; } else if (T < 2.8) { k = 1; dir = 1; } else { k = 1 - (T - 2.8) / 1.6; dir = -1; }
        const x = path[0] + (path[2] - path[0]) * k, y = path[1] + (path[3] - path[1]) * k;
        const goingRight = (path[2] > path[0]) === (dir > 0), moving = T < 1.6 || T >= 2.8, f = moving ? Math.floor(t * 12) % 2 : 0;
        const flick = !moving && Math.floor(t * 5) % 2;
        const body = [ flick ? '.tt......' : 'tt.......', 'ttt...ee.', '.tbbbbbee', '..bbbbbbe', f ? '..b.b.b..' : '...b..b..' ];
        sprite(body, x - 4, y - 5, { t: '#b8733a', b: '#8e4f22', e: '#a35d2a' }, 0.95, !goingRight);
      } },
      { name: 'fireflies', draw() {
        for (let i = 0; i < 14; i++) {
          const bx = 16 + fr(i) * 208, by = 120 + fr(i + 40) * 170, sp = 0.25 + fr(i + 80) * 0.3;
          const x = bx + Math.sin(t * sp + i) * 9 + Math.sin(t * sp * 2.3 + i * 2) * 3, y = by + Math.cos(t * sp * 0.8 + i * 1.7) * 6;
          const b = Math.max(0, Math.sin(t * (0.9 + fr(i + 9) * 0.8) + i * 2.1)); const a = b * b * b;
          if (a < 0.03) continue;
          px(x - 1, y - 1, 3, 3, '#d8ff60', 0.28 * a); px(x, y, 1, 1, '#fff7b0', 0.95 * a);
        }
      } } ],
    ocean: [
      { name: 'bubbles', draw() {
        for (let i = 0; i < 12; i++) {
          const P = 9 + fr(i) * 6, c = ((t + fr(i + 3) * P) % P) / P, side = i % 2;
          const x0 = side ? 192 + fr(i + 7) * 34 : 14 + fr(i + 7) * 34, y = 300 - c * 280, x = x0 + Math.sin(t * 2 + i) * 2;
          const a = (c < 0.1 ? c / 0.1 : 1) * (c > 0.8 ? (1 - c) / 0.2 : 1) * 0.75, big = fr(i + 11) > 0.6;
          if (big) { px(x, y - 1, 2, 1, '#bff3ff', a); px(x - 1, y, 1, 2, '#bff3ff', a); px(x + 2, y, 1, 2, '#bff3ff', a); px(x, y + 2, 2, 1, '#bff3ff', a); px(x, y, 1, 1, '#ffffff', a); }
          else { px(x, y, 1, 1, '#d9f8ff', a); px(x, y - 1, 1, 1, '#bff3ff', a * 0.5); }
        }
      } },
      { name: 'fish', draw() { // a small school crossing high up now and then
        const p = event(22, 8, 6); if (p < 0) return;
        const ltr = cycleNo(22, 6) % 2 === 0, base = ltr ? -24 + p * 290 : 264 - p * 290, wig = Math.floor(t * 8) % 2;
        const fish = wig ? ['.ooo.t', 'oooootl', '.ooo.t'] : ['.ooo..', 'oooootl', '.ooo..'];
        for (let i = 0; i < 6; i++) {
          const dx = [0, 9, 4, 14, 10, 18][i], dy = [0, -4, 5, 2, 9, -2][i];
          const x = base + (ltr ? -dx : dx), y = 66 + dy + Math.sin(t * 3 + i) * 1.2;
          sprite(fish, x, y, { o: '#1f5f7a', t: '#1f5f7a', l: '#2e7d99' }, 0.6, ltr);
        }
      } } ],
    farm: [
      { name: 'clouds', draw() {
        const C = [[0, 26, 3.0, 0], [1, 62, 2.0, 1], [2, 96, 2.6, 0]];
        for (const [i, y, sp, sh] of C) {
          const span = 300, x = ((fr(i + 5) * span + t * sp) % span) - 40;
          const rows = sh ? ['....wwww......', '..wwwwwwww.ww.', '.wwwwwwwwwwwww', 'gggggggggggggg'] : ['...www....', '.wwwwwww..', 'wwwwwwwwww', '.gggggggg.'];
          sprite(rows, x, y, { w: '#ffffff', g: '#d6e6f5' }, 0.85);
        }
      } },
      { name: 'windmill', draw() { // little farm windmill by the barn, slowly turning
        const hx = 186, hy = 174;
        line(hx - 6, 207, hx - 1, hy + 2, '#7a6a5a', 1, 1); line(hx + 6, 207, hx + 1, hy + 2, '#7a6a5a', 1, 1);
        line(hx - 4, 197, hx + 4, 197, '#6a5a4a', 1, 1); line(hx - 3, 188, hx + 3, 188, '#6a5a4a', 1, 1); line(hx - 5, 206, hx + 3, 189, '#8a7a6a', 0.8, 1);
        px(hx + 2, hy - 1, 5, 2, '#b23a2a', 1); px(hx + 6, hy - 3, 2, 6, '#c8b8a0', 1); // tail vane
        const a0 = t * 0.9;
        for (let k = 0; k < 4; k++) { const a = a0 + k * Math.PI / 2, ex = hx + Math.cos(a) * 12, ey = hy + Math.sin(a) * 12;
          line(hx, hy, ex, ey, '#efe6d6', 1, 2); const qx = hx + Math.cos(a) * 7 + Math.cos(a + 1.57) * 2, qy = hy + Math.sin(a) * 7 + Math.sin(a + 1.57) * 2; line(hx + Math.cos(a) * 4, hy + Math.sin(a) * 4, qx, qy, '#c9bda8', 1, 1); }
        px(hx - 1, hy - 1, 2, 2, '#4a3a2a', 1);
      } } ],
    arctic: [
      { name: 'aurora', draw() { // shimmer: the painted aurora brightens in slow waves and ripples by a pixel
        if (!auroraMask) return;
        g.save(); g.globalCompositeOperation = 'lighter';
        for (let x = 0; x < AW; x += 2) {
          const a = 0.06 + 0.30 * Math.max(0, Math.sin(x * 0.045 - t * 0.8)) * (0.6 + 0.4 * Math.sin(x * 0.017 + t * 0.35));
          const dy = Math.round(Math.sin(x * 0.06 + t * 1.1));
          g.globalAlpha = a; g.drawImage(auroraMask, x, 0, 2, 170, x, dy, 2, 170);
        }
        g.restore();
      } },
      { name: 'snow', draw() {
        for (let i = 0; i < 42; i++) {
          const sp = 7 + fr(i) * 7, H = AH + 10, y = ((fr(i + 21) * H + t * sp) % H) - 5;
          const x = ((fr(i + 50) * AW + Math.sin(t * 0.7 + i) * 4 + t * 1.5) % AW + AW) % AW;
          const s = fr(i + 70) > 0.8 ? 2 : 1; px(x, y, s, s, '#ffffff', 0.55 + 0.3 * fr(i + 90));
        }
      } } ],
    oriental: [
      { name: 'petals', draw() {
        for (let i = 0; i < 16; i++) {
          const P = 9 + fr(i) * 6, c = ((t + fr(i + 4) * P) % P) / P;
          const sx = i < 4 ? 130 + fr(i + 8) * 22 : 150 + fr(i + 8) * 85, sy = i < 4 ? 172 : 125 + fr(i + 12) * 60;
          const x = sx - c * (30 + fr(i + 2) * 40) + Math.sin(t * 2.2 + i * 1.3) * 4, y = sy + c * (230 + fr(i + 6) * 60);
          const a = (c < 0.08 ? c / 0.08 : 1) * (c > 0.85 ? (1 - c) / 0.15 : 1) * 0.9, fl = Math.floor(t * 4 + i) % 2;
          px(x, y, fl ? 2 : 1, fl ? 1 : 2, i % 3 ? '#ffb7c9' : '#ff8fb0', a);
        }
      } },
      { name: 'waterfall', draw() { // the thin fall under the pagoda cliff, flowing
        for (let y = 199; y < 252; y++) {
          const w = y < 216 ? 2 : 3, x = y < 216 ? 158 : 157;
          px(x, y, w, 1, '#cfe8f4', 0.42);
          const m = ((y - t * 28) % 7 + 7) % 7; if (m < 1.5) px(x + (y & 1), y, 1, 1, '#ffffff', 0.85);
        }
        for (let i = 0; i < 6; i++) { const a = 0.25 + 0.2 * Math.sin(t * 2 + i * 1.7); px(151 + i * 2.4, 250 + Math.sin(t * 1.3 + i) * 1.5, 2, 1, '#eef6fb', a); }
      } } ],
    savannah: [
      { name: 'birds', draw() { // a V of birds crossing in front of Kilimanjaro
        const p = event(20, 10, 5); if (p < 0) return;
        const bx = 262 - p * 300;
        for (let i = 0; i < 7; i++) {
          const k = i === 0 ? 0 : Math.ceil(i / 2), sgn = i % 2 ? -1 : 1, x = bx + k * 7, y = 120 + sgn * k * 4 + Math.sin(t * 2 + i) * 0.8;
          const up = Math.floor(t * 6 + i * 0.7) % 2;
          sprite(up ? ['l...l', '.l.l.', '..l..'] : ['.....', 'lllll', '..l..'], x, y, { l: '#3a2414' }, 0.85);
        }
      } },
      { name: 'grass', draw() { // the golden grass under the acacias sways in bands
        if (!bgArt) return;
        const y0 = 206, y1 = 252;
        for (let cx = 0; cx < AW; cx += 12) for (let y = y0; y < y1; y += 2) {
          const amp = (y1 - y) / (y1 - y0), dx = Math.round(amp * 1.6 * Math.sin(t * 1.6 + cx * 0.09));
          if (!dx) continue; g.globalAlpha = 1; g.drawImage(bgArt, cx, y, 12, 2, cx + dx, y, 12, 2);
        }
      } } ],
    jurassic: [
      { name: 'smoke', draw() {
        for (let i = 0; i < 7; i++) {
          const P = 7, c = ((t + i * P / 7) % P) / P;
          const x = 145 + c * 20 + Math.sin(t * 0.8 + i) * 2, y = 103 - c * 64, r = Math.round(2 + c * 5);
          const a = (c < 0.12 ? c / 0.12 : 1) * (1 - c) * 0.5;
          disc(x, y, r, '#5d4d4b', a); disc(x - 1, y - 1, Math.max(1, r - 2), '#857470', a * 0.8);
        }
      } },
      { name: 'pterodactyl', draw() {
        const p = event(26, 9, 8); if (p < 0) return;
        const ltr = cycleNo(26, 8) % 2 === 0, x = ltr ? -24 + p * 290 : 266 - p * 290, y = 48 + Math.sin(p * 6.28) * 4;
        const flap = Math.floor(t * 2.5) % 3 === 0;
        const rows = flap ? ['......dd.......', '.....dddd......', 'wwwwwddddwwwww.', '......dd.......']
                          : ['ww...........ww', '.www..dd...www.', '...wwddddhww...', '......dd...hh..'];
        sprite(rows, x - 7, y, { w: '#3d2222', d: '#2c1818', h: '#4a2a26' }, 0.85, !ltr);
      } } ],
    space: [
      { name: 'stars', draw() {
        for (let i = 0; i < 28; i++) {
          let x = 24 + fr(i) * 194, y = 30 + fr(i + 33) * 130;
          if ((x > 18 && x < 128 && y > 50 && y < 120) || (x > 168 && x < 204 && y > 112 && y < 144)) continue;
          const a = Math.max(0, Math.sin(t * (1 + fr(i + 5) * 1.5) + i * 2.3)); if (a < 0.05) continue;
          px(x, y, 1, 1, '#ffffff', a);
          if (fr(i + 60) > 0.65) { px(x - 1, y, 1, 1, '#9fd8ff', a * 0.5); px(x + 1, y, 1, 1, '#9fd8ff', a * 0.5); px(x, y - 1, 1, 1, '#9fd8ff', a * 0.5); px(x, y + 1, 1, 1, '#9fd8ff', a * 0.5); }
        }
      } },
      { name: 'comet', draw() { // a shooting star streaks across the window now and then
        const p = event(14, 1.3, 3); if (p < 0) return;
        const n = cycleNo(14, 3), sx = 150 + fr(n) * 60, sy = 30 + fr(n + 9) * 20, ex = sx - 120, ey = sy + 70;
        const x = sx + (ex - sx) * p, y = sy + (ey - sy) * p, fade = p > 0.75 ? (1 - p) / 0.25 : 1;
        g.save(); g.beginPath(); [[36, 24], [204, 24], [222, 42], [222, 150], [206, 166], [36, 166], [18, 150], [18, 42]].forEach(([a, b], i) => i ? g.lineTo(a, b) : g.moveTo(a, b)); g.clip();
        for (let k = 0; k < 14; k++) px(x + k * 1.7, y - k, 1, 1, k < 2 ? '#ffffff' : '#9fe8ff', fade * (1 - k / 14) * 0.9);
        px(x - 1, y, 2, 2, '#ffffff', fade);
        g.restore();
      } } ],
  };

  function loadBg(src) {
    bgArt = null; auroraMask = null;
    const im = new Image(), want = key;
    im.onload = () => {
      if (key !== want) return;
      const c = document.createElement('canvas'); c.width = AW; c.height = AH; const cg = c.getContext('2d');
      cg.imageSmoothingEnabled = false; cg.drawImage(im, 0, 0, AW, 1280 / 3); // one sample per 3x3 source block (the backdrop's pixel grid)
      bgArt = c;
      if (key === 'arctic') { // keep only the bright green/teal/violet aurora pixels of the sky
        const m = document.createElement('canvas'); m.width = AW; m.height = 170; const mg = m.getContext('2d');
        const d = cg.getImageData(0, 0, AW, 170), o = mg.createImageData(AW, 170);
        for (let i = 0; i < d.data.length; i += 4) {
          const r = d.data[i], gg = d.data[i + 1], b = d.data[i + 2];
          const green = gg > 120 && gg > r + 30, violet = b > 150 && r > 90 && gg < 110;
          if (green || violet) { o.data[i] = r * 0.7; o.data[i + 1] = gg * 0.8; o.data[i + 2] = b * 0.7; o.data[i + 3] = 255; }
        }
        mg.putImageData(o, 0, 0); auroraMask = m;
      }
      drawnAt = -1;
    };
    im.src = src;
  }

  function draw() {
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, AW, AH);
    for (const l of layers) { g.save(); l.draw(); g.restore(); }
    g.globalAlpha = 1; drawnAt = t; frames++;
  }

  window.ZMAmb = {
    setBiome(k, bgSrc) { key = k; layers = L[k] || []; t = 0; drawnAt = -1; frames = 0; loadBg(bgSrc); draw(); },
    // cover + bottom-aligned, matching #bg's CSS background (720 x 1280 source)
    layout(W, H) {
      const s = Math.max(W / 720, H / 1280), w = 720 * s;
      Object.assign(cv.style, { width: w + 'px', height: (AH * 3 * s) + 'px', left: ((W - w) / 2) + 'px', top: (H - 1280 * s) + 'px' });
    },
    // called every game frame; dt is 0 when the game is paused / over / hidden
    tick(dt, run) { running = !!run; if (run && dt > 0) t += Math.min(dt, 0.1); if (drawnAt !== t) draw(); },
    state() { return { biome: key, t: +t.toFixed(3), running, frames, layers: layers.map(l => l.name), canvas: !!cv.isConnected }; },
    canvas: cv,
  };
})();
