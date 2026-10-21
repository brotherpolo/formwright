// A form's list shown as a Board (cards in columns by stage or a choice field) or a Timeline
// (a bar per record between two dates). Pure functions, unit-tested; listlayouts.js draws them.
//
// A view's layout (saved with it as listViews/{id}.layout):
//   { kind: 'table' | 'board' | 'timeline',
//     by: '_stage' | fieldId,          Board: the columns
//     sum: fieldId | '',               Board: a number totalled in each column's header
//     start: fieldId | '_created',     Timeline: where a bar starts
//     end: fieldId | '',               Timeline: where it ends ('' = a one-day marker)
//     color: '_stage' | fieldId | '',  Timeline: what colours the bars
//     zoom: 'week' | 'month' | 'quarter' }

import { wfOn, stagesOf, stageById, movesOf, firstStage } from './workflow.js';

export const LAYOUTS = [['table', 'Table'], ['board', 'Board'], ['timeline', 'Timeline']];
export const ZOOMS = { week: { label: 'Weeks', pd: 36, tick: 'day' }, month: { label: 'Months', pd: 12, tick: 'week' }, quarter: { label: 'Quarters', pd: 3.5, tick: 'month' } };
const CHOICE = new Set(['select', 'radio', 'checkbox']);
const SUM = new Set(['number', 'decimal', 'currency', 'percent']);
const DATES = new Set(['date', 'datetime']);
const fieldsOf = (form) => (form?.fields || []).filter((f) => f && f.type !== 'heading');
const fieldIn = (form, id) => fieldsOf(form).find((f) => f.id === id) || null;
const optsOf = (f) => (f.type === 'checkbox' ? ['Yes', 'No'] : (f.options || []).map(String).filter((o) => o !== ''));

/* ---------- choices for the settings ---------- */

/** What a Board's columns can be: the workflow's stages, then single-choice fields and yes/no. */
export function boardChoices(form) {
  return [...(wfOn(form) ? [{ id: '_stage', label: 'Stage' }] : []), ...fieldsOf(form).filter((f) => CHOICE.has(f.type) && optsOf(f).length).map((f) => ({ id: f.id, label: f.label || 'Field' }))];
}
/** Numbers a Board can total in each column (formulas that make a number too). */
export function sumChoices(form) {
  return fieldsOf(form).filter((f) => SUM.has(f.type) || (f.type === 'formula' && ['decimal', 'currency', 'number', 'percent'].includes(f.format))).map((f) => ({ id: f.id, label: f.label || 'Number' }));
}
/** Dates a Timeline can use: date and date-and-time fields, and when the record was made. */
export function dateChoices(form) {
  return [...fieldsOf(form).filter((f) => DATES.has(f.type)).map((f) => ({ id: f.id, label: f.label || 'Date' })), { id: '_created', label: 'Created on' }];
}
/** What can colour a Timeline's bars. */
export const colorChoices = (form) => boardChoices(form);

/** A layout tidied for this form: anything that no longer exists falls back to a sensible choice. */
export function cleanLayout(l, form) {
  const x = l && typeof l === 'object' ? l : {};
  const kind = LAYOUTS.some(([k]) => k === x.kind) ? x.kind : 'table';
  const bc = boardChoices(form), sc = sumChoices(form), dc = dateChoices(form);
  const has = (list, id) => list.some((c) => c.id === id);
  const fieldDates = dc.filter((c) => c.id !== '_created');
  const start = has(dc, x.start) ? x.start : (fieldDates[0]?.id || '_created');
  let end = x.end === '' ? '' : has(dc, x.end) && x.end !== start ? x.end : '';
  if (x.end === undefined) end = fieldDates.find((c) => c.id !== start)?.id || ''; // first time: a second date if there is one (Start → Due)
  return {
    kind,
    by: has(bc, x.by) ? x.by : bc[0]?.id || '',
    sum: has(sc, x.sum) ? x.sum : '',
    start, end,
    color: x.color === '' ? '' : has(bc, x.color) ? x.color : bc[0]?.id || '',
    zoom: ZOOMS[x.zoom] ? x.zoom : 'month',
  };
}

