// The Calendar: which days a view shows, and what's on them.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { setCalendar, DEFAULT_CAL, parseLocal } from '../../src/cal.js';
import { viewRange, step, itemsFor, timeText, KINDS } from '../../src/callogic.js';

afterEach(() => setCalendar(DEFAULT_CAL));

test('month: whole weeks from the week-start day; week and list: the week', () => {
  const m = viewRange('month', '2026-10-20');
  assert.equal(m.title, 'October 2026');
  assert.equal(m.days[0], '2026-09-28');
  assert.equal(m.days.at(-1), '2026-11-01');
  assert.equal(m.days.length, 35);
  assert.equal(m.to, '2026-11-02');
  setCalendar({ weekStart: 0 });
  assert.equal(viewRange('month', '2026-10-20').days[0], '2026-09-27');
  const w = viewRange('week', '2026-10-20');
  assert.deepEqual([w.days[0], w.days.at(-1), w.title], ['2026-10-18', '2026-10-24', 'Oct 18 – 24, 2026']);
  setCalendar({});
  assert.equal(viewRange('list', '2026-10-31').title, 'Oct 26 – Nov 1, 2026');
  assert.equal(step('month', '2026-10-20', 1), '2026-11-01');
  assert.equal(step('month', '2026-01-15', -1), '2025-12-01');
  assert.equal(step('week', '2026-10-21', -1), '2026-10-12');
});

test('times read the usual way', () => {
  assert.deepEqual(['09:00', '13:30', '00:00', '12:00', 17, ''].map(timeText), ['9:00 a.m.', '1:30 p.m.', 'midnight', 'noon', '5:00 p.m.', '']);
});

const forms = {
  f_inv: { id: 'f_inv', name: 'Invoice', fields: [{ id: 'due', label: 'Due date', type: 'date', calendar: true }, { id: 'sent', label: 'Sent', type: 'date' }, { id: 'at', label: 'Meeting', type: 'datetime', calendar: true }] },
};
const recs = [
  { id: 'r1', formId: 'f_inv', values: { due: '2026-10-22', sent: '2026-10-21', at: '2026-10-23T14:30' } },
  { id: 'r2', formId: 'f_inv', values: { due: '2026-12-01' } },
];
const env = (o = {}) => ({
  me: 'me', today: '2026-10-20', tasks: [], wf: [], records: recs, formById: (id) => forms[id], recById: (id) => recs.find((r) => r.id === id), recTitle: (r) => 'INV-' + r.id, isAdmin: false,
  dashMails: {}, dashboards: [], automations: [], pendingSends: [], timeZone: 'America/Toronto', ...o,
});

test('form dates: only fields switched on, in range, with a time for date-and-time', () => {
  const r = viewRange('month', '2026-10-20');
  const out = itemsFor(env(), r).filter((x) => x.kind === 'rec');
  assert.deepEqual(out.map((x) => [x.day, x.time, x.title]), [['2026-10-22', '', 'INV-r1 · Due date'], ['2026-10-23', '14:30', 'INV-r1 · Meeting']]);
  assert.equal(out[0].go.recordId, 'r1');
});

test('tasks: due in range, done ones kept and marked, overdue ones marked late', () => {
  const tasks = [
    { id: 't1', title: 'Send invoice', due: '2026-10-20', time: '09:00', ownerId: 'amy', ownerName: 'Amy', assigneeId: 'me', recordId: 'r1' },
    { id: 't2', title: 'Old', due: '2026-10-02', ownerId: 'me' },
    { id: 't3', title: 'Finished', due: '2026-10-05', done: true, ownerId: 'me' },
    { id: 't4', title: 'Later', due: '2026-12-05', ownerId: 'me' },
    { id: 't5', title: 'No date', ownerId: 'me' },
    { id: 't6', title: 'Accounts work', due: '2026-10-21', assigneeRole: 'r_acc', assigneeRoleName: 'Accounts', ownerId: 'amy' },
  ];
  const out = itemsFor(env({ tasks }), viewRange('month', '2026-10-20')).filter((x) => x.kind === 'task');
  assert.deepEqual(out.map((x) => x.go.task), ['t2', 't3', 't1', 't6']);
  assert.equal(out[0].late, true);
  assert.equal(out[1].done, true);
  assert.equal(out[1].late, false);
  assert.match(out[2].meta, /from Amy · INV-r1/);
  assert.match(out[3].meta, /for Accounts/);
});

