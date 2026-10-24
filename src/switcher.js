/* The Wayholm app switcher: Forms (here) and Plan, from the sidebar's ⋮⋮ and the stones at the
   right of the phone's top bar. Plan is listed for people who can use it (an administrator, or
   "Can use Plan" in Users); for others it says how to get it. */

import { esc } from './util.js';

const STONES = (top) => `<ellipse cx="32" cy="50" rx="24" ry="8.6" transform="rotate(-3 32 50)"/><ellipse cx="30.5" cy="33.6" rx="16.5" ry="6.9" transform="rotate(5 30.5 33.6)"/>${top}`;
const SQUARE = '<rect class="tp" x="26" y="10.5" width="14" height="13" rx="3.6" transform="rotate(-7 33 17)"/>';
const ROUND = '<circle class="tp" cx="33.5" cy="17" r="7"/>';
/** The Forms mark alone (stones in the text colour, the top one in the accent). */
export const MARK = `<svg class="wh-mark" viewBox="0 0 64 64" aria-hidden="true"><g class="st">${STONES('')}</g>${SQUARE}</svg>`;
/** An app's icon: its colour, cream stones, a warm top stone. */
const tile = (top, bg) => `<svg class="wh-tile" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="14.4" fill="${bg}"/><g transform="translate(9 8) scale(.72)" fill="#F6F1E8">${STONES(top.replace('class="tp"', 'fill="#F3B98A"'))}</g></svg>`;
export const DOTS = '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">' + [3, 8, 13].flatMap((x) => [3, 8, 13].map((y) => `<circle cx="${x}" cy="${y}" r="1.6"/>`)).join('') + '</svg>';

let open = null; // the button that opened it

/** The pop-up's contents. me: the signed-in account; planUrl: where Plan lives (empty: not set up). */
export function appsHTML(me, planUrl) {
  const canPlan = !!planUrl && (me?.role === 'admin' || me?.cadence === true);
  const plan = canPlan
    ? `<a class="wh-app" role="menuitem" href="${esc(planUrl)}" target="cadence" rel="noopener">${tile(ROUND, '#4B7A3C')}<span><b>Plan</b><small>Mind map and tasks</small></span><span class="wh-go" aria-hidden="true">↗</span></a>`
    : `<div class="wh-app off" role="menuitem" aria-disabled="true">${tile(ROUND, '#4B7A3C')}<span><b>Plan</b><small>${planUrl ? 'Ask an administrator to switch on Plan for you (Users).' : 'Not set up yet.'}</small></span></div>`;
  return `<div class="wh-apps" id="wh-apps" role="menu" aria-label="Wayholm apps">
    <div class="wh-h">Wayholm</div>
    <div class="wh-app on" role="menuitem" aria-current="true" tabindex="-1">${tile(SQUARE, '#2F5E9E')}<span><b>Forms</b><small>Records, checklists, workflows</small></span><span class="wh-here">Here</span></div>
    ${plan}</div>`;
}

/** Open (or close) the switcher under a button. */
export function toggleApps(btn, me, planUrl) {
  if (open) { const was = open; closeApps(); if (was === btn) return; }
  const wrap = document.createElement('div');
  wrap.className = 'wh-pop'; wrap.innerHTML = appsHTML(me, planUrl);
  document.body.appendChild(wrap);
  const r = btn.getBoundingClientRect(), w = Math.min(300, window.innerWidth - 16);
  wrap.style.width = w + 'px';
  wrap.style.top = Math.round(r.bottom + 6) + 'px';
  wrap.style.left = Math.round(Math.max(8, Math.min(r.left, window.innerWidth - w - 8))) + 'px';
  open = btn; btn.setAttribute('aria-expanded', 'true');
  (wrap.querySelector('a.wh-app') || wrap.querySelector('.wh-app.on'))?.focus();
}
export function closeApps(focus = false) {
  if (!open) return;
  const btn = open; open = null;
  document.querySelector('.wh-pop')?.remove();
  btn.setAttribute('aria-expanded', 'false');
  if (focus && btn.isConnected) btn.focus();
}
export const appsOpen = () => !!open;

document.addEventListener('pointerdown', (e) => { if (open && (!open.isConnected || !e.target.closest?.('.wh-pop,[data-act="apps"]'))) closeApps(); }, true);
document.addEventListener('click', (e) => { if (open && e.target.closest?.('.wh-pop a.wh-app')) setTimeout(() => closeApps(), 0); });
document.addEventListener('keydown', (e) => {
  if (!open) return;
  if (e.key === 'Escape') { e.preventDefault(); closeApps(true); return; }
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    const items = [...document.querySelectorAll('.wh-pop .wh-app:not(.off)')];
    if (!items.length) return;
    e.preventDefault();
    const i = items.indexOf(document.activeElement);
    items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
  }
});
window.addEventListener('resize', () => closeApps());
