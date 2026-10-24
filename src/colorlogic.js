// Colour rules in lists: "When Due date is before today, colour the row red", "When Budget is
// more than 100000, make the Budget cell bold". Saved with a list view (cfg.colors), like its
// columns and filters. Pure functions (no DOM, no Firebase), so they're unit-tested.
//
//   rule  { id, conds: [{ field, op, value }], color: '' | TINTS key, bold: bool, cell: '' | column key }
//         cell '' colours the whole row (the first matching row rule wins); a column key
//         ('title', 'f:<id>', …) colours just that cell, on top of the row's colour.
//   Conditions are all-must-match and use the same comparisons as rules (rules.js), plus
//   dates against today: is before today, is today, is after today, in the next / last N days.
//   Lookups and rollups compare as what they show (a lookup of a date is a date; a count is a number).
import { opsFor, testCond, kindOf, isBlank } from './rules.js';
import { shownField } from './lookuplogic.js';
import { rollupOf } from './rolluplogic.js';
import { addDays } from './layoutlogic.js';

export const TINTS = [['red', 'Red'], ['amber', 'Amber'], ['green', 'Green'], ['blue', 'Blue'], ['purple', 'Purple'], ['grey', 'Grey']];
const TINT = new Set(TINTS.map((t) => t[0]));
export const MAX_COLOR_RULES = 20, MAX_COLOR_CONDS = 5;
const SKIP = new Set(['heading', 'instructions', 'signature', 'file', 'photo', 'attachments', 'richtext']);

/** Days against today (date fields only). value 'days': a whole number of days. */
export const TODAY_OPS = [
  { key: 'past', label: 'is before today', value: '' },
  { key: 'istoday', label: 'is today', value: '' },
  { key: 'future', label: 'is after today', value: '' },
  { key: 'next', label: 'is in the next … days', value: 'days' },
  { key: 'last', label: 'was in the last … days', value: 'days' },
];
const TODAY_KEYS = new Set(TODAY_OPS.map((o) => o.key));

/** What a field compares as: itself, or for a lookup / rollup the kind of value it shows. */
export function compareAs(form, f, formById) {
  if (!f) return null;
  if (f.type === 'lookup') {
    const t = formById && shownField(form, f, formById);
    return t ? { ...t, id: f.id, label: f.label } : null;
  }
  if (f.type === 'rollup') {
    if ((f.agg || 'count') === 'count' || ['sum', 'avg', 'min', 'max'].includes(f.agg)) return { id: f.id, type: 'number', label: f.label };
    if (f.agg === 'list') return { id: f.id, type: 'text', label: f.label };
    const of = formById && rollupOf(form, f, formById);
    return of ? { ...of, id: f.id, label: f.label } : { id: f.id, type: 'text', label: f.label };
  }
  return f;
}

/** The fields a colour rule can look at: [{ id, label, f (compares as) }]. stage: the workflow Stage pseudo field, if any. */
export function colorFields(form, formById, stage = null) {
  const out = [];
  (form?.fields || []).forEach((x) => {
    if (SKIP.has(x.type)) return;
    const f = compareAs(form, x, formById);
    if (!f || kindOf(f) === 'other') return;
    out.push({ id: x.id, label: x.label || 'Untitled field', f });
  });
  if (stage) out.push({ id: stage.id, label: stage.label || 'Stage', f: stage });
  return out;
}

/** Comparisons for a colour rule: the rule ones, with dates against today first. */
export function colorOps(f) {
  const ops = f ? opsFor(f) : [];
  return kindOf(f) === 'date' ? [...TODAY_OPS, ...ops] : ops;
}
export const colorOp = (f, op) => colorOps(f).find((o) => o.key === op) || null;

const dayOf = (v) => String(v ?? '').slice(0, 10);

/** Does one condition hold? today: 'YYYY-MM-DD'. An unfinished one never holds. */
export function testColor(cond, v, f, today) {
  if (!f || !cond || !cond.op) return false;
  if (TODAY_KEYS.has(cond.op)) {
    if (kindOf(f) !== 'date' || isBlank(v)) return false;
    const d = dayOf(v);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
    if (cond.op === 'past') return d < today;
    if (cond.op === 'istoday') return d === today;
    if (cond.op === 'future') return d > today;
    const n = Number(cond.value);
    if (!Number.isFinite(n) || n < 0 || cond.value === '' || cond.value == null) return false;
    const days = Math.min(3660, Math.floor(n));
    return cond.op === 'next' ? d >= today && d <= addDays(today, days) : d <= today && d >= addDays(today, -days);
  }
  return testCond(cond, v, f);
}

