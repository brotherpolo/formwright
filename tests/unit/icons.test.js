// Form icons: what's saved, what's drawn (safely), and the picker's search.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanShapes, iconSvg, showsIcon, iconFor, searchIcons, START } from '../../src/icons.js';
import set from '../../src/iconset.js';

test('the icon set: Lucide, 24 × 24 shapes', () => {
  const names = Object.keys(set);
  assert.ok(names.length > 1400, names.length + ' icons');
  ['receipt', 'building-2', 'truck', 'hard-hat', 'clipboard-check', 'folder-kanban'].forEach((n) => assert.ok(set[n], n));
  assert.ok(START.every((n) => set[n]), 'every starting icon exists');
});

test('a chosen icon is copied onto the form, and drawn in the badge’s colour', () => {
  const ic = iconFor('receipt', set);
  assert.equal(ic.set, 'lucide');
  assert.equal(ic.name, 'receipt');
  assert.ok(ic.shapes.length >= 2);
  const svg = iconSvg(ic, 20);
  assert.match(svg, /^<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"/);
  assert.match(svg, /<path d="M4 2v20/);
  assert.equal(iconFor('no-such-icon', set), null);
  assert.equal(showsIcon({ badge: 'icon', icon: ic }), true);
  assert.equal(showsIcon({ badge: 'letter', icon: ic }), false, 'Letter keeps the icon for later but shows the letter');
  assert.equal(showsIcon({ badge: 'icon' }), false, 'no icon chosen yet: the letter');
});

test('only plain shapes are drawn: nothing a saved form could use to run code', () => {
  const bad = [['script', { d: 'x' }], ['path', { d: 'M0 0"/><script>alert(1)</script>', onload: 'alert(1)', style: 'x' }], ['image', { href: 'javascript:x' }], 'nope'];
  const c = cleanShapes(bad);
  assert.deepEqual(c, [{ t: 'path', d: 'M0 0scriptalert1script' }]);
  assert.deepEqual(cleanShapes([{ t: 'script', d: 'x' }, { t: 'path', d: 'M1 1', onclick: 'x' }]), [{ t: 'path', d: 'M1 1' }], 'saved shapes are tidied too');
  assert.doesNotMatch(iconSvg({ shapes: bad }), /<script|onload|javascript|style=/);
  assert.equal(iconSvg({ shapes: [] }), '');
});

test('what’s saved can go into Firestore: no list inside a list, for every icon', () => {
  const nested = (v) => Array.isArray(v) ? v.some((x) => Array.isArray(x) || nested(x)) : v && typeof v === 'object' ? Object.values(v).some(nested) : false;
  Object.keys(set).forEach((n) => assert.equal(nested(iconFor(n, set)), false, n));
  const ic = iconFor('receipt', set);
  assert.equal(iconSvg({ shapes: ic.shapes }, 16), iconSvg({ shapes: set.receipt }, 16), 'saved and set shapes draw the same');
  assert.deepEqual(iconFor('receipt', set), { ...ic, shapes: cleanShapes(ic.shapes) }, 'reading a saved icon back changes nothing');
});

test('search: business words first, then names', () => {
  const names = Object.keys(set);
  assert.deepEqual(searchIcons(names, 'invoice').slice(0, 2), ['receipt', 'file-text']);
  assert.ok(searchIcons(names, 'truck').includes('truck'));
  assert.ok(searchIcons(names, 'safety').slice(0, 3).includes('shield-check'));
  assert.equal(searchIcons(names, '').length, START.length, 'before typing: a hand-picked set for business forms');
  assert.equal(searchIcons(names, '')[0], 'receipt');
  assert.deepEqual(searchIcons(names, 'zzzz'), []);
});
