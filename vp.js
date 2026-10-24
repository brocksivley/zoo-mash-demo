/* v7 viewport + safe-area probe, shared by game.js and ui.js. Every screen is position:fixed;inset:0, so layout uses the
   box that element really gets. --st / --sb (px) are the bands at the top / bottom that nothing important may enter:
     --st = max(env(safe-area-inset-top), device status-bar band, 12px)
     --sb = max(env(safe-area-inset-bottom), part of the box hidden behind browser chrome, home-indicator band, 8px)
   v6 only trusted env(safe-area-inset-top). On iOS 26 Safari the page can be drawn edge to edge (under the status bar /
   Dynamic Island) while env(safe-area-inset-top) still reads 0, so the HUD and headers slid under the island. v7 adds a
   device band: on an iPhone whose fixed box reaches the full screen height the top 59 px (Dynamic Island models, 47 px on
   notch models) and the bottom 34 px are always kept clear, whatever env() says. Standalone (home-screen) mode reports
   env() itself, which gives the same numbers.
   Tests: ?insets=TOP,BOTTOM (or window.__ZM_INSETS = {t, b} before load) simulates env() safe-area insets. */
(function () {
  const MIN_T = 12, MIN_B = 8;
  function probe(css) { const p = document.createElement('div'); p.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;' + css;
    document.body.appendChild(p); return p; }
  function simInsets() {
    if (window.__ZM_INSETS) return window.__ZM_INSETS;
    const m = /[?&]insets=(\d+),(\d+)/.exec(location.search);
    return m ? { t: +m[1], b: +m[2] } : null;
  }
  const UA = navigator.userAgent || '';
  const isIPhone = /iPhone|iPod/.test(UA);
  function measure() {
    const f = probe('right:0;bottom:0;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);box-sizing:border-box');
    const d = probe('width:1px;height:100vh;height:100dvh');
    const r = f.getBoundingClientRect(), cs = getComputedStyle(f);
    const W = Math.round(r.width) || innerWidth, H = Math.round(r.height) || innerHeight;
    let envT = parseFloat(cs.paddingTop) || 0, envB = parseFloat(cs.paddingBottom) || 0;
    const dvh = d.getBoundingClientRect().height || innerHeight;
    f.remove(); d.remove();
    const sim = simInsets(); if (sim) { envT = +sim.t || 0; envB = +sim.b || 0; }
    const visible = Math.min(H, innerHeight || H, dvh || H), hidden = Math.max(0, Math.round(H - visible));
    // iPhone drawn edge to edge: the fixed box is as tall as the screen (portrait) -> the island / home indicator overlap it
    const sh = Math.max(screen.width || 0, screen.height || 0), portrait = H >= W;
    const edge = !sim && isIPhone && portrait && sh > 0 && H >= sh - 2;
    const devT = edge ? (sh >= 852 ? 59 : sh >= 812 ? 47 : 20) : 0, devB = edge && sh >= 812 ? 34 : 0;
    const st = Math.max(envT, devT, MIN_T);
    const sb = Math.max(envB, devB, hidden - (edge ? devT : 0), MIN_B);
    const de = document.documentElement.style;
    de.setProperty('--st', st + 'px'); de.setProperty('--sb', sb + 'px');
    return { W, H, st, sb, envT, envB, hidden, edge, sim: !!sim, iw: innerWidth, ih: innerHeight };
  }
  // v7: modal panels (settings, pause, game over) are scaled down to fit between the safe bands instead of scrolling
  function fitPanel(m) {
    const p = m && m.querySelector('.panel'); if (!p || m.classList.contains('hidden')) return;
    p.style.transform = ''; p.style.maxHeight = 'none'; p.style.overflow = 'visible';
    const v = window.ZMVP.last || measure(), avail = (innerHeight || v.H) - v.st - v.sb - 20, h = p.offsetHeight;
    if (h > avail && h > 0) { const k = Math.max(0.6, avail / h); p.style.transform = 'scale(' + k.toFixed(3) + ')'; }
  }
  function fitAll() { document.querySelectorAll('.modal').forEach(fitPanel); }
  window.ZMVP = { measure, last: null, fitPanel, fitAll };
  window.ZMVP.last = measure();
  const watch = () => { const mo = new MutationObserver(fitAll); document.querySelectorAll('.modal').forEach(m => mo.observe(m, { attributes: true, attributeFilter: ['class'] })); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
  addEventListener('resize', () => { window.ZMVP.last = measure(); fitAll(); });
})();
