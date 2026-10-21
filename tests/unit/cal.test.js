// The company calendar: time zone, week start and fiscal year. These run whatever the
// computer's own zone is (try TZ=Asia/Tokyo npm run test:unit): every answer comes from the
// company's zone, not the device's.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setCalendar, normalizeCal, wall, at, parseLocal, startOf, nextOf, bucketName, axisName, fyOf, quarterOf, spanName, dayKeyOf, DEFAULT_CAL } from '../../src/cal.js';
import { periodRange, PERIODS, periodName, bucketOf, kpiOf } from '../../src/dashlogic.js';
import { bucketsOf, autoInterval, MAX_POINTS, timeOf } from '../../src/reportlogic.js';

afterEach(() => setCalendar(DEFAULT_CAL));
const iso = (t) => new Date(t).toISOString();
const key = (t) => dayKeyOf(t);

test('a saved calendar is tidied: Toronto, Monday, January unless set', () => {
  assert.deepEqual(normalizeCal({}), { timeZone: 'America/Toronto', weekStart: 1, fyStart: 1 });
  assert.deepEqual(normalizeCal({ timeZone: 'Nowhere/Land', weekStart: 0, fyStart: 4 }), { timeZone: 'America/Toronto', weekStart: 0, fyStart: 4 });
  assert.equal(normalizeCal({ fyStart: 13 }).fyStart, 1);
});

test('wall-clock days come from the company’s zone, not the computer’s', () => {
  setCalendar({ timeZone: 'America/Toronto' });
  const bill = Date.parse('2026-10-06T03:30:00Z'); // 11:30 p.m. Oct 5 in Toronto
  assert.equal(key(bill), '2026-10-05');
  assert.equal(iso(startOf(bill, 'day')), '2026-10-05T04:00:00.000Z');
  setCalendar({ timeZone: 'Asia/Tokyo' });
  assert.equal(key(bill), '2026-10-06');
  assert.equal(iso(startOf(bill, 'day')), '2026-10-05T15:00:00.000Z');
  setCalendar({ timeZone: 'UTC' });
  assert.equal(iso(at(2026, 0, 31)), '2026-01-31T00:00:00.000Z');
  assert.equal(iso(at(2026, 12, 1)), '2027-01-01T00:00:00.000Z', 'months run over like new Date()');
});

test('dates typed into a form are read on the company’s clocks', () => {
  setCalendar({ timeZone: 'America/Toronto' });
  assert.equal(iso(parseLocal('2026-10-05')), '2026-10-05T04:00:00.000Z');
  assert.equal(iso(timeOf('2026-10-05T23:00')), '2026-10-06T03:00:00.000Z');
  assert.equal(iso(timeOf('2026-01-15')), '2026-01-15T05:00:00.000Z', 'winter: EST');
  assert.equal(timeOf('2026-10-06T03:30:00Z'), Date.parse('2026-10-06T03:30:00Z'), 'a time with its zone is kept');
});

test('clock changes: days are 23 or 25 hours, still one day each', () => {
  setCalendar({ timeZone: 'America/Toronto' });
  const s = at(2026, 2, 8); // DST starts Mar 8, 2026
  assert.equal((nextOf(s, 'day') - s) / 36e5, 23);
  const f = at(2026, 10, 1); // ends Nov 1
  assert.equal((nextOf(f, 'day') - f) / 36e5, 25);
  assert.equal(key(nextOf(f, 'day')), '2026-11-02');
});

test('weeks start on Monday, or Sunday when set', () => {
  const wed = parseLocal('2026-10-21');
  assert.equal(key(startOf(wed, 'week')), '2026-10-19');
  assert.equal(bucketName(startOf(wed, 'week'), 'week'), 'Week of Oct 19, 2026');
  setCalendar({ weekStart: 0 });
  assert.equal(key(startOf(parseLocal('2026-10-21'), 'week')), '2026-10-18');
  assert.equal(key(startOf(parseLocal('2026-10-18'), 'week')), '2026-10-18', 'a Sunday starts its own week');
  const r = periodRange('week', parseLocal('2026-10-21') + 9 * 36e5);
  assert.equal(spanName(r.from, r.to), 'Oct 18 – 24, 2026');
});

test('fiscal year: quarters and years follow the start month, named by the year they end in', () => {
  setCalendar({ fyStart: 4 }); // April
  const t = parseLocal('2026-10-21');
  assert.equal(key(startOf(t, 'quarter')), '2026-10-01');
  assert.equal(key(startOf(t, 'year')), '2026-04-01');
  assert.equal(fyOf(t), 2027);
  assert.equal(quarterOf(t), 3);
  assert.equal(bucketName(startOf(t, 'quarter'), 'quarter'), 'Q3 FY2027');
  assert.equal(bucketName(startOf(t, 'year'), 'year'), 'FY2027');
  assert.equal(axisName(startOf(t, 'quarter'), 'quarter'), 'Q3 FY27');
  const feb = parseLocal('2027-02-10');
  assert.equal(key(startOf(feb, 'year')), '2026-04-01');
  assert.equal(fyOf(feb), 2027);
  assert.equal(quarterOf(feb), 4);
  setCalendar({ fyStart: 2 }); // February: quarters Feb-Apr, May-Jul, Aug-Oct, Nov-Jan
  assert.equal(key(startOf(parseLocal('2027-01-15'), 'quarter')), '2026-11-01');
  assert.equal(key(startOf(parseLocal('2026-10-21'), 'quarter')), '2026-08-01');
  setCalendar({ fyStart: 1 });
  assert.equal(bucketName(startOf(t, 'quarter'), 'quarter'), 'Q4 2026');
});

