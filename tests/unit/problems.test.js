// Problems: what's reported from the browser, the grouped list, the backup line, the address.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { problemFrom, Throttle, groupKey, groupProblems, backupText } from '../../src/problemlogic.js';
import { parseRoute, routeFor } from '../../src/route.js';

const ctx = { app: 'formwright', uid: 'u1', name: 'Amy', where: 'Edit form · save-form', url: '/#/x?f=secret', agent: 'UA', version: '', origin: 'https://fw.app', online: true, now: 7 };
const E = (message, code) => Object.assign(new Error(message), code ? { code } : {});

test('a real failure becomes a report the rules accept', () => {
  const p = problemFrom({ error: E('Function setDoc() called with invalid data. Nested arrays are not supported', 'invalid-argument'), kind: 'console', note: '[formwright] save form' }, ctx);
  assert.deepEqual(Object.keys(p).sort(), ['agent', 'app', 'at', 'code', 'detail', 'message', 'name', 'uid', 'url', 'version', 'where']);
  assert.equal(p.app, 'formwright'); assert.equal(p.uid, 'u1'); assert.equal(p.at, 7); assert.equal(p.code, 'invalid-argument');
  assert.equal(p.where, 'Edit form · save-form');
  assert.equal(p.url, '/#/x', 'a link’s filters aren’t kept');
  assert.match(p.detail, /^\(console\)\n\[formwright\] save form\nError: Function setDoc/);
  assert.ok(problemFrom({ error: E('x'.repeat(900)) }, ctx).message.length <= 500);
  assert.equal(problemFrom({ message: 'Uncaught TypeError: a is undefined', source: 'https://fw.app/assets/main.js' }, ctx).message, 'Uncaught TypeError: a is undefined');
});

test('not reported: signed out, browser noise, no connection, extensions, nothing to say', () => {
  assert.equal(problemFrom({ error: E('x') }, { ...ctx, uid: '' }), null);
  ['ResizeObserver loop completed with undelivered notifications.', 'Script error.', 'AbortError: The user aborted a request.', 'Failed to fetch dynamically imported module: https://fw.app/a.js', 'TypeError: Failed to fetch']
    .forEach((m) => assert.equal(problemFrom({ message: m }, ctx), null, m));
  assert.equal(problemFrom({ error: E('Failed to get document because the client is offline.', 'unavailable') }, ctx), null);
  assert.equal(problemFrom({ error: E('x') }, { ...ctx, online: false }), null);
  assert.equal(problemFrom({ message: 'boom', source: 'chrome-extension://abc/content.js' }, ctx), null);
  assert.equal(problemFrom({ message: 'boom', source: 'https://ads.example/x.js' }, ctx), null, 'another site’s script');
  assert.equal(problemFrom({}, ctx), null);
});

test('throttle: the same one not again for 5 minutes; at most 15 a page', () => {
  const t = new Throttle(15, 300e3), p = (m) => ({ app: 'formwright', where: 'w', message: m });
  assert.equal(t.ok(p('Saving record 123 failed'), 0), true);
  assert.equal(t.ok(p('Saving record 456 failed'), 1000), false, 'same apart from the number');
  assert.equal(t.ok(p('Saving record 456 failed'), 301e3), true, 'after 5 minutes');
  const u = new Throttle(3);
  assert.deepEqual(['a', 'b', 'c', 'd'].map((m) => u.ok(p(m))), [true, true, true, false]);
});

test('the list groups the same problem, newest first, with who and how often', () => {
  const list = [
    { id: '1', at: 10, app: 'formwright', where: 'Edit form · save-form', message: 'Nested arrays (record 4fa93b2c11)', name: 'Amy' },
    { id: '2', at: 30, app: 'formwright', where: 'Edit form · save-form', message: 'Nested arrays (record 77bb0c9e21)', name: 'Bo' },
    { id: '3', at: 20, app: 'server', where: 'Nightly backup', message: 'PERMISSION_DENIED', name: 'Server' },
    { id: '4', at: 5, app: 'formwright', where: 'Edit form · save-form', message: 'Nested arrays (record 1)', name: 'Amy' },
  ];
  const g = groupProblems(list, 15);
  assert.equal(g.length, 2);
  assert.deepEqual([g[0].n, g[0].people, g[0].first, g[0].last, g[0].latest.id, g[0].ids.sort().join(), g[0].fresh], [3, ['Amy', 'Bo'], 5, 30, '2', '1,2,4', 1]);
  assert.deepEqual([g[1].app, g[1].people, g[1].fresh], ['server', [], 1], 'the server isn’t a person');
  assert.equal(groupKey(list[0]), groupKey(list[1]));
});

test('the backup line', () => {
  const now = 100 * 3600e3, when = (t) => 'T' + t / 3600e3;
  assert.equal(backupText(null, now, when).ok, null);
  assert.deepEqual(backupText({ lastAt: now - 3600e3, ok: true, keepDays: 30 }, now, when), { ok: true, text: 'Last nightly backup: T99. Copies are kept 30 days.' });
  assert.match(backupText({ lastAt: now - 48 * 3600e3, ok: true }, now, when).text, /over a day ago/);
  assert.equal(backupText({ lastAt: now - 48 * 3600e3, ok: true }, now, when).ok, false);
  assert.deepEqual(backupText({ lastAt: now, ok: false, error: 'PERMISSION_DENIED', lastOkAt: now - 24 * 3600e3 }, now, when), { ok: false, text: 'The last nightly backup didn’t work (T100): PERMISSION_DENIED. The last one that did: T76.' });
});

test('#/problems opens Settings → Problems (the morning email links there)', () => {
  assert.deepEqual(parseRoute('#/problems'), { kind: 'problems' });
  assert.equal(routeFor({ name: 'problems' }), '#/problems');
});
