import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportSheets, templateSheets, planImport, copyName, COLS } from '../../src/checklistio.js';

let n = 0; const uid = () => 'u' + (++n);
const PFN = { id: 'as_pfn', name: 'Pass / Fail / N/A', options: [{ id: 'p', label: 'Pass', score: 1, fail: false }, { id: 'f', label: 'Fail', score: 0, fail: true }, { id: 'na', label: 'N/A', score: null, fail: false }] };
const existing = {
  types: [{ id: 't1', name: 'Safety inspections' }],
  sets: [PFN],
  checklists: [{ id: 'c1', name: 'Daily site walk', typeId: 't1', ver: 3, passAt: 80, items: [
    { id: 's1', kind: 'section', label: 'Access' },
    { id: 'i1', kind: 'item', label: 'Walkways clear', set: 'as_pfn', required: true, critical: false, onFail: { comment: 'req', photo: 'ask' }, help: 'Stairs', showIf: null },
    { id: 'i2', kind: 'item', label: 'Expiry date', set: 'date', required: false, critical: false, onFail: { comment: '', photo: '' }, help: '', showIf: { item: 'i1', any: ['f'] } },
  ] }],
};
const head = (rows) => [COLS, ...rows];

test('export: one row per item, the answer sets it uses, a guide', () => {
  const sh = exportSheets(existing);
  assert.deepEqual(sh.map((s) => s.name), ['Checklists', 'Answer sets', 'How to fill this in']);
  assert.deepEqual(sh[0].rows[1], ['Safety inspections', 'Daily site walk', 80, 'Access', 'Walkways clear', 'Pass / Fail / N/A', 'Yes', '', 'comment required, photo', 'Stairs', '']);
  assert.equal(sh[0].rows[2][10], 'Walkways clear = Fail');
  assert.equal(sh[0].rows[2][5], 'Date');
  assert.equal(sh[1].rows.length, 4, 'Pass / Fail / N/A: three answers');
  assert.deepEqual(sh[1].rows[3], ['Pass / Fail / N/A', 'N/A', '', '']);
});

test('export, then import: the same checklist comes back as an update, answer set unchanged', () => {
  const sh = exportSheets(existing).map((s) => ({ ...s, rows: s.rows.map((r) => r.map((c) => (c && typeof c === 'object' ? c.v : c))) }));
  const plan = planImport(sh, existing, { uid });
  assert.equal(plan.error, undefined);
  assert.deepEqual(plan.problems, []);
  assert.equal(plan.sets[0].status, 'same');
  assert.equal(plan.types[0].status, 'same');
  const c = plan.checklists[0];
  assert.equal(c.status, 'update');
  assert.equal(c.existingId, 'c1');
  assert.equal(c.passAt, 80);
  assert.deepEqual(c.items.map((x) => x.kind === 'section' ? '§' + x.label : x.label), ['§Access', 'Walkways clear', 'Expiry date']);
  const [, i1, i2] = c.items;
  assert.equal(i1.id, 'i1', 'items keep their ids when the question matches');
  assert.deepEqual(i1.onFail, { comment: 'req', photo: 'ask' });
  assert.deepEqual(i2.showIf, { item: 'i1', any: ['f'] });
});

test('the template reads back: new types, new answer sets, nothing to fix', () => {
  const sh = templateSheets().map((s) => ({ ...s, rows: s.rows.map((r) => r.map((c) => (c && typeof c === 'object' ? c.v : c))) }));
  const plan = planImport(sh, { types: [], sets: [], checklists: [] }, { uid });
  assert.deepEqual(plan.problems, []);
  assert.deepEqual(plan.types.map((t) => [t.name, t.status]), [['Safety inspections', 'new'], ['Vehicle checks', 'new']]);
  assert.deepEqual(plan.checklists.map((c) => [c.name, c.status, c.items.length]), [['Daily site walk', 'new', 6], ['Pre-trip', 'new', 1]]);
  assert.equal(plan.sets.length, 3);
  assert.ok(plan.sets.every((s) => s.status === 'new'));
  const walk = plan.checklists[0];
  assert.equal(walk.items[3].showIf.item, walk.items[2].id, 'Show only if, by question');
  assert.equal(walk.items[3].set, 'date');
  assert.equal(walk.items[2].critical, true);
});

test('problems point to the row, and those rows are left out', () => {
  const plan = planImport([{ name: 'Checklists', rows: head([
    ['Safety inspections', 'Walk', 'lots', '', 'Q1', 'Pass / Fail / N/A', 'yes', '', '', '', ''],
    ['Safety inspections', 'Walk', '', '', 'Q2', 'Yes / Maybe', '', '', '', '', ''],
    ['Safety inspections', 'Walk', '', '', '', 'Text', '', '', '', '', ''],
    ['Safety inspections', 'Walk', '', '', 'Q3', 'Text', '', 'Yes', 'comment', '', 'Q9 = Fail'],
    ['Safety inspections', 'Walk', '', '', 'Q4', 'Text', '', '', '', '', 'Q1 = Maybe'],
    ['', '', '', '', '', '', '', '', '', '', ''],
  ]) }], existing, { uid });
  const rows = plan.problems.map((p) => p.row);
  assert.deepEqual(rows, [2, 3, 4, 5, 5, 6]);
  assert.match(plan.problems[1].msg, /“Yes \/ Maybe” isn’t an answer set/);
  assert.equal(plan.checklists[0].items.length, 3, 'Q1, Q3 and Q4 come in');
  assert.equal(plan.checklists[0].items[1].critical, false, 'Critical needs answers that can fail');
  assert.equal(plan.checklists[0].items[2].showIf, null);
});

test('into one type: the Type column can be left out; a changed answer set is noticed', () => {
  const plan = planImport([
    { name: 'Checklists', rows: [['Checklist', 'Question', 'Answers'], ['Daily site walk', 'Walkways clear', 'Pass / Fail / N/A'], ['Scaffold', 'Ties in place', 'pass/fail/n/a']] },
    { name: 'Answer sets', rows: [['Answer set', 'Answer', 'Score', 'Fail'], ['Pass / Fail / N/A', 'Pass', 2, ''], ['Pass / Fail / N/A', 'Fail', 0, 'yes'], ['Pass / Fail / N/A', 'N/A', '', '']] },
  ], existing, { intoType: 't1', uid });
  assert.deepEqual(plan.problems, []);
  assert.deepEqual(plan.checklists.map((c) => [c.name, c.status, c.typeId]), [['Daily site walk', 'update', 't1'], ['Scaffold', 'new', 't1']]);
  assert.equal(plan.sets[0].status, 'changed');
  assert.deepEqual(plan.sets[0].options.map((o) => o.id), ['p', 'f', 'na'], 'answers keep their ids');
  assert.match(planImport([{ name: 'X', rows: [['Checklist', 'Question']] }], existing, { uid }).error, /Type column/);
  assert.match(planImport([{ name: 'X', rows: [['Nothing']] }], existing, { uid }).error, /no Checklists sheet/);
  assert.equal(copyName('Daily site walk', ['Daily site walk', 'Daily site walk (2)']), 'Daily site walk (3)');
});
