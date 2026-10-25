/* Zoo Mash v6 – subtle ambient backdrop animations, one set per biome, in the backdrop's own pixel-art style.
   Drawn on #amb, a low-res canvas laid exactly over the #bg backdrop (cover, bottom-aligned), on the backdrop's own
   3-source-px pixel grid (240 x 427 art px), behind the game canvas, so it never covers animals and never touches physics.
   v6 pixel rules for every moving part: hand-made sprite frames on whole art pixels, opaque palette colours (no alpha
   fades, no smooth rotation/skew/shear), and stepped timing – each layer advances on its own small frame rate (2–12 fps)
   via `step(fps)`. The canvas only redraws when one of the visible steps changes, which also keeps it cheap on old phones.
   The two "soft" layers Brock likes – forest fireflies and arctic snow – keep their v5 look.
   Every layer is a pure function of the ambient clock `t`; the clock only advances while the game is running
   (not paused, not game over, tab visible), so pausing freezes every layer in place. */
(function () {
  'use strict';
  const AW = 240, AH = 427;
  const cv = document.createElement('canvas'); cv.id = 'amb'; cv.width = AW; cv.height = AH; cv.setAttribute('aria-hidden', 'true');
  const bgEl = document.getElementById('bg'); bgEl.parentNode.insertBefore(cv, bgEl.nextSibling);
  const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
  let key = null, t = 0, running = false, layers = [], bgArt = null, auroraFrames = null, drawnKey = '', frames = 0, low = false, skipped = 0;

  // ---- helpers ----
  const fr = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }; // stable hash 0..1
  const step = fps => Math.floor(t * fps) / fps;                       // stepped clock for a layer
  const px = (x, y, w, h, c, a) => { g.globalAlpha = a == null ? 1 : a; g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w || 1, h || 1); };
  const spriteCache = new Map();
  function sprite(rows, x, y, pal, flip) { // rows: strings, '.' = clear, other chars index pal; cached as an offscreen canvas
    const ck = rows.join('/') + '#' + Object.keys(pal).map(k => k + pal[k]).join('');
    let c = spriteCache.get(ck);
    if (!c) {
      const w = Math.max(...rows.map(r => r.length)), h = rows.length;
      c = [document.createElement('canvas'), document.createElement('canvas')];
      for (let f = 0; f < 2; f++) {
        c[f].width = w; c[f].height = h; const cg = c[f].getContext('2d');
        for (let j = 0; j < h; j++) for (let i = 0; i < rows[j].length; i++) { const ch = rows[j][i]; if (ch === '.') continue; cg.fillStyle = pal[ch]; cg.fillRect(f ? w - 1 - i : i, j, 1, 1); }
      }
      spriteCache.set(ck, c);
    }
    g.globalAlpha = 1; g.drawImage(c[flip ? 1 : 0], Math.round(x), Math.round(y));
  }
  function line(x0, y0, x1, y1, c, w) { // Bresenham, w = 1 or 2 (only ever used for baked, fixed-angle frames)
    g.globalAlpha = 1; g.fillStyle = c; x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy;
    for (;;) { g.fillRect(x0, y0, w || 1, w || 1); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
  }
  // a once-every-`period` event: returns progress 0..1 while active, else -1. `first` = start time of the first one.
  function event(period, dur, first, tt = t) { const c = tt - first; if (c < 0) return -1; const p = c % period; return p < dur ? p / dur : -1; }
  const cycleNo = (period, first, tt = t) => Math.floor((tt - first) / period);

  // ---- sprite sheets (hand-made, on the backdrop's art-pixel grid) ----
  const CROW_PAL = { k: '#101018', b: '#23253a', h: '#424b6e', g: '#6b6b70', w: '#e8e8e0', l: '#2a2a30' };
  const CROW = {
    perch: ['...kkk....', '..kbbhk...', 'gkbwbbk...', '..kbbbbk..', '..kbhhbbk.', '...kbhhbbk', '....kbbbkk', '.....kkk.k', '.....l.l..', '....ll.ll.'],
    look:  ['....kkk...', '...khbbk..', '...kbbwbk.', '..kbbbbk..', '..kbhhbbk.', '...kbhhbbk', '....kbbbkk', '.....kkk.k', '.....l.l..', '....ll.ll.'],
    caw:   ['...kkk....', 'g.kbbhk...', '.kbwbbk...', 'gkkbbbbk..', '..kbhhbbk.', '...kbhhbbk', '....kbbbkk', '.....kkk.k', '.....l.l..', '....ll.ll.'],
    peck:  ['..........', '..........', '...kkk....', '..kbbhkk..', '.gkwbbbbk.', 'gg.kbhhbbk', '...kkbhhbk', '....kbbbkk', '.....l.l.k', '....ll.ll.'],
    fly: [ // wings up / level / down; 14 x 9, feet-row aligned with the perch frames' bottom at +9
      ['.....kk.......', '....khk.......', '...khbk.......', '..kkhbk...kk..', 'gkbwbbbkkkbbk.', '..kkbbbbbbkkkk', '....kkkkkk....', '..............', '..............'],
      ['..............', '..............', '..kkk.........', '.kbwbkkkkk.kk.', 'gkbbbbbhhbkbbk', '..kkkbbbbbkkkk', '....kkkkkk....', '..............', '..............'],
      ['..............', '..............', '..kkk.........', '.kbwbkkkkk.kk.', 'gkbbbbbbbbkbbk', '..kkbhbbkkkkkk', '...khbk.......', '...kbk........', '...kk.........'] ],
  };
  const PTERO_PAL = { k: '#1e0e0e', w: '#6a3530', d: '#3d2020', c: '#8a4436', b: '#b8604a' };
  const PTERO = [ // faces right: wings up / level / down, 17 x 10
    ['kk...........kk..', 'kwk.........kwk..', '.kwk.......kwk...', '..kwk.kkk.kwk....', '...kwkdddkwk.kkk.', '....kddddddkkcdbk', '.....kkdddkkkkkk.', '.......kk.k......', '.................', '.................'],
    ['.................', '.................', '..........kk.....', 'kkkk...kkkwwkkk..', 'kwwwkkkdddwkkkk..', '.kkwwwddddddkcdbk', '...kkkkdddkkkkkk.', '.......kk.k......', '.................', '.................'],
    ['.................', '.................', '.................', '.......kkk...kkk.', '......kdddkkkcdbk', '...kkkdddddkkkkk.', '..kwwwwdddwwwk...', '.kwwkkkkkkkwwwk..', '.kwk.......kwwk..', '..k.........kk...'] ];
  // savannah grass tufts: 3 lean frames (left / upright / right), golden blades with a darker base
  const TUFT_PAL = { a: '#e59425', b: '#d77f15', c: '#9f4d0d', d: '#6a3714', e: '#f2b043' };
  const TUFT = [
    [['e....a.', '.a..b..', '.b.ab..', '..bbc..', '..cdd..'], ['...e...', '.a.a.a.', '.b.b.b.', '..bbc..', '..cdd..'], ['.a....e', '..b..a.', '..ba.b.', '..cbb..', '..ddc..']],
    [['a..e.', 'ba.a.', '.bb..', '.cd..'], ['.e.a.', '.a.b.', '.bb..', '.cd..'], ['.a..e', '.a.ab', '..bb.', '..dc.']] ];
  // jurassic smoke puffs: 3 sizes with an outline + highlight, and a broken-up last frame
  const PUFF_PAL = { o: '#5e3a20', m: '#86603e', l: '#a07650', h: '#bb9066' };
  const PUFF = [
    ['.oo.', 'ohlo', 'omlo', '.oo.'],
    ['..ooo..', '.ohhlo.', 'ohllmmo', 'olmmmmo', '.ommmo.', '..ooo..'],
    ['...oooo...', '..ohhllo..', '.ohllllmo.', 'ohllmmmmmo', 'olmmmmmmmo', 'ommmmmmmmo', '.ommmmmmo.', '..oooooo..'],
    ['...o..o...', '..o.h.l...', '.o.l.l.m..', '..l.m.m.mo', 'o.m.m.m.m.', '.m.m.m.m.o', '..m.m.m...', '...o..o...'] ];
  const FISH_PAL = { o: '#164a60', b: '#1f5f7a', l: '#3a86a2', t: '#164a60' };
  const FISH = [['.ooo.t.', 'obblott', '.ooo.t.'], ['.ooo...', 'obblott', '.ooo...']];
  // savannah birds: chunky outlined pixel birds (beak, body, two-tone wings), 3 flap frames, flying left
  const BIRD_PAL = { k: '#24160c', d: '#6e4c2c', b: '#4a3220', o: '#e0a040' };
  const BIRD = [
    ['kk.....kk', 'kdk...kdk', '.kdkkkdk.', 'okbbbbbk.', '.kkkkkk..', '.........'],
    ['.........', 'kkk...kkk', 'kddkkkddk', 'okbbbbbk.', '.kkkkkk..', '.........'],
    ['.........', '.........', '.kkkkkkk.', 'okbbbbbkk', 'kdkkkkkdk', 'kk.....kk'] ];
  const SQ_PAL = { t: '#b8733a', b: '#8e4f22', e: '#a35d2a', k: '#4a2a12' };

  // ---- per-biome layers. fps = how often that layer's picture can change (the redraw key) ----
  const L = {
    forest: [
      { name: 'squirrel', fps: 8, draw() { // runs out along a pine bough from the trunk, flicks its tail, runs back; every ~25 s
        const tt = step(8), p = event(25, 4.4, 4, tt); if (p < 0) return;
        const side = cycleNo(25, 4, tt) % 2, path = side ? [212, 77, 175, 83] : [24, 72, 62, 83];
        const T = p * 4.4; let k, dir;
        if (T < 1.6) { k = T / 1.6; dir = 1; } else if (T < 2.8) { k = 1; dir = 1; } else { k = 1 - (T - 2.8) / 1.6; dir = -1; }
        const x = Math.round(path[0] + (path[2] - path[0]) * k), y = Math.round(path[1] + (path[3] - path[1]) * k);
        const goingRight = (path[2] > path[0]) === (dir > 0), moving = T < 1.6 || T >= 2.8, f = moving ? Math.floor(tt * 8) % 2 : 0;
        const flick = !moving && Math.floor(tt * 4) % 2;
        const body = [flick ? '.tt......' : 'tt.......', 'ttt...ek.', '.tbbbbbee', '..bbbbbbe', f ? '..b.b.b..' : '...b..b..'];
        sprite(body, x - 4, y - 5, SQ_PAL, !goingRight);
      } },
      { name: 'fireflies', fps: 30, soft: true, draw() { // (kept from v5 – soft glow is the point)
        for (let i = 0; i < (low ? 8 : 14); i++) {
          const bx = 16 + fr(i) * 208, by = 120 + fr(i + 40) * 170, sp = 0.25 + fr(i + 80) * 0.3;
          const x = bx + Math.sin(t * sp + i) * 9 + Math.sin(t * sp * 2.3 + i * 2) * 3, y = by + Math.cos(t * sp * 0.8 + i * 1.7) * 6;
          const b = Math.max(0, Math.sin(t * (0.9 + fr(i + 9) * 0.8) + i * 2.1)); const a = b * b * b;
          if (a < 0.03) continue;
          px(x - 1, y - 1, 3, 3, '#d8ff60', 0.28 * a); px(x, y, 1, 1, '#fff7b0', 0.95 * a);
        }
      } } ],
    ocean: [
      { name: 'bubbles', fps: 8, draw() { // opaque pixel bubbles rising in 1-px steps, popping (2-frame pop) near the top
        const tt = step(8);
        for (let i = 0; i < 12; i++) {
          const P = 9 + fr(i) * 6, c = ((tt + fr(i + 3) * P) % P) / P, side = i % 2;
          if (c < 0.06) continue;
          const x0 = side ? 192 + fr(i + 7) * 34 : 14 + fr(i + 7) * 34, y = Math.round(300 - c * 280), x = Math.round(x0 + [0, 1, 1, 0, -1, -1][(Math.floor(tt * 8) + i) % 6] * 0.6 + 0.2);
          const big = fr(i + 11) > 0.6;
          if (c > 0.9) { if (c < 0.95) sprite(['b.b', '...', 'b.b'], x - 1, y - 1, { b: '#d9f8ff' }); continue; } // pop
          if (big) sprite(['.bb.', 'bw.b', 'b..b', '.bb.'], x - 1, y - 1, { b: '#9fdcf0', w: '#ffffff' });
          else sprite(['w', 'b'], x, y - 1, { b: '#9fdcf0', w: '#d9f8ff' });
        }
      } },
      { name: 'fish', fps: 8, draw() { // a small school crossing high up now and then: outlined silhouettes, 2-frame tail wag
        const tt = step(8), p = event(22, 8, 6, tt); if (p < 0) return;
        const ltr = cycleNo(22, 6, tt) % 2 === 0, base = Math.round(ltr ? -24 + p * 290 : 264 - p * 290), wig = Math.floor(tt * 4) % 2;
        for (let i = 0; i < 6; i++) {
          const dx = [0, 9, 4, 14, 10, 18][i], dy = [0, -4, 5, 2, 9, -2][i], bob = (Math.floor(tt * 2) + i) % 4 === 0 ? 1 : 0;
          sprite(FISH[(wig + i) % 2], base + (ltr ? -dx : dx), 66 + dy + bob, FISH_PAL, ltr);
        }
      } } ],
    farm: [
      { name: 'clouds', fps: 4, draw() { // whole-pixel drift
        const tt = step(4), C = [[0, 26, 3.0, 0], [1, 62, 2.0, 1], [2, 96, 2.6, 0]];
        for (const [i, y, sp, sh] of C) {
          const span = 300, x = Math.floor(((fr(i + 5) * span + tt * sp) % span) - 40);
          const rows = sh ? ['....wwww......', '..wwwwwwww.ww.', '.wwwwwwwwwwwww', 'gggggggggggggg'] : ['...www....', '.wwwwwww..', 'wwwwwwwwww', '.gggggggg.'];
          sprite(rows, x, y, { w: '#ffffff', g: '#d6e6f5' });
        }
      } },
      { name: 'windmill', fps: 3, draw() { // little farm windmill by the barn: 4 baked sail frames (22.5° apart), stepped at 3 fps
        const hx = 186, hy = 174, f = Math.floor(t * 3) % 4;
        line(hx - 6, 207, hx - 1, hy + 2, '#7a6a5a', 1); line(hx + 6, 207, hx + 1, hy + 2, '#7a6a5a', 1);
        line(hx - 4, 197, hx + 4, 197, '#6a5a4a', 1); line(hx - 3, 188, hx + 3, 188, '#6a5a4a', 1); line(hx - 5, 206, hx + 3, 189, '#8a7a6a', 1);
        px(hx + 2, hy - 1, 5, 2, '#b23a2a'); px(hx + 6, hy - 3, 2, 6, '#c8b8a0'); // tail vane
        const a0 = f * Math.PI / 8;
        for (let k = 0; k < 4; k++) { const a = a0 + k * Math.PI / 2, ex = hx + Math.cos(a) * 12, ey = hy + Math.sin(a) * 12;
          line(hx, hy, ex, ey, '#efe6d6', 2); const qx = hx + Math.cos(a) * 7 + Math.cos(a + 1.57) * 2, qy = hy + Math.sin(a) * 7 + Math.sin(a + 1.57) * 2; line(hx + Math.cos(a) * 4, hy + Math.sin(a) * 4, qx, qy, '#c9bda8', 1); }
        px(hx - 1, hy - 1, 2, 2, '#4a3a2a');
      } },
      { name: 'crow', fps: 8, draw() { // flies in, perches on a fence post, looks around / pecks / caws, flies off; every ~24 s
        const tt = step(8), D = 9, p = event(24, D, 7, tt); if (p < 0) return;
        const n = cycleNo(24, 7, tt), post = [[144, 211], [126, 211], [60, 211]][n % 3], T = p * D, wing = Math.floor(tt * 8) % 3;
        const fromRight = n % 2 === 0, sx = fromRight ? 252 : -16, ex = fromRight ? -18 : 254;
        if (T < 1.5) { // glide in on a shallow arc, landing feet-first
          const k = T / 1.5, x = Math.round(sx + (post[0] - sx) * k), y = Math.round(150 + (post[1] - 9 - 150) * (1 - (1 - k) * (1 - k)));
          sprite(CROW.fly[k > 0.85 ? 2 : wing], x - 7, y, CROW_PAL, !fromRight);
        } else if (T < 7.4) { // perched: a little idle routine (frame per 1/4 s)
          const seq = 'ppppllppppkpkppppcppcpplllpp', ch = seq[Math.floor((T - 1.5) * 4) % seq.length];
          const fra = { p: CROW.perch, l: CROW.look, k: CROW.peck, c: CROW.caw }[ch];
          sprite(fra, post[0] - 5, post[1] - 9, CROW_PAL, !fromRight);
        } else { // take off up and away
          const k = (T - 7.4) / 1.6, x = Math.round(post[0] + (ex - post[0]) * k), y = Math.round(post[1] - 9 - 90 * k * k - 6 * k);
          sprite(CROW.fly[wing], x - 7, y, CROW_PAL, !fromRight);
        }
      } } ],
    arctic: [
      { name: 'aurora', fps: 2, draw() { // the painted aurora brightens in slow waves: pre-baked, ordered-dither frames at 2 fps
        if (!auroraFrames) return;
        g.globalAlpha = 1; g.drawImage(auroraFrames[Math.floor(t * 2) % auroraFrames.length], 0, 0);
      } },
      { name: 'snow', fps: 30, soft: true, draw() { // (kept from v5)
        for (let i = 0; i < (low ? 24 : 42); i++) {
          const sp = 7 + fr(i) * 7, H = AH + 10, y = ((fr(i + 21) * H + t * sp) % H) - 5;
          const x = ((fr(i + 50) * AW + Math.sin(t * 0.7 + i) * 4 + t * 1.5) % AW + AW) % AW;
          const s = fr(i + 70) > 0.8 ? 2 : 1; px(x, y, s, s, '#ffffff', 0.55 + 0.3 * fr(i + 90));
        }
      } } ],
    oriental: [
      { name: 'petals', fps: 8, draw() { // opaque 2-frame petals drifting down in whole-pixel steps
        const tt = step(8);
        for (let i = 0; i < 16; i++) {
          const P = 9 + fr(i) * 6, c = ((tt + fr(i + 4) * P) % P) / P;
          if (c < 0.04 || c > 0.93) continue;
          const sx = i < 4 ? 130 + fr(i + 8) * 22 : 150 + fr(i + 8) * 85, sy = i < 4 ? 172 : 125 + fr(i + 12) * 60;
          const sway = [0, 1, 2, 2, 1, 0, -1, -1][(Math.floor(tt * 4) + i) % 8];
          const x = Math.round(sx - c * (30 + fr(i + 2) * 40) + sway), y = Math.round(sy + c * (230 + fr(i + 6) * 60)), fl = (Math.floor(tt * 4) + i) % 2;
          const col = i % 3 ? '#ffb7c9' : '#ff8fb0';
          if (fl) sprite(['ab'], x, y, { a: col, b: '#e8708f' }); else sprite(['a', 'b'], x, y, { a: col, b: '#e8708f' });
        }
      } },
      { name: 'waterfall', fps: 8, draw() { // the thin fall under the pagoda cliff: opaque 4-frame loop, white dashes stepping down
        const f = Math.floor(t * 8) % 4;
        for (let y = 199; y < 252; y++) {
          const w = y < 216 ? 2 : 3, x = y < 216 ? 158 : 157, m = (y - f * 2 + 400) % 8;
          px(x, y, w, 1, m < 2 ? '#ffffff' : m < 5 ? '#cfe8f4' : '#a9cde0');
          if (m === 1) px(x + w - 1, y, 1, 1, '#eef6fb');
        }
        const sp = [['.w.w.w.', 'wcwcwcw'], ['w.w.w.w', 'cwcwcwc']][Math.floor(t * 4) % 2];      // 2-frame splash
        sprite(sp, 154, 250, { w: '#eef6fb', c: '#cfe8f4' });
      } } ],
    savannah: [
      { name: 'birds', fps: 6, draw() { // a V of birds crossing in front of Kilimanjaro, 3-frame flap
        const tt = step(6), p = event(20, 10, 5, tt); if (p < 0) return;
        const bx = Math.round(262 - p * 300);
        for (let i = 0; i < 5; i++) {
          const k = i === 0 ? 0 : Math.ceil(i / 2), sgn = i % 2 ? -1 : 1;
          sprite(BIRD[(Math.floor(tt * 6) + i) % 3], bx + k * 12, 116 + sgn * k * 6, BIRD_PAL);
        }
      } },
      { name: 'grass', fps: 4, draw() { // golden grass tufts in the field: 3 hand-drawn lean frames, a gust rolls across now and then
        const f4 = Math.floor(t * 4);
        for (let i = 0; i < 34; i++) {
          const x = Math.round(4 + fr(i + 200) * 228), y = Math.round(214 + fr(i + 230) * 110), small = i % 3 === 0;
          const gust = (f4 - Math.floor(x / 16) + 1000) % 12, lean = gust === 0 ? 2 : gust === 1 ? 1 : gust === 2 ? 0 : (Math.floor(f4 / 2) + i) % 7 === 0 ? 0 : 1;
          sprite(TUFT[small ? 1 : 0][lean], x, y - 5, TUFT_PAL);
        }
      } } ],
    jurassic: [
      { name: 'smoke', fps: 6, draw() { // stepped pixel puffs rising from the crater, growing, then breaking up
        const tt = step(6);
        for (let i = 0; i < 4; i++) {
          const P = 8, c = ((tt + i * P / 4) % P) / P;
          const size = c < 0.18 ? 0 : c < 0.45 ? 1 : c < 0.85 ? 2 : 3;
          if (c > 0.96) continue;
          const x = Math.round(141 + c * 22 + ((i & 1) ? 1 : 0)), y = Math.round(103 - c * 60), r = PUFF[size];
          sprite(r, x - (r[0].length >> 1), y - (r.length >> 1), PUFF_PAL);
        }
      } },
      { name: 'pterodactyl', fps: 6, draw() { // 3 opaque, outlined flap frames
        const tt = step(6), p = event(26, 9, 8, tt); if (p < 0) return;
        const ltr = cycleNo(26, 8, tt) % 2 === 0, x = Math.round(ltr ? -24 + p * 290 : 266 - p * 290), y = 48 + [0, 1, 2, 2, 1, 0, -1, -1][Math.floor(p * 32) % 8];
        sprite(PTERO[[0, 1, 2, 1][Math.floor(tt * 6) % 4]], x - 8, y, PTERO_PAL, !ltr);
      } } ],
    space: [
      { name: 'stars', fps: 4, draw() { // 3-level stepped twinkle: off / dim / bright cross
        const tt = step(4);
        for (let i = 0; i < 28; i++) {
          const x = Math.round(24 + fr(i) * 194), y = Math.round(30 + fr(i + 33) * 130);
          if (x > 35 && x < 57 && y > 115 && y < 137) continue; // v7: planets removed; only the small moon is skipped
          const a = Math.max(0, Math.sin(tt * (1 + fr(i + 5) * 1.5) + i * 2.3)), lv = a > 0.75 ? 2 : a > 0.3 ? 1 : 0;
          if (!lv) continue;
          px(x, y, 1, 1, lv === 2 ? '#ffffff' : '#8fa6c8');
          if (lv === 2 && fr(i + 60) > 0.65) { px(x - 1, y, 1, 1, '#6f8fc0'); px(x + 1, y, 1, 1, '#6f8fc0'); px(x, y - 1, 1, 1, '#6f8fc0'); px(x, y + 1, 1, 1, '#6f8fc0'); }
        }
      } },
      { name: 'comet', fps: 12, draw() { // a shooting star now and then: opaque head + stepped colour trail, moving at 12 fps
        const tt = step(12), p = event(14, 1.3, 3, tt); if (p < 0) return;
        const n = cycleNo(14, 3, tt), sx = 150 + fr(n) * 60, sy = 30 + fr(n + 9) * 20, ex = sx - 120, ey = sy + 60; // v7: ends above the moon
        const x = Math.round(sx + (ex - sx) * p), y = Math.round(sy + (ey - sy) * p), len = p > 0.8 ? 6 : 12;
        g.save(); g.beginPath(); [[36, 24], [204, 24], [222, 42], [222, 150], [206, 166], [36, 166], [18, 150], [18, 42]].forEach(([a, b], i) => i ? g.lineTo(a, b) : g.moveTo(a, b)); g.clip();
        const TR = ['#ffffff', '#ffffff', '#d2f6ff', '#9fe8ff', '#9fe8ff', '#5fb8e8', '#5fb8e8', '#3a78b8', '#3a78b8', '#2a4f8a', '#2a4f8a', '#22386a'];
        for (let k = len - 1; k >= 0; k--) px(x + Math.round(k * 1.7), y - k, 1, 1, TR[k]);
        if (p <= 0.8) px(x - 1, y, 2, 2, '#ffffff');
        g.restore();
      } } ],
  };

  function bakeAurora(cg) { // keep only the bright green/teal/violet aurora pixels, then bake dithered brightening frames
    const H = 170, d = cg.getImageData(0, 0, AW, H).data, mask = [];
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      if ((gg > 120 && gg > r + 30) || (b > 150 && r > 90 && gg < 110)) mask.push([(i >> 2) % AW, (i >> 2) / AW | 0, Math.min(255, r * 1.25 + 18), Math.min(255, gg * 1.22 + 22), Math.min(255, b * 1.22 + 22)]);
    }
    const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], N = 12, out = [];
    for (let f = 0; f < N; f++) {
      const c = document.createElement('canvas'); c.width = AW; c.height = H; const og = c.getContext('2d'), o = og.createImageData(AW, H), ph = f / N * Math.PI * 2;
      for (const [x, y, r, gg, b] of mask) {
        const lvl = Math.max(0, Math.sin(x * 0.045 - ph)) * (0.6 + 0.4 * Math.sin(x * 0.017 + ph * 0.5));    // 0..1
        const q = Math.round(lvl * 3) / 3 * 0.5;                                                           // 4 levels, max 50% coverage
        if (BAY[(y & 3) * 4 + (x & 3)] / 16 >= q) continue;
        const j = (y * AW + x) * 4; o.data[j] = r; o.data[j + 1] = gg; o.data[j + 2] = b; o.data[j + 3] = 255;
      }
      og.putImageData(o, 0, 0); out.push(c);
    }
    return out;
  }
  function loadBg(src) {
    bgArt = null; auroraFrames = null;
    const im = new Image(), want = key;
    im.onload = () => {
      if (key !== want) return;
      const c = document.createElement('canvas'); c.width = AW; c.height = AH; const cg = c.getContext('2d', { willReadFrequently: true });
      cg.imageSmoothingEnabled = false; cg.drawImage(im, 0, 0, AW, 1280 / 3); // one sample per 3x3 source block (the backdrop's pixel grid)
      bgArt = c;
      if (key === 'arctic') auroraFrames = bakeAurora(cg);
      drawnKey = '';
    };
    im.src = src;
  }

  // redraw key: each layer's current step. Soft layers are capped at 30 fps (15 in low-end mode); stepped layers at their
  // own rate (halved, min 2 fps, in low-end mode). Nothing is drawn if no step changed since the last frame.
  function stepKey() {
    let k = (bgArt ? 1 : 0) + (auroraFrames ? 2 : 0) + ':';
    for (const l of layers) { const f = low ? Math.max(2, Math.min(15, l.fps / 2)) : l.fps; k += Math.floor(t * f) + ','; }
    return k;
  }
  function draw() {
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, AW, AH);
    for (const l of layers) { g.save(); l.draw(); g.restore(); }
    g.globalAlpha = 1; frames++;
  }

  window.ZMAmb = {
    setBiome(k, bgSrc) { key = k; layers = L[k] || []; t = 0; drawnKey = ''; frames = 0; skipped = 0; loadBg(bgSrc); draw(); drawnKey = stepKey(); },
    // cover + bottom-aligned, matching #bg's CSS background (720 x 1280 source)
    layout(W, H) {
      const s = Math.max(W / 720, H / 1280), w = 720 * s;
      Object.assign(cv.style, { width: w + 'px', height: (AH * 3 * s) + 'px', left: ((W - w) / 2) + 'px', top: (H - 1280 * s) + 'px' });
    },
    // called every game frame; dt is 0 when the game is paused / over / hidden
    tick(dt, run) {
      running = !!run; if (run && dt > 0) t += Math.min(dt, 0.1);
      const k = stepKey(); if (k !== drawnKey) { draw(); drawnKey = k; } else skipped++;
    },
    setLow(v) { low = !!v; drawnKey = ''; },
    state() { return { biome: key, bgReady: !!bgArt, t: +t.toFixed(3), running, frames, skipped, low, layers: layers.map(l => l.name), fps: layers.map(l => l.fps), canvas: !!cv.isConnected }; },
    canvas: cv,
  };
})();
