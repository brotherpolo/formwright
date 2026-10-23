// Record templates: a saved starting point for new records (+ New ▾ on a form's list).
// What goes in follows Duplicate (duplogic.js): typed values, choices, links, files and photos,
// and the sub-form rows. Left out: auto numbers, signatures, calculations, lookups, rollups,
// fixed read-only values (they come from the form), the title (typed fresh each time), and dates
// unless keepDates. The parent, child records and tasks aren't part of a template.
// Pure functions, unit-tested.
import { copyValues, relinkRow } from './duplogic.js';
import { isFixed } from './fixedlogic.js';

const DATES = new Set(['date', 'datetime', 'time']);
const blank = (v) => v == null || v === '' || (Array.isArray(v) && !v.length);

function trim(form, values, { keepDates, titleId }) {
  const out = copyValues(form, values, { suffix: '' });
  (form?.fields || []).forEach((f) => {
    if (isFixed(f) || f.id === titleId || (!keepDates && DATES.has(f.type))) delete out[f.id];
  });
  if (out._rich) { Object.keys(out._rich).forEach((k) => { if (!(k in out)) delete out._rich[k]; }); if (!Object.keys(out._rich).length) delete out._rich; }
  return out;
}

/**
 * A template from a record. grids: [{ form (the sub-form), rows: [records in order] }].
 * → { values, grids: { [subFormId]: [values, …] }, fields (how many filled in), rows }
 */
export function templateFrom(form, rec, grids = [], { keepDates = false, titleId = null } = {}) {
  const values = trim(form, rec?.values, { keepDates, titleId });
  const out = {};
  let rows = 0;
  grids.forEach(({ form: cf, rows: rs }) => {
    const list = (rs || []).map((r) => relinkRow(cf, trim(cf, r.values, { keepDates, titleId: null }), form.id, rec?.id)).filter((v) => Object.keys(v).some((k) => k !== '_rich' && !blank(v[k])));
    if (list.length) { out[cf.id] = list; rows += list.length; }
  });
  const fields = Object.keys(values).filter((k) => k !== '_rich' && !blank(values[k])).length;
  return { values, grids: out, fields, rows };
}

/**
 * What a new record starts with from a template, for this form as it is now: fields that have
 * since gone (or changed type) are dropped, and so are choices that are no longer options.
 * → { values, grids: { [subFormId]: [values, …] } }
 */
export function fromTemplate(form, tpl, subForm = () => null) {
  const fit = (fm, vals) => {
    const out = {};
    (fm?.fields || []).forEach((f) => {
      const v = vals?.[f.id];
      if (blank(v) || isFixed(f)) return;
      if ((f.type === 'select' || f.type === 'radio') && !(f.options || []).includes(v)) return;
      if (f.type === 'multiselect') { const l = (Array.isArray(v) ? v : []).filter((x) => (f.options || []).includes(x)); if (l.length) out[f.id] = l; return; }
      if (['autonumber', 'signature', 'formula', 'lookup', 'rollup', 'heading', 'instructions'].includes(f.type)) return;
      out[f.id] = JSON.parse(JSON.stringify(v));
    });
    const rich = vals?._rich;
    if (rich && typeof rich === 'object') { const r = {}; Object.keys(rich).forEach((k) => { if (k in out) r[k] = rich[k]; }); if (Object.keys(r).length) out._rich = r; }
    return out;
  };
  const grids = {};
  Object.entries(tpl?.grids || {}).forEach(([cid, rows]) => { const cf = subForm(cid); if (cf) grids[cid] = (rows || []).map((v) => fit(cf, v)); });
  return { values: fit(form, tpl?.values), grids };
}

/** "9 fields · 6 line items" for the menu. */
export function templateMeta(t, gridName = () => 'rows') {
  const parts = [];
  if (t.fields) parts.push(`${t.fields} field${t.fields === 1 ? '' : 's'}`);
  Object.entries(t.grids || {}).forEach(([cid, rows]) => { if (rows?.length) parts.push(`${rows.length} ${gridName(cid, rows.length)}`); });
  return parts.join(' · ') || 'Empty';
}
