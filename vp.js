/* v6 viewport probe, shared by game.js and ui.js.
   Every screen is position:fixed;inset:0, so lay out in the box that element really gets (not window.innerHeight).
   On iPhone Safari (iOS 26, floating Liquid Glass toolbar, viewport-fit=cover) the fixed box can be taller than
   innerHeight / 100dvh: the page runs under the toolbar. Laying out in innerHeight then left everything bunched at the
   top with an empty band underneath. Now H = the fixed box, backdrops fill all of it, and anything pinned to the bottom
   is lifted by --sb = max(safe-area-inset-bottom, the part of the box hidden behind browser chrome). */
(function () {
  function probe(css) { const p = document.createElement('div'); p.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;' + css;
    document.body.appendChild(p); return p; }
  function measure() {
    const f = probe('right:0;bottom:0;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);box-sizing:border-box');
    const d = probe('width:1px;height:100vh;height:100dvh');
    const r = f.getBoundingClientRect(), cs = getComputedStyle(f);
    const W = Math.round(r.width) || innerWidth, H = Math.round(r.height) || innerHeight;
    const st = parseFloat(cs.paddingTop) || 0, envB = parseFloat(cs.paddingBottom) || 0;
    const dvh = d.getBoundingClientRect().height || innerHeight;
    f.remove(); d.remove();
    const visible = Math.min(H, innerHeight || H, dvh || H), hidden = Math.max(0, Math.round(H - visible));
    const sb = Math.max(envB, hidden);
    const de = document.documentElement.style;
    de.setProperty('--st', st + 'px'); de.setProperty('--sb', sb + 'px');
    return { W, H, st, sb, envB, hidden, iw: innerWidth, ih: innerHeight };
  }
  window.ZMVP = { measure, last: null };
  window.ZMVP.last = measure();
})();
