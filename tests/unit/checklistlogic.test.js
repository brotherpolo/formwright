import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  starterSets, cleanSet, setIssues, maxOf, cleanItems, checklistIssues, snapshotOf, usesSet,
  visibleItems, summarize, missing, cleanValue, summaryText, answerText, rowsOf, answerChanges, isFail, isBlankValue,
} from '../../src/checklistlogic.js';

let n = 0; const uid = () => 'o' + (++n);
const sets = Object.fromEntries(starterSets(uid).map((s) => [s.id, s]));
const pfn = sets.as_pfn.options, c15 = sets.as_15.options;
const [PASS, FAIL, NA] = pfn.map((o) => o.id);
const cl = {
  name: 'Daily site walk', passAt: 80, items: [
    { id: 's1', kind: 'section', label: 'Access' },
    { id: 'i1', kind: 'item', label: 'Walkways clear', help: 'Stairs and exits', set: 'as_pfn', required: true, onFail: { comment: 'req', photo: 'ask' } },
    { id: 'i2', kind: 'item', label: 'Extinguishers in date', set: 'as_pfn', required: true, critical: true },
    { id: 'i3', kind: 'item', label: 'Expiry date', set: 'date', showIf: { item: 'i2', any: [FAIL] } },
    { id: 's2', kind: 'section', label: 'Height' },
    { id: 'i4', kind: 'item', label: 'Harness condition', set: 'as_15', required: true },
    { id: 'i5', kind: 'item', label: 'Crew trained', set: 'percent' },
  ],
};
const snap = snapshotOf(cl, sets, 3);

test('answer sets', () => {
  assert.equal(starterSets(uid).length, 3);
  assert.equal(maxOf(pfn), 1);
  assert.equal(maxOf(c15), 4);
  assert.equal(maxOf([{ score: null }]), null);
  assert.deepEqual(cleanSet({ name: ' A ', options: [{ id: 'x', label: 'Yes', score: '2' }, { id: 'x', label: 'dup' }, { id: 'y', label: 'No', score: '' }] }).options, [{ id: 'x', label: 'Yes', score: 2, fail: false }, { id: 'y', label: 'No', score: null, fail: false }]);
  assert.deepEqual(setIssues({ name: '', options: [{ id: 'a', label: 'X' }] }), ['Give the answer set a name.', 'Add at least two answers.']);
  assert.ok(setIssues({ name: 'S', options: [{ id: 'a', label: 'X' }, { id: 'b', label: 'x' }] }).some((m) => /same label/.test(m)));
});

test('checking a checklist before saving', () => {
  assert.deepEqual(checklistIssues(cl, sets), []);
  assert.ok(checklistIssues({ name: '', items: [] }, sets).length === 2);
  assert.ok(checklistIssues({ name: 'X', items: [{ id: 'a', kind: 'item', label: 'Q', set: 'gone' }] }, sets).some((m) => /was deleted/.test(m)));
  assert.ok(checklistIssues({ name: 'X', items: [{ id: 'a', kind: 'item', label: 'Q', set: 'text', showIf: { item: 'b', any: ['x'] } }, { id: 'b', kind: 'item', label: 'R', set: 'as_yn' }] }, sets).some((m) => /above it/.test(m)), '“Only if” must look up the list');
  assert.ok(checklistIssues({ name: 'X', passAt: 120, items: [{ id: 'a', kind: 'item', label: 'Q', set: 'text' }] }, sets).some((m) => /pass mark/.test(m)));
  assert.equal(cleanItems([{ id: 'a', kind: 'item', label: 'Q', set: 'text', onFail: { comment: 'maybe' } }])[0].onFail.comment, '');
  assert.equal(usesSet(cl, 'as_15'), true);
  assert.equal(usesSet(cl, 'as_yn'), false);
});

test('the snapshot copies answers in, so later changes to a set don’t change it', () => {
  assert.equal(snap.ver, 3);
  assert.equal(snap.items[1].type, 'choice');
  assert.equal(snap.items[1].opts.length, 3);
  assert.equal(snap.items[3].type, 'date');
  sets.as_pfn.options[0].label = 'OK';
  assert.equal(snap.items[1].opts[0].label, 'Pass');
  sets.as_pfn.options[0].label = 'Pass';
});

test('Only if', () => {
  assert.ok(!visibleItems(snap, {}).has('i3'));
  assert.ok(!visibleItems(snap, { i2: PASS }).has('i3'));
  assert.ok(visibleItems(snap, { i2: FAIL }).has('i3'));
});

test('scores: N/A isn’t counted; the pass mark; critical items', () => {
  const [, c2, , c4] = c15.map((o) => o.id);
  let s = summarize(snap, { a: { i1: PASS, i2: PASS, i4: c4 } });
  assert.deepEqual([s.score, s.max, s.pct, s.result, s.answered, s.total], [5, 6, 83.3, 'pass', 3, 4]);
  s = summarize(snap, { a: { i1: NA, i2: PASS, i4: c2 } });
  assert.deepEqual([s.score, s.max, s.pct, s.result], [2, 5, 40, 'fail'], 'N/A drops out of the score and the most');
  s = summarize(snap, { a: { i1: PASS, i2: PASS } });
  assert.equal(s.result, '', 'a required item still to answer: no result yet');
  s = summarize(snap, { a: { i1: PASS, i2: FAIL } });
  assert.equal(s.result, 'fail', 'a critical item failed: it fails, whatever the score');
  assert.equal(s.total, 5, 'the Only if item shows now');
  assert.equal(summarize({ passAt: null, items: [{ id: 'x', kind: 'item', type: 'text' }] }, { a: { x: 'hi' } }).result, '', 'no pass mark: no result');
});

