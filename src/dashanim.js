// Dashboards come alive: each chart makes an entrance when a dashboard opens (or its filters or
// period change), and charts answer the mouse (the donut's slice under it, the line chart's
// nearest point). Live updates while you're looking don't replay anything. People who've asked
// their device for less motion get the charts as they are; phones and tablets get no hover.
// The styles are in dash.css (.db-anim and the hover rules).

import { store } from './store.js';

const still = () => typeof window === 'undefined' || !window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const NUM = /-?[\d,]*\.?\d+/;

// count each number in el up from 0 (text only, so the markup around it stays as it is)
function countUp(el, elapsed = 0) {
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (w.nextNode()) if (NUM.test(w.currentNode.nodeValue)) nodes.push(w.currentNode);
  nodes.forEach((n) => {
    const txt = n.nodeValue, m = NUM.exec(txt), raw = m[0];
    const target = Number(raw.replace(/,/g, '')), dec = (raw.split('.')[1] || '').length, comma = raw.includes(',');
    if (!isFinite(target) || target === 0) return;
    const fmt = (v) => (comma ? v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : v.toFixed(dec));
    const pre = txt.slice(0, m.index), post = txt.slice(m.index + raw.length), t0 = performance.now() - elapsed, dur = 900;
    if (elapsed >= dur) return;
    const ease = (t) => 1 - Math.pow(1 - t, 3);
    (function step(now) {
      const t = Math.min(1, (now - t0) / dur);
      n.nodeValue = t < 1 ? pre + fmt(target * ease(t)) + post : txt;
      if (t < 1) requestAnimationFrame(step);
    })(t0);
  });
}

/** Play one tile's entrance; elapsed (ms) carries on one that a redraw interrupted. */
export function animateTile(tile, elapsed = 0) {
  if (still()) return;
  tile.classList.remove('db-anim'); void tile.offsetWidth;
  tile.style.setProperty('--ad', `${-Math.round(elapsed)}ms`);
  tile.querySelectorAll('.rp-bar').forEach((b, i) => b.style.setProperty('--i', Math.min(i, 20)));
  tile.querySelectorAll('.db-li').forEach((b, i) => b.style.setProperty('--i', Math.min(i, 20)));
  tile.querySelectorAll('table tbody tr').forEach((r, i) => r.style.setProperty('--i', Math.min(i, 15)));
  tile.querySelectorAll('.rp-pt').forEach((p) => p.querySelector('i')?.style.setProperty('--x', (parseFloat(p.style.left) || 0) / 100));
  tile.classList.add('db-anim');
  tile.querySelectorAll('.rp-kpi, .db-ringc').forEach((el) => countUp(el, elapsed));
  setTimeout(() => tile.classList.remove('db-anim'), Math.max(0, ENTRANCE - elapsed)); // done: back to normal
}

const ENTRANCE = 2600; // ms, the longest entrance with its staggering
let lastView = null, io = null;
const started = new Map(); // tile id → when its entrance began (this view)
function begin(tile) { started.set(tile.dataset.tile, performance.now()); animateTile(tile, 0); }
/** Watch the tiles that haven't played yet, and play each as it comes into view. */
function watch(cv) {
  if (io) { io.disconnect(); io = null; }
  const fresh = [...cv.querySelectorAll('.db-tile')].filter((t) => !started.has(t.dataset.tile));
  if (!fresh.length) return;
  if (typeof IntersectionObserver === 'undefined') { fresh.forEach(begin); return; }
  io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { begin(e.target); io && io.unobserve(e.target); } }), { threshold: 0.2 });
  fresh.forEach((t) => io.observe(t));
}
/**
 * After each redraw. A dashboard that's new on screen (opened, or other filters or period) plays
 * its entrance, tile by tile as they come into view. Redraws while it plays (records still
 * arriving, someone saving) carry each tile on from where it was rather than cutting it off;
 * after that, redraws just show the new numbers.
 */
