/* Zoo Mash – Forest prototype. Numbers from zoo-mash-spec/physics-config.json */
(function () {
  'use strict';
  const { Engine, Bodies, Body, Composite, Events } = Matter;

  // ---- spec ----
  const NAMES = ['ladybug','mouse','frog','squirrel','owl','raccoon','fox','deer','wolf','moose','bear'];
  const RFRAC = [0.0368,0.0536,0.0681,0.0770,0.0993,0.1272,0.1440,0.1741,0.1975,0.2455,0.2891];
  const POINTS = n => n * (n - 1) / 2;          // creating tier n
  const BOSS_PAIR = 66;
  const DROP_POOL = [1,2,3,4,5];                 // 20% each
  const PHYS = { gravityPtS2: 750 /* 5 m/s² × 150 pt/m */, refWidth: 393, restitution: 0.15, friction: 0.3,
    wallFriction: 0.3, linearDamping: 0.05, angularDamping: 0.2 };
  const COOLDOWN = 0.5, GRACE = 2.0, WARN = 0.5, BOX_RATIO = 1.12, SPAWN_ABOVE = 40, SCALE_IN = 0.12;
  const STEP = 1000 / 120;                       // fixed physics substep (ms)
  const SPRITE_FILL = 201 / (2 * 98.7);          // sprite png edge vs. circle outer edge

  // ---- storage ----
  const LS_BEST = 'zoomash.forest.best', LS_SEEN = 'zoomash.forest.seen';
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
               set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  let best = ls.get(LS_BEST, 0) | 0;
  let seen = new Set(ls.get(LS_SEEN, []));

  // ---- DOM ----
  const $ = id => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const elScore = $('score'), elBest = $('best'), elNext = $('next-img'), elSlots = $('slots');
  const elOver = $('over'), elMenu = $('menu');

  // ---- sprites ----
  const sprites = NAMES.map((n, i) => { const im = new Image(); im.src = (window.ZM_SPR && window.ZM_SPR[i]) || `sprites/${String(i + 1).padStart(2, '0')}-${n}.png`; return im; });
  const spriteSrc = t => sprites[t - 1].src;

  // ---- layout ----
  let L = {}, dpr = 1;
  function safeInsets() {
    const p = document.createElement('div');
    p.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)';
    document.body.appendChild(p); const cs = getComputedStyle(p);
    const r = { t: parseFloat(cs.paddingTop) || 0, b: parseFloat(cs.paddingBottom) || 0 }; p.remove(); return r;
  }
  function computeLayout() {
    const W = window.innerWidth, H = window.innerHeight, s = safeInsets();
    const wall = Math.max(8, Math.round(W * 0.026));
    const Wi = W - 2 * wall;
    const stripTop = H - document.getElementById('strip').offsetHeight;
    const top = s.t + 44;
    const r5 = RFRAC[4] * Wi;
    const baseHeld = top + 10 + r5;
    const gapHL = Math.max(SPAWN_ABOVE, r5 + 4);          // held animal -> danger line
    const box = BOX_RATIO * Wi;                           // danger line -> floor (spec 1.12 × width)
    const minBand = 18, maxBand = 56;
    const extra = stripTop - (baseHeld + gapHL + box + minBand);
    const band = minBand + Math.max(0, Math.min(maxBand - minBand, extra));
    const shift = Math.max(0, extra - (band - minBand)) * 0.5; // leftover: half pushes the play stack down, half deepens the forest floor
    const heldY = baseHeld + shift;
    const dangerY = heldY + gapHL;
    const floorY = Math.min(stripTop - minBand, dangerY + box);
    return { W, H, wall, Wi, left: wall, right: W - wall, top, heldY, dangerY, floorY, stripTop,
             trunkEnd: floorY - Math.round(Wi * 0.035), gScale: PHYS.gravityPtS2 / 1e6 * (Wi / PHYS.refWidth) };
  }

  // ---- engine ----
  const engine = Engine.create({ enableSleeping: false, positionIterations: 10, velocityIterations: 8 });
  engine.gravity.y = 1;
  let statics = [];
  const animals = new Set();

  function buildStatics() {
    statics.forEach(b => Composite.remove(engine.world, b)); statics = [];
    const T = 400, tall = L.H * 4;
    const opt = { isStatic: true, friction: PHYS.wallFriction, restitution: PHYS.restitution, label: 'wall' };
    statics.push(Bodies.rectangle(L.left - T / 2, L.floorY - tall / 2 + T, T, tall + T, opt));
    statics.push(Bodies.rectangle(L.right + T / 2, L.floorY - tall / 2 + T, T, tall + T, opt));
    statics.push(Bodies.rectangle(L.W / 2, L.floorY + T / 2, L.W + 2 * T, T, Object.assign({}, opt, { label: 'floor' })));
    Composite.add(engine.world, statics);
    engine.gravity.scale = L.gScale;
  }

  function radius(t) { return RFRAC[t - 1] * L.Wi; }
  function makeAnimal(t, x, y, vx = 0, vy = 0, fresh = false) {
    const r = radius(t);
    const b = Bodies.circle(x, y, r, { restitution: PHYS.restitution, friction: PHYS.friction, frictionStatic: 0.5,
      frictionAir: PHYS.linearDamping / 60, density: 0.001, slop: 0.02, label: 'animal' }, 40);
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
      if (a.zm && a.zm.fresh) a.zm.fresh = false;
      if (b.zm && b.zm.fresh) b.zm.fresh = false;
      if (a.zm && b.zm && a.zm.tier === b.zm.tier && !a.zm.merging && !b.zm.merging && !gameOver) {
        a.zm.merging = b.zm.merging = true; mergeQ.push([a, b]);
      }
    }
  }
  Events.on(engine, 'collisionStart', onPairs);
  Events.on(engine, 'collisionActive', onPairs);

  const pops = [];
  function applyMerges() {
    if (!mergeQ.length) return;
    const q = mergeQ; mergeQ = [];
    for (const [a, b] of q) {
      if (!animals.has(a) || !animals.has(b)) continue;
      const t = a.zm.tier;
      const mx = (a.position.x + b.position.x) / 2, my = (a.position.y + b.position.y) / 2;
      const vx = (a.velocity.x + b.velocity.x) / 2, vy = (a.velocity.y + b.velocity.y) / 2;
      removeAnimal(a); removeAnimal(b);
      let pts;
      if (t === 11) { pts = BOSS_PAIR; pops.push({ x: mx, y: my, t0: now, txt: '+' + pts, boss: true }); }
      else {
        const nt = t + 1, r = radius(nt);
        const x = Math.min(L.right - r, Math.max(L.left + r, mx)), y = Math.min(L.floorY - r, my);
        makeAnimal(nt, x, y, vx, vy, false);
        pts = POINTS(nt);
        pops.push({ x, y, t0: now, txt: '+' + pts });
      }
      addScore(pts);
    }
  }

  // ---- game state ----
  let score = 0, current = 1, next = 1, aimX = 0, canDropAt = 0, gameOver = false, paused = false, now = 0, warnOn = false;
  let aiming = false, dropsTotal = 0, mergesTotal = 0;
  const rnd = () => DROP_POOL[Math.floor(Math.random() * DROP_POOL.length)];

  function addScore(p) {
    score += p; mergesTotal++;
    elScore.textContent = score.toLocaleString('en-US');
    if (score > best) { best = score; ls.set(LS_BEST, best); elBest.textContent = best.toLocaleString('en-US'); }
  }
  function setNextUI() { elNext.src = spriteSrc(next); }

  function markSeen(t) {
    if (seen.has(t)) return;
    seen.add(t); ls.set(LS_SEEN, [...seen].sort((a, b) => a - b));
    renderStrip(t);
  }
  function renderStrip(popTier) {
    const W = window.innerWidth;
    const slot = Math.max(22, Math.min(34, Math.floor((Math.min(W, 420) - 28 - 10 * 3) / 11)));
    elSlots.style.setProperty('--slot', slot + 'px');
    elSlots.innerHTML = '';
    for (let t = 1; t <= 11; t++) {
      const d = document.createElement('div');
      if (seen.has(t)) { d.className = 'slot'; const im = document.createElement('img'); im.src = spriteSrc(t); im.alt = NAMES[t - 1]; d.appendChild(im); }
      else { d.className = 'slot locked'; d.textContent = '?'; }
      if (t === popTier) d.classList.add('pop');
      elSlots.appendChild(d);
    }
  }

  function clampAim(x) { const r = radius(current); return Math.min(L.right - r - 1, Math.max(L.left + r + 1, x)); }
  function drop() {
    if (gameOver || paused || now < canDropAt) return false;
    const x = clampAim(aimX);
    makeAnimal(current, x, L.heldY, 0, 0, true);
    dropsTotal++;
    current = next; next = rnd(); setNextUI();
    canDropAt = now + COOLDOWN;
    return true;
  }

  function reset() {
    for (const b of [...animals]) removeAnimal(b);
    mergeQ = []; pops.length = 0;
    score = 0; elScore.textContent = '0'; elBest.textContent = best.toLocaleString('en-US');
    current = rnd(); next = rnd(); setNextUI(); markSeen(current);
    aimX = L.W / 2; canDropAt = now + 0.2; gameOver = false; paused = false; warnOn = false; dropsTotal = mergesTotal = 0;
    elOver.classList.add('hidden'); elMenu.classList.add('hidden');
  }
  function endGame() {
    gameOver = true; aiming = false;
    $('o-score').textContent = score.toLocaleString('en-US');
    $('o-best').textContent = best.toLocaleString('en-US');
    $('o-new').classList.toggle('hidden', !(score > 0 && score >= best));
    elOver.classList.remove('hidden');
  }

  // ---- danger check ----
  function checkDanger(dt) {
    let maxAbove = 0;
    for (const b of animals) {
      const z = b.zm;
      if (z.fresh) { z.above = 0; continue; }
      if (b.position.y - z.r < L.dangerY) z.above += dt; else z.above = 0;
      if (z.above > maxAbove) maxAbove = z.above;
    }
    warnOn = maxAbove >= WARN;
    if (maxAbove >= GRACE && !gameOver) endGame();
  }

  // ---- input ----
  function px(e) { return e.clientX; }
  canvas.addEventListener('pointerdown', e => { if (gameOver || paused) return; aiming = true; aimX = px(e); try { canvas.setPointerCapture(e.pointerId); } catch (_) {} e.preventDefault(); });
  canvas.addEventListener('pointermove', e => { if (!aiming) return; aimX = px(e); e.preventDefault(); });
  const up = e => { if (!aiming) return; aiming = false; aimX = px(e); drop(); e.preventDefault(); };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', () => { aiming = false; });
  // iOS: block page scroll / pinch / double-tap zoom / bounce
  const block = e => { if (e.touches && e.touches.length > 1) e.preventDefault(); else if (e.target === canvas) e.preventDefault(); };
  document.addEventListener('touchstart', block, { passive: false });
  document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(n => document.addEventListener(n, e => e.preventDefault(), { passive: false }));
  document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
  document.addEventListener('contextmenu', e => e.preventDefault());

  $('gear').addEventListener('click', () => { if (gameOver) return; paused = elMenu.classList.toggle('hidden') ? false : true; });
  $('m-close').addEventListener('click', () => { elMenu.classList.add('hidden'); paused = false; });
  $('m-restart').addEventListener('click', () => reset());
  $('again').addEventListener('click', () => reset());

  // ---- resize: rescale world into new layout ----
  function resize(first) {
    const old = L; L = computeLayout();
    dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.round(L.W * dpr); canvas.height = Math.round(L.H * dpr);
    canvas.style.width = L.W + 'px'; canvas.style.height = L.H + 'px';
    document.getElementById('bg').style.bottom = (L.H - L.stripTop) + 'px';
    buildStatics();
    if (!first && old.Wi) {
      const s = L.Wi / old.Wi;
      for (const b of animals) {
        const nx = L.left + (b.position.x - old.left) * s, ny = L.floorY - (old.floorY - b.position.y) * s;
        Body.scale(b, s, s); Body.setPosition(b, { x: nx, y: ny }); b.zm.r *= s;
      }
      aimX = L.left + (aimX - old.left) * s;
    }
    renderStrip(); buildDecor();
  }
  let rzT; window.addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(() => resize(false), 120); });

  // ---- static decor (pre-rendered pixel art: trunks + forest floor) ----
  let decor = null;
  function buildDecor() {
    const P = 2; // logical px per art pixel
    decor = document.createElement('canvas');
    const w = Math.ceil(L.W / P), h = Math.ceil(L.H / P);
    decor.width = w; decor.height = h; const g = decor.getContext('2d');
    let seed = 1337; const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // forest floor band
    const fy = Math.round(L.floorY / P), sy = Math.ceil(L.stripTop / P) + 1;
    // translucent earth so the painted forest floor in the backdrop shows through
    for (let y = fy; y < sy; y++) { const k = (y - fy) / Math.max(1, sy - fy); g.fillStyle = `rgba(52,32,16,${(0.30 + 0.35 * k).toFixed(3)})`; g.fillRect(0, y, w, 1); }
    for (let i = 0; i < w * (sy - fy) / 40; i++) { const x = (R() * w) | 0, y = fy + 2 + ((R() * Math.max(1, sy - fy - 3)) | 0);
      g.fillStyle = R() < .5 ? 'rgba(40,24,10,.55)' : 'rgba(150,110,70,.35)'; g.fillRect(x, y, 1 + (R() < .3), 1); }
    for (let i = 0; i < w / 14; i++) { const x = (R() * w) | 0, y = fy + 4 + ((R() * Math.max(1, sy - fy - 7)) | 0);
      g.fillStyle = '#6d655e'; g.fillRect(x, y, 3, 2); g.fillStyle = '#9a918a'; g.fillRect(x, y, 2, 1); }
    g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(0, fy, w, 2);
    // grass lip
    for (let x = 0; x < w; x++) {
      const hgt = 1 + ((R() * 3) | 0);
      g.fillStyle = '#3f6b25'; g.fillRect(x, fy - hgt, 1, hgt + 1);
      if (R() < .35) { g.fillStyle = '#5f9233'; g.fillRect(x, fy - hgt - 1, 1, 1); }
    }
    // trunks
    const tw = Math.ceil(L.wall / P) + 2, ty0 = Math.floor(L.top / P), ty1 = Math.round(L.trunkEnd / P);
    const bark = ['#4a2e1a', '#5b3920', '#6a4426', '#3c2414'];
    for (const side of [0, 1]) {
      for (let y = ty0; y < ty1; y++) for (let i = 0; i < tw; i++) {
        const x = side ? w - 1 - i : i;
        let c = bark[(R() * 3) | 0];
        if (i === tw - 1) c = '#2a190c';                               // inner edge outline
        else if (i === tw - 2) c = '#7d5230';                          // highlight
        else if ((y + i * 3) % 7 === 0) c = bark[3];                   // bark grooves
        g.fillStyle = c; g.fillRect(x, y, 1, 1);
      }
      // rounded/root tip where the trunk stops short of the ground
      g.fillStyle = '#2a190c';
      for (let i = 0; i < tw; i++) { const x = side ? w - 1 - i : i; g.fillRect(x, ty1, 1, 1 + (i < tw - 2 ? 1 : 0)); }
    }
  }

  // ---- render ----
  function drawSprite(t, x, y, r, ang = 0, scale = 1) {
    const im = sprites[t - 1]; if (!im.complete) return;
    const d = 2 * r * SPRITE_FILL * scale;
    ctx.imageSmoothingEnabled = d * dpr < im.naturalWidth; ctx.imageSmoothingQuality = 'high';
    ctx.save(); ctx.translate(x, y); if (ang) ctx.rotate(ang); ctx.drawImage(im, -d / 2, -d / 2, d, d); ctx.restore();
  }
  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, L.W, L.H);
    ctx.imageSmoothingEnabled = false;
    if (decor) ctx.drawImage(decor, 0, 0, decor.width * 2, decor.height * 2);
    // danger line
    ctx.save();
    const flash = warnOn && Math.floor(now * 6) % 2 === 0;
    ctx.strokeStyle = flash ? '#ff2a1a' : 'rgba(214,64,40,.9)'; ctx.lineWidth = flash ? 3 : 2;
    ctx.setLineDash([8, 6]); ctx.beginPath(); ctx.moveTo(L.left, L.dangerY); ctx.lineTo(L.right, L.dangerY); ctx.stroke();
    ctx.restore();
    // held animal + aim line
    if (!gameOver) {
      const ready = now >= canDropAt, r = radius(current), x = clampAim(aimX);
      if (ready) {
        ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 2; ctx.setLineDash([2, 6]);
        ctx.beginPath(); ctx.moveTo(x, L.heldY + r + 4); ctx.lineTo(x, L.floorY); ctx.stroke(); ctx.restore();
        drawSprite(current, x, L.heldY, r);
      }
    }
    // animals
    for (const b of animals) {
      const age = now - b.zm.born; const s = age < SCALE_IN && !b.zm.fresh ? 0.6 + 0.4 * (age / SCALE_IN) : 1;
      if (b.zm.above > WARN && warnOn) { ctx.save(); ctx.globalAlpha = 0.35; ctx.fillStyle = '#ff2a1a'; ctx.beginPath(); ctx.arc(b.position.x, b.position.y, b.zm.r + 3, 0, 7); ctx.fill(); ctx.restore(); }
      drawSprite(b.zm.tier, b.position.x, b.position.y, b.zm.r, b.angle, s);
    }
    // score pops
    ctx.save(); ctx.textAlign = 'center'; ctx.font = '700 16px Pix, monospace';
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i], a = (now - p.t0) / 0.8; if (a >= 1) { pops.splice(i, 1); continue; }
      ctx.globalAlpha = 1 - a; ctx.fillStyle = '#000'; ctx.fillText(p.txt, p.x, p.y - 20 * a + 2);
      ctx.fillStyle = p.boss ? '#ffd75e' : '#fff'; ctx.fillText(p.txt, p.x, p.y - 20 * a);
    }
    ctx.restore();
  }

  // ---- loop ----
  let last = performance.now(), acc = 0;
  const angK = Math.pow(1 - PHYS.angularDamping, 1 / 120);
  function frame(t) {
    let dt = Math.min(0.1, (t - last) / 1000); last = t;
    if (!paused && !gameOver) {
      acc += dt * 1000;
      while (acc >= STEP) {
        Engine.update(engine, STEP);
        applyMerges();                                   // after the physics step
        for (const b of animals) Body.setAngularVelocity(b, b.angularVelocity * angK);
        acc -= STEP; now += STEP / 1000;
      }
      checkDanger(dt);
    } else acc = 0;
    render();
    requestAnimationFrame(frame);
  }

  // ---- test hooks (used by headless tests; harmless in play) ----
  window.ZM = {
    get state() { return { score, best, current, next, gameOver, paused, animals: [...animals].map(b => ({ t: b.zm.tier, x: +b.position.x.toFixed(1), y: +b.position.y.toFixed(1), r: +b.zm.r.toFixed(1), fresh: b.zm.fresh })), seen: [...seen], layout: L, dropsTotal, mergesTotal, ready: now >= canDropAt }; },
    setCurrent(t) { current = t; }, setNext(t) { next = t; setNextUI(); },
    dropAt(xFrac) { aimX = L.left + xFrac * L.Wi; return drop(); },
    spawn(t, xFrac, yPx) { return !!makeAnimal(t, L.left + xFrac * L.Wi, yPx, 0, 0, false); },
    reset,
  };

  // ---- boot ----
  renderStrip();
  resize(true);
  reset();
  requestAnimationFrame(t => { last = t; frame(t); });
})();
