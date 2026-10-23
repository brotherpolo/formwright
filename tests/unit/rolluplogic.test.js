import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathOf, rollupTarget, rollupSources, rollupRecords, rollupValue, ofFields, rollupSummary, stripRollups, recordIndex } from '../../src/rolluplogic.js';
import { makeKit } from '../../src/server/recordkit.js';

const clients = { id: 'fc', name: 'Clients', itemName: 'Client', children: [{ formId: 'fp' }, { formId: 'fk' }], fields: [{ id: 'c_name', type: 'text', label: 'Company' }] };
const projects = { id: 'fp', name: 'Projects', itemName: 'Project', children: [{ formId: 'fv' }], fields: [
  { id: 'p_title', type: 'text', label: 'Project' }, { id: 'p_stage', type: 'select', label: 'Stage', options: ['Scoping', 'In progress', 'Done'] },
  { id: 'p_budget', type: 'currency', label: 'Budget' }, { id: 'p_due', type: 'date', label: 'Due date' }, { id: 'p_tax', type: 'formula', label: 'With tax', expr: '{Budget} * 2', format: 'currency' }] };
const contacts = { id: 'fk', name: 'Contacts', itemName: 'Contact', children: [], fields: [{ id: 'k_name', type: 'text', label: 'Name' }] };
const visits = { id: 'fv', name: 'Site visits', itemName: 'Site visit', children: [], fields: [
  { id: 'v_title', type: 'text', label: 'Summary' }, { id: 'v_when', type: 'date', label: 'Visited on' }, { id: 'v_contact', type: 'relation', label: 'Contact on site', relForm: 'fk' }] };
const R = (id, extra) => ({ id, type: 'rollup', label: id, ...extra });
clients.fields.push(
  R('c_open', { from: ['c:fp'], where: [{ field: 'p_stage', op: 'is', value: 'In progress' }], agg: 'count' }),
  R('c_budget', { from: ['c:fp'], where: [{ field: 'p_stage', op: 'not', value: 'Done' }], agg: 'sum', of: 'p_budget' }),
  R('c_next', { from: ['c:fp'], where: [{ field: 'p_stage', op: 'not', value: 'Done' }], agg: 'earliest', of: 'p_due' }),
  R('c_last', { from: ['c:fp', 'c:fv'], agg: 'latest', of: 'v_when' }),
  R('c_people', { from: ['c:fk'], agg: 'list', of: 'k_name' }),
  R('c_avg', { from: ['c:fp'], agg: 'avg', of: 'p_budget' }),
  R('c_max', { from: ['c:fp'], agg: 'max', of: 'p_tax' }),
  R('c_none', { from: ['c:fp'], where: [{ field: 'p_stage', op: 'is', value: 'Nope' }], agg: 'min', of: 'p_budget' }));
contacts.fields.push(R('k_visits', { from: ['l:fv:v_contact'], agg: 'count' }));
const forms = [clients, projects, contacts, visits];
const formById = (id) => forms.find((f) => f.id === id);
const recs = [
  { id: 'c1', formId: 'fc', values: { c_name: 'Northwind' } },
  { id: 'p1', formId: 'fp', parentId: 'c1', values: { p_title: 'Lobby', p_stage: 'In progress', p_budget: 48000, p_due: '2026-11-30' } },
  { id: 'p2', formId: 'fp', parentId: 'c1', values: { p_title: 'Signs', p_stage: 'Scoping', p_budget: 6500, p_due: '2026-11-04' } },
  { id: 'p3', formId: 'fp', parentId: 'c1', values: { p_title: 'Old', p_stage: 'Done', p_budget: 100000, p_due: '2026-01-01' } },
  { id: 'k1', formId: 'fk', parentId: 'c1', values: { k_name: 'Dana' } }, { id: 'k2', formId: 'fk', parentId: 'c1', values: { k_name: 'Lee' } },
  { id: 'v1', formId: 'fv', parentId: 'p1', values: { v_when: '2026-10-06', v_contact: 'k1' } },
  { id: 'v2', formId: 'fv', parentId: 'p2', values: { v_when: '2026-10-21', v_contact: 'k1' } },
  { id: 'v3', formId: 'fv', parentId: 'p3', values: { v_when: '2025-05-01', v_contact: 'k2' } },
];
const idx = recordIndex(recs);
const valOf = (g, r) => (g.type === 'formula' ? (r.values.p_budget ?? 0) * 2 : r.values?.[g.id]);
const h = { formById, ...idx, valOf, fmt: (g, v) => String(v) };
const F = (id) => [...clients.fields, ...contacts.fields].find((f) => f.id === id);
const c1 = recs[0];