test('every period, and the one before it', () => {
  const now = parseLocal('2026-10-21T14:00'); // a Wednesday
  const span = (k) => { const r = periodRange(k, now); return [key(r.from), key(r.to - 1), r.prevFrom == null ? null : key(r.prevFrom), r.prevTo == null ? null : key(r.prevTo - 1), r.label, r.prevLabel]; };
  assert.deepEqual(span('today'), ['2026-10-21', '2026-10-21', '2026-10-20', '2026-10-20', 'today', 'yesterday']);
  assert.deepEqual(span('yesterday'), ['2026-10-20', '2026-10-20', '2026-10-19', '2026-10-19', 'yesterday', 'the day before']);
  assert.deepEqual(span('7d'), ['2026-10-15', '2026-10-21', '2026-10-08', '2026-10-14', 'the last 7 days', 'the 7 days before']);
  assert.deepEqual(span('30d').slice(0, 2), ['2026-09-22', '2026-10-21']);
  assert.deepEqual(span('week'), ['2026-10-19', '2026-10-25', '2026-10-12', '2026-10-18', 'this week', 'last week']);
  assert.deepEqual(span('lastweek'), ['2026-10-12', '2026-10-18', '2026-10-05', '2026-10-11', 'last week', 'the week before']);
  assert.deepEqual(span('month'), ['2026-10-01', '2026-10-31', '2026-09-01', '2026-09-30', 'this month', 'last month']);
  assert.deepEqual(span('lastmonth'), ['2026-09-01', '2026-09-30', '2026-08-01', '2026-08-31', 'last month', 'the month before']);
  assert.deepEqual(span('quarter'), ['2026-10-01', '2026-12-31', '2026-07-01', '2026-09-30', 'this quarter', 'last quarter']);
  assert.deepEqual(span('lastquarter'), ['2026-07-01', '2026-09-30', '2026-04-01', '2026-06-30', 'last quarter', 'the quarter before']);
  assert.deepEqual(span('year'), ['2026-01-01', '2026-12-31', '2025-01-01', '2025-12-31', 'this year', 'last year']);
  assert.deepEqual(span('lastyear'), ['2025-01-01', '2025-12-31', '2024-01-01', '2024-12-31', 'last year', 'the year before']);
  assert.equal(periodRange('all', now), null);
  setCalendar({ fyStart: 4 });
  assert.deepEqual(span('year').slice(0, 2), ['2026-04-01', '2027-03-31']);
  assert.deepEqual(span('lastquarter').slice(0, 2), ['2026-07-01', '2026-09-30']);
  assert.equal(PERIODS.length, 14);
});

test('last month in January is December of the year before', () => {
  const r = periodRange('lastmonth', parseLocal('2027-01-03'));
  assert.deepEqual([key(r.from), key(r.to - 1)], ['2026-12-01', '2026-12-31']);
});

test('custom range: both days included; the period before is as long', () => {
  const now = parseLocal('2026-10-21');
  const r = periodRange('custom', now, { from: '2026-09-01', to: '2026-09-30' });
  assert.deepEqual([key(r.from), key(r.to - 1), key(r.prevFrom), key(r.prevTo - 1)], ['2026-09-01', '2026-09-30', '2026-08-02', '2026-08-31']);
  assert.equal(r.label, 'Sep 1 – 30, 2026');
  assert.equal(r.prevLabel, 'the 30 days before');
  assert.equal(periodName('custom', { from: '2026-09-01', to: '2026-09-30' }), 'Sep 1 – 30, 2026');
  const open = periodRange('custom', now, { from: '2026-09-01' });
  assert.equal(key(open.from), '2026-09-01');
  assert.equal(open.prevFrom, null);
  assert.equal(open.label, 'since Sep 1, 2026');
  assert.equal(periodRange('custom', now, { from: '2026-10-01', to: '2026-09-01' }), null, 'backwards: no range');
  assert.equal(periodRange('custom', now, {}), null);
  assert.equal(periodName('custom', {}), 'Custom range');
});

test('a bucket for a date, by day', () => {
  const t = parseLocal('2026-10-05T22:00');
  assert.deepEqual(bucketOf(t, 'day'), { k: 'Oct 5, 2026', s: parseLocal('2026-10-05') });
});

