import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lastDay, normalize, isRunDay, scheduleNow, nextRuns, nextRun, hourText, dayText, shortDay, ordinal, scheduleText, scheduleProblems, hourOf } from '../../src/autosched.js';

const S = (o) => ({ type: 'schedule', hour: 17, ...o });
const runs = (t, from, n = 4) => nextRuns(t, from + 'T00:00', n);

test('last day of the month, leap years included', () => {
  assert.equal(lastDay('2026-10'), '2026-10-31');
  assert.equal(lastDay('2028-02'), '2028-02-29');
  assert.equal(lastDay('2026-02'), '2026-02-28');
});

test('older month-end automations read as every month on the last (business) day', () => {
  assert.deepEqual(normalize({ type: 'schedule', every: 'monthEndBiz', hour: 17 }), { type: 'schedule', freq: 'month', n: 1, hour: 17, on: { kind: 'nth', nth: -1, what: 'biz' } });
  assert.deepEqual(normalize({ every: 'monthEnd' }).on, { kind: 'date', day: 'last' });
  assert.equal(scheduleText({ every: 'monthEndBiz', hour: 17 }), 'Every month on the last business day at 5:00 p.m.');
  assert.deepEqual(runs({ every: 'monthEndBiz' }, '2026-10-01', 3), ['2026-10-30', '2026-11-30', '2026-12-31']);
});

test('daily: every day, every n days from the start, weekdays only', () => {
  assert.deepEqual(runs(S({ freq: 'day' }), '2026-10-17', 3), ['2026-10-17', '2026-10-18', '2026-10-19']);
  assert.deepEqual(runs(S({ freq: 'day', weekdaysOnly: true }), '2026-10-17', 3), ['2026-10-19', '2026-10-20', '2026-10-21']);
  assert.deepEqual(runs(S({ freq: 'day', n: 3, start: '2026-10-20' }), '2026-10-17', 3), ['2026-10-20', '2026-10-23', '2026-10-26']);
  assert.equal(scheduleText(S({ freq: 'day' })), 'Every day at 5:00 p.m.');
  assert.equal(scheduleText(S({ freq: 'day', weekdaysOnly: true })), 'Every weekday (Monday to Friday) at 5:00 p.m.');
  assert.equal(scheduleText(S({ freq: 'day', n: 3, start: '2026-10-20' })), 'Every 3 days at 5:00 p.m., starting October 20, 2026');
});

test('weekly: chosen days, every n weeks counted from the start week', () => {
  const wed = S({ freq: 'week', days: [3], hour: 9 });
  assert.deepEqual(runs(wed, '2026-10-17', 3), ['2026-10-21', '2026-10-28', '2026-11-04']);
  assert.equal(scheduleText(wed), 'Every week on Wednesday at 9:00 a.m.');
  const two = S({ freq: 'week', n: 2, days: [3, 5], hour: 9, start: '2026-10-21' });
  assert.deepEqual(runs(two, '2026-10-17', 4), ['2026-10-21', '2026-10-23', '2026-11-04', '2026-11-06']);
  assert.equal(scheduleText(two), 'Every 2 weeks on Wednesday and Friday at 9:00 a.m., starting October 21, 2026');
  // a start mid-week still counts that whole week as week one
  assert.deepEqual(runs(S({ freq: 'week', n: 2, days: [1, 5], start: '2026-10-22' }), '2026-10-22', 3), ['2026-10-23', '2026-11-02', '2026-11-06']);
  assert.equal(scheduleText(S({ freq: 'week', days: [1, 3, 5] })), 'Every week on Monday, Wednesday and Friday at 5:00 p.m.');
});

test('monthly: a day number (short months use their last day), the last day, the nth weekday or business day', () => {
  assert.deepEqual(runs(S({ freq: 'month', on: { kind: 'date', day: 31 } }), '2026-10-01', 3), ['2026-10-31', '2026-11-30', '2026-12-31']);
  assert.deepEqual(runs(S({ freq: 'month', on: { kind: 'date', day: 30 } }), '2027-02-01', 2), ['2027-02-28', '2027-03-30']);
  assert.deepEqual(runs(S({ freq: 'month', on: { kind: 'nth', nth: 1, what: 1 } }), '2026-10-01', 3), ['2026-10-05', '2026-11-02', '2026-12-07']);
  assert.deepEqual(runs(S({ freq: 'month', on: { kind: 'nth', nth: 1, what: 'biz' } }), '2026-11-01', 2), ['2026-11-02', '2026-12-01']);
  assert.deepEqual(runs(S({ freq: 'month', on: { kind: 'nth', nth: -1, what: 5 } }), '2026-10-01', 2), ['2026-10-30', '2026-11-27']);
  const q = S({ freq: 'month', n: 3, on: { kind: 'nth', nth: -1, what: 'biz' }, start: '2026-10-01' });
  assert.deepEqual(runs(q, '2026-10-01', 3), ['2026-10-30', '2027-01-29', '2027-04-30']);
  assert.equal(scheduleText(q), 'Every 3 months on the last business day at 5:00 p.m., starting October 1, 2026');
  assert.equal(scheduleText(S({ freq: 'month', on: { kind: 'date', day: 15 } })), 'Every month on the 15th at 5:00 p.m.');
  assert.equal(scheduleText(S({ freq: 'month', on: { kind: 'nth', nth: 2, what: 2 } })), 'Every month on the second Tuesday at 5:00 p.m.');
});

