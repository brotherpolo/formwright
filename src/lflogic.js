// Live filters: a dashboard tile that filters the reports on it by any field, live, for whoever
// is looking. Pure functions, unit-tested; the tile itself is drawn in dash.js.
//
// tile.filter = { ref: { form, id },        the field it filters by
//                 also: [ref],             the same thing on other forms, filtered together
//                 label?, show: 'list' | 'dropdown', pick: 'many' | 'one' }
// A report is reached by the first of [ref, ...also] that's on its form or a form above it
// (an Invoices report is reached by Customer › Name, since every invoice belongs to a customer).
// Values compare as the text people see, so "Acme" on Customers and an Invoice's Client link
// to Acme match.
//
// A date field makes a date live filter: its pick is a period ({ period: 'lastmonth' }) or a
// range ({ period: 'custom', from, to }), counted with the company calendar, alongside the
// dashboard's own Period. People fields (Created by, Person responsible) offer "Me": each viewer
// sees their own records (the pick is stored as ME and read as whoever is looking).

import { fieldOf, valueOf, chainOf, titleFieldOf } from './reportlogic.js';
import { keysOf, chainFields, rowsFor, ffReach, periodRange, periodName } from './dashlogic.js';

export const ME = '@me';

export const lfRefs = (flt) => (flt && flt.ref ? [flt.ref, ...(flt.also || [])] : []);
const same = (a, b) => !!a && !!b && a.form === b.form && a.id === b.id;
export const refKeyOf = (r) => (r ? r.form + '.' + r.id : '');

/** The field (of refs) that reaches a report, or null. */
export function reachRef(ctx, def, refs) { return ffReach(ctx, def, { refs }); }

/** Can a live filter use this field? Choices, text, links, people, yes/no, numbers and dates; not colours. */
const usable = (x) => ['group', 'key', 'num', 'date'].includes(x.kind) && x.f.type !== 'color';
export const isDateField = (f) => !!f && (f.type === 'date' || f.type === 'datetime');
export const isPerson = (f) => !!f && f.type === 'owner';
/** Fields that can be filtered together: dates with dates, everything else with everything else. */
const family = (f) => (isDateField(f) ? 'date' : 'value');

/** The forms a dashboard's reports use, and the forms above them. */
export function dashForms(ctx, defs) {
  const out = [];
  (defs || []).forEach((d) => chainOf(ctx, d.form).forEach((fid) => { if (!out.includes(fid) && ctx.formById(fid)) out.push(fid); }));
  return out;
}

/** Fields to choose from: each form's own fields, [{ ref, f, form }], forms in the order given. */
export function lfChoices(ctx, formIds) {
  const out = [];
  (formIds || []).forEach((fid) => chainFields(ctx, fid).filter((x) => x.ref.form === fid && usable(x)).forEach((x) => out.push({ ref: x.ref, f: x.f, form: x.form })));
  return out;
}

/**
 * Fields on other forms of the dashboard that hold the same thing, to filter together:
 * [{ ref, f, form, why, on }]. why: 'link' (a link to the filter's form, when it filters by that
 * form's title), 'name' (same name and type): both start ticked; 'kind' (same type, another
 * name): offered unticked. Forms already reached through their links aren't listed.
 */
export function lfMatches(ctx, ref, formIds) {
  const f = fieldOf(ctx, ref), base = ctx.formById(ref?.form);
  if (!f || !base) return [];
  const isTitle = titleFieldOf(base)?.id === f.id;
  const name = String(f.label || '').trim().toLowerCase();
  const out = [];
  (formIds || []).forEach((fid) => {
    if (fid === ref.form || chainOf(ctx, fid).includes(ref.form)) return;
    const form = ctx.formById(fid);
    (form ? fieldsOf(form) : []).forEach((x) => {
      if (x.type === 'heading' || x.type === 'instructions') return;
      const r = { form: fid, id: x.id };
      if (isDateField(f)) { // dates: the same name is ticked; other dates are offered
        if (isDateField(x)) out.push({ ref: r, f: x, form, why: String(x.label || '').trim().toLowerCase() === name ? 'name' : 'kind', on: String(x.label || '').trim().toLowerCase() === name });
        return;
      }
      if (x.type === 'relation' && x.relForm === ref.form && isTitle) out.push({ ref: r, f: x, form, why: 'link', on: true });
      else if (x.type === f.type && String(x.label || '').trim().toLowerCase() === name) out.push({ ref: r, f: x, form, why: 'name', on: true });
      else if (x.type === f.type && ['select', 'radio', 'multiselect', 'relation', 'owner'].includes(x.type) && (x.type !== 'relation' || x.relForm === f.relForm)) out.push({ ref: r, f: x, form, why: 'kind', on: false });
    });
  });
  const rank = { link: 0, name: 1, kind: 2 };
  return out.sort((a, b) => rank[a.why] - rank[b.why]).slice(0, 12);
}

const fieldsOf = (form) => chainFieldsOwn(form);
function chainFieldsOwn(form) { return (form.fields || []).concat([{ id: '_created', label: 'Created on', type: 'date', system: true }, { id: '_updated', label: 'Last edited', type: 'date', system: true }, { id: '_owner', label: 'Created by', type: 'owner', system: true }]).concat(form.workflow?.on && (form.workflow.stages || []).length ? [{ id: '_assignee', label: 'Person responsible', type: 'owner', system: true }] : []); }

/** Any other field to add by hand (same family: dates with dates), not already in the filter: [{ ref, f, form }]. */
export function lfAddable(ctx, flt, formIds) {
  const f0 = fieldOf(ctx, flt?.ref); if (!f0) return [];
  const have = new Set(lfRefs(flt).map(refKeyOf));
  return lfChoices(ctx, formIds).filter((x) => x.ref.form !== flt.ref.form && !have.has(refKeyOf(x.ref)) && family(x.f) === family(f0));
}

