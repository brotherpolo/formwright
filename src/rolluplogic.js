// Rollup fields: a value worked out from other records, always current.
//   { type: 'rollup', from: [step, step?], where: [{ field, op, value }], agg, of }
//   step 'c:<formId>'            records of that form under this one (its children)
//   step 'l:<formId>:<fieldId>'  records of that form whose Link to record field points here
//   agg  count | sum | avg | min | max | latest | earliest | list   (of: the field, except count)
//   where: conditions on the records counted, as in rules (rules.js testCond); all must hold.
// Two steps at most (a Client → its Projects → their Site visits). Nothing is stored; only records
// the viewer can see are in their data, so only those count. Pure, unit-tested; used by the app
// and the server kit.
import { testCond, opsFor } from './rules.js';

export const isRollup = (f) => !!f && f.type === 'rollup';
export const AGGS = [['count', 'Count'], ['sum', 'Sum'], ['avg', 'Average'], ['min', 'Min'], ['max', 'Max'], ['latest', 'Latest'], ['earliest', 'Earliest'], ['list', 'List']];
const AGG_WORD = Object.fromEntries(AGGS);
export const MAX_WHERE = 3;
export const pathOf = (f) => (Array.isArray(f?.from) ? f.from.filter((s) => typeof s === 'string' && /^(c:[^:]+|l:[^:]+:[^:]+)$/.test(s)).slice(0, 2) : []);

const NUMERIC = new Set(['number', 'decimal', 'currency', 'percent', 'rating', 'range']);
const DATEISH = new Set(['date', 'datetime', 'time']);
const numberish = (g) => NUMERIC.has(g.type) || (g.type === 'formula' && !['date', 'text'].includes(g.format || 'decimal'));
const dateish = (g) => DATEISH.has(g.type) || (g.type === 'formula' && g.format === 'date');
/** Fields a rollup can show for an aggregate (lookups count as the field they show: shown(g) gives it). */
export function ofFields(form, agg, shown = (g) => g) {
  const fs = (form?.fields || []).filter((g) => !['heading', 'instructions'].includes(g.type));
  if (agg === 'count') return [];
  if (['sum', 'avg', 'min', 'max'].includes(agg)) return fs.filter((g) => { const s = shown(g); return s && numberish(s); });
  if (agg === 'latest' || agg === 'earliest') return fs.filter((g) => { const s = shown(g); return s && dateish(s); });
  return fs.filter((g) => !['signature', 'file', 'image', 'attachments', 'checklist'].includes(g.type));
}

/** One step, statically: the form it reaches (null when it no longer fits). */
export function stepForm(form, step, formById) {
  if (!form) return null;
  if (step.startsWith('c:')) { const id = step.slice(2); return (form.children || []).some((c) => c.formId === id) ? formById(id) || null : null; }
  const [, fid, lf] = step.split(':');
  const t = formById(fid);
  return t && (t.fields || []).some((x) => x.id === lf && x.type === 'relation' && x.relForm === form.id) ? t : null;
}
/** Which form the rollup counts: { form, forms } or null when it isn't set up. */
export function rollupTarget(form, f, formById) {
  const path = pathOf(f);
  if (!path.length) return null;
  let cur = form; const forms = [];
  for (const s of path) { cur = stepForm(cur, s, formById); if (!cur) return null; forms.push(cur); }
  return { form: cur, forms };
}
/** The designer's choices for From: [{ from, label, form }]. */
export function rollupSources(form, forms, itemName = (x) => x.name) {
  const formById = (id) => (forms || []).find((x) => x.id === id) || null;
  const from = (fm) => [
    ...(fm.children || []).map((c) => formById(c.formId)).filter(Boolean).map((cf) => ({ step: 'c:' + cf.id, label: `${cf.name} under this ${itemName(fm).toLowerCase()}`, short: cf.name, form: cf })),
    ...(forms || []).flatMap((t) => (t.fields || []).filter((x) => x.type === 'relation' && x.relForm === fm.id).map((x) => ({ step: `l:${t.id}:${x.id}`, label: `${t.name} that link here (${x.label || 'Link'})`, short: `${t.name} (${x.label || 'Link'})`, form: t }))),
  ];
  const out = [];
  from(form).forEach((a) => {
    out.push({ from: [a.step], label: a.label, form: a.form });
    from(a.form).forEach((b) => { if (b.form.id !== form.id) out.push({ from: [a.step, b.step], label: `${a.short} → ${b.short}`, form: b.form }); });
  });
  return out;
}

/** The records a rollup counts, before its conditions. h: { childrenOf(id, formId), linksTo(id, formId, fieldId) }. */
export function rollupRecords(rec, f, h) {
  let cur = rec && rec.id ? [rec] : [];
  for (const s of pathOf(f)) {
    const next = new Map();
    cur.forEach((r) => {
      const got = s.startsWith('c:') ? h.childrenOf(r.id, s.slice(2)) : (() => { const [, fid, lf] = s.split(':'); return h.linksTo(r.id, fid, lf); })();
      (got || []).forEach((x) => next.set(x.id, x));
    });
    cur = [...next.values()];
  }
  return rec && rec.id ? cur : [];
}

