import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathOf, lookupTarget, lookupRecord, lookupValue, shownField, withLookups, stripLookups, lookupSources, parentFormsOf, showable } from '../../src/lookuplogic.js';
import { makeKit } from '../../src/server/recordkit.js';

const clients = { id: 'fc', name: 'Clients', itemName: 'Client', children: [{ formId: 'fp' }], fields: [
  { id: 'c_name', type: 'text', label: 'Company' }, { id: 'c_addr', type: 'text', label: 'Address' }, { id: 'c_disc', type: 'percent', label: 'Discount' },
  { id: 'c_mgr', type: 'relation', label: 'Account manager', relForm: 'fk' }, { id: 'c_calc', type: 'formula', label: 'Double', expr: '{Discount} * 2', format: 'number' }] };
const projects = { id: 'fp', name: 'Projects', itemName: 'Project', children: [{ formId: 'fv' }], fields: [{ id: 'p_title', type: 'text', label: 'Project' }, { id: 'p_code', type: 'autonumber', label: 'Code' }] };
const contacts = { id: 'fk', name: 'Contacts', itemName: 'Contact', children: [], fields: [{ id: 'k_name', type: 'text', label: 'Name' }, { id: 'k_phone', type: 'phone', label: 'Phone' }, { id: 'k_h', type: 'heading', label: 'More' }] };
const visits = { id: 'fv', name: 'Site visits', itemName: 'Site visit', children: [], fields: [
  { id: 'v_title', type: 'text', label: 'Summary' }, { id: 'v_contact', type: 'relation', label: 'Contact on site', relForm: 'fk' },
  { id: 'v_phone', type: 'lookup', label: 'Contact phone', via: ['f:v_contact'], show: 'k_phone' },
  { id: 'v_proj', type: 'lookup', label: 'Project code', via: ['p:fp'], show: 'p_code' },
  { id: 'v_addr', type: 'lookup', label: 'Client address', via: ['p:fp', 'p:fc'], show: 'c_addr' },
  { id: 'v_mgr', type: 'lookup', label: 'Manager phone', via: ['p:fp', 'p:fc'], show: 'c_mgrphone' },
  { id: 'v_disc', type: 'lookup', label: 'Client discount', via: ['p:fp', 'p:fc'], show: 'c_calc' },
  { id: 'v_broken', type: 'lookup', label: 'Broken', via: ['f:gone'], show: 'k_phone' }] };
clients.fields.push({ id: 'c_mgrphone', type: 'lookup', label: 'Manager phone', via: ['f:c_mgr'], show: 'k_phone' });
const forms = [clients, projects, contacts, visits];
const formById = (id) => forms.find((f) => f.id === id);
const recs = [
  { id: 'c1', formId: 'fc', values: { c_name: 'Northwind', c_addr: '100 Queen St W', c_disc: 10, c_mgr: 'k2' } },
  { id: 'p1', formId: 'fp', parentId: 'c1', values: { p_title: 'Lobby' }, nums: { p_code: 'PRJ-007' } },
  { id: 'k1', formId: 'fk', values: { k_name: 'Dana', k_phone: '+1 416 555 0199' } },
  { id: 'k2', formId: 'fk', values: { k_name: 'Lee', k_phone: '+1 416 555 0100' } },
  { id: 'v1', formId: 'fv', parentId: 'p1', values: { v_title: 'Walkthrough', v_contact: 'k1' } },
  { id: 'v2', formId: 'fv', parentId: null, values: { v_title: 'No links' } },
];
const recById = (id) => recs.find((r) => r.id === id);
const F = (id) => visits.fields.find((f) => f.id === id);
const h = { recById, formById };

