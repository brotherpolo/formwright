import { test } from 'node:test';
import assert from 'node:assert/strict';
import { starterSets, snapshotOf, cleanValue } from '../../src/checklistlogic.js';
import { clFields, withClFields, clField, clValue, scoreText, fieldOrCl, isClId } from '../../src/clfields.js';
import { evaluate, testCond, condText, pruneRules, checkRules } from '../../src/rules.js';
import { columnCatalog, cellOf, filterRecords, cleanConfig } from '../../src/listlogic.js';
import { colorFields } from '../../src/colorlogic.js';
import { reportFields, valueOf, measureOf } from '../../src/reportlogic.js';
import { checkAutomation, triggerText } from '../../src/autologic.js';

let n = 0; const uid = () => 'o' + (++n);
const sets = Object.fromEntries(starterSets(uid).map((s) => [s.id, s]));
const [PASS, FAIL] = sets.as_pfn.options.map((o) => o.id);
const snap = snapshotOf({ name: 'Walk', passAt: 80, items: [
  { id: 'i1', kind: 'item', label: 'Walkways clear', set: 'as_pfn', required: true },
  { id: 'i2', kind: 'item', label: 'Extinguishers in date', set: 'as_pfn', critical: true },
  { id: 'i3', kind: 'item', label: 'Crew trained', set: 'percent' },
] }, sets, 2);
const form = { id: 'fm', name: 'Site walks', fields: [{ id: 'nm', type: 'text', label: 'Site' }, { id: 'ck', type: 'checklist', label: 'Walk', checklist: 'cl1' }] };
const snapOf = () => snap;
const good = cleanValue(snap, { a: { i1: PASS, i2: PASS, i3: 90 } }, 'cl1');
const bad = cleanValue(snap, { a: { i1: PASS, i2: FAIL } }, 'cl1');
const rec = (id, v) => ({ id, formId: 'fm', values: { nm: id, ck: v } });

test('a checklist gives Score, %, Result and Critical fail, and its questions when the checklist is to hand', () => {
  const ids = clFields(form).map((f) => f.id);
  assert.deepEqual(ids, ['ck~score', 'ck~pct', 'ck~result', 'ck~critical']);
  assert.ok(clFields(form, { report: true }).some((f) => f.id === 'ck~passed'));
  const qs = clFields(form, { snapOf }).filter((f) => f.virt.part === 'q');
  assert.deepEqual(qs.map((f) => f.id), ['ck~qc~i1', 'ck~qc~i2', 'ck~qp~i3']);
  assert.deepEqual(qs[0].options, ['Pass', 'Fail', 'N/A']);
  assert.equal(qs[0].label, 'Walk › Walkways clear');
  const plain = { fields: [{ id: 'a', type: 'text' }] };
  assert.equal(withClFields(plain), plain, 'no checklist: the form as it is');
  assert.equal(withClFields(form).fields.length, 6);
  assert.ok(isClId('ck~pct') && !isClId('ck'));
});

test('values come from the saved summary, or afresh from the checklist', () => {
  const f = (id) => clField(form, id);
  assert.equal(clValue(f('ck~score'), good), 2);
  assert.equal(clValue(f('ck~pct'), good), 100);
  assert.equal(clValue(f('ck~result'), good), 'Pass');
  assert.equal(clValue(f('ck~result'), bad), 'Fail');
  assert.equal(clValue(f('ck~critical'), bad), true);
  assert.equal(clValue(f('ck~critical'), good), false);
  assert.equal(clValue(f('ck~passed'), bad), 0);
  assert.equal(clValue(f('ck~qc~i2'), bad), 'Fail', 'the saved words: no checklist needed (the server)');
  assert.equal(clValue(f('ck~qp~i3'), good), 90);
  assert.equal(clValue(f('ck~qc~i2'), { a: { i2: FAIL } }, snap), 'Fail', 'an older value without words: from the checklist');
  assert.equal(clValue(f('ck~result'), { a: { i1: PASS, i2: FAIL } }, snap), 'Fail', 'while filling in: worked out now');
  assert.equal(clValue(f('ck~pct'), null), null);
  assert.equal(clValue(f('ck~critical'), null), false);
  assert.equal(scoreText(good), '2 / 2');
  assert.equal(clField(form, 'ck~nope'), null);
  assert.equal(clField(form, 'zz~pct'), null);
  assert.equal(fieldOrCl(form, 'nm').label, 'Site');
});