test('quarterly: calendar quarters, first or last month of the quarter', () => {
  const end = S({ freq: 'quarter', qmonth: 'last', on: { kind: 'nth', nth: -1, what: 'biz' } });
  assert.deepEqual(runs(end, '2026-10-01', 3), ['2026-12-31', '2027-03-31', '2027-06-30']);
  assert.equal(scheduleText(end), 'Every quarter on the last business day of the quarter’s last month at 5:00 p.m.');
  const first = S({ freq: 'quarter', qmonth: 'first', on: { kind: 'date', day: 1 } });
  assert.deepEqual(runs(first, '2026-10-17', 2), ['2027-01-01', '2027-04-01']);
  assert.deepEqual(runs(S({ freq: 'quarter', n: 2, qmonth: 'first', on: { kind: 'date', day: 15 }, start: '2026-10-01' }), '2026-10-01', 3), ['2026-10-15', '2027-04-15', '2027-10-15']);
});

test('yearly: a date, or the nth weekday of a month; every n years from the start', () => {
  assert.deepEqual(runs(S({ freq: 'year', month: 1, on: { kind: 'date', day: 15 } }), '2026-10-17', 2), ['2027-01-15', '2028-01-15']);
  assert.equal(scheduleText(S({ freq: 'year', month: 1, on: { kind: 'date', day: 15 } })), 'Every year on January 15 at 5:00 p.m.');
  const lab = S({ freq: 'year', month: 9, on: { kind: 'nth', nth: 1, what: 1 }, hour: 8 });
  assert.deepEqual(runs(lab, '2026-10-17', 2), ['2027-09-06', '2028-09-04']);
  assert.equal(scheduleText(lab), 'Every year on the first Monday of September at 8:00 a.m.');
  assert.deepEqual(runs(S({ freq: 'year', n: 2, month: 2, on: { kind: 'date', day: 'last' }, start: '2026-01-01' }), '2026-10-17', 2), ['2028-02-29', '2030-02-28']);
  assert.equal(scheduleText(S({ freq: 'year', month: 12, on: { kind: 'date', day: 'last' } })), 'Every year on the last day of December at 5:00 p.m.');
});

test('nothing runs before the start date', () => {
  assert.equal(isRunDay(S({ freq: 'day', start: '2026-11-01' }), '2026-10-31'), false);
  assert.deepEqual(runs(S({ freq: 'day', start: '2026-11-01' }), '2026-10-17', 1), ['2026-11-01']);
});

test('scheduleNow: at or after the hour on a run day; heads-up the day before (not for daily)', () => {
  const t = S({ freq: 'month', on: { kind: 'nth', nth: -1, what: 'biz' }, headsUp: true });
  assert.deepEqual(scheduleNow(t, '2026-10-30T16:59'), { period: '2026-10-30', run: false, headsPeriod: '2026-10-31', headsUp: false });
  assert.equal(scheduleNow(t, '2026-10-30T17:00').run, true);
  assert.equal(scheduleNow(t, '2026-10-30T23:00').run, true, 'a missed hour is caught up later that day');
  assert.deepEqual(scheduleNow(t, '2026-10-29T17:10'), { period: '2026-10-29', run: false, headsPeriod: '2026-10-30', headsUp: true });
  assert.equal(scheduleNow({ ...t, headsUp: false }, '2026-10-29T17:00').headsUp, false);
  assert.equal(scheduleNow(S({ freq: 'day', headsUp: true }), '2026-10-29T17:00').headsUp, false);
});

test('nextRun skips today once its hour has gone by', () => {
  const t = S({ freq: 'month', on: { kind: 'nth', nth: -1, what: 'biz' } });
  assert.equal(nextRun(t, '2026-10-30T16:00'), '2026-10-30');
  assert.equal(nextRun(t, '2026-10-30T17:00'), '2026-11-30');
});

test('problems before saving', () => {
  assert.deepEqual(scheduleProblems(S({ freq: 'week', days: [] })), ['Pick at least one day of the week.']);
  assert.match(scheduleProblems(S({ freq: 'month', n: 3, on: { kind: 'date', day: 1 } }))[0], /start date/);
  assert.match(scheduleProblems(S({ freq: 'month', n: 0 }))[0], /from 1 to 24/);
  assert.match(scheduleProblems(S({ freq: 'year', n: 11, start: '2026-01-01' }))[0], /from 1 to 10/);
  assert.deepEqual(scheduleProblems(S({ freq: 'month', on: { kind: 'date', day: 1 } })), []);
});

test('wording bits', () => {
  assert.equal(hourText(17), '5:00 p.m.');
  assert.equal(hourText(0), 'midnight');
  assert.equal(hourText(12), 'noon');
  assert.equal(hourOf({ hour: 'x' }), 17);
  assert.equal(dayText('2026-10-30'), 'Friday, October 30, 2026');
  assert.equal(shortDay('2026-10-30', 2026), 'Fri Oct 30');
  assert.equal(shortDay('2027-01-29', 2026), 'Fri Jan 29, 2027');
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(ordinal), ['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '31st']);
});