test('paths and targets', () => {
  assert.deepEqual(pathOf({ from: ['c:fp', 'c:fv', 'c:x'] }), ['c:fp', 'c:fv']);
  assert.deepEqual(pathOf({ from: ['l:fv'] }), [], 'a link step names its field');
  assert.equal(rollupTarget(clients, F('c_last'), formById).form.id, 'fv');
  assert.equal(rollupTarget(contacts, F('k_visits'), formById).form.id, 'fv');
  assert.equal(rollupTarget(contacts, R('x', { from: ['c:fp'] }), formById), null, 'Projects aren’t under Contacts');
  assert.equal(rollupTarget(clients, R('x', { from: ['l:fv:v_contact'] }), formById), null, 'that link points at Contacts, not Clients');
});

test('values: count with a condition, sum, earliest, latest two steps away, list, average, max of a calculation', () => {
  assert.equal(rollupValue(c1, F('c_open'), h), 1);
  assert.equal(rollupValue(c1, F('c_budget'), h), 54500);
  assert.equal(rollupValue(c1, F('c_next'), h), '2026-11-04');
  assert.equal(rollupValue(c1, F('c_last'), h), '2026-10-21');
  assert.deepEqual(rollupValue(c1, F('c_people'), h), ['Dana', 'Lee']);
  assert.equal(rollupValue(c1, F('c_avg'), h), (48000 + 6500 + 100000) / 3);
  assert.equal(rollupValue(c1, F('c_max'), h), 200000);
  assert.equal(rollupValue(c1, F('c_none'), h), null, 'nothing matches: empty');
  assert.equal(rollupValue(recs.find((r) => r.id === 'k1'), F('k_visits'), h), 2, 'records that link here');
  assert.equal(rollupValue({ formId: 'fc', values: {} }, F('c_open'), h), 0, 'a new record (no id yet) has nothing under it');
  // a project moves to Done: the count follows
  const moved = recs.map((r) => (r.id === 'p1' ? { ...r, values: { ...r.values, p_stage: 'Done' } } : r));
  assert.equal(rollupValue(c1, F('c_open'), { ...h, ...recordIndex(moved) }), 0);
  // records you can't see aren't in your data
  assert.equal(rollupValue(c1, F('c_budget'), { ...h, ...recordIndex(recs.filter((r) => r.id !== 'p2')) }), 48000);
  assert.deepEqual(rollupRecords(c1, F('c_last'), h).map((r) => r.id).sort(), ['v1', 'v2', 'v3']);
});

test('the designer’s choices and words', () => {
  const s = rollupSources(clients, forms, (x) => x.itemName);
  const labels = s.map((x) => x.label);
  assert.ok(labels.includes('Projects under this client'));
  assert.ok(labels.includes('Projects → Site visits'));
  assert.ok(rollupSources(contacts, forms, (x) => x.itemName).some((x) => x.label === 'Site visits that link here (Contact on site)'));
  assert.deepEqual(ofFields(projects, 'sum').map((g) => g.id), ['p_budget', 'p_tax']);
  assert.deepEqual(ofFields(projects, 'latest').map((g) => g.id), ['p_due']);
  assert.deepEqual(ofFields(projects, 'count'), []);
  assert.equal(rollupSummary(clients, F('c_open'), forms, (x) => x.itemName), 'Count of Projects where Stage is In progress');
  assert.equal(rollupSummary(clients, F('c_last'), forms, (x) => x.itemName), 'Latest of Visited on across Site visits (Projects → Site visits)');
  assert.deepEqual(stripRollups({ c_name: 'x', c_open: 3 }, clients), { c_name: 'x' });
});

test('the server: emails, PDFs and calculations see rollups', () => {
  const kit = makeKit({ forms, records: recs });
  const c = kit.recById('c1');
  assert.equal(kit.fieldText(clients, c, 'c_open'), '1');
  assert.match(kit.fieldText(clients, c, 'c_budget'), /\$54,500\.00$/);
  assert.equal(kit.fieldText(clients, c, 'c_people'), 'Dana, Lee');
  assert.equal(kit.fieldText(clients, c, 'c_next'), 'Nov 4, 2026');
  assert.match(kit.fieldText(clients, c, 'c_max'), /\$200,000\.00$/, 'a calculation on the children, worked out on the server');
});
