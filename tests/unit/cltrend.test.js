import { test } from 'node:test';
import assert from 'node:assert/strict';
import { questionStats, trendOf, mostFailed, failFrom, sparkPath } from '../../src/cltrend.js';
import { starterSets, snapshotOf, cleanValue } from '../../src/checklistlogic.js';
import { checklistItem } from '../../src/pdfdoc.js';

let n = 0; const uid = () => 'o' + (++n);
const sets = Object.fromEntries(starterSets(uid).map((s) => [s.id, s]));
const [PASS, FAIL, NA] = sets.as_pfn.options.map((o) => o.id);
const snap = snapshotOf({ name: 'Walk', passAt: 80, items: [
  { id: 's1', kind: 'section', label: 'Access' },
  { id: 'q1', kind: 'item', label: 'Exits clear', set: 'as_pfn', onFail: { comment: 'ask', photo: 'ask' } },
  { id: 'q2', kind: 'item', label: 'Crew trained', set: 'percent' },
] }, sets, 1);
const form = { id: 'f', fields: [{ id: 'ck', type: 'checklist', checklist: 'cl' }] };
const DAY = 86400000, now = Date.UTC(2026, 9, 21, 12);
const rec = (days, ans) => ({ id: 'r' + days, formId: 'f', createdAt: now - days * DAY, values: { ck: { cl: 'cl', ver: 1, a: { q1: ans, q2: 50 } } } });

test('fail rates by question, week by week, with a trend', () => {
  const recs = [rec(70, FAIL), rec(63, FAIL), rec(56, PASS), rec(21, PASS), rec(14, PASS), rec(7, PASS), rec(2, NA), rec(200, FAIL)];
  const st = questionStats(recs, { now, formById: () => form, failOf: (q, a) => failFrom(snap)(q, a) });
  const s = st.get('q1');
  assert.equal(s.asked, 6, 'N/A and older than 12 weeks aren’t counted');
  assert.equal(s.failed, 2);
  assert.equal(s.rate, 33.3);
  assert.equal(s.weeks.length, 12);
  assert.equal(s.trend, 'falling');
  assert.deepEqual(s.hits.map((h) => h.rec.id), ['r63', 'r70'], 'newest first');
  assert.equal(st.has('q2'), false, 'a percent isn’t pass or fail');
  assert.deepEqual(mostFailed(st).map((x) => x.id), ['q1']);
  assert.ok(sparkPath(s.weeks).startsWith('M'));
});

test('trends need enough answers; the answer set stands in for an unknown version', () => {
  const w = (a, f) => ({ asked: a, failed: f });
  assert.equal(trendOf([w(1, 1), w(0, 0), w(2, 2), w(3, 0)]), '');
  assert.equal(trendOf([w(5, 1), w(5, 0), w(5, 1), w(5, 0)]), 'steady');
  assert.equal(trendOf([w(5, 0), w(5, 0), w(5, 3), w(5, 2)]), 'rising');
  const bySet = failFrom(null, () => sets.as_pfn);
  assert.equal(bySet('q1', FAIL), true);
  assert.equal(bySet('q1', PASS), false);
  assert.equal(bySet('q1', NA), null);
});

test('the PDF answer table', () => {
  const v = cleanValue(snap, { a: { q1: FAIL, q2: 75 }, n: { q1: 'Boxes' }, p: { q1: [{ path: 'x/a.jpg', name: 'a.jpg' }, { path: 'x/b.pdf', name: 'b.pdf', type: 'application/pdf' }] } }, 'cl');
  const it = checklistItem({ label: 'Site walk' }, v, snap, { tasksFor: (id) => (id === 'q1' ? [{ title: 'Clear it', assigneeId: 'u', assigneeName: 'Sam', done: true }] : []) });
  assert.equal(it.kind, 'checklist');
  assert.equal(it.result, 'fail');
  assert.equal(it.score, '0 / 1');
  assert.deepEqual(it.rows.map((r) => r.section || r.label), ['Access', 'Exits clear', 'Crew trained']);
  const r = it.rows[1];
  assert.equal(r.fail, true);
  assert.equal(r.comment, 'Boxes');
  assert.equal(r.photos.length, 1, 'only pictures become thumbnails');
  assert.deepEqual(r.tasks, ['Clear it · Sam · done']);
  assert.equal(checklistItem({ label: 'X' }, v, null), null, 'no checklist to hand: it prints as before');
});