/** Does every complete condition of a rule hold? look(fieldId) → { f, v } or null. No complete condition: never. */
export function colorFires(rule, look, today) {
  const conds = (rule?.conds || []).filter((c) => c && c.field && c.op);
  if (!conds.length) return false;
  return conds.every((c) => { const x = look(c.field); return !!x && testColor(c, x.v, x.f, today); });
}

/**
 * The colours for one record: { row: { color, bold } | null, cells: { <column key>: { color, bold } } }.
 * The first matching whole-row rule colours the row; for each cell, the first matching rule for it.
 */
export function paintOf(rules, look, today) {
  const out = { row: null, cells: {} };
  (rules || []).forEach((r) => {
    if (!r || (!r.color && !r.bold)) return;
    const key = r.cell || '';
    if (key ? out.cells[key] : out.row) return;
    if (!colorFires(r, look, today)) return;
    const p = { color: r.color || '', bold: !!r.bold };
    if (key) out.cells[key] = p; else out.row = p;
  });
  return out;
}
export const hasPaint = (p) => !!p && (!!p.row || Object.keys(p.cells).length > 0);

/** CSS classes for a paint: 'cr-red cr-b'. */
export const paintClass = (p) => (p ? [p.color ? 'cr-' + p.color : '', p.bold ? 'cr-b' : ''].filter(Boolean).join(' ') : '');

/** Colour rules with anything that no longer exists taken out. fields: colorFields(); colKeys: Set of column keys. */
export function cleanColors(list, fields, colKeys) {
  const byId = fields ? new Map(fields.map((x) => [x.id, x])) : null; // null: don't check fields
  return (Array.isArray(list) ? list : []).slice(0, MAX_COLOR_RULES).map((r, i) => {
    if (!r || typeof r !== 'object') return null;
    const conds = (Array.isArray(r.conds) ? r.conds : []).slice(0, MAX_COLOR_CONDS).map((c) => {
      if (!c || typeof c !== 'object') return null;
      if (!c.field || typeof c.field !== 'string') return { field: '', op: '', value: '' };
      const fx = byId && byId.get(c.field);
      if (byId && !fx) return null; // the field was deleted
      const o = fx ? colorOp(fx.f, c.op) : typeof c.op === 'string' && c.op ? { key: c.op, value: 'any' } : null;
      const value = !o || !o.value ? '' : Array.isArray(c.value) ? c.value.filter((x) => typeof x === 'string').slice(0, 50) : typeof c.value === 'number' || typeof c.value === 'string' ? (typeof c.value === 'string' ? c.value.slice(0, 200) : c.value) : '';
      return { field: c.field, op: o ? o.key : '', value };
    }).filter(Boolean);
    const cell = typeof r.cell === 'string' && r.cell && (!colKeys || colKeys.has(r.cell)) ? r.cell : '';
    return { id: typeof r.id === 'string' && r.id ? r.id.slice(0, 40) : 'cr' + i, conds, color: TINT.has(r.color) ? r.color : '', bold: !!r.bold, cell };
  }).filter(Boolean);
}

/** For saving (listViews/{id}.colors): only what's needed. */
export const colorsDoc = (list) => (list || []).map((r) => ({ id: r.id, conds: r.conds.map((c) => ({ field: c.field, op: c.op, value: c.value ?? '' })), color: r.color, bold: !!r.bold, cell: r.cell || '' }));

/** "Due date is before today" — for the rule's summary line. */
export function condText(c, fields) {
  const fx = (fields || []).find((x) => x.id === c.field);
  if (!fx) return '';
  const o = colorOp(fx.f, c.op);
  if (!o) return fx.label;
  if (o.value === 'days') return `${fx.label} ${o.label.replace('…', c.value === '' || c.value == null ? '…' : String(c.value))}`;
  const v = Array.isArray(c.value) ? c.value.join(', ') : c.value;
  return `${fx.label} ${o.label}${o.value && v !== '' && v != null ? ' ' + v : ''}`;
}
