import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bulkFields, parseBulk, multiWith } from '../../src/listlogic.js';

const form = { fields: [
  { id: 't', type: 'text', label: 'Notes' }, { id: 'n', type: 'number', label: 'Crew', min: 0, max: 20 }, { id: 'c', type: 'currency', label: 'Budget' },
  { id: 'd', type: 'date', label: 'Due' }, { id: 's', type: 'select', label: 'Stage', options: ['A', 'B'] }, { id: 'e', type: 'select', label: 'Empty', options: [] },
  { id: 'm', type: 'multiselect', label: 'Issues', options: ['Power', 'Water'] }, { id: 'r', type: 'relation', label: 'Contact', relForm: 'fk' },
  { id: 'x', type: 'formula', label: 'Calc' }, { id: 'a', type: 'autonumber', label: 'No.' }, { id: 'l', type: 'lookup', label: 'Phone' },
  { id: 'ro', type: 'text', label: 'Code', readOnly: true }, { id: 'h', type: 'heading', label: 'Section' }, { id: 'f', type: 'file', label: 'File' },
  { id: 'at', type: 'attachments', label: 'Files' }, { id: 'sg', type: 'signature', label: 'Sign' }, { id: 'loc', type: 'location', label: 'Where' },
  { id: 'em', type: 'email', label: 'Email' }, { id: 'ph', type: 'phone', label: 'Phone no.' }, { id: 'rt', type: 'rating', label: 'Stars', max: 5 },
] };

test('which fields Set field offers', () => {
  assert.deepEqual(bulkFields(form).map((f) => f.id), ['t', 'n', 'c', 'd', 's', 'm', 'r', 'em', 'ph', 'rt']);
});

test('typed values are checked like the record page', () => {
  const F = (id) => form.fields.find((f) => f.id === id);
  assert.deepEqual(parseBulk(F('n'), '4'), { value: 4 });
  assert.match(parseBulk(F('n'), '4.5').error, /whole number/);
  assert.match(parseBulk(F('n'), '30').error, /20 or less/);
  assert.match(parseBulk(F('n'), '-1').error, /0 or more/);
  assert.deepEqual(parseBulk(F('c'), ' 1250.5 '), { value: 1250.5 });
  assert.match(parseBulk(F('c'), 'abc').error, /a number/);
  assert.match(parseBulk(F('t'), '   ').error, /Clear/);
  assert.match(parseBulk(F('r'), '').error, /Choose a record/);
  assert.deepEqual(parseBulk(F('d'), '2026-11-02'), { value: '2026-11-02' });
  assert.match(parseBulk(F('em'), 'nope').error, /email/);
  assert.deepEqual(parseBulk(F('em'), 'a@b.co'), { value: 'a@b.co' });
  assert.match(parseBulk(F('ph'), '12').error, /7 digits/);
  assert.deepEqual(parseBulk(F('rt'), '3'), { value: 3 });
});

test('multiple choice: add or remove one, keep the rest', () => {
  assert.deepEqual(multiWith(['Power'], 'Water', 'add'), ['Power', 'Water']);
  assert.deepEqual(multiWith(['Power', 'Water'], 'Water', 'add'), ['Power', 'Water'], 'no duplicates');
  assert.deepEqual(multiWith(['Power', 'Water'], 'Power', 'remove'), ['Water']);
  assert.deepEqual(multiWith(null, 'Power', 'add'), ['Power']);
  assert.deepEqual(multiWith(['Water'], 'Power', 'remove'), ['Water']);
  const cur = ['Power']; multiWith(cur, 'Water', 'add'); assert.deepEqual(cur, ['Power'], 'the record’s own list is untouched');
});