export function afterDashRender() {
  const cv = typeof document !== 'undefined' && document.getElementById('db-cv');
  const key = cv && !cv.classList.contains('edit') ? cv.dataset.view || '' : '';
  if (!key) { lastView = null; started.clear(); if (io) { io.disconnect(); io = null; } return; }
  if (still()) { lastView = key; return; }
  if (key !== lastView) {
    // still loading records (opening the app straight onto a dashboard): wait, so the entrance plays with the real numbers
    if (store.recordsLoading && store.recordsLoading.size) return;
    lastView = key; started.clear();
    watch(cv);
    return;
  }
  const now = performance.now();
  cv.querySelectorAll('.db-tile').forEach((t) => {
    const s = started.get(t.dataset.tile);
    if (s != null && now - s < ENTRANCE && !t.classList.contains('db-anim')) animateTile(t, now - s);
  });
  watch(cv);
}

/* ---------- pointing at charts ---------- */
// donut: which slice is under the mouse (from the ring's centre and angle)
function sliceAt(ring, e) {
  const r = ring.getBoundingClientRect(), x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
  const d = Math.hypot(x, y) / (r.width / 2);
  if (d < 0.58 || d > 1) return -1;
  const turn = ((Math.atan2(x, -y) / (2 * Math.PI)) + 1) % 1;
  const cuts = (ring.dataset.cuts || '').split(',').map(Number);
  return cuts.findIndex((c) => turn <= c);
}
function lightDonut(box, i) {
  const ring = box.querySelector('.db-ring'), leg = box.querySelector('.db-leg'), c = ring.querySelector('.db-ringc');
  if (!ring.dataset.bg) { ring.dataset.bg = ring.style.background; ring.dataset.c = c.innerHTML; }
  if (i < 0) { ring.style.background = ring.dataset.bg; c.innerHTML = ring.dataset.c; ring.classList.remove('hot'); leg?.classList.remove('hot'); leg?.querySelectorAll('.db-li').forEach((x) => x.classList.remove('on')); return; }
  let n = -1;
  ring.style.background = ring.dataset.bg.replace(/var\(--dc(\d+)\)/g, (m, k) => (++n === i ? m : `color-mix(in srgb, var(--dc${k}) 28%, var(--surface))`));
  const li = leg?.querySelectorAll('.db-li')[i];
  if (li) c.innerHTML = `${li.querySelector('.db-lv').textContent}<span class="hv">${li.querySelector('.db-lk').textContent} · ${li.querySelector('.db-lp').textContent}</span>`;
  ring.classList.add('hot'); leg?.classList.add('hot');
  leg?.querySelectorAll('.db-li').forEach((x, k) => x.classList.toggle('on', k === i));
}

function onMove(e) {
  const t = e.target;
  // donut: the slice under the mouse, or the legend entry
  const box = t.closest?.('.db-donut');
  document.querySelectorAll('.db-ring.hot').forEach((r) => { const b = r.closest('.db-donut'); if (b && b !== box) lightDonut(b, -1); });
  if (box && !box.closest('.db-cv.edit')) {
    const li = t.closest('.db-li');
    if (li) lightDonut(box, [...box.querySelectorAll('.db-li')].indexOf(li));
    else { const ring = t.closest('.db-ring'); lightDonut(box, ring ? sliceAt(ring, e) : -1); }
  }
  // line: a guide at the nearest point
  const plot = t.closest?.('.rp-plot');
  document.querySelectorAll('.rp-plot.hot').forEach((p) => { if (p !== plot) { p.classList.remove('hot'); p.querySelectorAll('.rp-pt.on').forEach((x) => x.classList.remove('on')); } });
  if (!plot || plot.closest('.db-cv.edit')) return;
  const pts = [...plot.querySelectorAll('.rp-pt')];
  if (!pts.length) return;
  const r = plot.getBoundingClientRect(), fx = ((e.clientX - r.left) / r.width) * 100;
  let best = pts[0], bd = 1e9;
  pts.forEach((p) => { const d = Math.abs(parseFloat(p.style.left) - fx); if (d < bd) { bd = d; best = p; } });
  let g = plot.querySelector('.rp-guide');
  if (!g) { g = document.createElement('div'); g.className = 'rp-guide'; g.setAttribute('aria-hidden', 'true'); plot.appendChild(g); }
  g.style.left = best.style.left;
  plot.classList.add('hot');
  pts.forEach((p) => p.classList.toggle('on', p === best));
}
if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
  document.addEventListener('mousemove', onMove, { passive: true });
}
