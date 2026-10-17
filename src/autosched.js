// Automations on a schedule: "Every 2 weeks on Wednesday at 9:00 a.m., starting October 21, 2026".
// Pure date sums and wording (no DOM, no Firebase), unit-tested. The editor builds the schedule
// and says it back in English with the next few dates; the Cadence functions (through fwkit)
// use the same code to decide when to run and when to give the heads-up the day before.
//
//   trigger = { type: 'schedule',
//     freq: 'day' | 'week' | 'month' | 'quarter' | 'year',  n: every n of them (1 = every one),
//     weekdaysOnly (day: skip Saturdays and Sundays),
//     days: [1..7] (week: Monday = 1 … Sunday = 7),
//     on: { kind: 'date', day: 1–31 | 'last' } | { kind: 'nth', nth: 1–4 | -1, what: 1–7 | 'biz' }
//         (month, quarter, year: the 15th, the last day, the first Monday, the last business day),
//     qmonth: 'first' | 'last' (quarter: which month of the quarter),
//     month: 1–12 (year),
//     start: 'YYYY-MM-DD' (counting starts here, so "every 2 weeks" knows which weeks; nothing runs before it),
//     hour: 0–23, headsUp (email the owner the day before), approve (a task to OK each one) }
//
// Older automations saved { every: 'monthEnd' | 'monthEndBiz' }: normalize() reads them as
// every month on the last day / last business day.

export const FREQS = [
  { key: 'day', one: 'day', many: 'days', max: 365 },
  { key: 'week', one: 'week', many: 'weeks', max: 52 },
  { key: 'month', one: 'month', many: 'months', max: 24 },
  { key: 'quarter', one: 'quarter', many: 'quarters', max: 8 },
  { key: 'year', one: 'year', many: 'years', max: 10 },
];
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']; // index + 1 = day number
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const NTHS = [{ v: 1, label: 'first' }, { v: 2, label: 'second' }, { v: 3, label: 'third' }, { v: 4, label: 'fourth' }, { v: -1, label: 'last' }];
export const DEFAULT_HOUR = 17;

const pad = (n) => String(n).padStart(2, '0');
const utc = (key) => { const [y, m, d] = key.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const keyOf = (dt) => dt.toISOString().slice(0, 10);
export const addDays = (key, n) => keyOf(new Date(utc(key).getTime() + n * 864e5));
const isoDow = (key) => ((utc(key).getUTCDay() + 6) % 7) + 1; // Monday 1 … Sunday 7
const daysBetween = (a, b) => Math.round((utc(b) - utc(a)) / 864e5);
const monthIdx = (key) => { const [y, m] = key.split('-').map(Number); return y * 12 + (m - 1); };
const freqOf = (k) => FREQS.find((f) => f.key === k) || FREQS[2];

export const hourOf = (t) => { const h = Math.round(Number(t?.hour)); return Number.isFinite(h) && h >= 0 && h <= 23 ? h : DEFAULT_HOUR; };
export function lastDay(monthKey) { const [y, m] = monthKey.split('-').map(Number); return keyOf(new Date(Date.UTC(y, m, 0))); }

/** A schedule in today's shape, whatever was saved (older month-end automations included). */
export function normalize(t0) {
  const t = { ...(t0 || {}) };
  if (!t.freq) {
    t.freq = 'month';
    t.on = t.every === 'monthEnd' ? { kind: 'date', day: 'last' } : { kind: 'nth', nth: -1, what: 'biz' };
  }
  delete t.every;
  const f = freqOf(t.freq);
  t.freq = f.key;
  t.n = Math.min(f.max, Math.max(1, Math.round(Number(t.n) || 1)));
  t.hour = hourOf(t);
  if (t.freq === 'week') t.days = [...new Set((Array.isArray(t.days) ? t.days : []).map(Number).filter((d) => d >= 1 && d <= 7))].sort((a, b) => a - b);
  if (['month', 'quarter', 'year'].includes(t.freq)) {
    const o = t.on || {};
    t.on = o.kind === 'nth'
      ? { kind: 'nth', nth: [1, 2, 3, 4, -1].includes(Number(o.nth)) ? Number(o.nth) : 1, what: o.what === 'biz' ? 'biz' : Math.min(7, Math.max(1, Number(o.what) || 1)) }
      : { kind: 'date', day: o.day === 'last' ? 'last' : Math.min(31, Math.max(1, Math.round(Number(o.day) || 1))) };
  }
  if (t.freq === 'quarter') t.qmonth = t.qmonth === 'last' ? 'last' : 'first';
  if (t.freq === 'year') t.month = Math.min(12, Math.max(1, Math.round(Number(t.month) || 1)));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(t.start || ''))) delete t.start;
  return t;
}

/** Does this day of its month match "the 15th", "the last day", "the first Monday", "the last business day"? */
function onMatches(on, key) {
  const last = lastDay(key.slice(0, 7)), dom = Number(key.slice(8, 10));
  if (on.kind === 'date') return dom === (on.day === 'last' ? Number(last.slice(8)) : Math.min(on.day, Number(last.slice(8)))); // the 31st in a 30-day month: the 30th
  const hits = [];
  for (let d = 1; d <= Number(last.slice(8)); d++) {
    const k = key.slice(0, 8) + pad(d), w = isoDow(k);
    if (on.what === 'biz' ? w <= 5 : w === on.what) hits.push(d);
  }
  return dom === (on.nth === -1 ? hits[hits.length - 1] : hits[on.nth - 1]);
}

