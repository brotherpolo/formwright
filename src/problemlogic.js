// Problems (Settings → Problems): what to report when something goes wrong in the browser, and
// how the list groups them. Pure functions, unit-tested; problems.js does the listening and
// sending. Cadence keeps a copy of problemFrom and Throttle in its own utils.js.
//
// A report: { at, app, uid, name, where, message, code, detail, url, agent, version }
// (the rules check every field; Cadence's functions/problems.js makes the server's own).

// Browser noise that isn't a problem anyone can fix
const NOISE = [
  /ResizeObserver loop/i, /^Script error\.?$/i, /AbortError|aborted a request|The operation was aborted/i,
  /Failed to fetch dynamically imported module|Importing a module script failed|Load failed$/i, // a dropped connection mid-update
  /NetworkError when attempting to fetch|Failed to fetch$|net::ERR_/i,
  /Non-Error promise rejection captured/i, /cancelled by the user|The user denied|NotAllowedError/i,
];
const OFFLINE = new Set(['unavailable', 'deadline-exceeded', 'cancelled', 'auth/network-request-failed']);
const cut = (s, n) => { const t = String(s == null ? '' : s); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

/**
 * A report from what went wrong, or null when it isn't worth one.
 * input: { error, message, source (the script's address), kind: 'error' | 'rejection' | 'console', note }
 * ctx: { app, uid, name, where, url, agent, version, origin, online, now }
 */
export function problemFrom(input, ctx) {
  if (!ctx || !ctx.uid) return null; // signed out: nowhere to send it
  const err = input && input.error;
  const message = String((err && (err.message || (typeof err === 'string' ? err : ''))) || (input && input.message) || (err && err.code) || '').trim();
  if (!message) return null;
  if (NOISE.some((r) => r.test(message))) return null;
  const code = err && typeof err.code === 'string' ? err.code : '';
  if (OFFLINE.has(code) || ctx.online === false) return null; // no connection: not a fault
  // errors from someone's browser extensions, not from the app
  const src = String((input && input.source) || '');
  if (src && ctx.origin && !src.startsWith(ctx.origin)) return null;
  if (/(chrome|moz|safari)-extension:\/\//.test(String((err && err.stack) || '') + src)) return null;
  const stack = err && err.stack ? String(err.stack).split('\n').slice(0, 8).join('\n') : '';
  return {
    at: ctx.now || Date.now(), app: ctx.app || 'formwright', uid: ctx.uid, name: cut(ctx.name || 'Someone', 100),
    where: cut(ctx.where || '', 200), message: cut(message, 500), code: cut(code, 100),
    detail: cut([input.kind ? `(${input.kind})` : '', input.note || '', stack].filter(Boolean).join('\n'), 4000),
    url: cut(String(ctx.url || '').replace(/\?.*$/, ''), 300), agent: cut(ctx.agent || '', 300), version: cut(ctx.version || '', 40),
  };
}

/** At most `max` reports per page load, and the same one not again within `quietMs`. */
export class Throttle {
  constructor(max = 15, quietMs = 5 * 60e3) { this.max = max; this.quietMs = quietMs; this.n = 0; this.last = new Map(); }
  ok(p, now = Date.now()) {
    if (!p || this.n >= this.max) return false;
    const k = groupKey(p), t = this.last.get(k);
    if (t != null && now - t < this.quietMs) return false;
    this.last.set(k, now); this.n++;
    return true;
  }
}

/** Same app, same place, same message (numbers and IDs blurred): one line in the list. Matches the server's. */
export function groupKey(p) {
  const blur = (s) => String(s || '').replace(/[0-9a-f]{8,}|\d+/gi, '#');
  return [p.app || '', blur(p.where), blur(p.message)].join('|');
}

/**
 * The list on Settings → Problems: [{ key, app, where, message, code, n, people: [name], first, last, latest, ids }],
 * newest first. `since`: reports after it are new (for the count on the Settings card).
 */
export function groupProblems(list, since = 0) {
  const m = new Map();
  (list || []).forEach((p) => {
    const k = groupKey(p);
    const g = m.get(k) || { key: k, app: p.app, where: p.where || '', message: p.message || '', code: p.code || '', n: 0, people: [], first: Infinity, last: 0, latest: null, ids: [], fresh: 0 };
    g.n++; g.ids.push(p.id);
    if (p.at > since) g.fresh++;
    if (p.app !== 'server' && p.name && !g.people.includes(p.name)) g.people.push(p.name);
    g.first = Math.min(g.first, p.at || 0);
    if ((p.at || 0) >= g.last) { g.last = p.at || 0; g.latest = p; }
    m.set(k, g);
  });
  m.forEach((g) => g.people.sort((a, b) => a.localeCompare(b)));
  return [...m.values()].sort((a, b) => b.last - a.last);
}

/** How the last nightly backup went, in words: { ok, text } (system/backup). */
export function backupText(b, now = Date.now(), whenRaw = (t) => new Date(t).toLocaleString()) {
  const when = (t) => String(whenRaw(t)).replace(/\.$/, ''); // '11:01 a.m.' ends a sentence once
  if (!b || !b.lastAt) return { ok: null, text: 'No nightly backup has run yet. The first one runs at 2:30 a.m. once the server update is installed.' };
  if (b.ok) {
    const stale = now - b.lastAt > 36 * 3600e3;
    return { ok: !stale, text: `Last nightly backup: ${when(b.lastAt)}${stale ? ', over a day ago: it may have stopped running' : ''}. Copies are kept ${b.keepDays || 30} days.` };
  }
  return { ok: false, text: `The last nightly backup didn’t work (${when(b.lastAt)}): ${b.error || 'no reason given'}.${b.lastOkAt ? ` The last one that did: ${when(b.lastOkAt)}.` : ''}` };
}