/* ---------- Board ---------- */

/** The value a record shows on the Board for a column field. */
export function keyOf(form, by, rec) {
  if (by === '_stage') return rec.stage && stageById(form, rec.stage) ? rec.stage : '';
  const f = fieldIn(form, by), v = rec.values?.[by];
  if (!f) return '';
  if (f.type === 'checkbox') return v === true ? 'Yes' : 'No';
  return v == null ? '' : String(v);
}

/**
 * The columns, in order, with their records: [{ key, label, recs, blank, color }].
 * Stages in the workflow's order (records not started yet first, when there are any); choices
 * in the field's order, then any old values no longer offered, then the empty ones.
 */
export function boardColumns(form, by, recs) {
  const cols = [];
  const map = new Map();
  const add = (key, label, extra = {}) => { const c = { key, label, recs: [], blank: false, ...extra }; cols.push(c); map.set(key, c); return c; };
  if (by === '_stage') {
    const ns = add('', 'Not started', { blank: true });
    stagesOf(form).forEach((s, i) => add(s.id, s.name || 'Stage ' + (i + 1), { color: i }));
    recs.forEach((r) => map.get(keyOf(form, by, r)).recs.push(r));
    if (!ns.recs.length) cols.splice(cols.indexOf(ns), 1);
    return cols;
  }
  const f = fieldIn(form, by);
  if (!f) return [];
  optsOf(f).forEach((o, i) => add(o, o, { color: i }));
  const blank = { key: '', label: 'No ' + (f.label || 'value').toLowerCase(), recs: [], blank: true };
  recs.forEach((r) => {
    const k = keyOf(form, by, r);
    if (k === '') { blank.recs.push(r); return; }
    (map.get(k) || add(k, k, { old: true, color: cols.length })).recs.push(r);
  });
  if (blank.recs.length && f.type !== 'checkbox') cols.push(blank);
  return cols;
}

/**
 * Where a card may go, and how: Map(columnKey → { kind, ... }). Choice fields: any other column
 * (empty clears it). Stages: the stage's own moves (the buttons on the record), any stage for an
 * administrator (asks why), and the first stage for one not started yet.
 * who: { admin, canEdit (may change the record), canWork (holds it at its stage) }
 */
export function targetsOf(form, by, rec, who) {
  const out = new Map();
  if (!who || !who.canEdit) return out;
  const here = keyOf(form, by, rec);
  if (by === '_stage') {
    if (!here) { const f0 = firstStage(form); if (f0) out.set(f0.id, { kind: 'start', target: f0 }); }
    else {
      if (who.canWork) movesOf(form, rec.stage).forEach((m) => { if (!out.has(m.to)) out.set(m.to, { kind: 'move', move: m, target: m.target }); });
      if (who.admin) stagesOf(form).forEach((s) => { if (s.id !== here && !out.has(s.id)) out.set(s.id, { kind: 'jump', target: s }); });
    }
    return out;
  }
  const f = fieldIn(form, by);
  if (!f) return out;
  const keys = [...optsOf(f), ...(f.type === 'checkbox' ? [] : [''])];
  keys.forEach((k) => { if (k !== here) out.set(k, { kind: 'set', value: f.type === 'checkbox' ? k === 'Yes' : k === '' ? null : k }); });
  return out;
}

/** A column's total of a number field (formulas included, through valOf). */
export function colSum(recs, fid, valOf) {
  if (!fid) return null;
  return recs.reduce((a, r) => { const v = Number(valOf(r, fid)); return a + (Number.isFinite(v) ? v : 0); }, 0);
}

/* ---------- Timeline ---------- */

const DAY = 864e5;
const toUTC = (k) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(k || '')); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null; };
const fromUTC = (t) => new Date(t).toISOString().slice(0, 10);
/** Days from a to b ('YYYY-MM-DD'). */
export const dayDiff = (a, b) => Math.round((toUTC(b) - toUTC(a)) / DAY);
export const addDays = (k, n) => fromUTC(toUTC(k) + n * DAY);
const dow = (k) => new Date(toUTC(k)).getUTCDay();