test('form rules and automation conditions can use them', () => {
  const get = (r) => (src, fid) => { const f = fieldOrCl(form, fid); return f ? { f, v: f.virt ? clValue(f, r.values[f.virt.of]) : r.values[fid] } : null; };
  const rf = { ...form, fields: [...form.fields, { id: 'fu', type: 'date', label: 'Follow-up' }], rules: [{ id: 'r1', join: 'any', conds: [{ id: 'c1', field: 'ck~pct', op: 'lt', value: 80 }, { id: 'c2', field: 'ck~qc~i2', op: 'is', value: 'Fail' }], acts: [{ do: 'show', targets: ['f:fu'] }] }] };
  assert.equal(evaluate(rf, get(rec('a', good))).hidden.has('f:fu'), true);
  assert.equal(evaluate(rf, get(rec('b', bad))).hidden.has('f:fu'), false);
  assert.equal(testCond({ op: 'yes' }, true, clField(form, 'ck~critical')), true);
  assert.equal(condText({ field: 'ck~pct', op: 'lt', value: 80 }, { form }), 'Walk › % less than 80');
  assert.equal(pruneRules(rf, { targets: [{ key: 'f:fu', kind: 'field', field: rf.fields[2] }] })[0].conds.length, 2, 'kept: they aren’t deleted fields');
  assert.ok(!checkRules(rf, { targets: [{ key: 'f:fu', kind: 'field', field: rf.fields[2] }] }).some((m) => /no longer exists/.test(m.text)));
  const a = { name: 'x', formId: 'fm', trigger: { type: 'changed', field: 'ck~result', op: 'is', value: 'Fail' }, acts: [{ do: 'task', title: 'T', assign: 'owner' }] };
  assert.deepEqual(checkAutomation(a, form), []);
  assert.match(triggerText(a, form), /Walk › Result becomes Fail/);
});

test('lists: columns, filters and colour rules', () => {
  const cat = columnCatalog({ form, titleField: form.fields[0] });
  assert.ok(['f:ck~score', 'f:ck~pct', 'f:ck~result', 'f:ck~critical'].every((k) => cat.some((c) => c.key === k)));
  const h = { form, valOf: (f, r) => (f.virt ? clValue(f, r.values[f.virt.of]) : r.values[f.id]), fmt: (f, v) => (v == null ? '' : String(v)), recTitle: (r) => r.id };
  assert.equal(cellOf('f:ck~score', rec('a', good), h).text, '2 / 2');
  assert.equal(cellOf('f:ck~pct', rec('a', good), h).sort, 100);
  const recs = [rec('a', good), rec('b', bad)];
  assert.deepEqual(filterRecords(recs, { 'ck~result': ['Fail'] }, form).map((r) => r.id), ['b']);
  assert.deepEqual(cleanConfig({ cols: ['f:ck~pct'], filters: { 'ck~result': ['Fail'] } }, cat, form).filters, { 'ck~result': ['Fail'] });
  assert.ok(colorFields(form).some((x) => x.id === 'ck~critical'));
});

test('reports: average %, pass rate, critical fails', () => {
  const recs = [rec('a', good), rec('b', bad)];
  const ctx = { formById: () => form, recById: () => null, records: recs };
  assert.ok(reportFields(form).some((f) => f.id === 'ck~passed'));
  assert.equal(valueOf(ctx, recs[1], { form: 'fm', id: 'ck~result' }), 'Fail');
  assert.equal(measureOf(ctx, { measure: { fn: 'avg', ref: { form: 'fm', id: 'ck~passed' } } }, recs), 50);
});