/**
 * The rollup's value: a number (count, sum, avg, min, max), a date or time (latest, earliest),
 * or a list of texts (list); null when there's nothing to show (count and sum: 0).
 * h: { formById, childrenOf, linksTo, valOf(field, rec, form), fmt(field, v) }
 */
export function rollupValue(rec, f, h, depth = 0) {
  if (!rec || depth > 3) return null;
  const form = h.formById(rec.formId);
  const t = rollupTarget(form, f, h.formById);
  const agg = AGG_WORD[f.agg] ? f.agg : 'count';
  if (!t) return agg === 'count' || agg === 'sum' ? 0 : null;
  const byId = new Map((t.form.fields || []).map((x) => [x.id, x]));
  const conds = (f.where || []).filter((c) => c && byId.has(c.field)).slice(0, MAX_WHERE);
  const recs = rollupRecords(rec, f, h).filter((r) => conds.every((c) => { const g = byId.get(c.field); return testCond(c, h.valOf(g, r, t.form), g); }));
  if (agg === 'count') return recs.length;
  const g = byId.get(f.of);
  if (!g) return agg === 'sum' ? 0 : null;
  const vals = recs.map((r) => h.valOf(g, r, t.form)).filter((v) => v != null && v !== '' && !(Array.isArray(v) && !v.length));
  if (agg === 'list') {
    const out = [];
    vals.forEach((v) => (Array.isArray(v) ? v : [v]).forEach((x) => { const s = h.fmt ? h.fmt(g, x) : String(x); if (s && !out.includes(s)) out.push(s); }));
    return out.length ? out : null;
  }
  if (agg === 'latest' || agg === 'earliest') {
    const ds = vals.map(String).sort();
    return ds.length ? (agg === 'latest' ? ds[ds.length - 1] : ds[0]) : null;
  }
  const ns = vals.map(Number).filter(Number.isFinite);
  if (agg === 'sum') return ns.reduce((a, b) => a + b, 0);
  if (!ns.length) return null;
  if (agg === 'avg') return ns.reduce((a, b) => a + b, 0) / ns.length;
  return agg === 'min' ? Math.min(...ns) : Math.max(...ns);
}

/** The field a rollup's value formats as (count: none). */
export function rollupOf(form, f, formById) {
  const t = rollupTarget(form, f, formById);
  return t && f.agg !== 'count' ? (t.form.fields || []).find((x) => x.id === f.of) || null : null;
}

/** Words for what a rollup counts: "Count of Projects where Stage is In progress". */
export function rollupSummary(form, f, forms, itemName) {
  const src = rollupSources(form, forms, itemName).find((s) => s.from.join('|') === pathOf(f).join('|'));
  if (!src) return 'Not set up yet';
  const byId = new Map((src.form.fields || []).map((x) => [x.id, x]));
  const of = byId.get(f.of);
  const head = f.agg === 'count' || !f.agg ? `Count of ${src.form.name}` : `${AGG_WORD[f.agg]} of ${of ? of.label : '?'} across ${src.form.name}`;
  const ws = (f.where || []).filter((c) => byId.has(c.field)).map((c) => {
    const g = byId.get(c.field), op = opsFor(g)?.find((o) => o.key === c.op);
    const v = Array.isArray(c.value) ? c.value.join(', ') : c.value;
    return `${g.label} ${op ? op.label : c.op}${op && op.value ? ' ' + (v ?? '') : ''}`;
  });
  return head + (ws.length ? ' where ' + ws.join(' and ') : '') + (pathOf(f).length > 1 ? ` (${src.label})` : '');
}

/** Values to store: without rollups (they're worked out). */
export function stripRollups(values, form) {
  const out = { ...(values || {}) };
  (form?.fields || []).forEach((f) => { if (isRollup(f)) delete out[f.id]; });
  return out;
}

/** Fast lookups over a list of records, for rollups: { childrenOf, linksTo }. */
export function recordIndex(records) {
  const kids = new Map(), links = new Map();
  (records || []).forEach((r) => {
    if (r.parentId) { const k = r.parentId + '|' + r.formId; if (!kids.has(k)) kids.set(k, []); kids.get(k).push(r); }
    Object.entries(r.values || {}).forEach(([fid, v]) => { if (typeof v === 'string' && v) { const k = v + '|' + r.formId + '|' + fid; if (!links.has(k)) links.set(k, []); links.get(k).push(r); } });
  });
  return { childrenOf: (id, formId) => kids.get(id + '|' + formId) || [], linksTo: (id, formId, fieldId) => links.get(id + '|' + formId + '|' + fieldId) || [] };
}
