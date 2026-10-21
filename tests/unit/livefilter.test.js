// Live filters: what a filter reaches, the fields filtered together, values with counts, picks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rowsFor } from '../../src/dashlogic.js';
import { lfRefs, reachRef, dashForms, lfChoices, lfMatches, lfThrough, lfExtra, lfValues, normalizeFilter, togglePick, fromOldFilters } from '../../src/lflogic.js';

const forms = [
  { id: 'clients', name: 'Clients', titleField: 'name', children: [{ formId: 'projects' }], fields: [
    { id: 'name', type: 'text', label: 'Company name' }, { id: 'status', type: 'select', label: 'Status', options: ['Lead', 'Active'] }, { id: 'since', type: 'date', label: 'Since' }] },
  { id: 'projects', name: 'Projects', titleField: 'title', children: [], fields: [
    { id: 'title', type: 'text', label: 'Project name' }, { id: 'stage', type: 'select', label: 'Stage', options: ['Scoping', 'In progress', 'Done'] }, { id: 'budget', type: 'currency', label: 'Budget' }] },
  // not a child of Clients: linked by a field instead
  { id: 'invoices', name: 'Invoices', titleField: 'no', children: [], fields: [
    { id: 'no', type: 'text', label: 'Invoice #' }, { id: 'client', type: 'relation', relForm: 'clients', label: 'Client' }, { id: 'status', type: 'select', label: 'Status', options: ['Lead', 'Active', 'Paid'] }, { id: 'kind', type: 'select', label: 'Kind', options: ['A'] }] },
];
const rec = (id, formId, values, parentId = null) => ({ id, formId, values, parentId, ownerId: 'u1', createdAt: 1 });
const records = [
  rec('c1', 'clients', { name: 'Acme', status: 'Active' }), rec('c2', 'clients', { name: 'Globex', status: 'Lead' }), rec('c3', 'clients', { name: 'Initech', status: 'Lead' }),
  rec('p1', 'projects', { title: 'Lobby', stage: 'In progress', budget: 100 }, 'c1'), rec('p2', 'projects', { title: 'Roof', stage: 'Done', budget: 50 }, 'c1'), rec('p3', 'projects', { title: 'Yard', stage: 'Scoping', budget: 70 }, 'c2'),
  rec('i1', 'invoices', { no: 'INV-1', client: 'c1', status: 'Paid' }), rec('i2', 'invoices', { no: 'INV-2', client: 'c2', status: 'Active' }),
];
const byF = new Map(forms.map((f) => [f.id, f])), byR = new Map(records.map((r) => [r.id, r]));
const ctx = { forms, records, profiles: {}, formById: (id) => byF.get(id) || null, recById: (id) => byR.get(id) || null, fmt: (f, v) => String(v), recTitle: (r) => r.values.name || r.values.title || r.values.no || r.id };
const NAME = { form: 'clients', id: 'name' };
const ids = (l) => l.map((r) => r.id).sort().join();

test('a filter on Clients reaches Clients and Projects (through their client), not Invoices on its own', () => {
  assert.deepEqual(reachRef(ctx, { form: 'projects' }, [NAME]), NAME);
  assert.equal(reachRef(ctx, { form: 'invoices' }, [NAME]), null);
  const inv = { form: 'invoices', id: 'client' };
  assert.deepEqual(reachRef(ctx, { form: 'invoices' }, [NAME, inv]), inv, 'with Invoices › Client filtered together, it does');
});

test('picking values filters every report it reaches; one field per report', () => {
  const fields = [{ ref: NAME, refs: [NAME, { form: 'invoices', id: 'client' }], values: ['Acme'] }];
  assert.equal(ids(rowsFor(ctx, { form: 'projects' }, { fields })), 'p1,p2');
  assert.equal(ids(rowsFor(ctx, { form: 'invoices' }, { fields })), 'i1');
  assert.equal(ids(rowsFor(ctx, { form: 'clients' }, { fields })), 'c1');
  assert.equal(ids(rowsFor(ctx, { form: 'projects' }, { fields: [{ ref: NAME, refs: [NAME], values: ['Acme', 'Globex'] }] })), 'p1,p2,p3', 'several: any of them');
  assert.equal(ids(rowsFor(ctx, { form: 'projects' }, { fields: [{ ref: NAME, refs: [NAME], values: [] }] })), 'p1,p2,p3', 'nothing picked: everything');
});

