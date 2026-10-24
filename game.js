/* Zoo Mash – the drop-and-merge level, all 8 biomes. Numbers from zoo-mash-spec/physics-config.json */
(function () {
  'use strict';
  const { Engine, Bodies, Body, Composite, Events, Vector } = Matter;

  // ---- spec ----
  const NAMES = ['ladybug','mouse','frog','squirrel','owl','raccoon','fox','deer','wolf','moose','bear']; // Forest sprite files
  const D = window.ZM_DATA, KEYS = D.map(b => b.key);
  const THEME = k => (k === 'dinosaurs' ? 'jurassic' : k);       // theme / backdrop / island file key
  let B = 0;                                                      // current biome index (0 Forest … 7 Space)
  const RFRAC = [0.0368,0.0536,0.0681,0.0770,0.0993,0.1272,0.1440,0.1741,0.1975,0.2455,0.2891];
  const POINTS = n => n * (n - 1) / 2;          // creating tier n
  const BOSS_PAIR = 250;                         // two tier-11 bears merge and vanish
  const DROP_POOL = [1,2,3,4,5];                 // 20% each
  // v2 feel: heavier + bouncier. Tunable in the gear menu (saved in localStorage).
  // v3 feel (matched to the QS Watermelon reference): strong gravity, low-moderate bounce, slippery animal-on-animal,
  // grippy floor/walls, big animals much heavier. Gravity/bounce/weight are tunable in Settings (demo-only, saved locally).
  const PHYS = { ptPerM: 150, refWidth: 393,
    animalFriction: 0.05, animalFrictionStatic: 0.2,          // animal-on-animal: slippery, they roll into gaps
    groundFriction: 0.6, groundFrictionStatic: 0.8,           // animal-on-floor/wall: normal grip, smooth stop
    groundBounceFactor: 0.35,                                 // floor/wall bounce = bounce × this (1-2 tiny hops)
    airFriction: 0.0002 /* per 1/60 s */, angularDamping: 2.5 /* 1/s rolling resistance: rolls settle smoothly */, bigBounceCut: 0.35 /* tier 11 keeps 65% of the bounce */ };
  const TUNE_DEF = { gravity: 10 /* m/s² @150 pt/m, Brock's iPhone pick (v3 was 34) */, bounce: 0.20 /* animal-on-animal restitution, small tiers */, weight: 1.10 /* density × per tier */ };
  const TUNE_RANGE = { gravity: [10, 60, 1], bounce: [0, 0.6, 0.01], weight: [1, 1.45, 0.01] };
  const LS_TUNE = 'zoomash.forest.tune.v4' /* bumped so saved v3 sliders don't override the new defaults */, LS_PREFS = 'zoomash.prefs';
  const MAX_BOX_RATIO = 1.30 /* v7: was 1.45; tall phones keep the extra height as sky above the held animal */, DROP_VY = 1.0 /* px per 1/60 s initial push */;
  // Empty-board drop-to-floor at gravity 10, measured 0.85 s (tier 1; 390×844 and 440×956 match).
  // Cooldown is half of that fall, and scales with 1/sqrt(gravity) so it stays about half a fall as the slider moves.
  const FALL_G10 = 0.85;
  // v6 juice / combo / danger tuning (documented in README)
  const COMBO_WIN = 1.5;                         // s: a merge within this long after the previous one extends the chain
  const COMBO_BONUS = 10;                        // the k-th merge of a chain (k >= 2) adds COMBO_BONUS * (k - 1) on top
  const NEAR_HOLD = 0.25;                        // s an animal must sit near the line before the line starts pulsing
  const FX_CAP = 260, FX_CAP_LOW = 110;          // particle caps (normal / low-end mode)
  const GRACE = 2.0, WARN = 0.5, BOX_RATIO = 1.12, SPAWN_ABOVE = 40, SCALE_IN = 0.12;
  const STEP = 1000 / 240;                       // fixed physics substep (ms): 240 Hz so fast falls never tunnel
  // Badge look. The circle (background fill, light rim, dark outline) is drawn as vector shapes at full device
  // resolution; only the animal art comes from sprites/NN-name.png. Those PNGs are the original art with every
  // source pixel blown up to an exact 4x4 block (nearest neighbour, offline), so smooth downscaling keeps it crisp.
  // Per tier: circle centre x, y and outer radius in PNG pixels, plus the background colour sampled from the old badge.
  const ART = [
    [400.02, 400.37, 395.73, '#f1c5b7'],
    [403.52, 403.12, 395.26, '#d8d5ca'],
    [400, 404, 395.55, '#dee7bc'],
    [403.56, 400.5, 395.96, '#f0d4b6'],
    [400.01, 400, 395.55, '#dcccb7'],
    [403.99, 400, 395.55, '#dbd7cd'],
    [404.02, 403.1, 395.44, '#fad7b2'],
    [404.02, 403.65, 395.71, '#e7d2b7'],
    [399.46, 401.48, 394.9, '#d6d8d3'],
    [403.52, 402.5, 394.92, '#d7c8b5'],
    [404.02, 403.1, 395.44, '#d9c9b3'] ];
  const RING_COL = '#090805', RIM_COL = '#fefaee';
  const OUTLINE_W = 0.0253, RIM_W = 0.0101;      // outline / light rim thickness as a fraction of the radius (from the art)

  // ---- storage ----
  // per-biome keys: zoomash.<key>.best / zoomash.<key>.seen (Forest keeps its v4 keys, which follow the same pattern)
  const lsKey = (b, k) => `zoomash.${KEYS[b]}.${k}`;
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
               set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  let best = ls.get(lsKey(0, 'best'), 0) | 0;
  let seen = new Set(ls.get(lsKey(0, 'seen'), []));
  const prefs = Object.assign({ vibration: true, sound: true, music: true }, ls.get(LS_PREFS, {})); // sound/music: placeholders for now
  // haptics: navigator.vibrate where it exists (Android Chrome); iOS Safari has no Vibration API, so this is a silent no-op there
  let buzzLog = [];
  const buzz = ms => { buzzLog.push(ms); if (buzzLog.length > 20) buzzLog.shift(); try { if (prefs.vibration && navigator.vibrate) navigator.vibrate(ms); } catch (e) {} };
  const reduceMotion = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();
  const tune = Object.assign({}, TUNE_DEF, ls.get(LS_TUNE, {}));
  for (const k in TUNE_RANGE) { const [lo, hi] = TUNE_RANGE[k], v = +tune[k]; tune[k] = Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : TUNE_DEF[k]; }

  // ---- DOM ----
  const $ = id => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const elScore = $('score'), elBest = $('best'), elNext = $('next-img'), elSlots = $('slots');
  const elOver = $('over'), elPause = $('pausemenu'), elSet = $('settings');

  // ---- sprites ----
  // Forest: the approved 4x sprites. Other biomes: art/<key>/NN.png painted by ZMArt (same 4x-NN + mip recipe).
  const forestSprites = NAMES.map((n, i) => { const im = new Image(); im.src = (window.ZM_SPR && window.ZM_SPR[i]) || `sprites/${String(i + 1).padStart(2, '0')}-${n}.png?v=hd1`; return im; });
  let sprites = forestSprites, artGen = 0;
  // Badge images for the evolution strip and NEXT preview are drawn by the same code as the board (see badgeURL).
  const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  let badgeURLs = [];
  const spriteSrc = t => badgeURLs[t - 1] || BLANK;
  let spritesReady = false;
  const waitImg = im => (im.decode ? im.decode().catch(() => new Promise(r => { if (im.complete) r(); else im.onload = im.onerror = r; }))
                                   : new Promise(r => { if (im.complete) r(); else im.onload = im.onerror = r; })).then(() => im);
  function loadBiomeArt(b) {
    const gen = ++artGen; spritesReady = false; mips.length = 0; badgeCache.length = 0; badgeURLs = [];
    const ps = b === 0 ? forestSprites.map(waitImg) : Array.from({ length: 11 }, (_, i) => window.ZMArt.load(b, i + 1).catch(() => new Image()));
    Promise.all(ps).then(arr => {
      if (gen !== artGen) return;
      sprites = arr; tierCols = b === 0 ? TIER_COL : arr.map((im, i) => artColors(im, D[b].animals[i]));
      spritesReady = true; buildBadgeURLs(); renderStrip(); setNextUI();
    });
  }
  // burst colours for the other biomes: the 3 most common opaque colours of each animal's own art
  function artColors(im, a) {
    try {
      const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
      const g = c.getContext('2d'); g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data, h = new Map();
      const hex = v => parseInt(v.slice(1), 16), bgv = hex(a.bg), br = bgv >> 16, bgg = (bgv >> 8) & 255, bb = bgv & 255;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 200) continue; const r = d[i], gg = d[i + 1], b = d[i + 2];
        if (r + gg + b < 90) continue;                                                   // outlines
        if (Math.abs(r - br) + Math.abs(gg - bgg) + Math.abs(b - bb) < 60) continue;       // badge background
        const k = ((r >> 4) << 8) | ((gg >> 4) << 4) | (b >> 4); h.set(k, (h.get(k) || 0) + 1);
      }
      const top = [...h.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k]) => '#' + [k >> 8, (k >> 4) & 15, k & 15].map(v => (v * 17).toString(16).padStart(2, '0')).join(''));
      while (top.length < 3) top.push(a.rim || '#ffffff');
      return top;
    } catch (e) { return [a.bg, a.rim || '#fff', a.ring || '#000']; }
  }

  // ---- layout ----
  let L = {}, dpr = 1, lastBadgeDpr = 0;
  function safeInsets() { const v = (window.ZMVP.last = window.ZMVP.measure()); return { t: v.st, b: v.sb, W: v.W, H: v.H, iw: v.iw, ih: v.ih }; }
  function computeLayout() {
    const s = safeInsets(), W = s.W, H = s.H;   // v6: the fixed box's real size (see vp.js)
    const wall = Math.max(8, Math.round(W * 0.026));
    const Wi = W - 2 * wall;
    const stripTop = H - document.getElementById('strip').offsetHeight;
    const top = s.t + 44;
    const r5 = RFRAC[4] * Wi;
    const baseHeld = top + 10 + r5;
    const gapHL = Math.max(SPAWN_ABOVE, r5 + 4);          // held animal -> danger line
    // v2: the forest-floor band stays thin (16-26 px); spare height goes into a taller play area
    // (danger line -> floor from 1.12× up to 1.30× the width, v7), and only what is left over pushes the stack down.
    const minBand = 16, band = Math.max(minBand, Math.min(26, Math.round(H * 0.026)));
    const avail = stripTop - band - (baseHeld + gapHL);
    const box = Math.max(BOX_RATIO * Wi, Math.min(MAX_BOX_RATIO * Wi, avail));
    const shift = Math.max(0, avail - box);
    const heldY = baseHeld + shift;
    const dangerY = heldY + gapHL;
    const floorY = Math.min(stripTop - minBand, dangerY + box);
    return { W, H, iw: s.iw, ih: s.ih, wall, Wi, left: wall, right: W - wall, top, heldY, dangerY, floorY, stripTop,
             trunkEnd: floorY - Math.round(Wi * 0.035) };
  }

  // ---- engine ----
  const engine = Engine.create({ enableSleeping: false, positionIterations: 8, velocityIterations: 6 });
  // Matter pairs use min(friction)/max(bounce). Override for animal-vs-floor/wall contacts so each surface gets its own feel.
  const _pairUpdate = Matter.Pair.update;
  Matter.Pair.update = function (pair, collision, ts) {
    _pairUpdate(pair, collision, ts);
    const A = collision.parentA, B = collision.parentB;
    if (A.isStatic !== B.isStatic) {
      const an = A.isStatic ? B : A;
      pair.friction = PHYS.groundFriction; pair.frictionStatic = PHYS.groundFrictionStatic;
      pair.restitution = an.restitution * PHYS.groundBounceFactor;
    }
  };
  engine.gravity.y = 1;
  let statics = [];
  const animals = new Set();

  function buildStatics() {
    statics.forEach(b => Composite.remove(engine.world, b)); statics = [];
    const T = 400, tall = L.H * 4;
    const opt = { isStatic: true, friction: PHYS.groundFriction, restitution: 0, label: 'wall' }; // pair bounce = max(), so the animal's own value rules
    statics.push(Bodies.rectangle(L.left - T / 2, L.floorY - tall / 2 + T, T, tall + T, opt));
    statics.push(Bodies.rectangle(L.right + T / 2, L.floorY - tall / 2 + T, T, tall + T, opt));
    statics.push(Bodies.rectangle(L.W / 2, L.floorY + T / 2, L.W + 2 * T, T, Object.assign({}, opt, { label: 'floor' })));
    Composite.add(engine.world, statics);
    applyGravity();
  }
  // ---- tuning ----
  function applyGravity() { if (L.Wi) engine.gravity.scale = tune.gravity * PHYS.ptPerM / 1e6 * (L.Wi / PHYS.refWidth); }
  function restOf(t) { return tune.bounce * (1 - PHYS.bigBounceCut * (t - 1) / 10); }
  function densOf(t) { return 0.001 * Math.pow(tune.weight, t - 1); }
  function dropGap() { return (FALL_G10 / 2) * Math.sqrt(10 / tune.gravity); }
  function applyTune() {
    applyGravity();
    for (const b of animals) { b.restitution = restOf(b.zm.tier); Body.setDensity(b, densOf(b.zm.tier)); }
    if (lastDropAt >= 0) canDropAt = lastDropAt + dropGap(); // slider moves: keep the wait at about half a fall
    ls.set(LS_TUNE, tune);
  }

  function radius(t) { return RFRAC[t - 1] * L.Wi; }
  function makeAnimal(t, x, y, vx = 0, vy = 0, fresh = false) {
    const r = radius(t);
    const b = Bodies.circle(x, y, r, { restitution: restOf(t), friction: PHYS.animalFriction, frictionStatic: PHYS.animalFrictionStatic,
      frictionAir: PHYS.airFriction, density: densOf(t), slop: 0.02, label: 'animal' }, 40);
    b.zm = { tier: t, r, fresh, above: 0, born: now, merging: false };
    Body.setVelocity(b, { x: vx, y: vy });
    Composite.add(engine.world, b); animals.add(b);
    markSeen(t);
    return b;
  }
  function removeAnimal(b) { Composite.remove(engine.world, b); animals.delete(b); }

  // ---- merges (queued during collision events, applied after the step) ----
  let mergeQ = [];
  function onPairs(ev) {
    for (const p of ev.pairs) {
      const a = p.bodyA, b = p.bodyB;
      if (a.zm && a.zm.fresh) { a.zm.fresh = false; if (a === lastDrop) fallTime = now - lastDropAt; }
      if (b.zm && b.zm.fresh) { b.zm.fresh = false; if (b === lastDrop) fallTime = now - lastDropAt; }
      if (a.zm && b.zm && a.zm.tier === b.zm.tier && !a.zm.merging && !b.zm.merging && !gameOver) {
        a.zm.merging = b.zm.merging = true; mergeQ.push([a, b]);
      }
    }
  }
  Events.on(engine, 'collisionStart', onPairs);
  Events.on(engine, 'collisionActive', onPairs);

  const pops = [], fx = [];
  const TIER_COL = [['#d8332a','#2a1a14','#f6e7c8'],['#a7a2a6','#f2b6c0','#6d6870'],['#5fae3a','#a6d96a','#2f6a1f'],['#d9772b','#f2c27b','#7a3f17'],
    ['#9a6b3f','#e8c48a','#f2d36b'],['#7d7a78','#2b2b2b','#d9d4cf'],['#e2702a','#fff1de','#8a3a14'],['#b07a45','#f0d2a2','#5a3a1e'],
    ['#7f8ea0','#d4dbe3','#3c4652'],['#7a4e2c','#c79a62','#3f2714'],['#6b4226','#c08a55','#2b190c'],['#ffd75e','#fff3b0','#ff9f3a']];
  const MASH_COL = ['#ffd75e','#ff5a3c','#7dff6a','#5ecbff','#ff8ad4','#fff6d0','#ff9f3a','#ffffff','#c79a62'];
  let tierCols = TIER_COL;
  // particle cap: the oldest pixel bits go first, rings/sparkles are kept
  function capFx() { const cap = perf.low ? FX_CAP_LOW : FX_CAP; let over = fx.length - cap; for (let i = 0; over > 0 && i < fx.length; ) { if (fx[i].k === 'px') { fx.splice(i, 1); over--; } else i++; } }
  function sparkles(x, y, r, t, n) {               // little 4-point pixel twinkles around the new animal
    const cols = ['#ffffff', '#fff3b0', (tierCols[t - 1] || TIER_COL[t - 1])[1]];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, d = r * (0.75 + Math.random() * 0.6);
      fx.push({ k: 'spark', x: Math.round(x + Math.cos(a) * d), y: Math.round(y + Math.sin(a) * d - 4), c: cols[i % 3], t0: now + Math.random() * 0.12, dur: 0.36 + Math.random() * 0.14 });
    }
  }
  function burst(x, y, r, t) {
    fx.push({ k: 'ring', x, y, r0: r * 0.8, r1: r * 1.7, t0: now, dur: 0.32 });
    const cols = tierCols[t - 1] || TIER_COL[t - 1], n = Math.round((10 + Math.min(14, t * 2)) * (perf.low ? 0.5 : 1));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5, sp = (90 + Math.random() * 150) * (0.7 + r / 120);
      fx.push({ k: 'px', x: x + Math.cos(a) * r * 0.6, y: y + Math.sin(a) * r * 0.6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
        c: cols[i % cols.length], s: Math.random() < 0.4 ? 6 : 4, t0: now, dur: 0.35 + Math.random() * 0.25 });
    }
    sparkles(x, y, r, t, (perf.low ? 3 : 5) + Math.min(5, t >> 1)); capFx();
    const sc = document.getElementById('score').parentNode; sc.classList.remove('pulse', 'pulse-big'); void sc.offsetWidth; sc.classList.add('pulse');
  }
  function drawFx(dt) {
    ctx.save(); ctx.imageSmoothingEnabled = false;
    for (let i = fx.length - 1; i >= 0; i--) {
      const f = fx[i], a = (now - f.t0) / f.dur; if (a >= 1 || a < 0) { if (a >= 1) fx.splice(i, 1); continue; }
      if (f.k === 'ring') {                                 // stepped, chunky ring
        const rr = Math.round((f.r0 + (f.r1 - f.r0) * Math.min(1, a * 1.15)) / 2) * 2;
        ctx.globalAlpha = 0.85 * (1 - a); ctx.strokeStyle = '#fff'; ctx.lineWidth = 4 * (1 - a) + 1.5;
        ctx.beginPath(); ctx.arc(f.x, f.y, rr, 0, Math.PI * 2); ctx.stroke();
      } else if (f.k === 'spark') {                         // stepped 3-frame twinkle: dot, plus, big plus, plus
        const st = [0, 1, 2, 1][Math.min(3, Math.floor(a * 4))], P = 2; ctx.globalAlpha = 1; ctx.fillStyle = f.c;
        ctx.fillRect(f.x - P / 2, f.y - P / 2, P, P);
        if (st >= 1) { ctx.fillRect(f.x - P / 2 - P, f.y - P / 2, P, P); ctx.fillRect(f.x + P / 2, f.y - P / 2, P, P); ctx.fillRect(f.x - P / 2, f.y - P / 2 - P, P, P); ctx.fillRect(f.x - P / 2, f.y + P / 2, P, P); }
        if (st >= 2) { ctx.fillRect(f.x - P / 2 - 2 * P, f.y - P / 2, P, P); ctx.fillRect(f.x + P / 2 + P, f.y - P / 2, P, P); ctx.fillRect(f.x - P / 2, f.y - P / 2 - 2 * P, P, P); ctx.fillRect(f.x - P / 2, f.y + P / 2 + P, P, P); }
      } else {
        if (!paused && !gameOver) { f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 600 * dt; f.vx *= 0.96; }
        ctx.globalAlpha = 1 - a * a; ctx.fillStyle = f.c; ctx.fillRect(Math.round(f.x), Math.round(f.y), f.s, f.s);
      }
    }
    ctx.restore();
  }
  // Tier-11 pair vanishes: big multi-colour pixel burst, "ZOO MASH!" banner, +250 popup.
  // Does not pause the game or extend the drop cooldown. A small 5px shake (v6), no sound.
  function celebrateBoss(x, y, pts) {
    const r = radius(11);
    fx.push({ k: 'ring', x, y, r0: r * 0.35, r1: r * 2.4, t0: now, dur: 0.48 });
    fx.push({ k: 'ring', x, y, r0: r * 0.7, r1: r * 3.3, t0: now, dur: 0.72 });
    const n = perf.low ? 54 : 108;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.35, sp = 180 + Math.random() * 420;
      fx.push({ k: 'px', x: x + Math.cos(a) * r * 0.2, y: y + Math.sin(a) * r * 0.2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 110,
        c: MASH_COL[i % MASH_COL.length], s: i % 5 === 0 ? 8 : (i % 2 ? 6 : 4), t0: now, dur: 0.8 + Math.random() * 0.55 });
    }
    capFx(); shake(5, 0.34);
    pops.push({ x, y, t0: now, txt: '+' + pts, boss: true });
    const ban = $('mash');
    ban.classList.remove('on'); void ban.offsetWidth; ban.classList.add('on');
    const sc = elScore.parentNode;
    sc.classList.remove('pulse', 'pulse-big'); void sc.offsetWidth; sc.classList.add('pulse-big');
    buzz([50, 40, 80, 40, 120]);
  }
  function applyMerges() {
    if (!mergeQ.length) return;
    const q = mergeQ; mergeQ = [];
    for (const [a, b] of q) {
      if (!animals.has(a) || !animals.has(b)) continue;
      const t = a.zm.tier;
      const mx = (a.position.x + b.position.x) / 2, my = (a.position.y + b.position.y) / 2;
      const va = Body.getVelocity(a), vb = Body.getVelocity(b);
      const vx = (va.x + vb.x) / 2, vy = (va.y + vb.y) / 2;
      removeAnimal(a); removeAnimal(b);
      let pts;
      if (t === 11) { pts = BOSS_PAIR; celebrateBoss(mx, my, pts); }
      else {
        const nt = t + 1, r = radius(nt);
        const x = Math.min(L.right - r, Math.max(L.left + r, mx)), y = Math.min(L.floorY - r, my);
        const nb = makeAnimal(nt, x, y, vx, vy, false); nb.zm.pop = now;      // squash/pop on the new animal
        pts = POINTS(nt);
        pops.push({ x, y, t0: now, txt: '+' + pts }); burst(x, y, r, nt);
        if (nt >= 9) shake(nt - 7, 0.22);                                   // tiers 9/10/11: 2/3/4 px
        buzz(nt >= 9 ? 22 : 10);
      }
      addScore(pts);
      combo(mx, my);
    }
  }
  // ---- combo chains: merges within COMBO_WIN of each other ----
  // v7 COMBO BUG fix: the pop is a CSS animation with fill-mode 'forwards' started by adding class 'on', and v6 never took
  // the class off again. Leaving the level hides #app (display:none) and entering a new round shows it again - and CSS
  // restarts every animation on an element that goes from display:none back to rendered. So after the first combo of a
  // session, "COMBO x2! +10" replayed at the start of every later round (same for the ZOO MASH! banner). Now the class is
  // dropped when the animation ends and whenever a round starts/restarts/resumes, and the chain itself only counts merges
  // that happen after the player's first drop of the round.
  let chain = 0, lastMergeAt = -9, comboLog = [], comboShown = 0;
  const JUICE_ON = ['combo', 'mash'];
  JUICE_ON.forEach(id => $(id).addEventListener('animationend', e => { if (e.target === $(id)) $(id).classList.remove('on'); }));
  function clearJuice() {
    chain = 0; lastMergeAt = -9;
    JUICE_ON.forEach(id => $(id).classList.remove('on', 'hot'));
    const sc = elScore.parentNode; sc.classList.remove('pulse', 'pulse-big');
  }
  function combo(x, y) {
    if (!dropsTotal) { chain = 0; lastMergeAt = -9; return; }        // no player drop yet this round -> never a combo
    chain = now - lastMergeAt <= COMBO_WIN ? chain + 1 : 1; lastMergeAt = now;
    if (chain < 2) return;
    const bonus = COMBO_BONUS * (chain - 1);
    score += bonus; elScore.textContent = score.toLocaleString('en-US');
    if (score > best) { best = score; ls.set(lsKey(B, 'best'), best); elBest.textContent = best.toLocaleString('en-US'); }
    comboLog.push({ n: chain, bonus, t: +now.toFixed(2) }); if (comboLog.length > 30) comboLog.shift(); comboShown++;
    const el = $('combo'); el.querySelector('b').textContent = 'COMBO x' + chain + '!'; el.querySelector('i').textContent = '+' + bonus;
    el.classList.toggle('hot', chain >= 4);
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
    if (chain >= 3) buzz([8, 30, 8]);
  }
  // ---- screen shake: integer-pixel offsets, stepped at ~30 Hz, decaying; off for prefers-reduced-motion ----
  let shk = { a: 0, t0: -9, dur: 0 };
  function shake(a, dur) { if (reduceMotion) return; if (a >= shk.a * Math.max(0, 1 - (now - shk.t0) / (shk.dur || 1))) shk = { a, t0: now, dur }; }
  function shakeOffset() {
    const q = (now - shk.t0) / shk.dur; if (!(q >= 0 && q < 1) || !shk.a) return [0, 0];
    const st = Math.floor((now - shk.t0) * 30), amp = Math.max(1, Math.round(shk.a * (1 - q)));
    const h = (n) => { const v = Math.sin(n * 12.9898 + st * 78.233) * 43758.5453; return v - Math.floor(v); };
    return [Math.round((h(1) * 2 - 1) * amp), Math.round((h(2) * 2 - 1) * amp)];
  }

  // ---- game state ----
  let score = 0, current = 1, next = 1, aimX = 0, canDropAt = 0, gameOver = false, paused = false, now = 0, warnOn = false;
  let aiming = false, dropsTotal = 0, mergesTotal = 0, lastDrop = null, lastDropAt = -9, fallTime = 0;
  // cooldown is half a full-height fall at the current gravity, not a fixed 0.25 s
  function isReady() {
    return now >= canDropAt;
  }
  const rnd = () => DROP_POOL[Math.floor(Math.random() * DROP_POOL.length)];

  function addScore(p) {
    score += p; mergesTotal++;
    elScore.textContent = score.toLocaleString('en-US');
    if (score > best) { best = score; ls.set(lsKey(B, 'best'), best); elBest.textContent = best.toLocaleString('en-US'); }
  }
  function setNextUI() { elNext.src = spriteSrc(next); }

  // quiet = only previewed in the NEXT/current queue: the card waits until that animal actually lands on the board
  const cardPend = new Set();
  function markSeen(t, quiet) {
    if (seen.has(t)) { if (!quiet && cardPend.delete(t)) newCard(t); return; }
    seen.add(t); ls.set(lsKey(B, 'seen'), [...seen].sort((a, b) => a - b));
    renderStrip(t);
    // v7: the first tier-11 of a biome whose next biome was still locked -> BIOME COMPLETE celebration (once per biome,
    // remembered in localStorage; never in Unlock-all mode, where nothing is actually being unlocked)
    const celebrate = t === 11 && B < D.length - 1 && !ls.get('zoomash.demo.unlockAll', false) && !ls.get(lsKey(B, 'celebrated'), false);
    if (celebrate) { cbOpenSoon(B); return; }
    if (quiet) cardPend.add(t); else newCard(t);
    // progression: reaching this biome's tier-11 animal unlocks the next biome on the map
    if (t === 11 && B < D.length - 1) toast(D[B + 1].name + ' UNLOCKED!');
  }
  // ---- v7 BIOME COMPLETE! celebration: frame-based (12 fps) chunky pixel confetti + fireworks, banner, two buttons ----
  const CB_FPS = 12, CB_PX = 3;                                        // 1 fx pixel = 3 CSS px
  const CB_COL = ['#ffd75e', '#e84a3c', '#4fc3f7', '#9fe36b', '#ff8ad8', '#ffffff', '#ff9f2e'];
  const cbH = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };   // stable per-particle hash
  let cb = { on: false, b: -1, f: 0, hold: null, t0: 0, raf: 0, log: [] }, cbT = 0;
  function cbOpenSoon(b) { clearTimeout(cbT); cbT = setTimeout(() => cbOpen(b), 650); }   // let the tier-11 merge pop land first
  function cbOpen(b) {
    if (!active || gameOver) { if (b < D.length - 1) toast(D[b + 1].name + ' UNLOCKED!'); return; }
    ls.set(lsKey(b, 'celebrated'), true);
    clearTimeout(cbT); clearJuice(); cardQ.length = 0; nextCard(); aiming = false;
    elPause.classList.add('hidden'); elSet.classList.add('hidden'); paused = true;
    const a = D[b].animals[10], el = $('celebrate');
    $('cb-img').src = spriteSrc(11);
    $('cb-name').textContent = a.n.toUpperCase();
    $('cb-no').textContent = 'No.' + String(b * 11 + 11).padStart(2, '0');
    $('cb-biome').textContent = D[b].name.toUpperCase();
    $('cb-unl').textContent = D[b + 1].name.toUpperCase() + ' UNLOCKED!';
    el.classList.remove('hidden', 'in'); void el.offsetWidth; el.classList.add('in');
    cb = { on: true, b, f: 0, hold: null, t0: performance.now(), raf: 0, log: cb.log };
    cb.log.push({ b, at: +now.toFixed(2) });
    cbSize(); buzz([20, 60, 20, 60, 40]);
    const loop = () => { if (!cb.on) return; if (cb.hold == null) { const f = Math.floor((performance.now() - cb.t0) / 1000 * CB_FPS); if (f !== cb.f || f === 0) { cb.f = f; cbDraw(f); } } cb.raf = requestAnimationFrame(loop); };
    cbDraw(0); cb.raf = requestAnimationFrame(loop);
  }
  function cbClose() { clearTimeout(cbT); if (!cb.on) { $('celebrate').classList.add('hidden'); return; } cb.on = false; cancelAnimationFrame(cb.raf); $('celebrate').classList.add('hidden'); }
  function cbSize() { const c = $('cb-fx'); c.width = Math.ceil(window.innerWidth / CB_PX); c.height = Math.ceil(window.innerHeight / CB_PX); }
  function cbDraw(f) {
    const c = $('cb-fx'), g = c.getContext('2d'), W = c.width, H = c.height;
    g.clearRect(0, 0, W, H);
    const P = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), w, h); };
    // fireworks: a new burst every 7 frames, each lives 12 frames; 16 sparks on a ring that steps outward and sags
    for (let k = Math.max(0, Math.floor((f - 12) / 7)); k <= Math.floor(f / 7); k++) {
      const s = f - k * 7; if (s < 0 || s > 11) continue;
      const cx = W * (0.15 + cbH(k * 3 + 1) * 0.7), cy = H * (0.07 + cbH(k * 3 + 2) * 0.16) + (k % 3 === 2 ? H * 0.62 : 0), c1 = CB_COL[k % CB_COL.length], c2 = CB_COL[(k + 3) % CB_COL.length];
      if (s === 0) { P(cx - 4, cy, 9, 1, '#fff'); P(cx, cy - 4, 1, 9, '#fff'); P(cx - 1, cy - 1, 3, 3, c1); continue; }   // flash
      const rr = 3 + s * 3.2, sag = 0.12 * s * s;
      for (let i = 0; i < 20; i++) {
        const a = i / 20 * Math.PI * 2 + k, x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr + sag;
        if (s >= 8 && (i + s) % 2) continue;                          // dithered fade-out
        const col = s < 2 ? '#ffffff' : s < 7 ? c1 : c2, z = s < 7 ? 2 : 1;
        P(x, y, z, z, col);
        if (s >= 2 && s < 8) { P(x - Math.cos(a) * 3, y - Math.sin(a) * 3, 1, 1, c2); P(x - Math.cos(a) * 5, y - Math.sin(a) * 5, 1, 1, '#ffffff'); }   // short trail
      }
    }
    // confetti: 90 chunky flakes falling with a stepped sway; they flip between 2x1 / 1x2 / 2x2 every few frames
    for (let i = 0; i < 110; i++) {
      const sp = 1.6 + cbH(i + 50) * 1.8, x0 = cbH(i + 7) * W, y0 = -cbH(i + 13) * H * 0.7 + H * 0.25, span = H + 8;
      const y = ((y0 + f * sp) % span + span) % span - 4, x = x0 + [0, 1, 2, 1, 0, -1, -2, -1][(Math.floor(f / 2) + i) % 8] * (1 + (i % 2));
      if (f * sp + y0 < -3) continue;                                  // not in view yet (first fall from the top)
      const ph = (Math.floor(f / 3) + i) % 3, col = CB_COL[i % CB_COL.length];
      P(x, y, ph === 1 ? 1 : 2, ph === 0 ? 1 : 2, col);
    }
  }
  window.addEventListener('resize', () => { if (cb.on) { cbSize(); cbDraw(cb.f); } });
  $('cb-keep').addEventListener('click', () => { cbClose(); paused = false; chain = 0; lastMergeAt = -9; canDropAt = Math.max(canDropAt, now + 0.25); });
  $('cb-next').addEventListener('click', () => { const b = cb.b; cbClose(); if (window.ZMUI) window.ZMUI.go('map', { unlock: b + 1 }); });
  // ---- "NEW ANIMAL!" card: first time a tier is created in a biome (not shown for entries Unlock all revealed) ----
  const cardQ = []; let cardOn = null, cardT = 0, cardLog = [];
  function newCard(t) {
    if (ls.get('zoomash.demo.unlockAll', false)) return;
    cardQ.push({ b: B, t }); if (!cardOn) nextCard();
  }
  function nextCard() {
    clearTimeout(cardT); const el = $('newcard');
    const c = cardQ.shift(); cardOn = c || null;
    if (!c) { el.classList.remove('on'); el.classList.add('hidden'); return; }
    const a = D[c.b].animals[c.t - 1];
    el.querySelector('img').src = spriteSrc(c.t);
    el.querySelector('.nc-name').textContent = a.n.toUpperCase();
    el.querySelector('.nc-no').textContent = 'No.' + String(c.b * 11 + c.t).padStart(2, '0');
    el.classList.remove('hidden', 'on'); void el.offsetWidth; el.classList.add('on');
    cardLog.push({ b: c.b, t: c.t, no: c.b * 11 + c.t, name: a.n }); if (cardLog.length > 40) cardLog.shift();
    buzz([12, 40, 12]);
    cardT = setTimeout(nextCard, cardQ.length ? 1400 : 2300);         // auto-dismiss (faster when more are waiting)
  }
  function dismissCard() { if (cardOn) { cardQ.length = 0; nextCard(); } }
  $('newcard').addEventListener('pointerdown', e => { e.stopPropagation(); dismissCard(); });
  setInterval(() => { if (cardOn) { const im = $('newcard').querySelector('img'); if (im.src === BLANK || !im.src || im.src.endsWith('gif;base64,' + BLANK.split(',')[1])) im.src = spriteSrc(cardOn.t); } }, 250);
  function renderStrip(popTier) {
    const W = window.innerWidth;
    const slot = Math.max(22, Math.min(34, Math.floor((Math.min(W, 420) - 28 - 10 * 3) / 11)));
    elSlots.style.setProperty('--slot', slot + 'px');
    elSlots.innerHTML = '';
    for (let t = 1; t <= 11; t++) {
      const d = document.createElement('div');
      if (seen.has(t)) { d.className = 'slot'; const im = document.createElement('img'); im.src = spriteSrc(t); im.alt = D[B].animals[t - 1].n; d.appendChild(im); }
      else { d.className = 'slot locked'; d.textContent = '?'; }
      if (t === popTier) d.classList.add('pop');
      elSlots.appendChild(d);
    }
  }

  function clampAim(x) { const r = radius(current); return Math.min(L.right - r - 1, Math.max(L.left + r + 1, x)); }
  function drop() {
    if (gameOver || paused || !isReady()) return false;
    const x = clampAim(aimX);
    lastDrop = makeAnimal(current, x, L.heldY, 0, DROP_VY * (L.Wi / PHYS.refWidth), true); lastDropAt = now;
    dropsTotal++;
    current = next; next = rnd(); setNextUI();
    canDropAt = now + dropGap();
    return true;
  }

  function reset() {
    for (const b of [...animals]) removeAnimal(b);
    mergeQ = []; pops.length = 0; fx.length = 0; lastDrop = null; fallTime = 0; clearJuice(); shk.a = 0; nearT = 0; danger = 'none';
    score = 0; elScore.textContent = '0'; elBest.textContent = best.toLocaleString('en-US');
    current = rnd(); next = rnd(); setNextUI(); cardPend.clear(); markSeen(current, true);
    aimX = L.W / 2; canDropAt = now + 0.2; gameOver = false; paused = false; warnOn = false; dropsTotal = mergesTotal = 0;
    elOver.classList.add('hidden'); elPause.classList.add('hidden'); elSet.classList.add('hidden'); cbClose();
  }
  function endGame() {
    gameOver = true; aiming = false; cardQ.length = 0; nextCard();
    $('o-score').textContent = score.toLocaleString('en-US');
    $('o-best').textContent = best.toLocaleString('en-US');
    $('o-new').classList.toggle('hidden', !(score > 0 && score >= best));
    elOver.classList.remove('hidden');
  }

  // ---- danger check ----
  // near: a settled animal's top within ~one small-animal height under the line, for NEAR_HOLD s -> the line pulses red
  let nearT = 0, danger = 'none', nearK = 0;
  function checkDanger(dt) {
    let maxAbove = 0, gap = Infinity; const nearPx = Math.max(radius(3) * 2.2, L.Wi * 0.12);
    for (const b of animals) {
      const z = b.zm;
      if (z.fresh) { z.above = 0; continue; }
      if (b.position.y - z.r < L.dangerY) z.above += dt; else z.above = 0;
      if (z.above > maxAbove) maxAbove = z.above;
      if (b.speed < 6) gap = Math.min(gap, b.position.y - z.r - L.dangerY);
    }
    nearT = gap < nearPx ? nearT + dt : 0;
    nearK = gap < nearPx ? Math.min(1, Math.max(0, 1 - gap / nearPx)) : 0;
    warnOn = maxAbove >= WARN;
    danger = warnOn ? 'warn' : nearT >= NEAR_HOLD ? 'near' : 'none';
    if (maxAbove >= GRACE && !gameOver) endGame();
  }

  // ---- input ----
  function px(e) { return e.clientX; }
  canvas.addEventListener('pointerdown', e => { dismissCard(); if (gameOver || paused) return; aiming = true; aimX = px(e); try { canvas.setPointerCapture(e.pointerId); } catch (_) {} e.preventDefault(); });
  canvas.addEventListener('pointermove', e => { if (!aiming) return; aimX = px(e); e.preventDefault(); });
  const up = e => { if (!aiming) return; aiming = false; aimX = px(e); drop(); e.preventDefault(); };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', () => { aiming = false; });
  // iOS: block page scroll / pinch / double-tap zoom / bounce
  const block = e => { if (e.touches && e.touches.length > 1) e.preventDefault(); else if (e.target === canvas) e.preventDefault(); };
  document.addEventListener('touchstart', block, { passive: false });
  document.addEventListener('touchmove', e => { if (!(e.target.closest && e.target.closest('input[type=range]'))) e.preventDefault(); }, { passive: false });
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(n => document.addEventListener(n, e => e.preventDefault(), { passive: false }));
  document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
  document.addEventListener('contextmenu', e => e.preventDefault());

  // ---- pause menu + settings ----
  function openPanel(el) { if (gameOver) return; aiming = false; elPause.classList.add('hidden'); elSet.classList.add('hidden'); el.classList.remove('hidden'); paused = true; }
  function closePanels() { elPause.classList.add('hidden'); elSet.classList.add('hidden'); paused = false; chain = 0; lastMergeAt = -9; }   // v7: resume never continues a chain
  let toastT; function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hidden'), 1400); }
  $('pause').addEventListener('click', () => openPanel(elPause));
  $('gear').addEventListener('click', () => { if (gameOver) elSet.classList.remove('hidden'); else openPanel(elSet); });
  $('p-resume').addEventListener('click', closePanels);
  $('p-restart').addEventListener('click', () => reset());
  // pause menu -> other screens (ui.js owns navigation)
  $('p-main').addEventListener('click', () => { if (window.ZMUI) window.ZMUI.go('title'); });
  // v7: CHANGE BIOME ends the round exactly like MAIN MENU (leave() clears juice/celebration; the next PLAY is a fresh round) and opens the map
  $('p-biome').addEventListener('click', () => { if (window.ZMUI) window.ZMUI.go('map', { from: 'game', focus: B }); });
  $('p-zoo').addEventListener('click', () => { if (window.ZMUI) window.ZMUI.openZoo({ from: 'game' }); });
  $('o-menu').addEventListener('click', () => { if (window.ZMUI) window.ZMUI.go('title'); });
  $('s-close').addEventListener('click', closePanels);
  $('again').addEventListener('click', () => reset());
  for (const k of ['vibration', 'sound', 'music']) {
    const el = $('s-' + k), sync = () => { el.classList.toggle('on', !!prefs[k]); el.setAttribute('aria-checked', !!prefs[k]); };
    el.addEventListener('click', () => { prefs[k] = !prefs[k]; ls.set(LS_PREFS, prefs); sync(); if (k === 'vibration' && prefs[k]) buzz(20); });
    sync();
  }
  const FMT = { gravity: v => v.toFixed(0), bounce: v => v.toFixed(2), weight: v => '×' + v.toFixed(2) };
  function syncTuneUI() {
    for (const k in TUNE_RANGE) { const el = $('t-' + k); el.value = tune[k]; $('v-' + k).textContent = FMT[k](tune[k]); }
  }
  for (const k in TUNE_RANGE) {
    const el = $('t-' + k), [lo, hi, st] = TUNE_RANGE[k];
    el.min = lo; el.max = hi; el.step = st;
    el.addEventListener('input', () => { tune[k] = +el.value; $('v-' + k).textContent = FMT[k](tune[k]); applyTune(); });
  }
  $('t-reset').addEventListener('click', () => { Object.assign(tune, TUNE_DEF); syncTuneUI(); applyTune(); });
  syncTuneUI();
  $('again').addEventListener('click', () => reset());

  // ---- resize: rescale world into new layout ----
  function resize(first) {
    const old = L; L = computeLayout();
    dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.round(L.W * dpr); canvas.height = Math.round(L.H * dpr);
    canvas.style.width = L.W + 'px'; canvas.style.height = L.H + 'px';
    document.getElementById('bg').style.bottom = (L.H - L.stripTop) + 'px';
    if (window.ZMAmb) window.ZMAmb.layout(L.W, L.stripTop);
    buildStatics(); vCapB = 0.8 * RFRAC[0] * L.Wi * (16.667 / STEP);
    if (!first && old.Wi) {
      const s = L.Wi / old.Wi;
      for (const b of animals) {
        const nx = L.left + (b.position.x - old.left) * s, ny = L.floorY - (old.floorY - b.position.y) * s;
        Body.scale(b, s, s); Body.setPosition(b, { x: nx, y: ny }); b.zm.r *= s;
      }
      aimX = L.left + (aimX - old.left) * s;
    }
    badgeCache.length = 0; if (spritesReady && dpr !== lastBadgeDpr) { buildBadgeURLs(); setNextUI(); } lastBadgeDpr = dpr;
    renderStrip(); buildDecor();
  }
  let rzT; window.addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(() => { if (active) resize(false); else needResize = true; }, 120); });

  // ---- static decor (pre-rendered pixel art: side posts + flat floor slab) ----
  let decor = null;
  // per-biome palette for the floor band, its lip and the two side posts (Forest = the approved v4 look)
  const DECOR = {
    forest:   { earth: [52, 32, 16], spk: ['rgba(40,24,10,.55)', 'rgba(150,110,70,.35)'], stone: ['#6d655e', '#9a918a'], lip: ['#3f6b25', '#5f9233'],
                bark: ['#4a2e1a', '#5b3920', '#6a4426', '#3c2414'], edge: '#2a190c', hl: '#7d5230' },
    ocean:    { earth: [120, 92, 52], spk: ['rgba(80,60,30,.45)', 'rgba(255,240,200,.35)'], stone: ['#5d6b70', '#8fa0a6'], lip: ['#d9c08a', '#f0dcae'],
                bark: ['#2f4f5a', '#365c68', '#3e6a77', '#24404a'], edge: '#132a31', hl: '#6aa3ad' },
    farm:     { earth: [74, 48, 22], spk: ['rgba(50,30,12,.5)', 'rgba(170,130,80,.35)'], stone: ['#7a6e62', '#a39686'], lip: ['#4f8a2a', '#7cbf45'],
                bark: ['#8a5a32', '#9a6a3c', '#a87644', '#6e4626'], edge: '#3a2210', hl: '#c89a62', plank: true },
    arctic:   { earth: [200, 225, 240], spk: ['rgba(140,180,210,.45)', 'rgba(255,255,255,.6)'], stone: ['#8fb2cc', '#c8e2f2'], lip: ['#ffffff', '#d6ecf8'],
                bark: ['#a8cfe6', '#b8dcf0', '#c8e6f6', '#8fbad6'], edge: '#3b5a78', hl: '#eef8ff' },
    oriental: { earth: [60, 44, 24], spk: ['rgba(40,28,12,.5)', 'rgba(150,120,80,.3)'], stone: ['#6e6a66', '#9c9690'], lip: ['#4f7a2a', '#7aa840'],
                bark: ['#5e8a2e', '#6b9a36', '#7aab40', '#4a6e22'], edge: '#24380f', hl: '#a8d064', nodes: '#3d5a1a' },
    savannah: { earth: [110, 70, 30], spk: ['rgba(70,40,15,.5)', 'rgba(230,190,110,.35)'], stone: ['#6e5c4c', '#9a8674'], lip: ['#c8962e', '#e6bc56'],
                bark: ['#6a4426', '#7a5030', '#8a5c36', '#523218'], edge: '#2b190c', hl: '#a87a4a' },
    jurassic: { earth: [70, 40, 25], spk: ['rgba(40,20,10,.55)', 'rgba(255,140,60,.25)'], stone: ['#4a3e3c', '#6e605c'], lip: ['#4a6a22', '#6f9a30'],
                bark: ['#3a3030', '#463a3a', '#524444', '#2a2222'], edge: '#120d0d', hl: '#7a6060' },
    space:    { earth: [30, 36, 52], spk: ['rgba(10,14,22,.5)', 'rgba(150,170,200,.3)'], stone: ['#56617a', '#8a97b0'], lip: ['#33e1ff', '#7d8ba0'],
                bark: ['#4a5466', '#56617a', '#626e88', '#3a4252'], edge: '#0b0f16', hl: '#9aa8c0', rivets: '#9aa8c0' },
  };
  function buildDecor() {
    const Pal = DECOR[THEME(KEYS[B])] || DECOR.forest;
    const P = 2; // logical px per art pixel
    decor = document.createElement('canvas');
    const w = Math.ceil(L.W / P), h = Math.ceil(L.H / P);
    decor.width = w; decor.height = h; const g = decor.getContext('2d');
    let seed = 1337; const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // v6 floor: one flat pixel slab in every biome (no grass, no speckle) - a dark outline, a 1-px highlight on top, a
    // solid face and a darker bottom edge - tinted to the biome's side posts so posts + floor read as one open-topped box
    const fy = Math.round(L.floorY / P), sy = Math.ceil(L.stripTop / P) + 1;
    g.fillStyle = Pal.edge; g.fillRect(0, fy - 1, w, 1);
    g.fillStyle = Pal.hl; g.fillRect(0, fy, w, 1);
    g.fillStyle = Pal.bark[1]; g.fillRect(0, fy + 1, w, Math.max(1, sy - fy - 2));
    g.fillStyle = Pal.bark[3]; g.fillRect(0, sy - 2, w, 1);
    g.fillStyle = Pal.edge; g.fillRect(0, sy - 1, w, 1);
    // trunks
    const tw = Math.ceil(L.wall / P) + 2, ty0 = 0, ty1 = Math.round(L.floorY / P) - 1;   // v6: posts run from the top edge into the floor
    const bark = Pal.bark;
    for (const side of [0, 1]) {
      for (let y = ty0; y < ty1; y++) for (let i = 0; i < tw; i++) {
        const x = side ? w - 1 - i : i;
        let c = bark[(R() * 3) | 0];
        if (i === tw - 1) c = Pal.edge;                                // inner edge outline
        else if (i === tw - 2) c = Pal.hl;                             // highlight
        else if (Pal.nodes && (y - ty0) % 22 < 2) c = Pal.nodes;       // bamboo nodes
        else if (Pal.plank && (y - ty0) % 16 === 0) c = Pal.edge;      // fence-plank seams
        else if (Pal.rivets && (y - ty0) % 18 === 4 && i === 1) c = Pal.rivets; // hull rivets
        else if (!Pal.nodes && !Pal.rivets && (y + i * 3) % 7 === 0) c = bark[3]; // bark grooves
        g.fillStyle = c; g.fillRect(x, y, 1, 1);
      }
      // small pixel cap at the top edge: a 1-px highlight row over a dark row
      for (let i = 0; i < tw; i++) { const x = side ? w - 1 - i : i; g.fillStyle = Pal.hl; g.fillRect(x, 0, 1, 1); g.fillStyle = Pal.edge; g.fillRect(x, 1, 1, 1); }
    }
  }

  // ---- render ----
  // Halving chain of each art PNG (808 -> 404 -> 202 -> 101 px). Each step averages exact 2x2 blocks, so small badges
  // are downscaled cleanly in every browser regardless of imageSmoothingQuality support.
  const mips = [];
  function artLevel(t, want) {
    const im = sprites[t - 1];
    let ch = mips[t - 1];
    if (!ch) {
      ch = mips[t - 1] = [im];
      let src = im, w = im.naturalWidth, h = im.naturalHeight;
      while (w > 96) {
        w = Math.ceil(w / 2); h = Math.ceil(h / 2);
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const g = c.getContext('2d'); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
        g.drawImage(src, 0, 0, w, h); ch.push(c); src = c;
      }
    }
    let i = 0; while (i + 1 < ch.length && ch[i + 1].width >= want) i++;
    return ch[i];
  }
  // Paint tier t's badge, circle of outer radius R (canvas px) centred at (cx, cy), onto 2D context g.
  function paintBadge(g, t, cx, cy, R) {
    if (B !== 0) { const im = sprites[t - 1]; if (im && im.naturalWidth) window.ZMArt.paint(g, B, t, im, cx, cy, R); return; }
    const [ax, ay, aR, bg] = ART[t - 1], ro = R, rr = R * (1 - OUTLINE_W), rb = R * (1 - OUTLINE_W - RIM_W);
    g.save();
    g.fillStyle = RIM_COL; g.beginPath(); g.arc(cx, cy, rr + 0.5, 0, Math.PI * 2); g.fill();          // light rim
    g.fillStyle = bg; g.beginPath(); g.arc(cx, cy, rb, 0, Math.PI * 2); g.fill();                    // tinted fill
    const s = R / aR, im = sprites[t - 1];
    if (im.complete && im.naturalWidth) {
      const lv = artLevel(t, im.naturalWidth * s);
      g.beginPath(); g.arc(cx, cy, rr + 0.25, 0, Math.PI * 2); g.clip();
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(lv, cx - ax * s, cy - ay * s, im.naturalWidth * s, im.naturalHeight * s);       // animal art
    }
    g.restore();
    g.fillStyle = RING_COL; g.beginPath(); g.arc(cx, cy, ro, 0, Math.PI * 2); g.arc(cx, cy, rr, 0, Math.PI * 2, true); g.fill(); // outline
  }
  // Each tier is pre-rendered once at its exact on-screen device size; frames just blit (and rotate) that bitmap with
  // smoothing, so there is no nearest-neighbour scaling or rotation of the art at draw time.
  const BADGE_PAD = 2, badgeCache = [];
  function badgeCanvas(t, r) {
    const D = 2 * r * dpr, c0 = badgeCache[t - 1];
    if (c0 && Math.abs(c0.D - D) < 0.01) return c0.c;
    const im = sprites[t - 1]; if (!spritesReady || !im || !im.complete || !im.naturalWidth) return null;
    const ov = B ? Math.max(1, window.ZM_DATA[B].animals[t - 1].ov || 1) : 1;   // Saturn's rings poke out of the circle
    const c = document.createElement('canvas'); c.width = c.height = 2 * Math.ceil(D * ov / 2 + BADGE_PAD);
    paintBadge(c.getContext('2d'), t, c.width / 2, c.height / 2, D / 2);
    if (B) window.ZMArt.forget(B, t);
    badgeCache[t - 1] = { D, c }; return c;
  }
  function buildBadgeURLs() {
    const px = Math.max(96, Math.ceil(40 * dpr)), c = document.createElement('canvas'), g = c.getContext('2d');
    c.width = c.height = px;
    badgeURLs = NAMES.map((n, i) => { const ov = B ? Math.max(1, D[B].animals[i].ov || 1) : 1;
      g.clearRect(0, 0, px, px); paintBadge(g, i + 1, px / 2, px / 2, (px / 2 - 0.5) / ov); return c.toDataURL('image/png'); });
    if (B) window.ZMArt.forget(B);
  }
  // squash/pop frames (sx, sy), 50 ms each: pop in small, squash wide, stretch tall, settle
  const POP_FR = [[0.82, 0.82], [1.2, 0.84], [0.9, 1.12], [1.05, 0.97], [1, 1]];
  function drawSprite(t, x, y, r, ang = 0, scale = 1, scaleY = scale) {
    const c = badgeCanvas(t, r); if (!c) return;
    const w = c.width / dpr;
    ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    if (!ang && scale === 1 && scaleY === 1) { x = Math.round(x * dpr) / dpr; y = Math.round(y * dpr) / dpr; } // unrotated: land on device pixels
    ctx.translate(x, y); if (scaleY !== scale) { ctx.scale(scale, scaleY); if (ang) ctx.rotate(ang); } else { if (ang) ctx.rotate(ang); if (scale !== 1) ctx.scale(scale, scale); }
    ctx.drawImage(c, -w / 2, -w / 2, w, w); ctx.restore();
  }
  // where the held animal's bottom would first touch an animal (anywhere under its footprint) or the floor
  function aimEnd(x, r) {
    let cy = L.floorY - r;
    for (const b of animals) {
      const br = b.zm.r, dx = Math.abs(b.position.x - x), R = r + br;
      if (dx >= R || b.position.y < L.heldY) continue;
      const c = b.position.y - Math.sqrt(R * R - dx * dx);
      if (c < cy) cy = c;
    }
    return Math.max(L.heldY, cy) + r;
  }
  let renderDt = 0;
  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, L.W, L.H);
    const [sx0, sy0] = shakeOffset(); lastShake = [sx0, sy0];
    if (sx0 || sy0) ctx.setTransform(dpr, 0, 0, dpr, sx0 * dpr, sy0 * dpr);
    ctx.imageSmoothingEnabled = false;
    if (decor) ctx.drawImage(decor, 0, 0, decor.width * 2, decor.height * 2);
    // danger line
    ctx.save();
    const flash = warnOn && Math.floor(now * 6) % 2 === 0;
    if (danger === 'near' && !gameOver) {
      // stepped red pulse (4 steps, faster the closer the stack is), plus a 2-row pixel glow band above the line
      const hz = 1.6 + nearK * 1.6, st = [0, 1, 2, 1][Math.floor(now * hz * 4) % 4];
      const col = ['#c8402c', '#e8301e', '#ff2a1a'][st];
      ctx.fillStyle = col; ctx.globalAlpha = [0.12, 0.22, 0.32][st];
      ctx.fillRect(L.left, L.dangerY - 6, L.right - L.left, 4); ctx.globalAlpha = [0.06, 0.12, 0.18][st]; ctx.fillRect(L.left, L.dangerY - 10, L.right - L.left, 4);
      ctx.globalAlpha = 1; ctx.strokeStyle = col; ctx.lineWidth = 2 + st;
    } else { ctx.strokeStyle = flash ? '#ff2a1a' : 'rgba(214,64,40,.9)'; ctx.lineWidth = flash ? 3 : 2; }
    ctx.setLineDash([8, 6]); ctx.beginPath(); ctx.moveTo(L.left, L.dangerY); ctx.lineTo(L.right, L.dangerY); ctx.stroke();
    ctx.restore();
    // held animal + aim line
    if (!gameOver) {
      const ready = isReady(), r = radius(current), x = clampAim(aimX);
      if (ready) {
        ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 5]);
        const yEnd = aimEnd(x, r);
        if (yEnd > L.heldY + r + 2) { ctx.beginPath(); ctx.moveTo(x, L.heldY); ctx.lineTo(x, yEnd); ctx.stroke(); } // centre -> landing point
        ctx.restore();
        drawSprite(current, x, L.heldY, r);
      }
    }
    // animals
    for (const b of animals) {
      const age = now - b.zm.born; let s = age < SCALE_IN && !b.zm.fresh ? 0.6 + 0.4 * (age / SCALE_IN) : 1, sy = s;
      if (b.zm.pop != null) { const q = now - b.zm.pop, f = POP_FR[Math.floor(q / 0.05)]; if (f) { s = f[0]; sy = f[1]; } else b.zm.pop = null; }
      if (b.zm.above > WARN && warnOn) { ctx.save(); ctx.globalAlpha = 0.35; ctx.fillStyle = '#ff2a1a'; ctx.beginPath(); ctx.arc(b.position.x, b.position.y, b.zm.r + 3, 0, 7); ctx.fill(); ctx.restore(); }
      drawSprite(b.zm.tier, b.position.x, b.position.y, b.zm.r, b.angle, s, sy);
    }
    drawFx(renderDt);
    // score pops
    ctx.save(); ctx.textAlign = 'center';
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i], dur = p.boss ? 1.15 : 0.8, a = (now - p.t0) / dur; if (a >= 1) { pops.splice(i, 1); continue; }
      const rise = (p.boss ? 54 : 20) * a;
      ctx.globalAlpha = 1 - a; ctx.font = p.boss ? '700 28px Pix, monospace' : '700 16px Pix, monospace';
      ctx.fillStyle = '#000'; ctx.fillText(p.txt, p.x, p.y - rise + 2);
      ctx.fillStyle = p.boss ? '#ffd75e' : '#fff'; ctx.fillText(p.txt, p.x, p.y - rise);
    }
    ctx.restore();
  }

  // ---- low-end check: a running average of frame time; if a phone can't hold ~45 fps after a 2 s warm-up, switch to
  // low-FX mode for the session (half the particles, fewer sparkles, ambient backdrop at 4 fps with fewer flakes) ----
  const perf = { avg: 16.7, n: 0, low: false, forced: null };
  try { if (/[?&]lowfx=1/.test(location.search)) perf.forced = true; } catch (e) {}
  function perfSample(dt) {
    if (dt <= 0 || dt >= 0.1) return;                                   // ignore hitches (tab switches, GC) entirely
    perf.n++; perf.avg += (dt * 1000 - perf.avg) * 0.05;
    const low = perf.forced != null ? perf.forced : (perf.low || (perf.n > 120 && perf.avg > 22));
    if (low !== perf.low) { perf.low = low; if (window.ZMAmb && window.ZMAmb.setLow) window.ZMAmb.setLow(low); }
  }
  let lastShake = [0, 0];
  // ---- loop ----
  let last = performance.now(), acc = 0;
  const angK = Math.exp(-PHYS.angularDamping * STEP / 1000);
  let vCapB = 24; // max px per 1/60 s, refreshed on resize: 0.8 × smallest radius per 1/120 s substep
  function frame(t) {
    if (!active) { running = false; return; }
    let dt = Math.min(0.1, (t - last) / 1000); last = t;
    if (document.hidden) { requestAnimationFrame(frame); return; }      // tab in background: no physics, no drawing
    perfSample(dt);
    if (!paused && !gameOver) {
      acc += dt * 1000;
      while (acc >= STEP) {
        Engine.update(engine, STEP);
        applyMerges();                                   // after the physics step
        for (const b of animals) {
          Body.setAngularVelocity(b, b.angularVelocity * angK);
          if (b.speed > vCapB) Body.setVelocity(b, Vector.mult(b.velocity, vCapB / b.speed)); // anti-tunnelling cap (velocity is per 1/60 s)
        }
        acc -= STEP; now += STEP / 1000;
      }
      checkDanger(dt);
    } else acc = 0;
    renderDt = dt; render();
    if (window.ZMAmb) { const run = !paused && !gameOver && !document.hidden; window.ZMAmb.tick(run ? dt : 0, run); }
    requestAnimationFrame(frame);
  }

  // ---- test hooks (used by headless tests; harmless in play) ----
  window.ZM = {
    get state() { return { score, best, current, next, gameOver, paused, prefs: Object.assign({}, prefs), animals: [...animals].map(b => ({ t: b.zm.tier, x: +b.position.x.toFixed(1), y: +b.position.y.toFixed(1), r: +b.zm.r.toFixed(1), fresh: b.zm.fresh })), seen: [...seen], layout: L, dropsTotal, mergesTotal, ready: isReady(), fallTime, cooldown: dropGap(), pops: pops.map(p => p.txt), biome: B, biomeKey: KEYS[B], artReady: spritesReady, theme: document.body.dataset.biome || null, bgImage: document.getElementById('bg').style.backgroundImage, ambient: window.ZMAmb ? window.ZMAmb.state() : null, tierCols: tierCols.slice(0, 11) }; },
    setPaused(v) { paused = !!v; },
    setCurrent(t) { current = t; }, setNext(t) { next = t; setNextUI(); },
    dropAt(xFrac) { aimX = L.left + xFrac * L.Wi; return drop(); },
    spawn(t, xFrac, yPx) { return !!makeAnimal(t, L.left + xFrac * L.Wi, yPx, 0, 0, false); },
    reset,
    get tune() { return Object.assign({}, tune); }, tuneDefaults: TUNE_DEF,
    setTune(o) { Object.assign(tune, o); syncTuneUI(); applyTune(); },
    aimEnd(xFrac, t) { const r = radius(t || current); return aimEnd(L.left + xFrac * L.Wi, r); },
    get juice() { return { chain, lastMergeAt, comboShown, comboOn: $('combo').classList.contains('on'), comboLog: comboLog.slice(), combo: { window: COMBO_WIN, bonus: COMBO_BONUS }, danger, nearK: +nearK.toFixed(2), nearT: +nearT.toFixed(2), shake: Object.assign({}, shk), lastShake: lastShake.slice(), fx: fx.length, fxKinds: fx.reduce((o, f) => (o[f.k] = (o[f.k] || 0) + 1, o), {}), pops: [...animals].filter(b => b.zm.pop != null).length, buzz: buzzLog.slice(), card: cardOn ? Object.assign({}, cardOn) : null, cardQ: cardQ.length, cardLog: cardLog.slice() }; },
    get perf() { return { avg: +perf.avg.toFixed(1), n: perf.n, low: perf.low, cap: perf.low ? FX_CAP_LOW : FX_CAP }; },
    setLow(v) { perf.forced = v == null ? null : !!v; perfSample(0.016); },
    dismissCard,
    celebrate(b) { cbOpen(b == null ? B : b); }, cbHold(f) { if (!cb.on) return; cb.hold = f; cb.f = f; cbDraw(f); }, cbRelease() { cb.hold = null; cb.t0 = performance.now() - cb.f / CB_FPS * 1000; },
    get cb() { return { on: cb.on, b: cb.b, f: cb.f, hold: cb.hold, log: cb.log.slice() }; },
    energy() { let e = 0, m = 0; for (const b of animals) { e += b.speed; m = Math.max(m, b.speed); } return { sum: e, max: m, n: animals.size }; },
  };

  // ---- boot: the level only starts when ui.js enters the game screen ----
  let active = false, running = false, booted = false, needResize = false;
  function setBiome(b, first) {
    B = b; best = ls.get(lsKey(b, 'best'), 0) | 0; seen = new Set(ls.get(lsKey(b, 'seen'), []));
    const th = THEME(KEYS[b]), src = b === 0 ? 'forest-bg.jpg' : `bg/${th}.png${th === 'space' ? '?v=fd7' : ''}`; // v7: space art changed (planets removed)
    document.body.dataset.biome = th;                                     // ui-themes/themes.css: HUD, NEXT frame, strip
    const bg = document.getElementById('bg'); bg.style.backgroundImage = `url(${src})`; bg.classList.toggle('pix', b !== 0);
    bg.dataset.biome = th;
    loadBiomeArt(b);
    if (window.ZMAmb) window.ZMAmb.setBiome(th, src);
    if (!first) { buildDecor(); renderStrip(); }
  }
  function startLoop() { if (running) return; running = true; requestAnimationFrame(t => { last = t; frame(t); }); }
  window.ZMGame = {
    // mode 'new': fresh run. mode 'resume': back from the Zoopedia with the pause menu open.
    enter(mode, biome) {
      active = true; clearJuice();                                      // v7: no stale combo/banner animation on (re)entry
      const want = (mode === 'resume' || biome == null) ? B : Math.max(0, Math.min(D.length - 1, biome | 0));
      if (!booted) { booted = true; setBiome(want, true); renderStrip(); resize(true); reset(); }
      else {
        if (want !== B || !document.body.dataset.biome) setBiome(want);
        if (needResize || window.innerWidth !== L.iw || window.innerHeight !== L.ih) { needResize = false; resize(false); }
        if (mode === 'resume' && !gameOver) { renderStrip(); openPanel(elPause); }
        else reset();
      }
      startLoop();
    },
    leave() { active = false; aiming = false; paused = true; elPause.classList.add('hidden'); clearJuice(); cbClose(); },
    get active() { return active; },
    get best() { return best; },
    get biome() { return B; },
    bestOf(b) { return ls.get(lsKey(b, 'best'), 0) | 0; },
    seenOf(b) { return ls.get(lsKey(b, 'seen'), []); },
    seen() { return [...seen]; },
    refreshSeen() { seen = new Set(ls.get(lsKey(B, 'seen'), [])); best = ls.get(lsKey(B, 'best'), 0) | 0; },
  };
})();