/** Is this calendar day ("2026-10-30") one it runs on? */
export function isRunDay(t0, key) {
  const t = normalize(t0);
  if (t.start && key < t.start) return false;
  const start = t.start || key; // without a start, "every n" counts from today: only n = 1 makes sense then (the editor asks for one)
  const every = (diff) => diff % t.n === 0;
  switch (t.freq) {
    case 'day':
      if (t.weekdaysOnly && isoDow(key) > 5) return false;
      return every(daysBetween(start, key));
    case 'week': {
      if (!t.days.includes(isoDow(key))) return false;
      const mon = (k) => addDays(k, 1 - isoDow(k));
      return every(daysBetween(mon(start), mon(key)) / 7);
    }
    case 'month':
      return every(monthIdx(key) - monthIdx(start)) && onMatches(t.on, key);
    case 'quarter': {
      const m = Number(key.slice(5, 7)), want = t.qmonth === 'last' ? [3, 6, 9, 12] : [1, 4, 7, 10];
      if (!want.includes(m)) return false;
      const q = (k) => Math.floor(monthIdx(k) / 3);
      return every(q(key) - q(start)) && onMatches(t.on, key);
    }
    case 'year':
      return Number(key.slice(5, 7)) === t.month && every(Number(key.slice(0, 4)) - Number(start.slice(0, 4))) && onMatches(t.on, key);
  }
  return false;
}

/**
 * What's due now. local = "2026-10-30T17:05" in the company time zone.
 * { period, run, headsUp, headsPeriod }: run stays true for the rest of the day (a missed hour is
 * caught up); the server keeps a mark per period (the run day) so each runs once.
 */
export function scheduleNow(t0, local) {
  const t = normalize(t0);
  const today = local.slice(0, 10), late = Number(local.slice(11, 13)) >= t.hour, tomorrow = addDays(today, 1);
  return { period: today, run: late && isRunDay(t, today), headsPeriod: tomorrow, headsUp: !!t.headsUp && t.freq !== 'day' && late && isRunDay(t, tomorrow) };
}

/** The next count run days on or after now (today only if its hour hasn't gone by). */
export function nextRuns(t0, local, count = 3) {
  const t = normalize(t0), out = [];
  let k = local.slice(0, 10);
  if (Number(local.slice(11, 13)) >= t.hour) k = addDays(k, 1);
  if (t.start && k < t.start) k = t.start;
  for (let i = 0; i < 12000 && out.length < count; i++, k = addDays(k, 1)) if (isRunDay(t, k)) out.push(k);
  return out;
}
export const nextRun = (t, local) => nextRuns(t, local, 1)[0] || null;

/* ---------- in English ---------- */
export function hourText(h) {
  const n = hourOf({ hour: h });
  return n === 0 ? 'midnight' : n === 12 ? 'noon' : `${n % 12}:00 ${n < 12 ? 'a.m.' : 'p.m.'}`;
}
/** "Friday, October 30, 2026" */
export const dayText = (key) => utc(key).toLocaleDateString('en-CA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
/** "Fri Oct 30" (this year) or "Fri Jan 29, 2027" */
export function shortDay(key, thisYear) {
  const d = utc(key), s = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).replace(',', '');
  return thisYear && key.slice(0, 4) === String(thisYear) ? s : `${s}, ${key.slice(0, 4)}`;
}
const longDate = (key) => utc(key).toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
export const ordinal = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const list = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
function onText(on) {
  if (on.kind === 'date') return on.day === 'last' ? 'the last day' : `the ${ordinal(on.day)}`;
  return `the ${NTHS.find((x) => x.v === on.nth)?.label || 'first'} ${on.what === 'biz' ? 'business day' : WEEKDAYS[on.what - 1]}`;
}

/** "Every 2 weeks on Wednesday and Friday at 9:00 a.m., starting October 21, 2026" */
export function scheduleText(t0) {
  const t = normalize(t0), f = freqOf(t.freq);
  const every = t.n === 1 ? `Every ${f.one}` : `Every ${t.n} ${f.many}`;
  let s;
  if (t.freq === 'day') s = t.n === 1 && t.weekdaysOnly ? 'Every weekday (Monday to Friday)' : every + (t.weekdaysOnly ? ', weekdays only' : '');
  else if (t.freq === 'week') s = `${every} on ${t.days.length ? list(t.days.map((d) => WEEKDAYS[d - 1])) : '(pick a day)'}`;
  else if (t.freq === 'month') s = `${every} on ${onText(t.on)}`;
  else if (t.freq === 'quarter') {
    const of = t.qmonth === 'last' ? 'last' : 'first';
    s = `${every} on ${onText(t.on)} of the quarter’s ${of} month`;
  } else s = `${every} on ${t.on.kind === 'date' && t.on.day !== 'last' ? `${MONTHS[t.month - 1]} ${t.on.day}` : `${onText(t.on)} of ${MONTHS[t.month - 1]}`}`;
  return `${s} at ${hourText(t.hour)}${t.n > 1 && t.start ? `, starting ${longDate(t.start)}` : ''}`;
}

/** Problems to fix before saving: [text]. */
export function scheduleProblems(t0) {
  const t = normalize(t0), out = [];
  const raw = Number(t0?.n);
  if (t0?.n != null && t0.n !== '' && (!Number.isInteger(raw) || raw < 1 || raw > freqOf(t.freq).max)) out.push(`“Every” must be a whole number from 1 to ${freqOf(t.freq).max}.`);
  if (t.freq === 'week' && !t.days.length) out.push('Pick at least one day of the week.');
  if (t.n > 1 && !t.start) out.push(`Pick a start date, so “every ${t.n} ${freqOf(t.freq).many}” knows where to count from.`);
  return out;
}