test('workflow due dates, late when past', () => {
  const wf = [{ rec: recs[0], form: forms.f_inv, due: '2026-10-19', stage: 'Approve', who: 'you' }, { rec: recs[1], form: forms.f_inv, due: '2026-10-26', stage: 'Send', who: 'anyone in Accounts' }];
  const out = itemsFor(env({ wf }), viewRange('month', '2026-10-20')).filter((x) => x.kind === 'wf');
  assert.deepEqual(out.map((x) => [x.day, x.title, x.late]), [['2026-10-19', 'INV-r1 · Approve', true], ['2026-10-26', 'INV-r2 · Send', false]]);
});

test('administrators: dashboard emails, scheduled automations with heads-up, date automations, OKs waiting', () => {
  const dashMails = { d1: { dashboardId: 'd1', on: true, freq: 'weekly', day: 1, hour: 8, to: { people: ['a', 'b'], addresses: 'x@y.example' } }, d2: { dashboardId: 'd2', on: false, freq: 'daily', hour: 8 } };
  const automations = [
    { id: 'm1', name: 'Month-end invoices', formId: 'f_inv', on: true, trigger: { type: 'schedule', freq: 'month', on: { kind: 'nth', nth: -1, what: 'biz' }, hour: 17, headsUp: true, approve: true } },
    { id: 'm2', name: 'Payment reminder', formId: 'f_inv', on: true, trigger: { type: 'date', dateField: 'due', rel: 'before', days: 3 } },
    { id: 'm3', name: 'Off', formId: 'f_inv', on: false, trigger: { type: 'schedule', freq: 'day', hour: 9 } },
  ];
  const e = env({ isAdmin: true, dashMails, dashboards: [{ id: 'd1', name: 'Billings' }], automations, pendingSends: [{ id: 'm1_r1', automationId: 'm1', recordId: 'r1' }] });
  const out = itemsFor(e, viewRange('month', '2026-10-20'));
  const rep = out.filter((x) => x.kind === 'rep');
  assert.deepEqual(rep.map((x) => x.day), ['2026-10-26'], 'from today on: past Mondays aren’t listed');
  assert.equal(rep[0].time, '08:00');
  assert.equal(rep[0].title, 'Billings');
  assert.match(rep[0].meta, /to 3 recipients/);
  const auto = out.filter((x) => x.kind === 'auto').map((x) => [x.day, x.time, x.title]);
  assert.deepEqual(auto, [['2026-10-29', '17:00', 'Heads-up: Month-end invoices'], ['2026-10-30', '17:00', 'Month-end invoices']], 'from today on (the Oct 19 reminder and September’s run are past)');
  const nov = itemsFor(e, viewRange('month', '2026-11-20')).filter((x) => x.kind === 'auto').map((x) => [x.day, x.title]);
  assert.ok(nov.some((x) => x[0] === '2026-11-28' && x[1] === 'Payment reminder · INV-r2'), 'three days before INV-r2 is due (Dec 1)');
  assert.ok(nov.some((x) => x[0] === '2026-11-30' && x[1] === 'Month-end invoices'));
  const ok = out.filter((x) => x.kind === 'ok');
  assert.deepEqual(ok.map((x) => [x.day, x.title]), [['2026-10-20', 'OK to send: INV-r1']]);
  assert.equal(itemsFor({ ...e, isAdmin: false }, viewRange('month', '2026-10-20')).filter((x) => ['rep', 'auto', 'ok'].includes(x.kind)).length, 0, 'members don’t see them');
});

test('a day’s order: all-day first, then by time', () => {
  const tasks = [{ id: 'a', title: 'B late', due: '2026-10-21', time: '15:00', ownerId: 'me' }, { id: 'b', title: 'A early', due: '2026-10-21', time: '08:30', ownerId: 'me' }, { id: 'c', title: 'All day', due: '2026-10-21', ownerId: 'me' }];
  assert.deepEqual(itemsFor(env({ tasks, records: [] }), viewRange('week', '2026-10-21')).map((x) => x.title), ['All day', 'A early', 'B late']);
  assert.equal(KINDS.length, 6);
});