/** The forms reached through links (below the filter's form), for "Also filters … through their link". */
export function lfThrough(ctx, ref, formIds) {
  return (formIds || []).filter((fid) => fid !== ref?.form && chainOf(ctx, fid).includes(ref?.form));
}

/** What the dashboard's reports get: [{ ref, refs, values, label, id }] for each live filter tile. */
export function lfExtra(ctx, tiles, picks, me = {}, now = Date.now()) {
  return (tiles || []).filter((t) => t.filter && t.filter.ref && fieldOf(ctx, t.filter.ref)).map((t) => {
    const base = { id: t.id, ref: t.filter.ref, refs: lfRefs(t.filter).filter((r) => fieldOf(ctx, r)), label: lfLabel(ctx, t.filter) };
    const p = picks && picks[t.id];
    if (isDateField(fieldOf(ctx, t.filter.ref))) {
      const r = p && p.period ? periodRange(p.period, now, p.period === 'custom' ? p : null) : null;
      return { ...base, values: [], range: r ? { from: r.from, to: r.to } : null, text: r ? periodName(p.period, p.period === 'custom' ? p : null) : '' };
    }
    const vals = Array.isArray(p) ? p : [];
    return { ...base, values: vals.map((v) => (v === ME ? me.name || '\u0000' : v)), text: vals.map((v) => (v === ME ? 'Me' : v)).join(', ') };
  });
}
export const lfLabel = (ctx, flt) => (flt?.label || fieldOf(ctx, flt?.ref)?.label || 'Filter');

/**
 * The values to pick from: [{ v, n }], n = how many records of countDef (the first report it
 * reaches) have it, under the other live filters and the period. Choices keep their order;
 * anything else is A to Z. Picked values always stay in the list.
 * opts: { countDef, others: extra.fields of the other live filters, range, picked: [v] }
 */
export function lfValues(ctx, flt, opts = {}) {
  const refs = lfRefs(flt).filter((r) => fieldOf(ctx, r));
  if (!refs.length) return [];
  const f0 = fieldOf(ctx, refs[0]);
  const set = new Set();
  if (f0.type === 'checkbox') ['Yes', 'No'].forEach((v) => set.add(v));
  (f0.options || []).forEach((v) => set.add(String(v)));
  refs.forEach((r) => {
    const f = fieldOf(ctx, r);
    ctx.records.filter((x) => x.formId === r.form).forEach((rec) => keysOf(ctx, f, valueOf(ctx, rec, r)).forEach((k) => { if (k !== '(blank)') set.add(k); }));
  });
  (opts.picked || []).filter((v) => v !== ME).forEach((v) => set.add(String(v)));
  const counts = new Map();
  const def = opts.countDef;
  const via = def ? reachRef(ctx, def, refs) : null;
  if (def && via) {
    const fv = fieldOf(ctx, via);
    rowsFor(ctx, def, { fields: opts.others || [], range: opts.range || null }).forEach((rec) => keysOf(ctx, fv, valueOf(ctx, rec, via)).forEach((k) => counts.set(k, (counts.get(k) || 0) + 1)));
  }
  const opt = (f0.options || []).map(String);
  const list = [...set];
  const pos = (v) => { const i = opt.indexOf(v); return i < 0 ? 1e6 : i; };
  list.sort((a, b) => pos(a) - pos(b) || a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  const out = list.map((v) => ({ v, n: def && via ? counts.get(v) || 0 : null }));
  // people: "Me" first, standing for whoever is looking
  if (isPerson(f0) && opts.me && opts.me.name) out.unshift({ v: ME, label: 'Me', n: def && via ? counts.get(opts.me.name) || 0 : null });
  return out;
}

/** Tidy a tile's filter settings. */
export function normalizeFilter(flt) {
  const x = flt || {};
  return {
    ref: x.ref && x.ref.form && x.ref.id ? { form: x.ref.form, id: x.ref.id } : null,
    also: (x.also || []).filter((r) => r && r.form && r.id && !same(r, x.ref)).map((r) => ({ form: r.form, id: r.id })).slice(0, 12),
    ...(x.label ? { label: String(x.label).slice(0, 60) } : {}),
    show: x.show === 'dropdown' ? 'dropdown' : 'list',
    pick: x.pick === 'one' ? 'one' : 'many',
  };
}

/** Turn a picked value on or off (one: only that value, or none). */
export function togglePick(list, v, pick) {
  const has = (list || []).includes(v);
  if (pick === 'one') return has ? [] : [v];
  return has ? list.filter((x) => x !== v) : [...(list || []), v];
}

/** The old "+ Filter by…" dropdowns as live filter tiles (dropdown, one value), across the top. */
export function fromOldFilters(fields, startX = 0) {
  return (fields || []).filter((r) => r && r.form && r.id).slice(0, 4).map((ref, i) => ({ id: 'lf-' + ref.form + '-' + ref.id, filter: { ref: { form: ref.form, id: ref.id }, also: [], show: 'dropdown', pick: 'one' }, x: startX + i * 6, y: 0, w: 6, h: 2 }));
}

/** A date live filter's pick, tidied: { period } or { period: 'custom', from, to }, or null. */
export function datePick(p) {
  if (!p || typeof p !== 'object' || !p.period) return null;
  if (p.period === 'custom') { const ok = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : ''; const from = ok(p.from), to = ok(p.to); return from || to ? { period: 'custom', from, to } : { period: 'custom', from: '', to: '' }; }
  return { period: String(p.period) };
}