// charts over time
const F = { id: 'f', name: 'Bills', fields: [{ id: 'd', label: 'Date', type: 'date' }, { id: 'amt', label: 'Amount', type: 'number' }] };
const ctx = (records) => ({ forms: [F], records, formById: () => F, recById: (id) => records.find((r) => r.id === id) });
const rec = (id, d, amt = 10) => ({ id, formId: 'f', values: { d, amt } });
const def = (o) => ({ form: 'f', type: 'line', time: { form: 'f', id: 'd' }, measure: { fn: 'sum', ref: { form: 'f', id: 'amt' } }, ...o });

test('Auto picks days for a month, weeks for a quarter, months for a year', () => {
  assert.equal(autoInterval(parseLocal('2026-10-01'), parseLocal('2026-10-31')), 'day');
  assert.equal(autoInterval(parseLocal('2026-07-01'), parseLocal('2026-09-30')), 'week');
  assert.equal(autoInterval(parseLocal('2026-01-01'), parseLocal('2026-12-31')), 'month');
  assert.equal(autoInterval(parseLocal('2019-01-01'), parseLocal('2026-12-31')), 'quarter');
  const now = parseLocal('2026-10-21T12:00');
  const rs = [rec('a', '2026-10-01'), rec('b', '2026-10-05'), rec('c', '2026-10-05')];
  const r = periodRange('month', now);
  const b = bucketsOf(ctx(rs), def({ interval: 'auto' }), rs, now, { from: r.from, to: r.to });
  assert.equal(b.iv, 'day');
  assert.equal(b.length, 21, 'Oct 1 to today');
  assert.equal(b[4].value, 20);
});

test('too many points steps up (weeks to months) and says so', () => {
  const now = parseLocal('2026-10-21T12:00');
  const rs = [rec('a', '2019-04-01'), rec('b', '2026-10-01')];
  const b = bucketsOf(ctx(rs), def({ interval: 'week', span: 'fit' }), rs, now);
  assert.equal(b.asked, 'week');
  assert.equal(b.iv, 'month');
  assert.equal(b.stepped, true);
  assert.ok(b.length <= MAX_POINTS);
  const d = bucketsOf(ctx(rs), def({ interval: 'day', span: 'fit' }), rs, now);
  assert.equal(d.iv, 'month', 'days over 7 years: months');
  const ok = bucketsOf(ctx(rs), def({ interval: 'month', span: 'fit' }), rs, now);
  assert.equal(ok.stepped, false);
});

test('the bucket still running is marked in progress', () => {
  const now = parseLocal('2026-10-21T12:00');
  const rs = [rec('a', '2026-10-20')];
  const r = periodRange('month', now);
  const b = bucketsOf(ctx(rs), def({ interval: 'week' }), rs, now, { from: r.from, to: r.to });
  assert.deepEqual(b.map((x) => x.partial), [false, false, false, true]);
  const last = periodRange('lastmonth', now);
  const p = bucketsOf(ctx(rs), def({ interval: 'week' }), rs, now, { from: last.from, to: last.to });
  assert.ok(p.every((x) => !x.partial), 'a closed month has nothing in progress');
});

test('a KPI compares with the period before, for any period', () => {
  const now = parseLocal('2026-10-21T12:00');
  const rs = [rec('a', '2026-09-03', 100), rec('b', '2026-09-20', 50), rec('c', '2026-08-15', 120)];
  const c = ctx(rs);
  const kd = { form: 'f', type: 'kpi', measure: { fn: 'sum', ref: { form: 'f', id: 'amt' } }, dateRef: { form: 'f', id: 'd' }, compare: true };
  const r = periodRange('lastmonth', now);
  const k = kpiOf(c, kd, { periodKey: 'lastmonth', range: { from: r.from, to: r.to }, fields: [] }, now);
  assert.equal(k.value, 150);
  assert.equal(k.prev, 120);
  assert.equal(Math.round(k.delta), 25);
  assert.equal(k.prevLabel, 'the month before');
});

test('Settings → Dates and time previews a calendar without changing the one in use', async () => {
  const { periodRangeFor } = await import('../../src/calpreview.js');
  const now = parseLocal('2026-10-21T12:00');
  const p = periodRangeFor({ weekStart: 0, fyStart: 4, timeZone: 'America/Toronto' }, now);
  assert.deepEqual(p.rows, [['Today', 'Wed, Oct 21, 2026'], ['This week', 'Oct 18 – 24, 2026'], ['This quarter', 'Q3 FY2027: Oct 1 – Dec 31, 2026'], ['This year', 'FY2027: Apr 1, 2026 – Mar 31, 2027']]);
  assert.equal(p.fyExample, 'FY2027 runs April 2026 to March 2027');
  assert.equal(key(startOf(now, 'week')), '2026-10-19', 'the calendar in use is unchanged (Monday)');
  assert.equal(periodRangeFor({}, now).fyExample, 'the year runs January to December');
});
