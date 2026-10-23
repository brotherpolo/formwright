import { test } from 'node:test';
import assert from 'node:assert/strict';
import { templateFrom, fromTemplate, templateMeta } from '../../src/templatelogic.js';

const lines = { id: 'fl', name: 'Line items', itemName: 'Line item', fields: [
  { id: 'l_desc', type: 'text', label: 'Description' }, { id: 'l_qty', type: 'number', label: 'Qty' }, { id: 'l_amt', type: 'formula', label: 'Amount', expr: '1' },
  { id: 'l_proj', type: 'relation', label: 'Project', relForm: 'fp' }, { id: 'l_on', type: 'date', label: 'On' }] };
const projects = { id: 'fp', name: 'Projects', fields: [
  { id: 'p_title', type: 'text', label: 'Project name' }, { id: 'p_stage', type: 'select', label: 'Stage', options: ['Scoping', 'Done'] },
  { id: 'p_budget', type: 'currency', label: 'Budget' }, { id: 'p_due', type: 'date', label: 'Due' }, { id: 'p_no', type: 'autonumber', label: 'No.' },
  { id: 'p_sig', type: 'signature', label: 'Signed' }, { id: 'p_tax', type: 'formula', label: 'Tax', expr: '1' }, { id: 'p_code', type: 'text', label: 'Code', readOnly: true, defaultValue: 'X' },
  { id: 'p_tags', type: 'multiselect', label: 'Tags', options: ['A', 'B'] }, { id: 'p_sow', type: 'file', label: 'SOW' }, { id: 'p_brief', type: 'textarea', label: 'Brief' }] };
const rec = { id: 'r1', formId: 'fp', values: { p_title: 'Kitchen 12', p_stage: 'Scoping', p_budget: 32000, p_due: '2026-11-30', p_no: 'PRJ-9', p_sig: 'data:image/png;base64,x', p_tax: 1, p_code: 'X', p_tags: ['A'], p_sow: { name: 'sow.pdf', url: 'u', path: 'p' }, p_brief: 'Hi', _rich: { p_brief: '<p><b>Hi</b></p>', p_title: '<p>x</p>' } } };
const rows = [
  { id: 'g1', formId: 'fl', values: { l_desc: 'Cabinets', l_qty: 1, l_amt: 9, l_proj: 'r1', l_on: '2026-10-01' } },
  { id: 'g2', formId: 'fl', values: { l_desc: 'Countertop', l_qty: 2 } },
  { id: 'g3', formId: 'fl', values: {} },
];

test('a template keeps typed values and rows; leaves out the title, numbers, signatures, calculations, fixed values and dates', () => {
  const t = templateFrom(projects, rec, [{ form: lines, rows }], { titleId: 'p_title' });
  assert.deepEqual(Object.keys(t.values).sort(), ['_rich', 'p_brief', 'p_budget', 'p_sow', 'p_stage', 'p_tags']);
  assert.deepEqual(t.values._rich, { p_brief: '<p><b>Hi</b></p>' }, 'formatting only for what’s kept');
  assert.equal(t.fields, 5);
  assert.deepEqual(t.grids.fl, [{ l_desc: 'Cabinets', l_qty: 1 }, { l_desc: 'Countertop', l_qty: 2 }], 'rows: no calculations, no link back to the original, no dates, no empty rows');
  assert.equal(t.rows, 2);
  const withDates = templateFrom(projects, rec, [{ form: lines, rows }], { titleId: 'p_title', keepDates: true });
  assert.equal(withDates.values.p_due, '2026-11-30');
  assert.equal(withDates.grids.fl[0].l_on, '2026-10-01');
  rec.values.p_tags.push('changed later');
  assert.deepEqual(t.values.p_tags, ['A'], 'a copy, not the record’s own list');
  rec.values.p_tags.pop();
});

test('starting from a template follows the form as it is now', () => {
  const t = templateFrom(projects, rec, [{ form: lines, rows }], { titleId: 'p_title' });
  const changed = { ...projects, fields: projects.fields.filter((f) => f.id !== 'p_budget').map((f) => (f.id === 'p_stage' ? { ...f, options: ['Planning', 'Done'] } : f.id === 'p_tags' ? { ...f, options: ['B'] } : f)) };
  const s = fromTemplate(changed, t, (id) => (id === 'fl' ? lines : null));
  assert.equal('p_budget' in s.values, false, 'a field since removed');
  assert.equal('p_stage' in s.values, false, 'a choice that’s no longer an option');
  assert.equal('p_tags' in s.values, false, 'nor are multiple choices');
  assert.equal(s.values.p_brief, 'Hi');
  assert.deepEqual(s.values._rich, { p_brief: '<p><b>Hi</b></p>' });
  assert.equal(s.grids.fl.length, 2);
  assert.deepEqual(fromTemplate(projects, t, () => null).grids, {}, 'a sub-form no longer there');
  s.values.p_sow.name = 'x';
  assert.equal(t.values.p_sow.name, 'sow.pdf', 'a copy: editing the new record doesn’t touch the template');
});

test('the menu line', () => {
  assert.equal(templateMeta({ fields: 9, grids: { fl: [{}, {}, {}, {}, {}, {}] } }, (cid, n) => (n === 1 ? 'line item' : 'line items')), '9 fields · 6 line items');
  assert.equal(templateMeta({ fields: 1, grids: {} }), '1 field');
  assert.equal(templateMeta({ fields: 0 }), 'Empty');
});
