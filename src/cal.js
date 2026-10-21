// The company calendar for reports and dashboards: one time zone, the day weeks start on,
// and the month the fiscal year starts in (Settings → Dates and time, settings/calendar).
// Every period (This week, Last quarter…) and every bucket (a day, a week, a fiscal quarter)
// is worked out here, in the company's time zone, whatever the device's own clock says, so a
// bill at 11 p.m. lands on the same day for everyone. Pure functions; the server uses the
// same file (through fwkit) for dashboard emails. Unit-tested under several zones.

export const DEFAULT_CAL = Object.freeze({ timeZone: 'America/Toronto', weekStart: 1, fyStart: 1 });
let CAL = { ...DEFAULT_CAL };

const okZone = (z) => { try { new Intl.DateTimeFormat('en-US', { timeZone: z }); return true; } catch (e) { return false; } };

/** Tidy a saved calendar: { timeZone, weekStart: 0 (Sunday) | 1 (Monday), fyStart: 1-12 }. */
export function normalizeCal(c) {
  const x = c || {};
  return {
    timeZone: typeof x.timeZone === 'string' && x.timeZone && okZone(x.timeZone) ? x.timeZone : DEFAULT_CAL.timeZone,
    weekStart: x.weekStart === 0 || x.weekStart === '0' ? 0 : 1,
    fyStart: Number.isInteger(+x.fyStart) && +x.fyStart >= 1 && +x.fyStart <= 12 ? +x.fyStart : 1,
  };
}
/** Use this calendar from now on (the app does this when settings/calendar loads). */
export function setCalendar(c) { CAL = normalizeCal(c); cache.clear(); return CAL; }
export const getCalendar = () => CAL;

/* ---------- wall-clock time in the company's zone ---------- */

