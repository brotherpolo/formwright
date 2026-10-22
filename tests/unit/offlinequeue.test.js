import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findPending, uploaded, isPending, stale } from '../../src/offlinequeue.js';

const wait = { name: 'a.jpg', size: 10, type: 'image/jpeg', path: 'u/a.jpg', url: '', pending: 'q1' };
const recs = [
  { id: 'r1', values: { photo: wait, note: 'hi' } },
  { id: 'r2', values: { photo: { ...wait, pending: 'q2' }, other: { ...wait } } },
  { id: 'r3', values: {} },
  { id: 'r4' },
];

test('findPending lists every place a stand-in sits', () => {
  assert.deepEqual(findPending(recs, 'q1'), [{ recordId: 'r1', fieldId: 'photo' }, { recordId: 'r2', fieldId: 'other' }]);
  assert.deepEqual(findPending(recs, 'q2'), [{ recordId: 'r2', fieldId: 'photo' }]);
  assert.deepEqual(findPending(recs, 'nope'), []);
  assert.deepEqual(findPending(null, 'q1'), []);
});

test('uploaded drops the pending mark and sets the url', () => {
  const v = uploaded(wait, 'https://x/a.jpg');
  assert.equal(v.url, 'https://x/a.jpg');
  assert.equal('pending' in v, false);
  assert.equal(v.name, 'a.jpg');
  assert.equal(wait.pending, 'q1', 'the original value is untouched');
  assert.deepEqual(uploaded(null, 'u'), { url: 'u' });
});

test('isPending: a stand-in with no url yet', () => {
  assert.equal(isPending(wait), true);
  assert.equal(isPending({ ...wait, url: 'https://x' }), false);
  assert.equal(isPending({ name: 'a', url: 'https://x' }), false);
  assert.equal(isPending('text'), false);
  assert.equal(isPending(null), false);
});

test('stale: old queue items no record points at', () => {
  const now = Date.UTC(2026, 9, 21);
  const old = now - 20 * 864e5, fresh = now - 2 * 864e5;
  const items = [{ id: 'q1', at: old }, { id: 'q9', at: old }, { id: 'q8', at: fresh }, { id: 'q7' }];
  assert.deepEqual(stale(items, recs, now).map((x) => x.id), ['q9', 'q7']);
  assert.deepEqual(stale(items, recs, now, 30).map((x) => x.id), ['q7']);
  assert.deepEqual(stale(null, recs, now), []);
});