/**
 * A record's span: { from, to } as 'YYYY-MM-DD' (to ≥ from), or null without a start.
 * dayOf(ms): the company's day for a moment (for Created on).
 */
export function spanOf(rec, start, end, dayOf) {
  const day = (id) => {
    if (id === '_created') return rec.createdAt ? dayOf(rec.createdAt) : null;
    const v = rec.values?.[id];
    return typeof v === 'string' && toUTC(v) != null ? v.slice(0, 10) : null;
  };
  const from = day(start);
  if (!from) return null;
  const to = end ? day(end) : null;
  return { from, to: to && to >= from ? to : from, open: !!end && !to };
}

/** The stretch of days a Timeline shows: around the records and today, a little either side. */
export function windowOf(spans, today, zoom = 'month') {
  const pad = { week: 3, month: 14, quarter: 30 }[zoom] || 14;
  let from = today, to = today;
  spans.forEach((s) => { if (s.from < from) from = s.from; if (s.to > to) to = s.to; });
  from = addDays(from, -pad); to = addDays(to, pad);
  if (dayDiff(from, to) > 3 * 366) { // keep it to about three years, centred on today where it can be
    const half = Math.floor(3 * 366 / 2);
    from = addDays(today, -half) < from ? from : addDays(today, -half);
    to = addDays(from, 3 * 366);
  }
  return { from, to, days: dayDiff(from, to) + 1 };
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** The axis: [{ key, at (days from the window's start), label, major }] for the zoom. */
export function ticksOf(win, zoom, weekStart = 1) {
  const out = [], tick = (ZOOMS[zoom] || ZOOMS.month).tick;
  for (let i = 0; i < win.days; i++) {
    const k = addDays(win.from, i), [y, m, d] = k.split('-').map(Number);
    if (tick === 'day') out.push({ key: k, at: i, label: `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dow(k)]} ${d}`, major: d === 1 || i === 0, month: `${MON[m - 1]} ${y}` });
    else if (tick === 'week' && dow(k) === weekStart) out.push({ key: k, at: i, label: `${MON[m - 1]} ${d}`, major: d <= 7 });
    else if (tick === 'month' && d === 1) out.push({ key: k, at: i, label: m === 1 ? `${MON[0]} ${y}` : MON[m - 1], major: m === 1 });
  }
  return out;
}

/** A span after a drag of n days: the whole bar ('move'), or one end ('start' / 'end'), never inside out. */
export function shiftSpan(span, part, n) {
  if (part === 'start') { const from = addDays(span.from, n); return { from: from > span.to ? span.to : from, to: span.to }; }
  if (part === 'end') { const to = addDays(span.to, n); return { from: span.from, to: to < span.from ? span.from : to }; }
  return { from: addDays(span.from, n), to: addDays(span.to, n) };
}

/** The value to save in a date field for a new day: a date-and-time keeps its time. */
export function dateValue(old, day, type) {
  if (type === 'datetime') { const t = /T(\d{2}:\d{2})/.exec(String(old || '')); return day + 'T' + (t ? t[1] : '09:00'); }
  return day;
}

/** "Oct 5 – 30, 2026", "Sep 28 – Oct 4, 2026", "Oct 5, 2026" for a span. */
export function spanText(s) {
  const [y1, m1, d1] = s.from.split('-').map(Number), [y2, m2, d2] = s.to.split('-').map(Number);
  if (s.from === s.to) return `${MON[m1 - 1]} ${d1}, ${y1}`;
  if (y1 !== y2) return `${MON[m1 - 1]} ${d1}, ${y1} – ${MON[m2 - 1]} ${d2}, ${y2}`;
  if (m1 === m2) return `${MON[m1 - 1]} ${d1} – ${d2}, ${y1}`;
  return `${MON[m1 - 1]} ${d1} – ${MON[m2 - 1]} ${d2}, ${y1}`;
}