const fmts = new Map();
function fmtFor(tz) {
  if (!fmts.has(tz)) fmts.set(tz, new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' }));
  return fmts.get(tz);
}
const cache = new Map();
/** { y, m (0-11), d, h, mi, s, dow (0 Sunday) } for a moment, in the company's zone. */
export function wall(t) {
  const key = Math.floor(t / 1000);
  const hit = cache.get(key);
  if (hit) return hit;
  const p = {};
  fmtFor(CAL.timeZone).formatToParts(new Date(key * 1000)).forEach((x) => { if (x.type !== 'literal') p[x.type] = +x.value; });
  const out = { y: p.year, m: p.month - 1, d: p.day, h: p.hour % 24, mi: p.minute, s: p.second };
  out.dow = new Date(Date.UTC(out.y, out.m, out.d)).getUTCDay();
  if (cache.size > 20000) cache.clear();
  cache.set(key, out);
  return out;
}
const offsetAt = (t) => { const w = wall(t); return Date.UTC(w.y, w.m, w.d, w.h, w.mi, w.s) - Math.floor(t / 1000) * 1000; };
/**
 * The moment it's y-m-d h:mi on the company's clocks. Months and days may run over (month 12
 * is next January, day 0 the last day of the month before), like new Date(y, m, d).
 */
export function at(y, m, d = 1, h = 0, mi = 0) {
  const guess = Date.UTC(y, m, d, h, mi);
  const o1 = offsetAt(guess - 0);
  let t = guess - o1;
  const o2 = offsetAt(t);
  if (o2 !== o1) { const t2 = guess - o2; if (offsetAt(t2) === o2) t = t2; } // across a clock change
  return t;
}

/** '2026-10-05' → that day's midnight; '2026-10-05T14:30' → that time; both on the company's clocks. */
export function parseLocal(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(String(s || ''));
  if (!m) return null;
  return at(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0) + (m[6] ? +m[6] * 1000 : 0);
}
/** '2026-10-05' for a moment (its day on the company's clocks). */
export function dayKeyOf(t) { const w = wall(t); return `${w.y}-${String(w.m + 1).padStart(2, '0')}-${String(w.d).padStart(2, '0')}`; }

/* ---------- starts of days, weeks, months, quarters and years ---------- */

const fyM0 = () => CAL.fyStart - 1;
/** Months back from (y, m) to the start of its fiscal quarter or year. */
const qBack = (m) => (((m - fyM0()) % 3) + 3) % 3;
const yBack = (m) => (((m - fyM0()) % 12) + 12) % 12;

export const INTERVAL_IDS = ['day', 'week', 'month', 'quarter', 'year'];

/** The start of the day, week, month, fiscal quarter or fiscal year a moment falls in. */
export function startOf(t, iv) {
  const w = wall(t);
  if (iv === 'day') return at(w.y, w.m, w.d);
  if (iv === 'week') return at(w.y, w.m, w.d - ((w.dow - CAL.weekStart + 7) % 7));
  if (iv === 'quarter') return at(w.y, w.m - qBack(w.m), 1);
  if (iv === 'year') return at(w.y, w.m - yBack(w.m), 1);
  return at(w.y, w.m, 1);
}
/** The start of the period k after (or before, k < 0) the one starting at s. */
export function nextOf(s, iv, k = 1) {
  const w = wall(s);
  if (iv === 'day') return at(w.y, w.m, w.d + k);
  if (iv === 'week') return at(w.y, w.m, w.d + 7 * k);
  if (iv === 'quarter') return at(w.y, w.m + 3 * k, 1);
  if (iv === 'year') return at(w.y, w.m + 12 * k, 1);
  return at(w.y, w.m + k, 1);
}

/* ---------- names ---------- */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export { MON, MONTH };
export const fiscal = () => CAL.fyStart !== 1;
/** The fiscal year a moment is in, named by the calendar year it ends in (FY2027 runs Apr 2026 to Mar 2027). */
export function fyOf(t) { const w = wall(t); const sm = w.m - yBack(w.m); return fiscal() ? (sm < 0 ? w.y : w.y + 1) : w.y; }
/** 1-4: which (fiscal) quarter a moment is in. */
export function quarterOf(t) { const w = wall(t); return Math.floor(yBack(w.m) / 3) + 1; }

/** 'Oct 5, 2026' (with the weekday: 'Mon, Oct 5, 2026'). */
export function dayName(t, { weekday = false, year = true } = {}) {
  const w = wall(t);
  return `${weekday ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][w.dow] + ', ' : ''}${MON[w.m]} ${w.d}${year ? ', ' + w.y : ''}`;
}
/** A bucket's full name: 'Oct 5, 2026', 'Week of Oct 5, 2026', 'Oct 2026', 'Q4 2026' or 'Q2 FY2027', '2026' or 'FY2027'. */
export function bucketName(s, iv) {
  const w = wall(s);
  if (iv === 'day') return dayName(s);
  if (iv === 'week') return 'Week of ' + dayName(s);
  if (iv === 'quarter') return `Q${quarterOf(s)} ${fiscal() ? 'FY' + fyOf(s) : w.y}`;
  if (iv === 'year') return fiscal() ? 'FY' + fyOf(s) : String(w.y);
  return `${MON[w.m]} ${w.y}`;
}
/** A short axis label: 'Oct 5', 'Oct', 'Q4', '2026'; with the year ('’26') when the chart crosses years. */
export function axisName(s, iv, withYear) {
  const w = wall(s), yy = (n) => ' ’' + String(n).slice(2);
  if (iv === 'day' || iv === 'week') return `${MON[w.m]} ${w.d}` + (withYear ? yy(w.y) : '');
  if (iv === 'quarter') return `Q${quarterOf(s)}` + (fiscal() ? ' FY' + String(fyOf(s)).slice(2) : yy(w.y));
  if (iv === 'year') return fiscal() ? 'FY' + String(fyOf(s)).slice(2) : String(w.y);
  return MON[w.m] + (withYear ? yy(w.y) : '');
}
/** The year a bucket belongs to, for deciding whether axis labels need it. */
export const yearOf = (s, iv) => (iv === 'quarter' || iv === 'year') && fiscal() ? fyOf(s) : wall(s).y;

/** 'Oct 5 – 11, 2026', 'Sep 28 – Oct 4, 2026', 'Dec 28, 2026 – Jan 3, 2027' for [from, to). */
export function spanName(from, to) {
  const a = wall(from), b = wall(to - 1);
  if (a.y === b.y && a.m === b.m && a.d === b.d) return dayName(from);
  if (a.y !== b.y) return `${dayName(from)} – ${dayName(to - 1)}`;
  if (a.m === b.m) return `${MON[a.m]} ${a.d} – ${b.d}, ${a.y}`;
  return `${MON[a.m]} ${a.d} – ${MON[b.m]} ${b.d}, ${a.y}`;
}

/** Work something out under another calendar (Settings → Dates and time previews a change before it's saved). */
export function withCalendar(c, fn) {
  const prev = CAL;
  CAL = normalizeCal(c); cache.clear();
  try { return fn(); } finally { CAL = prev; cache.clear(); }
}
