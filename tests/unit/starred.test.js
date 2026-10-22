// Ctrl K: your starred and recently opened records first; the lists themselves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paletteResults, noteRecent, toggleStar } from '../../src/palettelogic.js';

const P = (id, label) => ({ kind: 'page', id, label, sub: 'Page' });
const F = (id, label) => ({ kind: 'form', id, label, sub: 'Form' });
const R = (id, label, at) => ({ kind: 'record', id, label, sub: 'Invoices', at });
const items = [P('home', 'Home'), P('mywork', 'My work'), F('inv', 'Invoices'), R('r1', 'INV-1001 Acme', 10), R('r2', 'INV-1002 Globex', 50), R('r3', 'INV-1003 Initech', 30), R('r4', 'INV-1004 Acme', 40)];

test('empty: Starred, then Recently opened, then pages and forms, then recently changed', () => {
  const out = paletteResults(items, '', 12, { starred: ['r3', 'gone'], recent: ['r1', 'r3', 'r4'] });
  assert.deepEqual(out.map((x) => [x.id, x.group]), [['r3', 'Starred'], ['r1', 'Recently opened'], ['r4', 'Recently opened'], ['home', 'Pages'], ['mywork', 'Pages'], ['inv', 'Forms'], ['r2', 'Recently changed']]);
  assert.equal(out[0].starred, true, 'marked');
  assert.ok(!out.some((x) => x.id === 'gone'), 'a star on something you can’t see (or that was deleted) is left out');
  assert.deepEqual(paletteResults(items, '').map((x) => x.id), ['home', 'mywork', 'inv', 'r2', 'r4', 'r3', 'r1'], 'with nothing of yours: as before');
});

test('typed: your starred, then recently opened, records first at the same match', () => {
  const ids = (mine) => paletteResults(items, 'acme', 12, mine).map((x) => x.id);
  assert.deepEqual(ids({}), ['r4', 'r1'], 'most recently changed first');
  assert.deepEqual(ids({ recent: ['r1'] }), ['r1', 'r4'], 'one you opened lately');
  assert.deepEqual(ids({ starred: ['r4'], recent: ['r1'] }), ['r4', 'r1'], 'a star beats that');
  assert.equal(paletteResults(items, 'acme', 12, { starred: ['r4'] })[0].starred, true);
  assert.deepEqual(paletteResults(items, 'inv', 12, { starred: ['r2'] }).slice(0, 2).map((x) => x.id), ['inv', 'r2'], 'a better match still wins (the form)');
});

test('the lists', () => {
  assert.deepEqual(noteRecent(['a', 'b', 'c'], 'b'), ['b', 'a', 'c'], 'opening again moves it to the top');
  assert.deepEqual(noteRecent(null, 'x'), ['x']);
  assert.equal(noteRecent(Array.from({ length: 20 }, (_, i) => 'r' + i), 'n').length, 12);
  assert.deepEqual(toggleStar(['a'], 'b'), ['b', 'a'], 'newest star first');
  assert.deepEqual(toggleStar(['b', 'a'], 'b'), ['a'], 'again: unstarred');
  assert.equal(toggleStar(Array.from({ length: 100 }, (_, i) => 'r' + i), 'n').length, 100);
});

test('empty, for administrators: forms come before the Settings pages', () => {
  const list = [P('home', 'Home'), { kind: 'page', id: 'users', label: 'Users', sub: 'Settings', admin: true }, F('inv', 'Invoices')];
  assert.deepEqual(paletteResults(list, '').map((x) => [x.id, x.group]), [['home', 'Pages'], ['inv', 'Forms'], ['users', 'Settings']]);
});
