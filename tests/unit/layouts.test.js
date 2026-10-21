// Board and Timeline (layoutlogic.js): settings, columns, where a card may go, spans, the window, ticks, drags.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardChoices, sumChoices, dateChoices, cleanLayout, boardColumns, targetsOf, keyOf, colSum, spanOf, windowOf, ticksOf, shiftSpan, dateValue, spanText, dayDiff, addDays } from '../../src/layoutlogic.js';
import { cleanConfig, sameConfig, viewDoc, configOfDoc } from '../../src/listlogic.js';

const stages = [
  { id: 's1', name: 'Draft', moves: [{ id: 'm1', label: 'Send for review', to: 's2', comment: false }] },
  { id: 's2', name: 'Review', moves: [{ id: 'm2', label: 'Approve', to: 's3', comment: false }, { id: 'm3', label: 'Send back', to: 's1', comment: true }] },
  { id: 's3', name: 'Approved', moves: [] },
];
const form = { id: 'f', name: 'Jobs', workflow: { on: true, stages }, fields: [
  { id: 'title', type: 'text', label: 'Title' }, { id: 'pri', type: 'select', label: 'Priority', options: ['High', 'Low'] },
  { id: 'paid', type: 'checkbox', label: 'Paid' }, { id: 'amt', type: 'currency', label: 'Amount' }, { id: 'tot', type: 'formula', label: 'Total', format: 'currency' },
  { id: 'start', type: 'date', label: 'Start' }, { id: 'due', type: 'datetime', label: 'Due' }, { id: 'h', type: 'heading', label: 'H' }] };
const plain = { ...form, workflow: null };
const R = (id, extra = {}, values = {}) => ({ id, formId: 'f', values, ...extra });

test('settings: what can make columns, totals and dates; tidy defaults', () => {
  assert.deepEqual(boardChoices(form).map((c) => c.id), ['_stage', 'pri', 'paid']);
  assert.deepEqual(boardChoices(plain).map((c) => c.id), ['pri', 'paid']);
  assert.deepEqual(sumChoices(form).map((c) => c.id), ['amt', 'tot']);
  assert.deepEqual(dateChoices(form).map((c) => c.id), ['start', 'due', '_created']);
  assert.deepEqual(cleanLayout(undefined, form), { kind: 'table', by: '_stage', sum: '', start: 'start', end: 'due', color: '_stage', zoom: 'month' }, 'first time: Start → Due');
  assert.deepEqual(cleanLayout({ kind: 'board', by: 'gone', sum: 'title', start: 'gone', end: 'start', color: '', zoom: 'year' }, form), { kind: 'board', by: '_stage', sum: '', start: 'start', end: '', color: '', zoom: 'month' }, 'what no longer fits falls back; an end the same as the start goes');
  assert.equal(cleanLayout({ kind: 'nope' }, form).kind, 'table');
  assert.equal(cleanLayout({ kind: 'board' }, { id: 'x', fields: [{ id: 't', type: 'text' }] }).by, '', 'nothing to make columns from');
});

test('board columns: stages in order (Not started only when needed); choices, old values, then empty', () => {
  const recs = [R('a', { stage: 's2' }), R('b', { stage: 's1' }), R('c', { stage: 's2' })];
  assert.deepEqual(boardColumns(form, '_stage', recs).map((c) => [c.key, c.label, c.recs.map((r) => r.id).join()]), [['s1', 'Draft', 'b'], ['s2', 'Review', 'a,c'], ['s3', 'Approved', '']]);
  assert.deepEqual(boardColumns(form, '_stage', [...recs, R('d'), R('e', { stage: 'gone' })]).map((c) => c.label), ['Not started', 'Draft', 'Review', 'Approved']);
  const cols = boardColumns(plain, 'pri', [R('a', {}, { pri: 'Low' }), R('b', {}, {}), R('c', {}, { pri: 'Urgent' })]);
  assert.deepEqual(cols.map((c) => [c.key, c.label, c.recs.length, !!c.old]), [['High', 'High', 0, false], ['Low', 'Low', 1, false], ['Urgent', 'Urgent', 1, true], ['', 'No priority', 1, false]]);
  assert.deepEqual(boardColumns(plain, 'paid', [R('a', {}, { paid: true }), R('b')]).map((c) => [c.key, c.recs.length]), [['Yes', 1], ['No', 1]], 'yes/no: unticked is No');
  assert.equal(keyOf(form, 'paid', R('a')), 'No');
});

test('where a card may go: a field to any other value; stages by their own moves', () => {
  const ed = { admin: false, canEdit: true, canWork: true };
  const t = targetsOf(plain, 'pri', R('a', {}, { pri: 'High' }), ed);
  assert.deepEqual([...t.entries()], [['Low', { kind: 'set', value: 'Low' }], ['', { kind: 'set', value: null }]]);
  assert.deepEqual([...targetsOf(plain, 'paid', R('a', {}, { paid: true }), ed).entries()], [['No', { kind: 'set', value: false }]]);
  assert.equal(targetsOf(plain, 'pri', R('a'), { ...ed, canEdit: false }).size, 0, 'read only: nowhere');
  const inReview = R('a', { stage: 's2' });
  const m = targetsOf(form, '_stage', inReview, ed);
  assert.deepEqual([...m.keys()], ['s3', 's1']);
  assert.equal(m.get('s1').move.comment, true, 'Send back asks why');
  assert.equal(targetsOf(form, '_stage', inReview, { ...ed, canWork: false }).size, 0, 'not theirs at this stage: nowhere');
  const admin = targetsOf(form, '_stage', R('a', { stage: 's1' }), { admin: true, canEdit: true, canWork: true });
  assert.deepEqual([...admin.entries()].map(([k, v]) => [k, v.kind]), [['s2', 'move'], ['s3', 'jump']], 'administrators can jump, with a reason');
  assert.deepEqual([...targetsOf(form, '_stage', R('n'), ed).entries()].map(([k, v]) => [k, v.kind]), [['s1', 'start']], 'not started: into the first stage');
});