test('fields to choose: the dashboard’s forms and the ones above them; no dates', () => {
  const fs = dashForms(ctx, [{ form: 'projects' }, { form: 'invoices' }]);
  assert.deepEqual(fs, ['projects', 'clients', 'invoices']);
  const ch = lfChoices(ctx, fs).map((x) => x.ref.form + '.' + x.ref.id);
  assert.ok(ch.includes('clients.name') && ch.includes('projects.stage') && ch.includes('invoices.client') && ch.includes('projects.budget'));
  assert.ok(!ch.includes('clients.since'), 'dates are the Period’s job');
});

test('filtered together: a link to the same records and the same name are ticked; same kind offered unticked', () => {
  const fs = ['projects', 'clients', 'invoices'];
  const m = lfMatches(ctx, NAME, fs).map((x) => [x.ref.form + '.' + x.ref.id, x.why, x.on]);
  assert.deepEqual(m, [['invoices.client', 'link', true]]);
  const s = lfMatches(ctx, { form: 'clients', id: 'status' }, fs).map((x) => [x.ref.form + '.' + x.ref.id, x.why, x.on]);
  assert.deepEqual(s, [['invoices.status', 'name', true], ['invoices.kind', 'kind', false]]);
  assert.deepEqual(lfThrough(ctx, NAME, fs), ['projects'], 'Projects is reached through its link, so it isn’t offered');
});

test('values with counts of the first report it reaches, under the other filters', () => {
  const flt = { ref: NAME, also: [{ form: 'invoices', id: 'client' }] };
  assert.deepEqual(lfValues(ctx, flt, { countDef: { form: 'projects' } }), [{ v: 'Acme', n: 2 }, { v: 'Globex', n: 1 }, { v: 'Initech', n: 0 }]);
  const others = [{ ref: { form: 'projects', id: 'stage' }, refs: [{ form: 'projects', id: 'stage' }], values: ['Done'] }];
  assert.deepEqual(lfValues(ctx, flt, { countDef: { form: 'projects' }, others }).map((x) => x.n), [1, 0, 0]);
  assert.deepEqual(lfValues(ctx, { ref: { form: 'projects', id: 'stage' } }, { countDef: { form: 'projects' } }).map((x) => x.v), ['Scoping', 'In progress', 'Done'], 'choices keep their order');
  assert.deepEqual(lfValues(ctx, flt, {}).map((x) => x.n), [null, null, null], 'no report: no counts');
});

test('the dashboard gets one entry per live filter tile; settings tidied; picking', () => {
  const tiles = [{ id: 'a', filter: { ref: NAME, also: [{ form: 'invoices', id: 'client' }], label: 'Client' } }, { id: 'b', report: 'r1' }, { id: 'c', filter: { ref: { form: 'gone', id: 'x' } } }];
  assert.deepEqual(lfExtra(ctx, tiles, { a: ['Acme'] }), [{ id: 'a', ref: NAME, refs: [NAME, { form: 'invoices', id: 'client' }], values: ['Acme'], label: 'Client' }]);
  assert.deepEqual(normalizeFilter({ ref: NAME, also: [NAME, { form: 'invoices', id: 'client' }], show: 'x', pick: 'one' }), { ref: NAME, also: [{ form: 'invoices', id: 'client' }], show: 'list', pick: 'one' });
  assert.deepEqual(lfRefs({ ref: NAME }), [NAME]);
  assert.deepEqual(togglePick(['a'], 'b', 'many'), ['a', 'b']);
  assert.deepEqual(togglePick(['a', 'b'], 'a', 'many'), ['b']);
  assert.deepEqual(togglePick(['a'], 'b', 'one'), ['b']);
  assert.deepEqual(togglePick(['b'], 'b', 'one'), []);
});

test('the old "+ Filter by…" dropdowns become dropdown live filters across the top', () => {
  assert.deepEqual(fromOldFilters([NAME, { form: 'projects', id: 'stage' }]), [
    { id: 'lf-clients-name', filter: { ref: NAME, also: [], show: 'dropdown', pick: 'one' }, x: 0, y: 0, w: 6, h: 2 },
    { id: 'lf-projects-stage', filter: { ref: { form: 'projects', id: 'stage' }, also: [], show: 'dropdown', pick: 'one' }, x: 6, y: 0, w: 6, h: 2 }]);
});
