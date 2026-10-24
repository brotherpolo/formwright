import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanQuestion, questionIssues, changesMeaning, usedBy, poolMatch, syncItems, planSave, forkItem, planMigration, remapItems, searchPool } from '../../src/poollogic.js';

let n = 0; const uid = () => 'n' + (++n);
const it = (id, label, set = 'as1', extra = {}) => ({ id, kind: 'item', label, help: '', set, required: false, critical: false, onFail: { comment: '', photo: '' }, showIf: null, ...extra });
const pool = [{ id: 'q1', label: 'Fire extinguishers in date', help: 'Check the tag', set: 'as1', onFail: { comment: 'req', photo: '' }, catId: 'fire' }, { id: 'q2', label: 'Exits clear', help: '', set: 'yn', onFail: { comment: '', photo: '' }, catId: 'fire' }];
const cls = [{ id: 'c1', items: [it('q1', 'Fire extinguishers in date'), it('q2', 'Exits clear', 'yn')] }, { id: 'c2', items: [it('q1', 'Fire extinguishers in date')] }];

test('questions', () => {
  assert.deepEqual(cleanQuestion({ label: ' Q ', set: 'text', onFail: { comment: 'x' }, catId: 'c' }), { label: 'Q', help: '', set: 'text', onFail: { comment: '', photo: '' }, catId: 'c' });
  assert.deepEqual(questionIssues({ label: '', set: 'gone' }, new Map()), ['Write the question.', 'Its answer set was deleted. Pick another.']);
  assert.equal(changesMeaning({ label: 'Exits clear', set: 'yn' }, { label: 'exits  clear!', set: 'yn' }), false, 'case and punctuation aren’t a new meaning');
  assert.equal(changesMeaning({ label: 'Exits clear', set: 'yn' }, { label: 'Exits clear', set: 'as1' }), true, 'other answers are');
  assert.deepEqual(usedBy('q1', cls).map((c) => c.id), ['c1', 'c2']);
  assert.equal(poolMatch(pool, 'fire extinguishers in date.', 'as1').id, 'q1');
  assert.equal(poolMatch(pool, 'Fire extinguishers in date', 'yn'), null);
  const synced = syncItems([it('q1', 'old words', 'as1', { required: true })], pool);
  assert.equal(synced[0].label, 'Fire extinguishers in date');
  assert.equal(synced[0].onFail.comment, 'req');
  assert.equal(synced[0].required, true, 'the checklist’s own settings stay');
});

test('saving a checklist: new questions, quiet changes, and changes that need asking', () => {
  const items = [it('q1', 'Fire extinguishers in date — all floors'), it('q2', 'Exits clear', 'yn', { help: 'and lit' }), it('i9', 'Spill kit stocked', 'yn')];
  const plan = planSave(items, pool, cls, 'c1', () => 'house');
  assert.deepEqual(plan.creates.map((c) => [c.id, c.q.label, c.q.catId]), [['i9', 'Spill kit stocked', 'house']]);
  assert.deepEqual(plan.updates.map((u) => [u.id, u.meaning, u.others]), [['q1', true, ['c2']], ['q2', false, []]]);
  assert.deepEqual(plan.asks.map((u) => u.id), ['q1'], 'only a new meaning, on a question another checklist uses, asks');
  assert.equal(plan.updates[0].q.catId, 'fire', 'the category is kept');
  assert.deepEqual(planSave(syncItems(cls[0].items, pool), pool, cls, 'c1').updates, [], 'nothing changed: nothing to do');
  const forked = forkItem([it('q1', 'A'), it('x', 'B', 'as1', { showIf: { item: 'q1', any: ['f'] } })], 'q1', 'q9');
  assert.deepEqual(forked.map((x) => [x.id, x.showIf?.item || '']), [['q9', ''], ['x', 'q9']]);
});

test('moving checklists made before the pool into it: one question for the same wording and answers', () => {
  const old = [
    { id: 'a', items: [{ id: 's', kind: 'section', label: 'S' }, it('a1', 'Walkways clear'), it('a2', 'Harness OK', 'c15'), it('a3', 'Expiry', 'date', { showIf: { item: 'a1', any: ['f'] } })] },
    { id: 'b', items: [it('b1', 'walkways  clear'), it('a2', 'Harness changed wording', 'c15'), it('b3', 'Fire extinguishers in date')] },
  ];
  const { questions, remap } = planMigration(old, pool, uid);
  assert.deepEqual(questions.map((q) => q.q.label), ['Walkways clear', 'Harness OK', 'Expiry', 'Harness changed wording']);
  assert.deepEqual(remap, { b: { b1: 'a1', a2: questions[3].id, b3: 'q1' } }, 'b’s copies point to the pool; a reused id with other words gets its own');
  assert.notEqual(questions[3].id, 'a2');
  const nb = remapItems(old[1].items, remap.b);
  assert.deepEqual(nb.map((x) => x.id), ['a1', questions[3].id, 'q1']);
  assert.deepEqual(planMigration(cls, pool, uid), { questions: [], remap: {} }, 'already in the pool: nothing to move');
});

test('searching the pool', () => {
  assert.deepEqual(searchPool(pool, 'fire ext').map((q) => q.id), ['q1']);
  assert.deepEqual(searchPool(pool, 'tag').map((q) => q.id), ['q1'], 'help text counts');
  assert.deepEqual(searchPool(pool, 'clear', { exclude: new Set(['q2']) }), []);
  assert.equal(searchPool(pool, '', { catId: 'fire' }).length, 2);
});
