// How often each checklist question fails, week by week. A checklist item's id is its question's
// id (poollogic.js), so every checklist asking "Fire extinguishers in date" counts toward the same
// question. Pure functions (no DOM, no Firebase), unit-tested. Used by Settings › Checklists ›
// Questions and the dashboard's "Most-failed questions" report.
import { startOf, nextOf } from './cal.js';

export const WEEKS = 12;
const MIN_HALF = 3; // answers needed in each half before calling a trend
const TREND_PTS = 5; // percentage points between the halves that count as a change

/**
 * The checklist answers on these records, by question:
 *   Map(questionId → { asked, failed, rate, weeks: [{ from, asked, failed, rate }], trend, hits: [{ rec, field }] })
 * rate: a percent (null when nothing was asked) · trend: 'rising' | 'steady' | 'falling' | '' (too few answers)
 * hits: the records where it failed, newest first.
 * opts: { now, weeks, formById, failOf(questionId, answer, value) → true (a fail) | false | null (not counted: N/A, not a choice) }
 * A record counts on the day it was created.
 */
export function questionStats(records, { now = Date.now(), weeks = WEEKS, formById, failOf }) {
  const first = nextOf(startOf(now, 'week'), 'week', -(weeks - 1));
  const starts = Array.from({ length: weeks }, (_, i) => nextOf(first, 'week', i));
  const out = new Map();
  const get = (q) => {
    if (!out.has(q)) out.set(q, { asked: 0, failed: 0, rate: null, weeks: starts.map((from) => ({ from, asked: 0, failed: 0, rate: null })), trend: '', hits: [] });
    return out.get(q);
  };
  (records || []).forEach((rec) => {
    const t = rec.createdAt || 0;
    if (t < first || t > now) return;
    const form = formById(rec.formId);
    const fs = (form?.fields || []).filter((f) => f.type === 'checklist');
    if (!fs.length) return;
    let wi = weeks - 1;
    while (wi > 0 && starts[wi] > t) wi--;
    fs.forEach((f) => {
      const v = rec.values?.[f.id];
      if (!v || !v.a) return;
      Object.entries(v.a).forEach(([q, ans]) => {
        const fail = failOf(q, ans, v);
        if (fail == null) return;
        const s = get(q), w = s.weeks[wi];
        s.asked++; w.asked++;
        if (fail) { s.failed++; w.failed++; s.hits.push({ rec, field: f }); }
      });
    });
  });
  out.forEach((s) => {
    s.rate = pct(s.failed, s.asked);
    s.weeks.forEach((w) => { w.rate = pct(w.failed, w.asked); });
    s.trend = trendOf(s.weeks);
    s.hits.sort((a, b) => (b.rec.createdAt || 0) - (a.rec.createdAt || 0));
  });
  return out;
}
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);

/** Rising, steady or falling: the later half of the weeks against the earlier half. */
export function trendOf(weeks) {
  const h = Math.floor(weeks.length / 2);
  const sum = (ws) => ws.reduce((a, w) => ({ asked: a.asked + w.asked, failed: a.failed + w.failed }), { asked: 0, failed: 0 });
  const a = sum(weeks.slice(0, h)), b = sum(weeks.slice(h));
  if (a.asked < MIN_HALF || b.asked < MIN_HALF) return '';
  const d = (b.failed / b.asked - a.failed / a.asked) * 100;
  return d >= TREND_PTS ? 'rising' : d <= -TREND_PTS ? 'falling' : 'steady';
}

/** The questions that fail most: [{ id, …stats }] by fail rate, then by how many failed. */
export function mostFailed(stats, limit = 8) {
  return [...stats.entries()].filter(([, s]) => s.failed > 0).map(([id, s]) => ({ id, ...s }))
    .sort((x, y) => y.rate - x.rate || y.failed - x.failed).slice(0, limit);
}

/** Is an answer a fail? From the checklist the record was filled in on (snap), or else the question's answer set. */
export function failFrom(snap, set) {
  return (q, ans) => {
    const item = snap ? (snap.items || []).find((x) => x.id === q && x.kind === 'item') : null;
    const opts = item ? (item.type === 'choice' ? item.opts : null) : set ? set(q)?.options : null;
    if (!opts) return null;
    const o = opts.find((x) => x.id === ans);
    if (!o) return null;
    if (!o.fail && typeof o.score !== 'number') return null; // N/A isn't counted
    return !!o.fail;
  };
}

/** A small line of the weekly fail rate: an SVG path (0–100 across, 0–100 down) and a point per week with answers. */
export function sparkPath(weeks, w = 100, h = 30, pad = 3) {
  const n = weeks.length;
  const pts = weeks.map((x, i) => (x.rate == null ? null : [n === 1 ? w / 2 : (i / (n - 1)) * w, pad + (1 - x.rate / 100) * (h - 2 * pad)])).filter(Boolean);
  if (!pts.length) return '';
  if (pts.length === 1) return `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)} h0.1`;
  return pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
}
