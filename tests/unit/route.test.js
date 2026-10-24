import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, routeFor, parsePath, routeOf, SETTINGS_PAGES } from '../../src/route.js';

test('every page has an address, and reading it back gives the same page', () => {
  const pairs = [
    [{ name: 'home' }, '#/home', { kind: 'home' }],
    [{ name: 'mywork' }, '#/mywork', { kind: 'mywork' }],
    [{ name: 'designer' }, '#/designer', { kind: 'designer' }],
    [{ name: 'formEdit', formId: 'f_projects' }, '#/designer/f_projects', { kind: 'formEdit', id: 'f_projects', tab: 'fields' }],
    [{ name: 'formEdit', formId: 'f_projects', tab: 'relations' }, '#/designer/f_projects/relationships', { kind: 'formEdit', id: 'f_projects', tab: 'relations' }],
    [{ name: 'formEdit', formId: 'f_projects', tab: 'workflow' }, '#/designer/f_projects/workflow', { kind: 'formEdit', id: 'f_projects', tab: 'workflow' }],
    [{ name: 'settings' }, '#/settings', { kind: 'settings' }],
    [{ name: 'users' }, '#/settings/users', { kind: 'settings', page: 'users' }],
    [{ name: 'automations' }, '#/settings/automations', { kind: 'settings', page: 'automations' }],
    [{ name: 'automation', autoId: 'au1' }, '#/settings/automations/au1', { kind: 'settings', page: 'automations', id: 'au1' }],
    [{ name: 'groupEdit', groupId: 'g1' }, '#/settings/groups/g1', { kind: 'settings', page: 'groups', id: 'g1' }],
    [{ name: 'roleEdit', roleId: 'r 1' }, '#/settings/roles/r%201', { kind: 'settings', page: 'roles', id: 'r 1' }],
    [{ name: 'audit' }, '#/settings/audit', { kind: 'settings', page: 'audit' }],
    [{ name: 'audit', recordId: 'r_p1' }, '#/record/r_p1/history', { kind: 'recordHistory', id: 'r_p1' }],
    [{ name: 'record', formId: 'f_projects', recordId: null }, '#/form/f_projects/new', { kind: 'newRecord', id: 'f_projects' }],
    [{ name: 'record', formId: 'f_projects', recordId: 'r_p1' }, '#/record/r_p1', { kind: 'record', id: 'r_p1' }],
    [{ name: 'problems' }, '#/problems', { kind: 'problems' }],
  ];
  pairs.forEach(([v, addr, r]) => {
    assert.equal(routeFor(v), addr, v.name);
    assert.deepEqual(parseRoute(addr), r, addr);
  });
  SETTINGS_PAGES.filter((p) => p !== 'problems').forEach((p) => assert.equal(routeFor({ name: p }), '#/settings/' + p));
});

test('unsaved editors point at their list', () => {
  assert.equal(routeFor({ name: 'automation', autoId: 'au_new', isNew: true }), '#/settings/automations');
  assert.equal(routeFor({ name: 'groupEdit' }), '#/settings/groups');
  assert.equal(routeFor({ name: 'roleEdit' }), '#/settings/roles');
  assert.equal(routeFor({ name: 'import', formId: 'f' }), '#/settings/imports');
});

test('addresses that aren’t pages', () => {
  assert.equal(parseRoute('#/settings/nope'), null);
  assert.equal(parseRoute('#/settings/users/u1'), null, 'only groups, roles and automations have one each');
  assert.equal(parseRoute('#/designer/f/nope'), null);
  assert.equal(parseRoute('#/record/x/nope'), null);
  assert.equal(parseRoute('#/home/x'), null);
  assert.deepEqual(parseRoute('#/settings/users/'), { kind: 'settings', page: 'users' }, 'a trailing slash is fine');
});

test('the same address without the # (step 1: read, not written yet)', () => {
  assert.deepEqual(parsePath('/settings/users'), { kind: 'settings', page: 'users' });
  assert.deepEqual(parsePath('/record/abc'), { kind: 'record', id: 'abc' });
  assert.equal(parsePath('/'), null);
  assert.equal(parsePath('/index.html'), null);
  assert.equal(parsePath('/test.html'), null);
  assert.equal(parsePath('/manifest.webmanifest'), null);
  assert.deepEqual(routeOf({ hash: '#/mywork', pathname: '/settings/users' }), { kind: 'mywork' }, 'the # wins');
  assert.deepEqual(routeOf({ hash: '', pathname: '/designer/f1/rules' }), { kind: 'formEdit', id: 'f1', tab: 'rules' });
  assert.equal(routeOf({ hash: '', pathname: '/' }), null);
});
