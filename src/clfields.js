// A Checklist field's score, %, result and answers, as fields of their own: list columns,
// filters, colour rules, reports, rollups, form rules and automations can all use them like
// any other field. Pure functions (no DOM, no Firebase), shared with the server kit.
//
//   <field id>~score     Score            number   "14" (lists show "14 / 18")
//   <field id>~pct       %                percent  78
//   <field id>~result    Result           choice   Pass | Fail
//   <field id>~critical  Critical fail    Yes / No a critical question was failed
//   <field id>~passed    Pass rate        percent  100 when it passed, 0 when it failed: its average is the pass rate (reports, rollups)
//   <field id>~q<k>~<item id>   one question's answer. k: c choice (its answer's words) · n number · p percent · t text · d date
//
// Nothing extra is saved for these except what the checklist already keeps (checklistlogic.js
// cleanValue: s, the summary, and l, the words of each choice answer, so the server can compare
// answers without the checklist). Given the checklist (snap), values are worked out afresh.
import { summarize, visibleItems } from './checklistlogic.js';

export const SEP = '~';
const PARTS = [
  { part: 'score', label: 'Score', type: 'number' },
  { part: 'pct', label: '%', type: 'percent' },
  { part: 'result', label: 'Result', type: 'select', options: ['Pass', 'Fail'] },
  { part: 'critical', label: 'Critical fail', type: 'checkbox' },
  { part: 'passed', label: 'Pass rate', type: 'percent', report: true },
];
const PART = new Map(PARTS.map((p) => [p.part, p]));
const KIND = { choice: 'c', decimal: 'n', percent: 'p', text: 't', date: 'd' };
const KIND_TYPE = { c: 'select', n: 'decimal', p: 'percent', t: 'text', d: 'date' };

export const isClId = (id) => typeof id === 'string' && id.includes(SEP);
const clFieldsOf = (form) => (form?.fields || []).filter((f) => f.type === 'checklist');
const baseName = (f) => f.label || 'Checklist';

function partField(base, p) {
  return { id: base.id + SEP + p.part, type: p.type, label: `${baseName(base)} › ${p.label}`, ...(p.options ? { options: p.options } : {}), pseudo: true, virt: { of: base.id, part: p.part } };
}
function questionField(base, item) {
  const k = KIND[item.type];
  if (!k) return null;
  const options = k === 'c' ? [...new Set((item.opts || []).map((o) => String(o.label || '')).filter(Boolean))] : undefined;
  return { id: `${base.id}${SEP}q${k}${SEP}${item.id}`, type: KIND_TYPE[k], label: `${baseName(base)} › ${item.label || 'Question'}`, ...(options ? { options } : {}), pseudo: true, virt: { of: base.id, part: 'q', k, item: item.id, opts: item.opts || null } };
}

/**
 * The extra fields for a form's checklists. opts: { report: include Pass rate,
 * snapOf(field) → the checklist (latest version) to list its questions, or null }
 */
export function clFields(form, { report = false, snapOf = null } = {}) {
  const out = [];
  clFieldsOf(form).forEach((base) => {
    PARTS.forEach((p) => { if (!p.report || report) out.push(partField(base, p)); });
    const snap = snapOf ? snapOf(base) : null;
    (snap?.items || []).forEach((x) => { if (x.kind === 'item') { const q = questionField(base, x); if (q) out.push(q); } });
  });
  return out;
}
/** Just the part fields (Score, %, Result, Critical fail…) of one Checklist field, for list columns. */
export const partFieldsOf = (base, { report = false } = {}) => PARTS.filter((p) => !p.report || report).map((p) => partField(base, p));

/** The form with its checklists' extra fields added (like the workflow's Stage field). */
export function withClFields(form, opts) {
  if (!form || !clFieldsOf(form).length) return form;
  return { ...form, fields: [...(form.fields || []), ...clFields(form, opts)] };
}

/** One extra field from its id (questions too, without the checklist: their kind is in the id), or null. */
export function clField(form, id, snapOf = null) {
  if (!isClId(id)) return null;
  const [fid, rest, item] = id.split(SEP);
  const base = clFieldsOf(form).find((f) => f.id === fid);
  if (!base) return null;
  if (PART.has(rest) && item === undefined) return partField(base, PART.get(rest));
  const k = /^q([cnptd])$/.exec(rest || '')?.[1];
  if (!k || !item) return null;
  const snap = snapOf ? snapOf(base) : null;
  const x = (snap?.items || []).find((y) => y.id === item && y.kind === 'item');
  if (x && KIND[x.type] === k) return questionField(base, x);
  return { id, type: KIND_TYPE[k], label: `${baseName(base)} › Question`, pseudo: true, virt: { of: fid, part: 'q', k, item, opts: null } };
}

/** A form's field by id, the extra ones included. */
export const fieldOrCl = (form, id, snapOf = null) => (form?.fields || []).find((f) => f.id === id) || clField(form, id, snapOf);

const blankCl = (v) => !v || typeof v !== 'object' || !v.a || !Object.keys(v.a).length;

/** The summary to use: worked out from the checklist when given (while filling in), else the saved one. */
function summaryOf(v, snap) {
  if (snap) return summarize(snap, v);
  return v?.s || null;
}

/**
 * The value of an extra field, from the Checklist field's value v. snap: that value's checklist
 * version, when to hand (answers' words and a fresh summary); without it, what was saved.
 */
export function clValue(vf, v, snap = null) {
  const x = vf?.virt;
  if (!x || blankCl(v)) return x?.part === 'critical' ? false : null;
  if (x.part === 'q') {
    if (snap && !visibleItems(snap, v.a).has(x.item)) return null;
    const a = v.a[x.item];
    if (a == null || a === '') return null;
    if (x.k === 'c') {
      const item = snap ? (snap.items || []).find((y) => y.id === x.item) : null;
      const o = (item?.opts || x.opts || []).find((y) => y.id === a);
      return o ? String(o.label || '') || null : v.l?.[x.item] ?? null;
    }
    if (x.k === 'n' || x.k === 'p') { const n = Number(a); return Number.isFinite(n) ? n : null; }
    return String(a);
  }
  const s = summaryOf(v, snap);
  if (!s) return x.part === 'critical' ? false : null;
  if (x.part === 'score') return s.max > 0 ? s.score : null;
  if (x.part === 'pct') return typeof s.pct === 'number' ? s.pct : null;
  if (x.part === 'result') return s.result === 'pass' ? 'Pass' : s.result === 'fail' ? 'Fail' : null;
  if (x.part === 'passed') return s.result === 'pass' ? 100 : s.result === 'fail' ? 0 : null;
  if (x.part === 'critical') return !!s.critical;
  return null;
}

/** "14 / 18" for the Score column. */
export function scoreText(v, snap = null) {
  if (blankCl(v)) return '';
  const s = summaryOf(v, snap);
  if (!s || !(s.max > 0)) return '';
  const f = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ''));
  return `${f(s.score)} / ${f(s.max)}`;
}
