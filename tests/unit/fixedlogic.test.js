import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLayout, canDefault, canReadOnly, hasDefault, isFixed, isReadOnly, defaultFor, withDefaults, withFixed, stripFixed, defaultText, clock } from '../../src/fixedlogic.js';
import { makeKit } from '../../src/server/recordkit.js';
import { skippedFields, templateColumns } from '../../src/importlogic.js';
import { stageView, BEFORE, beforeStage } from '../../src/workflow.js';

const now = new Date(2026, 9, 21, 9, 5);
const F = {
  url: { id: 'u', type: 'url', label: 'Checklist', readOnly: true, defaultValue: 'https://example.com/c.pdf', linkText: 'Open the checklist' },
  code: { id: 'c', type: 'text', label: 'Site code', readOnly: true, defaultValue: 'NW-04' },
  st: { id: 's', type: 'select', label: 'Status', options: ['Lead', 'Active'], defaultValue: 'Lead' },
  day: { id: 'd', type: 'date', label: 'Visit date', defaultValue: 'today' },
  ro: { id: 'r', type: 'text', label: 'Set by automations', readOnly: true },
  ins: { id: 'i', type: 'instructions', label: 'Before you start', text: 'Do this.' },
};
const form = { id: 'f1', name: 'Visits', fields: Object.values(F) };

test('which fields can do what', () => {
  assert.equal(isLayout(F.ins), true);
  assert.equal(isLayout({ type: 'heading' }), true);
  assert.equal(isLayout(F.code), false);
  assert.equal(canDefault(F.url), true);
  assert.equal(canDefault({ type: 'file' }), false);
  assert.equal(canReadOnly({ type: 'formula' }), false);
  assert.equal(canReadOnly(F.ins), false);
  assert.equal(canReadOnly({ type: 'attachments' }), true);
  assert.equal(isFixed(F.url), true);
  assert.equal(isFixed(F.st), false, 'a default people can change');
  assert.equal(isFixed(F.ro), false, 'read only with no value set keeps what records hold');
  assert.equal(isReadOnly(F.ro), true);
  assert.equal(hasDefault({ type: 'checkbox', defaultValue: false }), true);
  assert.equal(hasDefault({ type: 'multiselect', defaultValue: [] }), false);
});

test('defaultFor: today, now, options that still exist, numbers', () => {
  assert.equal(defaultFor(F.day, now), '2026-10-21');
  assert.equal(defaultFor({ type: 'time', defaultValue: 'now' }, now), '09:05');
  assert.equal(defaultFor({ type: 'datetime', defaultValue: 'now' }, now), '2026-10-21T09:05');
  assert.equal(defaultFor({ type: 'date', defaultValue: '2026-12-01' }, now), '2026-12-01');
  assert.equal(defaultFor({ type: 'date', defaultValue: 'soon' }, now), null);
  assert.equal(defaultFor({ type: 'select', options: ['A'], defaultValue: 'B' }), null, 'an option since removed');
  assert.deepEqual(defaultFor({ type: 'multiselect', options: ['A', 'B'], defaultValue: ['B', 'Z'] }), ['B']);
  assert.equal(defaultFor({ type: 'currency', defaultValue: '12.5' }), 12.5);
  assert.equal(defaultFor({ type: 'checkbox', defaultValue: true }), true);
  assert.equal(defaultFor({ type: 'checkbox', defaultValue: false }), false);
  assert.equal(clock(new Date(Date.UTC(2026, 9, 21, 3, 0)), 'America/Toronto').day, '2026-10-20', 'the server uses the business time zone');
});

test('new records get defaults; what people typed stays', () => {
  const v = withDefaults({ s: 'Active' }, form, now);
  assert.equal(v.s, 'Active');
  assert.equal(v.d, '2026-10-21');
  assert.equal(v.c, 'NW-04');
  assert.equal('r' in v, false);
  assert.equal('i' in v, false);
});

test('fixed values come from the form, are never stored, and follow the form', () => {
  const rec = { id: 'r1', formId: 'f1', values: { u: 'https://old.example', s: 'Active' } };
  const shown = withFixed(rec, form, now);
  assert.equal(shown.values.u, 'https://example.com/c.pdf');
  assert.equal(shown.values.c, 'NW-04');
  assert.equal(shown.values.s, 'Active');
  assert.equal(rec.values.u, 'https://old.example', 'the stored record is untouched');
  const same = { id: 'r2', formId: 'f1', values: { u: F.url.defaultValue, c: 'NW-04' } };
  assert.equal(withFixed(same, form, now), same, 'nothing to change: the same object');
  assert.equal(withFixed(rec, { fields: [F.st] }), rec);
  assert.deepEqual(stripFixed({ u: 'x', c: 'y', s: 'Lead', r: 'kept' }, form), { s: 'Lead', r: 'kept' });
  assert.equal(defaultText(F.day), 'Today');
  assert.equal(defaultText({ type: 'checkbox', defaultValue: false }), 'No');
});

test('the server shows fixed values too, and Instructions aren’t a field', () => {
  const kit = makeKit({ forms: [form], records: [{ id: 'r1', formId: 'f1', values: { s: 'Lead', v: 'x' } }] });
  assert.equal(kit.valOf(F.code, { id: 'r9', formId: 'f1', values: {} }, form), 'NW-04');
  assert.equal(kit.fieldText(form, kit.recById('r1'), 'Site code'), 'NW-04');
  assert.equal(kit.text(form, kit.recById('r1'), F.ins), '');
  const m = kit.pdfModel(form, kit.recById('r1'));
  assert.equal(JSON.stringify(m).includes('Before you start'), false, 'PDFs leave Instructions out');
});

test('imports skip fixed fields', () => {
  const sk = skippedFields(form);
  assert.ok(sk.some((x) => x.id === 'c' && /read only/.test(x.why)));
  assert.ok(!templateColumns(form, [], () => 'Visit').some((c) => c.key === 'c'));
});

test('a workflow stage can hide Instructions', () => {
  const wf = { ...form, workflow: { on: true, stages: [{ id: 's1', name: 'One', fields: { i: 'hide' } }] } };
  assert.ok(stageView(wf, 's1').hide.has('i'));
});

test('Before saving: a built-in stage for a record not saved yet', () => {
  const wf = { fields: [{ id: 'a', type: 'text' }, { id: 'b', type: 'text' }, { id: 'c', type: 'formula' }], workflow: { on: true, stages: [{ id: 's1', name: 'Draft', fields: { a: 'hide' } }], before: { fields: { a: 'req', b: 'hide', c: 'req' }, sections: { 'g:f_lines': 'hide' } } } };
  const v = stageView(wf, BEFORE);
  assert.ok(v.req.has('a') && v.hide.has('b') && !v.req.has('c'), 'Required and Hidden; calculations can’t be required');
  assert.ok(v.keys.has('g:f_lines'), 'sections too');
  assert.ok(stageView(wf, 's1').hide.has('a'), 'real stages unchanged');
  assert.equal(stageView({ ...wf, workflow: { ...wf.workflow, on: false } }, BEFORE).req.size, 0, 'no workflow: nothing');
  assert.equal(stageView({ fields: wf.fields, workflow: { on: true, stages: [{ id: 's1' }] } }, BEFORE).hide.size, 0, 'nothing set: nothing changes');
  assert.equal(beforeStage(wf).name, 'Before saving');
});