test('a column’s total', () => {
  assert.equal(colSum([R('a', {}, { amt: 10 }), R('b', {}, { amt: '2.5' }), R('c')], 'amt', (r, f) => r.values[f]), 12.5);
  assert.equal(colSum([], '', () => 0), null);
});

test('timeline: spans, the window, ticks and drags', () => {
  const dayOf = (t) => new Date(t).toISOString().slice(0, 10);
  assert.deepEqual(spanOf(R('a', {}, { start: '2026-10-05', due: '2026-10-30T14:00' }), 'start', 'due', dayOf), { from: '2026-10-05', to: '2026-10-30', open: false });
  assert.deepEqual(spanOf(R('a', {}, { start: '2026-10-05' }), 'start', 'due', dayOf), { from: '2026-10-05', to: '2026-10-05', open: true }, 'no end yet');
  assert.deepEqual(spanOf(R('a', {}, { start: '2026-10-05', due: '2026-10-01' }), 'start', 'due', dayOf).to, '2026-10-05', 'an end before the start: one day');
  assert.equal(spanOf(R('a'), 'start', 'due', dayOf), null);
  assert.equal(spanOf(R('a', { createdAt: Date.UTC(2026, 0, 2) }), '_created', '', dayOf).from, '2026-01-02');
  const w = windowOf([{ from: '2026-10-05', to: '2026-10-30' }], '2026-10-21', 'month');
  assert.deepEqual([w.from, w.to, w.days], ['2026-09-21', '2026-11-13', 54]);
  assert.ok(windowOf([{ from: '2015-01-01', to: '2040-01-01' }], '2026-10-21').days <= 3 * 366 + 1, 'about three years at most');
  assert.equal(dayDiff('2026-02-27', '2026-03-02'), 3); assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  const wk = ticksOf({ from: '2026-10-01', to: '2026-10-31', days: 31 }, 'month', 1);
  assert.deepEqual(wk.map((t) => t.label), ['Oct 5', 'Oct 12', 'Oct 19', 'Oct 26'], 'weeks start Monday');
  assert.equal(ticksOf({ from: '2026-10-01', to: '2026-10-31', days: 31 }, 'month', 0)[0].label, 'Oct 4', 'or Sunday');
  assert.deepEqual(ticksOf({ from: '2026-11-15', to: '2027-02-15', days: 93 }, 'quarter').map((t) => t.label), ['Dec', 'Jan 2027', 'Feb']);
  assert.equal(ticksOf({ from: '2026-10-30', to: '2026-11-02', days: 4 }, 'week')[2].label, 'Sun 1');
  const s = { from: '2026-10-05', to: '2026-10-10' };
  assert.deepEqual(shiftSpan(s, 'move', 3), { from: '2026-10-08', to: '2026-10-13' });
  assert.deepEqual(shiftSpan(s, 'start', 2), { from: '2026-10-07', to: '2026-10-10' });
  assert.deepEqual(shiftSpan(s, 'start', 9), { from: '2026-10-10', to: '2026-10-10' }, 'never inside out');
  assert.deepEqual(shiftSpan(s, 'end', -9), { from: '2026-10-05', to: '2026-10-05' });
  assert.equal(dateValue('2026-10-30T14:30', '2026-11-02', 'datetime'), '2026-11-02T14:30', 'a date and time keeps its time');
  assert.equal(dateValue('', '2026-11-02', 'datetime'), '2026-11-02T09:00');
  assert.equal(dateValue('2026-10-30', '2026-11-02', 'date'), '2026-11-02');
  assert.deepEqual(['2026-10-05|2026-10-30', '2026-09-28|2026-10-04', '2026-12-28|2027-01-03', '2026-10-05|2026-10-05'].map((x) => { const [from, to] = x.split('|'); return spanText({ from, to }); }),
    ['Oct 5 – 30, 2026', 'Sep 28 – Oct 4, 2026', 'Dec 28, 2026 – Jan 3, 2027', 'Oct 5, 2026']);
});

test('a saved view keeps its layout; a table view saves as before', () => {
  const cat = [{ key: 'f:pri' }];
  const board = cleanConfig({ cols: ['f:pri'], layout: { kind: 'board', by: 'pri', sum: 'amt' } }, cat, plain);
  const doc = viewDoc({ formId: 'f', name: 'B', ownerId: 'u', shared: false, cfg: board, now: 1 });
  assert.deepEqual(doc.layout, { kind: 'board', by: 'pri', sum: 'amt', start: 'start', end: 'due', color: 'pri', zoom: 'month' });
  assert.ok(sameConfig(cleanConfig(configOfDoc(doc), cat, plain), board), 'reads back the same');
  const table = cleanConfig({ cols: ['f:pri'] }, cat, plain);
  assert.equal('layout' in viewDoc({ formId: 'f', name: 'T', ownerId: 'u', shared: false, cfg: table, now: 1 }), false, 'no layout on a table view');
  assert.ok(sameConfig(table, { ...table, layout: { ...table.layout, zoom: 'week' } }), 'a table doesn’t care how its timeline was set');
  assert.ok(!sameConfig(table, board));
});
