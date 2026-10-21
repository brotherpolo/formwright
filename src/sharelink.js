// A dashboard link that carries what you're looking at: the period, live filter picks and a
// chart click (Copy link on a dashboard). #/dashboard/<id>?f=<code>, where the code is the
// state as JSON in URL-safe base64. Opening the link applies it for that person, this visit;
// it changes nobody's dashboard and gives no access: they still need to be able to open it.
// Pure functions, unit-tested; what comes in from a link is checked field by field.

const MAX = 4000;
const str = (v, n = 200) => (typeof v === 'string' ? v.slice(0, n) : '');
const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const okRef = (r) => r && typeof r.form === 'string' && typeof r.id === 'string' && r.form && r.id ? { form: str(r.form, 100), id: str(r.id, 100) } : null;

function toB64(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = ''; bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** What a dashboard's filters look like now, trimmed to what's set: { p, a, b, l, c } or null. */
export function shareState(fv) {
  if (!fv) return null;
  const out = {};
  if (fv.period && fv.period !== 'all') out.p = fv.period;
  if (fv.period === 'custom') { if (fv.from) out.a = fv.from; if (fv.to) out.b = fv.to; }
  const l = {};
  Object.entries(fv.lf || {}).forEach(([tid, v]) => { if ((Array.isArray(v) && v.length) || (v && !Array.isArray(v) && v.period)) l[tid] = v; });
  if (Object.keys(l).length) out.l = l;
  if (fv.click && (fv.click.filters || []).length) out.c = { t: fv.click.tid, n: fv.click.name, f: fv.click.filters };
  return Object.keys(out).length ? out : null;
}

/** The code for a state, or '' (nothing set, or too long for a link). */
export function encodeShare(state) {
  if (!state) return '';
  const code = toB64(JSON.stringify(state));
  return code.length <= MAX ? code : '';
}

/**
 * A code from a link, read back and checked: { period, from, to, lf, click } or null.
 * periods: the period keys this version knows (anything else is left as All time).
 */
export function decodeShare(code, periods = []) {
  if (typeof code !== 'string' || !code || code.length > MAX || !/^[A-Za-z0-9_-]+$/.test(code)) return null;
  let s;
  try { s = JSON.parse(fromB64(code)); } catch (e) { return null; }
  if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
  const known = (p) => typeof p === 'string' && periods.includes(p);
  const out = { period: known(s.p) ? s.p : 'all', from: '', to: '', lf: {}, click: null };
  if (out.period === 'custom') { out.from = isDay(s.a) ? s.a : ''; out.to = isDay(s.b) ? s.b : ''; }
  if (s.l && typeof s.l === 'object' && !Array.isArray(s.l)) {
    Object.entries(s.l).slice(0, 20).forEach(([tid, v]) => {
      const t = str(tid, 60); if (!t) return;
      if (Array.isArray(v)) { const vals = v.filter((x) => typeof x === 'string').map((x) => x.slice(0, 200)).slice(0, 50); if (vals.length) out.lf[t] = vals; }
      else if (v && typeof v === 'object' && known(v.period)) out.lf[t] = v.period === 'custom' ? { period: 'custom', from: isDay(v.from) ? v.from : '', to: isDay(v.to) ? v.to : '' } : { period: v.period };
    });
  }
  if (s.c && typeof s.c === 'object' && Array.isArray(s.c.f)) {
    const filters = s.c.f.slice(0, 4).map((f) => {
      const ref = okRef(f && f.ref); if (!ref) return null;
      const title = str(f.title);
      if (Number.isFinite(f.from) && Number.isFinite(f.to) && f.from < f.to) return { ref, from: f.from, to: f.to, text: str(f.text) || title, title };
      const keys = Array.isArray(f.keys) ? f.keys.filter((k) => typeof k === 'string').map((k) => k.slice(0, 200)).slice(0, 100) : [];
      return keys.length ? { ref, keys, title: title || keys[0] } : null;
    }).filter(Boolean);
    if (filters.length && str(s.c.t, 60)) out.click = { tid: str(s.c.t, 60), name: str(s.c.n), filters };
  }
  return out;
}

/** The full link: this Formwright, the dashboard, and the code when anything's set. */
export function shareUrl(base, dashId, fv) {
  const code = encodeShare(shareState(fv));
  return base + '#/dashboard/' + encodeURIComponent(dashId) + (code ? '?f=' + code : '');
}
