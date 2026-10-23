// Default values, Read only fields and Instructions blocks (Form designer → a field's settings).
//   f.defaultValue  filled in on new records (date 'today', time and date & time 'now')
//   f.readOnly      people can't change it on the record
//   read only + a default = a fixed value: it belongs to the form, so every record shows the
//   form's current value (changing it in the designer changes it everywhere); it isn't stored
//   on records (stripFixed), and the app and the server overlay it (withFixed).
//   f.linkText      a read-only Website shows as a button with these words
//   Instructions    a layout item ({ type: 'instructions', label, text, html }): formatted text
//                   on the form; it holds no value.
// Pure, unit-tested; used by the app, the store and the server kit.

/** Layout items: they hold no value (Section heading, Instructions). */
export const LAYOUT = new Set(['heading', 'instructions']);
export const isLayout = (f) => !!f && LAYOUT.has(f.type);

/** Field types that can have a default value. */
export const DEFAULT_TYPES = new Set(['text', 'textarea', 'email', 'phone', 'url', 'number', 'decimal', 'currency', 'percent', 'rating', 'range', 'date', 'time', 'datetime', 'checkbox', 'select', 'radio', 'multiselect', 'color']);
export const canDefault = (f) => !!f && DEFAULT_TYPES.has(f.type);
/** Types that can be switched to Read only (calculations and auto numbers already are). */
export const canReadOnly = (f) => !!f && !isLayout(f) && !['formula', 'autonumber', 'lookup', 'rollup'].includes(f.type);

const NUMS = new Set(['number', 'decimal', 'currency', 'percent', 'rating', 'range']);
const blank = (v) => v == null || v === '' || (Array.isArray(v) && !v.length);
export const hasDefault = (f) => canDefault(f) && !blank(f.defaultValue);
export const isFixed = (f) => !!f && !!f.readOnly && hasDefault(f);
export const isReadOnly = (f) => !!f && !!f.readOnly && canReadOnly(f);

const pad = (n) => String(n).padStart(2, '0');
/** Now's date and time as { day: 'YYYY-MM-DD', time: 'HH:MM' }, in a time zone when given. */
export function clock(now = new Date(), timeZone) {
  if (timeZone) {
    try {
      const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now).map((x) => [x.type, x.value]));
      return { day: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
    } catch (e) { /* unknown zone: local time */ }
  }
  return { day: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`, time: `${pad(now.getHours())}:${pad(now.getMinutes())}` };
}

/** The field's default as a value (null when it has none, or it no longer fits the field). */
export function defaultFor(f, now = new Date(), timeZone) {
  if (!hasDefault(f)) return null;
  const v = f.defaultValue;
  const c = () => clock(now, timeZone);
  switch (f.type) {
    case 'date': return v === 'today' ? c().day : /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : null;
    case 'time': return v === 'now' ? c().time : /^\d{2}:\d{2}/.test(String(v)) ? String(v).slice(0, 5) : null;
    case 'datetime': { if (v === 'now') { const k = c(); return k.day + 'T' + k.time; } return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(String(v)) ? String(v).slice(0, 16) : null; }
    case 'checkbox': return v === true || v === 'yes' ? true : v === false || v === 'no' ? false : null;
    case 'select': case 'radio': return (f.options || []).includes(v) ? v : null;
    case 'multiselect': { const o = f.options || []; const l = (Array.isArray(v) ? v : [v]).filter((x) => o.includes(x)); return l.length ? l : null; }
    default:
      if (NUMS.has(f.type)) { const n = Number(v); return Number.isFinite(n) ? n : null; }
      return String(v);
  }
}

/** Values for a new record: each empty field with a default gets it. Returns a new object. */
export function withDefaults(values, form, now = new Date(), timeZone) {
  const out = { ...(values || {}) };
  (form?.fields || []).forEach((f) => { if (hasDefault(f) && blank(out[f.id])) { const d = defaultFor(f, now, timeZone); if (d != null) out[f.id] = d; } });
  return out;
}

/** A record as everyone sees it: fixed fields show the form's value. The same object when nothing changes. */
export function withFixed(rec, form, now = new Date(), timeZone) {
  const fx = (form?.fields || []).filter(isFixed);
  if (!rec || !fx.length) return rec;
  const values = { ...(rec.values || {}) };
  let changed = false;
  fx.forEach((f) => { const d = defaultFor(f, now, timeZone); if (JSON.stringify(values[f.id] ?? null) !== JSON.stringify(d)) { values[f.id] = d; changed = true; } });
  return changed ? { ...rec, values } : rec;
}

/** Values to store: without fixed fields (they come from the form). Returns a new object. */
export function stripFixed(values, form) {
  const out = { ...(values || {}) };
  (form?.fields || []).forEach((f) => { if (isFixed(f)) delete out[f.id]; });
  return out;
}

/** The designer's words for a default ('' when none), for the field list. */
export function defaultText(f) {
  if (!hasDefault(f)) return '';
  const v = f.defaultValue;
  if (v === 'today') return 'Today';
  if (v === 'now') return 'Now';
  if (f.type === 'checkbox') return v === true || v === 'yes' ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}
