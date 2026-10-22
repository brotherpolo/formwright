// The bar along the top when there's no signal, or while changes are still syncing:
//   "Offline. Changes are saved on this phone and sync when you're back · 3 waiting"
//   "Syncing 3 changes…" (then it goes)
// It also starts waiting uploads when the signal returns, and says so if a change made offline
// was refused by the server afterwards. store.js does the work; this is what you see.

import { offline, isOnline, onLateError, flushUploads, watchBacklog } from './store.js';
import { toast, esc } from './ui.js';

let bar = null, timer = null;
const device = () => {
  const touch = window.matchMedia?.('(pointer: coarse)').matches, w = Math.min(screen.width || innerWidth, innerWidth);
  if (/iPhone|Android.+Mobile/.test(navigator.userAgent) || (touch && w < 700)) return 'phone';
  if (/iPad|Tablet/.test(navigator.userAgent) || touch) return 'tablet';
  return 'device';
};

function paint() {
  if (!bar) { bar = document.createElement('div'); bar.id = 'offbar'; bar.setAttribute('role', 'status'); bar.setAttribute('aria-live', 'polite'); document.body.prepend(bar); }
  const n = offline.pending + offline.uploads;
  const waiting = n ? ` · ${n} waiting` : offline.backlog ? ' · changes waiting' : '';
  const on = isOnline();
  let html = '';
  if (!on) html = `<b>Offline.</b> <span>Changes are saved on this ${device()} and sync when you’re back${esc(waiting)}.</span>`;
  else if (n || offline.backlog) html = `<span class="ob-spin" aria-hidden="true"></span><span>Syncing${n ? ` ${n} change${n === 1 ? '' : 's'}` : ''}…</span>`;
  bar.innerHTML = html;
  bar.hidden = !html;
  bar.className = on ? 'sync' : 'off';
  document.documentElement.classList.toggle('is-offline', !on);
}

export function installOffline() {
  offline.listeners.add(() => { cancelAnimationFrame(timer); timer = requestAnimationFrame(paint); });
  onLateError((e) => {
    console.error('[formwright] a change made offline was refused', e); // listed under Problems too
    toast(`A change made offline couldn’t be saved: ${e?.code === 'permission-denied' ? 'you’re not allowed to make it any more' : e?.message || 'the server refused it'}. Check the record and try again.`, { duration: 12000 });
  });
  window.addEventListener('online', () => { paint(); flushUploads(); toast('Back online. Syncing your changes.'); });
  window.addEventListener('offline', () => { paint(); toast('You’re offline. Keep working: changes are saved on this ' + device() + ' and sync when you’re back.', { duration: 6000 }); });
  setInterval(() => { if (isOnline() && offline.uploads) flushUploads(); }, 60000);
  paint();
}
/** When the data is ready: anything from an earlier visit still waiting, and uploads to finish. */
export function offlineReady() { watchBacklog(); flushUploads(); }
