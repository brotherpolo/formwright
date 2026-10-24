import { test } from 'node:test';
import assert from 'node:assert/strict';
import { colorFields, colorOps, testColor, colorFires, paintOf, paintClass, cleanColors, colorsDoc, compareAs, hasPaint, condText } from '../../src/colorlogic.js';
import { cleanConfig, sameConfig, viewDoc, configOfDoc, defaultConfig } from '../../src/listlogic.js';

const today = '2026-10-23';
const F = {
  due: { id: 'due', type: 'date', label: 'Due date' },
  st: { id: 'st', type: 'select', label: 'Status', options: ['Open', 'Done'] },
  bud: { id: 'bud', type: 'currency', label: 'Budget' },
  nm: { id: 'nm', type: 'text', label: 'Name' },
  h: { id: 'h', type: 'heading', label: 'Section' },
  sig: { id: 'sig', type: 'signature', label: 'Sign' },
  lk: { id: 'lk', type: 'lookup', label: 'Client city', via: ['p:clients'], field: 'city' },
  ru: { id: 'ru', type: 'rollup', label: 'Open tasks', agg: 'count', from: ['c:tasks'] },
};
const form = { id: 'f1', name: 'Projects', fields: Object.values(F) };
const fields = colorFields(form, () => null, { id: '_stage', type: 'select', label: 'Stage', options: ['Draft', 'Review'], pseudo: true });

test('which fields colour rules can use', () => {
  const ids = fields.map((x) => x.id);
  assert.deepEqual(ids.filter((x) => ['h', 'sig'].includes(x)), [], 'not headings or signatures');
  assert.ok(ids.includes('due') && ids.includes('st') && ids.includes('ru') && ids.includes('_stage'));
  assert.ok(!ids.includes('lk'), 'a lookup whose source can’t be found is left out');
  assert.equal(compareAs(form, F.ru).type, 'number', 'a count compares as a number');
  assert.equal(compareAs(form, { id: 'x', type: 'rollup', agg: 'list' }).type, 'text');
});

test('dates against today', () => {
  assert.equal(colorOps(F.due)[0].key, 'past', 'today comparisons come first for dates');
  assert.ok(!colorOps(F.st).some((o) => o.key === 'past'));
  assert.equal(testColor({ op: 'past' }, '2026-10-22', F.due, today), true);
  assert.equal(testColor({ op: 'past' }, '2026-10-23', F.due, today), false);
  assert.equal(testColor({ op: 'past' }, '', F.due, today), false, 'no date: not overdue');
  assert.equal(testColor({ op: 'istoday' }, '2026-10-23T09:30', { type: 'datetime' }, today), true);
  assert.equal(testColor({ op: 'future' }, '2026-10-24', F.due, today), true);
  assert.equal(testColor({ op: 'next', value: 7 }, '2026-10-30', F.due, today), true);
  assert.equal(testColor({ op: 'next', value: 7 }, '2026-10-31', F.due, today), false);
  assert.equal(testColor({ op: 'next', value: 7 }, '2026-10-22', F.due, today), false, 'the past isn’t “next”');
  assert.equal(testColor({ op: 'next', value: '' }, '2026-10-24', F.due, today), false, 'unfinished');
  assert.equal(testColor({ op: 'last', value: 3 }, '2026-10-20', F.due, today), true);
  assert.equal(testColor({ op: 'last', value: 3 }, '2026-10-19', F.due, today), false);
  assert.equal(testColor({ op: 'next', value: 2 }, '2026-12-31', F.due, '2026-12-30'), true, 'across months');
  assert.equal(testColor({ op: 'before', value: '2026-11-01' }, '2026-10-30', F.due, today), true, 'the usual date comparisons still work');
});

test('the usual comparisons', () => {
  assert.equal(testColor({ op: 'is', value: 'Done' }, 'Done', F.st, today), true);
  assert.equal(testColor({ op: 'gt', value: 100000 }, 112000, F.bud, today), true);
  assert.equal(testColor({ op: 'gt', value: 100000 }, 2000, F.bud, today), false);
  assert.equal(testColor({ op: 'empty' }, '', F.nm, today), true);
  assert.equal(testColor({ op: '' }, 'x', F.nm, today), false);
});