test('paths and targets', () => {
  assert.deepEqual(pathOf({ via: ['f:a', 'p:b', 'f:c'] }), ['f:a', 'p:b']);
  assert.deepEqual(pathOf({ via: ['nonsense'] }), []);
  assert.equal(lookupTarget(visits, F('v_phone'), formById).field.id, 'k_phone');
  assert.equal(lookupTarget(visits, F('v_addr'), formById).form.id, 'fc');
  assert.equal(lookupTarget(visits, F('v_broken'), formById), null);
  assert.equal(lookupTarget(visits, { type: 'lookup', via: ['p:fk'], show: 'k_phone' }, formById), null, 'Contacts isn’t a parent of Site visits');
  assert.equal(shownField(visits, F('v_mgr'), formById).type, 'phone', 'a lookup of a lookup formats as the real field');
});

test('values: through a link, the parent, two steps, auto numbers, calculations', () => {
  const v1 = recById('v1');
  assert.equal(lookupRecord(v1, F('v_phone'), recById).id, 'k1');
  assert.equal(lookupValue(v1, F('v_phone'), h), '+1 416 555 0199');
  assert.equal(lookupValue(v1, F('v_proj'), h), 'PRJ-007');
  assert.equal(lookupValue(v1, F('v_addr'), h), '100 Queen St W');
  assert.equal(lookupValue(v1, F('v_mgr'), h), '+1 416 555 0100', 'Client → its account manager’s phone');
  assert.equal(lookupValue(v1, F('v_disc'), h), null, 'a calculation needs valOf');
  assert.equal(lookupValue(v1, F('v_disc'), { ...h, valOf: (f, r) => r.values.c_disc * 2 }), 20);
  assert.equal(lookupValue(recById('v2'), F('v_phone'), h), null, 'nothing linked');
  assert.equal(lookupValue(v1, F('v_phone'), { ...h, recById: (id) => (id === 'k1' ? undefined : recById(id)) }), null, 'a record you can’t see shows nothing');
  // a draft: pick another contact, the lookup follows before saving
  assert.equal(lookupValue({ ...v1, values: { ...v1.values, v_contact: 'k2' } }, F('v_phone'), h), '+1 416 555 0100');
});

test('filled in for lists, never stored', () => {
  const shown = withLookups(recById('v1'), visits, h);
  assert.equal(shown.values.v_phone, '+1 416 555 0199');
  assert.equal(shown.values.v_addr, '100 Queen St W');
  assert.equal('v_broken' in shown.values, false);
  assert.equal(recById('v1').values.v_phone, undefined, 'the record itself is untouched');
  assert.deepEqual(stripLookups({ v_title: 'x', v_phone: 'y', v_addr: 'z' }, visits), { v_title: 'x' });
  assert.equal(withLookups(recById('k1'), contacts, h), recById('k1'));
});

test('the designer’s choices', () => {
  assert.deepEqual(parentFormsOf(visits, forms).map((f) => f.id), ['fp']);
  const s = lookupSources(visits, forms, (p) => p.itemName);
  const labels = s.map((x) => x.label);
  assert.ok(labels.includes('Contact on site'));
  assert.ok(labels.includes('Project'));
  assert.ok(labels.includes('Project → Client'));
  assert.ok(!labels.some((l) => l.split(' → ').length > 2), 'two steps at most');
  assert.deepEqual(s.find((x) => x.label === 'Project → Client').via, ['p:fp', 'p:fc']);
  assert.ok(labels.includes('Contact on site') && !lookupSources(contacts, forms).length, 'a form with no links or parents has nothing');
  assert.equal(showable(contacts).some((f) => f.type === 'heading'), false);
});

test('the server: emails, PDFs and calculations see lookups', () => {
  const kit = makeKit({ forms, records: recs });
  const v1 = kit.recById('v1');
  assert.equal(kit.fieldText(visits, v1, 'Contact phone'), '+1 416 555 0199');
  assert.equal(kit.fieldText(visits, v1, 'Client discount'), '20');
  assert.equal(kit.fieldText(visits, v1, 'Project code'), 'PRJ-007');
  const pdf = JSON.stringify(kit.pdfModel(visits, v1));
  assert.ok(pdf.includes('100 Queen St W'));
});
