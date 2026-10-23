// Lookup fields: show a value from another record, always current.
//   { type: 'lookup', via: [step, step?], show: '<fieldId on the record reached>' }
//   step 'f:<fieldId>'  through a Link to record field on the form so far
//   step 'p:<formId>'   the record it sits under (its parent), when that's a record of formId
// Up to two steps (a Site visit → its Project → the Project's Client). Nothing is stored on
// records: the app and the server work it out (and the store fills it in for lists and filters).
// A linked record you can't see isn't in your data, so the lookup is empty rather than leaking.
// Pure, unit-tested; used by the app, the store and the server kit.

export const isLookup = (f) => !!f && f.type === 'lookup';
export const MAX_STEPS = 2;
export const pathOf = (f) => (Array.isArray(f?.via) ? f.via.filter((s) => typeof s === 'string' && /^[fp]:./.test(s)).slice(0, MAX_STEPS) : []);

/** The forms that hold this form as a child (sub-form grid or child records). */
export const parentFormsOf = (form, forms) => (forms || []).filter((p) => p && p.id !== form?.id && (p.children || []).some((c) => c.formId === form?.id));

/** One step from a form, statically: the form it reaches (null when the step no longer fits). */
export function stepForm(form, step, formById) {
  if (!form) return null;
  if (step.startsWith('f:')) {
    const lf = (form.fields || []).find((x) => x.id === step.slice(2) && x.type === 'relation');
    return (lf && formById(lf.relForm)) || null;
  }
  const pf = formById(step.slice(2));
  return pf && (pf.children || []).some((c) => c.formId === form.id) ? pf : null;
}

/** Which form and field a lookup shows: { form, field, forms: [each step's form] } or null when it's not set up (or broken). */
export function lookupTarget(form, f, formById) {
  const path = pathOf(f);
  if (!path.length || !f.show) return null;
  let cur = form;
  const forms = [];
  for (const s of path) { cur = stepForm(cur, s, formById); if (!cur) return null; forms.push(cur); }
  const field = (cur.fields || []).find((x) => x.id === f.show && x.type !== 'heading' && x.type !== 'instructions');
  return field ? { form: cur, field, forms } : null;
}

/** The record a lookup reaches from this record (null when a link is empty or the record isn't visible). */
export function lookupRecord(rec, f, recById) {
  let r = rec;
  for (const s of pathOf(f)) {
    if (!r) return null;
    if (s.startsWith('f:')) { const id = r.values?.[s.slice(2)]; r = typeof id === 'string' && id ? recById(id) || null : null; }
    else { const p = r.parentId ? recById(r.parentId) : null; r = p && p.formId === s.slice(2) ? p : null; }
  }
  return r && r !== rec ? r : null;
}

/**
 * The lookup's value for a record. h: { recById, formById, valOf?(field, rec, form) } — valOf works
 * out calculations; without it a calculation's value is empty. Lookups of lookups follow (3 deep).
 */
export function lookupValue(rec, f, h, depth = 0) {
  if (!rec || depth > 3) return null;
  const form = h.formById(rec.formId);
  const t = lookupTarget(form, f, h.formById);
  const r = t && lookupRecord(rec, f, h.recById);
  if (!r) return null;
  const g = t.field;
  if (g.type === 'lookup') return lookupValue(r, g, h, depth + 1);
  if (g.type === 'formula') return h.valOf ? h.valOf(g, r, t.form) ?? null : null;
  if (g.type === 'autonumber') return r.nums?.[g.id] ?? null;
  return r.values?.[g.id] ?? null;
}

/** The shown field, for formatting: follows lookups of lookups to a real field (or null). */
export function shownField(form, f, formById, depth = 0) {
  const t = lookupTarget(form, f, formById);
  if (!t) return null;
  return t.field.type === 'lookup' && depth < 3 ? shownField(t.form, t.field, formById, depth + 1) : t.field;
}

/** A record with its lookups filled in (stored-value targets; the same object when nothing changes). */
export function withLookups(rec, form, h) {
  const lk = (form?.fields || []).filter(isLookup);
  if (!rec || !lk.length) return rec;
  const values = { ...(rec.values || {}) };
  lk.forEach((f) => { const v = lookupValue(rec, f, h); if (v == null) delete values[f.id]; else values[f.id] = v; });
  return { ...rec, values };
}

/** Values to store: without lookups (they're worked out). Returns a new object. */
export function stripLookups(values, form) {
  const out = { ...(values || {}) };
  (form?.fields || []).forEach((f) => { if (isLookup(f)) delete out[f.id]; });
  return out;
}

/**
 * The designer's choices for Look up from: [{ via, label, form }]. One step: each Link to record
 * field and each parent form; two: the same again from there (not back to this form's own link).
 * stepName(form) names a parent step (its item name).
 */
export function lookupSources(form, forms, stepName = (p) => p.name) {
  const formById = (id) => (forms || []).find((x) => x.id === id) || (form && form.id === id ? form : null);
  const from = (fm) => [
    ...(fm.fields || []).filter((x) => x.type === 'relation' && formById(x.relForm)).map((x) => ({ step: 'f:' + x.id, label: x.label || 'Link', form: formById(x.relForm) })),
    ...parentFormsOf(fm, forms).map((p) => ({ step: 'p:' + p.id, label: stepName(p), form: p })),
  ];
  const out = [];
  from(form).forEach((a) => {
    out.push({ via: [a.step], label: a.label, form: a.form });
    from(a.form).forEach((b) => { if (b.form.id !== form.id || b.step.startsWith('f:')) out.push({ via: [a.step, b.step], label: a.label + ' → ' + b.label, form: b.form }); });
  });
  return out;
}

/** Fields a lookup can show from a form (anything that holds or works out a value). */
export const showable = (form) => (form?.fields || []).filter((x) => !['heading', 'instructions'].includes(x.type));
