/* Zoo Mash – shared badge painter for the Zoopedia, map and popups.
   The 1x animal art (art/<biome>/NN.png) is blown up 4x nearest-neighbour at runtime, halved down a mip chain, and
   painted inside a vector circle (fill, light rim, dark outline) at the exact device size it is shown at — the same
   recipe as the approved in-game badges, so every animal stays crisp at DPR 3. */
(function () {
  'use strict';
  const D = window.ZM_DATA;
  const imgs = {}, mips = {}, out = {}, got = {};
  const key = (b, t) => D[b].key + '/' + String(t).padStart(2, '0');
  function load(b, t) {
    const k = key(b, t);
    if (!imgs[k]) imgs[k] = new Promise((res, rej) => { const im = new Image(); im.onload = () => { got[k] = im; if (im.decode) im.decode().then(() => res(im), () => res(im)); else res(im); }; im.onerror = rej; im.src = 'art/' + k + '.png'; });
    return imgs[k];
  }
  // 4x NN upscale, then a halving chain (each step averages exact 2x2 blocks)
  function chain(k, im) {
    if (mips[k]) return mips[k];
    const c = document.createElement('canvas'); c.width = im.naturalWidth * 4; c.height = im.naturalHeight * 4;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(im, 0, 0, c.width, c.height);
    const ch = [c]; let src = c, w = c.width, h = c.height;
    while (w > 96) {
      w = Math.ceil(w / 2); h = Math.ceil(h / 2);
      const n = document.createElement('canvas'); n.width = w; n.height = h;
      const ng = n.getContext('2d'); ng.imageSmoothingEnabled = true; ng.imageSmoothingQuality = 'high';
      ng.drawImage(src, 0, 0, w, h); ch.push(n); src = n;
    }
    return (mips[k] = ch);
  }
  function level(ch, want) { let i = 0; while (i + 1 < ch.length && ch[i + 1].width >= want) i++; return ch[i]; }
  // paint badge for biome b, tier t with outer radius R (device px) centred at cx, cy
  function paint(g, b, t, im, cx, cy, R) {
    const a = D[b].animals[t - 1], k = key(b, t);
    const ow = a.ow ?? 0.0253, rw = a.rw ?? 0.0101, rr = R * (1 - ow), rb = R * (1 - ow - rw);
    const s = R / a.R, W = im.naturalWidth * s, H = im.naturalHeight * s, x0 = cx - a.cx * s, y0 = cy - a.cy * s;
    const lv = level(chain(k, im), W);
    g.save();
    g.fillStyle = a.rim || '#fefaee'; g.beginPath(); g.arc(cx, cy, rr + 0.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = a.bg; g.beginPath(); g.arc(cx, cy, rb, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(cx, cy, rr + 0.25, 0, Math.PI * 2); g.clip();
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(lv, x0, y0, W, H);
    g.restore();
    g.fillStyle = a.ring || '#090805'; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.arc(cx, cy, rr, 0, Math.PI * 2, true); g.fill();
    if (a.ov && a.ov > 1) { // art that pokes out of the circle (Saturn's rings): redraw it outside the badge, unclipped
      g.save(); g.beginPath(); g.rect(x0 - 2, y0 - 2, W + 4, H + 4); g.arc(cx, cy, rr, 0, Math.PI * 2, true); g.clip('evenodd');
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(lv, x0, y0, W, H); g.restore();
    }
  }
  // Render into the given <canvas> so it shows as a circle of `css` CSS px diameter (crisp at the device ratio).
  async function draw(cv, b, t, css) {
    const dpr = Math.min(3, window.devicePixelRatio || 1), a = D[b].animals[t - 1], ov = Math.max(1, a.ov || 1);
    const Dd = Math.round(css * dpr), pad = Math.ceil(Dd * (ov - 1) / 2) + 2, n = Dd + 2 * pad;
    const tag = b + ':' + t + ':' + n;
    cv.dataset.tag = tag;
    let src = out[tag];
    if (!src) {
      const im = await load(b, t);
      src = document.createElement('canvas'); src.width = src.height = n;
      paint(src.getContext('2d'), b, t, im, n / 2, n / 2, Dd / 2);
      out[tag] = src; delete mips[key(b, t)]; // drop the big 4x temp canvases right away (phone memory)
    }
    if (cv.dataset.tag !== tag) return; // re-used for something else meanwhile
    cv.width = cv.height = n;
    const g = cv.getContext('2d'); g.clearRect(0, 0, n, n); g.drawImage(src, 0, 0);
    const cssN = n / dpr; cv.style.width = cv.style.height = cssN + 'px';
    cv.style.margin = (-(cssN - css) / 2) + 'px';
  }
  // drop the big 4x temp canvases for a biome (or one tier) once its badges are rendered (phone memory)
  function forget(b, t) { for (let i = t || 1; i <= (t || 11); i++) delete mips[key(b, i)]; }
  function preload(b) { for (let t = 1; t <= 11; t++) load(b, t).catch(() => {}); }
  window.ZMArt = { draw, preload, load, loaded: (b, t) => got[key(b, t)] || null, paint, forget, data: D };
})();