test('what still needs filling in', () => {
  assert.deepEqual(Object.keys(missing(snap, { a: {} })).sort(), ['i1', 'i2', 'i4']);
  assert.equal(missing(snap, { a: { i1: FAIL } }).i1, 'Add a comment.');
  assert.equal(missing(snap, { a: { i1: FAIL }, n: { i1: 'Boxes on stairs' } }).i1, undefined);
  assert.equal(missing(snap, { a: { i5: 120 } }).i5, 'A percent from 0 to 100.');
  assert.equal(isFail(snap.items[1], FAIL), true);
});

test('the saved value: only what shows, comments only for fails, with its summary', () => {
  const v = cleanValue(snap, { a: { i1: PASS, i2: PASS, i3: '2026-10-01', i4: c15[3].id, i5: '75', junk: 1 }, n: { i1: 'left over', i2: 'x' } }, 'cl1');
  assert.deepEqual(Object.keys(v.a).sort(), ['i1', 'i2', 'i4', 'i5'], 'the hidden Only if answer is dropped');
  assert.equal(v.a.i5, 75);
  assert.equal(v.n, undefined, 'a comment on a pass isn’t kept');
  assert.equal(v.cl, 'cl1');
  assert.equal(v.ver, 3);
  assert.deepEqual(v.s, { score: 5, max: 6, pct: 83.3, answered: 4, total: 4, result: 'pass' });
  assert.equal(summaryText(v), '5 / 6 · 83.3% · Pass · 4 of 4 answered');
  const f = cleanValue(snap, { a: { i1: FAIL }, n: { i1: ' Boxes ' }, p: { i1: [{ name: 'a.jpg' }] } }, 'cl1');
  assert.equal(f.n.i1, 'Boxes');
  assert.equal(f.p.i1.length, 1);
  assert.equal(isBlankValue({ a: {} }), true);
  assert.equal(summaryText({ a: {} }), '');
});

test('words: answers, rows for PDFs, audit changes', () => {
  assert.equal(answerText(snap.items[1], FAIL), 'Fail');
  assert.equal(answerText(snap.items[6], 42.5), '42.5%');
  const v = { a: { i1: FAIL, i2: PASS }, n: { i1: 'Boxes' } };
  const rows = rowsOf(snap, v);
  assert.deepEqual(rows.map((r) => r.section || r.label), ['Access', 'Walkways clear', 'Extinguishers in date', 'Height', 'Harness condition', 'Crew trained']);
  assert.equal(rows[1].score, '0 / 1');
  assert.equal(rows[1].fail, true);
  assert.equal(rows[1].comment, 'Boxes');
  assert.deepEqual(answerChanges(snap, { a: { i1: PASS } }, v), ['Walkways clear: Fail', 'Extinguishers in date: Pass']);
});

import { findPending, fillUploaded } from '../../src/offlinequeue.js';
import { makeKit } from '../../src/server/recordkit.js';
test('a checklist photo taken offline is found and filled in once it uploads', () => {
  const v = { cl: 'c', ver: 1, a: { i1: 'x' }, p: { i1: [{ name: 'a.jpg', pending: 'q1' }, { name: 'b.jpg', url: 'u' }] } };
  assert.deepEqual(findPending([{ id: 'r1', values: { chk: v, t: 'x' } }], 'q1'), [{ recordId: 'r1', fieldId: 'chk' }]);
  const out = fillUploaded(v, 'q1', 'https://x/a.jpg');
  assert.equal(out.p.i1[0].url, 'https://x/a.jpg');
  assert.equal(out.p.i1[0].pending, undefined);
  assert.equal(out.a.i1, 'x');
  assert.equal(fillUploaded(v, 'nope', 'u'), v, 'nothing waiting: the same value');
  assert.equal(fillUploaded([{ pending: 'q2' }], 'q2', 'u')[0].url, 'u', 'Attachments lists as before');
});
test('the server shows a checklist as its score line, and calculations get its %', () => {
  const form = { id: 'f', fields: [{ id: 'chk', type: 'checklist', label: 'Walk' }, { id: 'pct', type: 'formula', expr: '{Walk} * 2', format: 'number' }] };
  const kit = makeKit({ forms: [form], records: [{ id: 'r', formId: 'f', values: { chk: { cl: 'c', ver: 1, a: { i: 'x' }, s: { score: 3, max: 4, pct: 75, answered: 2, total: 2, result: 'fail' } } } }] });
  const r = kit.recById('r');
  assert.equal(kit.text(form, r, form.fields[0]), '3 / 4 · 75% · Fail · 2 of 2 answered');
  assert.equal(kit.valOf(form.fields[1], r, form), 150);
});

import { setColor, scoreBand, SET_COLORS } from '../../src/checklistlogic.js';
test('answer set colours and how good each answer is', () => {
  assert.equal(cleanSet({ name: 'A', color: 'violet', options: [] }).color, 'violet');
  assert.equal('color' in cleanSet({ name: 'A', color: 'tartan', options: [] }), false);
  assert.equal(setColor({ color: 'teal' }, 0), 'teal');
  assert.equal(setColor({}, 2), SET_COLORS[2], 'no colour: by its place');
  const opts = [{ score: 0, fail: true }, { score: 1 }, { score: 2 }, { score: 4 }, { score: null }];
  assert.deepEqual(opts.map((o) => scoreBand(o, opts)), ['f', 1, 2, 4, 'n']);
  assert.equal(scoreBand({ score: 1 }, [{ score: 1 }]), 4, 'all the same: best');
});