test('rules: all conditions; the first row rule wins; cells on top', () => {
  const rec = { due: '2026-10-01', st: 'Open', bud: 120000, _stage: 'Review' };
  const look = (fid) => { const x = fields.find((y) => y.id === fid); return x ? { f: x.f, v: rec[fid] } : null; };
  const rules = [
    { id: 'a', conds: [{ field: 'due', op: 'past' }, { field: 'st', op: 'not', value: 'Done' }], color: 'red', bold: false, cell: '' },
    { id: 'b', conds: [{ field: 'st', op: 'is', value: 'Open' }], color: 'green', bold: false, cell: '' },
    { id: 'c', conds: [{ field: 'bud', op: 'gt', value: 100000 }], color: '', bold: true, cell: 'f:bud' },
    { id: 'd', conds: [{ field: 'bud', op: 'gt', value: 1 }], color: 'blue', bold: false, cell: 'f:bud' },
    { id: 'e', conds: [{ field: '_stage', op: 'is', value: 'Review' }], color: 'purple', bold: false, cell: 'title' },
    { id: 'f', conds: [{ field: '', op: '' }], color: 'grey', bold: false, cell: 'f:nm' },
    { id: 'g', conds: [{ field: 'gone', op: 'filled' }], color: 'grey', bold: false, cell: 'f:st' },
  ];
  const p = paintOf(rules, look, today);
  assert.deepEqual(p.row, { color: 'red', bold: false }, 'the first matching row rule');
  assert.deepEqual(p.cells['f:bud'], { color: '', bold: true }, 'the first matching rule for a cell');
  assert.equal(p.cells.title.color, 'purple', 'the workflow Stage');
  assert.equal(p.cells['f:nm'], undefined, 'an unfinished rule never fires');
  assert.equal(p.cells['f:st'], undefined, 'a deleted field never matches');
  assert.equal(paintClass(p.row), 'cr-red');
  assert.equal(paintClass({ color: 'green', bold: true }), 'cr-green cr-b');
  assert.equal(hasPaint(paintOf([], look, today)), false);
  rec.due = '2026-12-01';
  assert.equal(paintOf(rules, look, today).row.color, 'green', 'not overdue any more: the next rule');
  assert.equal(colorFires({ conds: [] }, look, today), false);
});

test('cleaning: deleted fields, bad colours, columns that are gone, limits', () => {
  const keys = new Set(['title', 'f:bud', 'f:st']);
  const out = cleanColors([
    { id: 'a', conds: [{ field: 'due', op: 'next', value: 7 }, { field: 'gone', op: 'is', value: 'x' }], color: 'pink', bold: 1, cell: 'f:nope' },
    { id: 'b', conds: [{ field: 'st', op: 'filled', value: 'left over' }], color: 'green', cell: 'f:bud' },
    null, 'junk',
  ], fields, keys);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0].conds, [{ field: 'due', op: 'next', value: 7 }], 'the deleted field’s condition is dropped');
  assert.equal(out[0].color, '', 'not one of the colours');
  assert.equal(out[0].bold, true);
  assert.equal(out[0].cell, '', 'a column that’s gone: the whole row');
  assert.equal(out[1].conds[0].value, '', 'a comparison with no value keeps none');
  assert.equal(out[1].cell, 'f:bud');
  assert.equal(cleanColors(Array.from({ length: 30 }, (_, i) => ({ id: 'r' + i, conds: [] })), fields, keys).length, 20, 'at most 20 rules');
  assert.equal(cleanColors(undefined, fields, keys).length, 0);
  assert.deepEqual(colorsDoc(out)[1], { id: 'b', conds: [{ field: 'st', op: 'filled', value: '' }], color: 'green', bold: false, cell: 'f:bud' });
  assert.equal(condText({ field: 'due', op: 'next', value: 7 }, fields), 'Due date is in the next 7 days');
  assert.equal(condText({ field: 'bud', op: 'gt', value: 5 }, fields), 'Budget more than 5');
});

test('saved with the view, like columns and filters', () => {
  const catalog = [{ key: 'f:bud' }, { key: 'f:st' }, { key: 'f:due' }];
  const ctx = { form, titleField: F.nm, parents: [] };
  const base = defaultConfig(ctx);
  assert.deepEqual(base.colors, []);
  const rule = { id: 'a', conds: [{ field: 'st', op: 'is', value: 'Done' }], color: 'green', bold: false, cell: '' };
  const cfg = cleanConfig({ ...base, colors: [rule] }, catalog, form, fields);
  assert.equal(cfg.colors.length, 1);
  assert.equal(sameConfig(cfg, cleanConfig(base, catalog, form, fields)), false, 'adding a colour rule is a change to the view');
  const d = viewDoc({ formId: 'f1', name: 'Mine', ownerId: 'u', shared: false, cfg, now: 1 });
  assert.equal(d.colors.length, 1);
  assert.equal('colors' in viewDoc({ formId: 'f1', name: 'Mine', ownerId: 'u', shared: false, cfg: base, now: 1 }), false, 'no rules: no colors key');
  assert.deepEqual(configOfDoc(d).colors, d.colors);
  assert.deepEqual(configOfDoc({}).colors, []);
  assert.equal(sameConfig(cleanConfig(configOfDoc(d), catalog, form, fields), cfg), true, 'reading it back is the same view');
});
