// Problems: when something goes wrong in someone's browser (an error, a failed save), a short
// report goes to problems/{id} for administrators to see in Settings → Problems. What counts,
// and what's left out (browser noise, extensions, no connection), is in problemlogic.js.
// Each report says where it happened: the screen's title and the last button pressed.

import { problemFrom, Throttle } from './problemlogic.js';
import { store, reportProblem } from './store.js';

let lastAct = '', sending = false, opts = { title: () => '', version: '' };
const throttle = new Throttle();

function ctx() {
  const uid = store.user?.uid;
  return {
    app: 'formwright', uid, name: store.profiles?.[uid]?.displayName || store.user?.displayName || store.user?.email || '',
    where: [opts.title(), lastAct].filter(Boolean).join(' · '), url: location.pathname + location.hash,
    agent: navigator.userAgent, version: opts.version, origin: location.origin, online: navigator.onLine,
  };
}

/** Send one report (never throws, never reports itself). */
export function report(input) {
  if (sending) return;
  try {
    const p = problemFrom(input, ctx());
    if (!p || !throttle.ok(p)) return;
    sending = true;
    reportProblem(p).catch(() => { /* the rules or the connection said no: nothing more to do */ }).finally(() => { sending = false; });
  } catch (e) { sending = false; }
}

/** Start listening: uncaught errors, failed promises, and errors the app logs (console.error with an Error). */
export function installProblems({ title, version } = {}) {
  opts = { title: title || (() => ''), version: version || '' };
  document.addEventListener('click', (e) => { const el = e.target.closest?.('[data-act],[data-d],[data-cv],[data-dv]'); if (el) lastAct = el.dataset.act || el.dataset.d || el.dataset.cv || el.dataset.dv || ''; }, true);
  window.addEventListener('error', (e) => report({ error: e.error, message: e.message, source: e.filename, kind: 'error' }));
  window.addEventListener('unhandledrejection', (e) => report({ error: e.reason, kind: 'rejection' }));
  const original = console.error.bind(console);
  console.error = (...args) => {
    original(...args);
    const err = args.find((a) => a instanceof Error || (a && typeof a === 'object' && typeof a.message === 'string' && (a.code || a.name)));
    if (err) report({ error: err, kind: 'console', note: args.filter((a) => typeof a === 'string').join(' ').slice(0, 300) });
  };
}
