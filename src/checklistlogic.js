// Checklists: reusable lists of questions with scored answers, kept in Settings › Checklists and
// put on any form with a Checklist field. Pure functions (no DOM, no Firebase), so they're
// unit-tested and shared by the app, PDFs and the server kit.
//
//   answerSets/{id}     { name, options: [{ id, label, score: number | null, fail: bool }] }
//                       score null: the answer isn't counted (N/A). fail: it counts as a fail.
//   checklistTypes/{id} { name, order }
//   checklists/{id}     { name, typeId, passAt: number | null, items: [Item], ver, snap, … }
//     Item  { id, kind: 'section', label }
//           { id, kind: 'item', label, help, set, required, critical,
//             onFail: { comment, photo, task: '' | 'ask' | 'req' },  (task: 'ask' offers + Add a task, 'req' needs one)
//             showIf: { item, any: [option ids] } | null }
//           set: an answer set id, or 'text' | 'date' | 'decimal' | 'percent'
//     ver   the version number; saving makes the next one
//     snap  the current version, ready to fill in (answer sets copied in, so later changes
//           to a set don't change it). Older versions: checklistVersions/{id}@{ver}.
//
// On a record, a Checklist field's value:
//   { cl, ver, a: { itemId: answer }, n: { itemId: comment }, p: { itemId: [file] }, l: { itemId: words }, s: Summary }
//   l: the words of each choice answer (so the server can compare answers without the checklist)
//   answer: an option id (choice), text, 'YYYY-MM-DD', or a number (decimal, percent)
//   Summary { score, max, pct, answered, total, result: 'pass' | 'fail' | '', critical }, worked out when saved
//   so lists, reports and the server can use it without the checklist.

export const BUILT_IN = [['text', 'Text'], ['date', 'Date'], ['decimal', 'Decimal'], ['percent', 'Percent']];
const BUILT = new Set(BUILT_IN.map((x) => x[0]));
export const isBuiltIn = (set) => BUILT.has(set);
export const MAX_ITEMS = 200, MAX_OPTIONS = 20, MAX_TEXT = 500;
export const FAIL_MODES = [['', 'Nothing'], ['ask', 'Ask'], ['req', 'Required']];

const str = (v, n = 200) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const mode = (v) => (v === 'ask' || v === 'req' ? v : '');
const isEmpty = (v) => v == null || v === '' || (Array.isArray(v) && !v.length);

/** The usual answer sets, to start with. */
export function starterSets(uid) {
  return [
    { id: 'as_pfn', name: 'Pass / Fail / N/A', options: [{ id: uid(), label: 'Pass', score: 1, fail: false }, { id: uid(), label: 'Fail', score: 0, fail: true }, { id: uid(), label: 'N/A', score: null, fail: false }] },
    { id: 'as_yn', name: 'Yes / No', options: [{ id: uid(), label: 'Yes', score: 1, fail: false }, { id: uid(), label: 'No', score: 0, fail: true }] },
    { id: 'as_15', name: 'Condition 1–5', options: [1, 2, 3, 4, 5].map((n) => ({ id: uid(), label: String(n), score: n - 1, fail: n === 1 })) },
  ];
}

/** An answer set, tidied for saving. */
export function cleanSet(d) {
  const seen = new Set();
  const options = (Array.isArray(d?.options) ? d.options : []).slice(0, MAX_OPTIONS).map((o) => ({
    id: str(o?.id, 40), label: str(o?.label, 60), score: num(o?.score), fail: !!o?.fail,
  })).filter((o) => o.id && !seen.has(o.id) && seen.add(o.id));
  return { name: str(d?.name, 80), options, ...(SET_COLORS.includes(d?.color) ? { color: d.color } : {}) };
}
/** Colours an answer set can have (Settings › Checklists); without one, it gets one by its place in the list. */
export const SET_COLORS = ['green', 'amber', 'violet', 'blue', 'teal', 'red', 'pink', 'slate'];
export const setColor = (s, i = 0) => (SET_COLORS.includes(s?.color) ? s.color : SET_COLORS[i % SET_COLORS.length]);
/** How good an answer is, for its colour: 'n' (not counted), 'f' (a fail), or 0 (worst) to 4 (best). */
export function scoreBand(o, options) {
  if (!o || typeof o.score !== 'number') return o?.fail ? 'f' : 'n';
  if (o.fail) return 'f';
  const xs = (options || []).map((x) => x.score).filter((x) => typeof x === 'number');
  const lo = Math.min(...xs), hi = Math.max(...xs);
  return hi === lo ? 4 : Math.round(((o.score - lo) / (hi - lo)) * 4);
}
export function setIssues(d) {
  const s = cleanSet(d), out = [];
  if (!s.name) out.push('Give the answer set a name.');
  if (s.options.length < 2) out.push('Add at least two answers.');
  if (s.options.some((o) => !o.label)) out.push('Every answer needs a label.');
  const labels = s.options.map((o) => o.label.toLowerCase());
  if (new Set(labels).size !== labels.length) out.push('Two answers have the same label.');
  return out;
}
/** The best score an item with these options can get (null: none of them counts). */
export function maxOf(options) {
  const xs = (options || []).map((o) => o.score).filter((x) => typeof x === 'number');
  return xs.length ? Math.max(...xs) : null;
}

/** A checklist's items, tidied for saving. sets: Map or object of answer set id → set. */
export function cleanItems(items) {
  const seen = new Set();
  const out = (Array.isArray(items) ? items : []).slice(0, MAX_ITEMS).map((x) => {
    const id = str(x?.id, 40);
    if (!id || seen.has(id)) return null;
    seen.add(id);
    if (x.kind === 'section') return { id, kind: 'section', label: str(x.label, 120) };
    const set = str(x.set, 40);
    const showIf = x.showIf && typeof x.showIf === 'object' && str(x.showIf.item, 40) ? { item: str(x.showIf.item, 40), any: (Array.isArray(x.showIf.any) ? x.showIf.any : []).map((v) => str(v, 40)).filter(Boolean).slice(0, MAX_OPTIONS) } : null;
    return { id, kind: 'item', label: str(x.label, 300), help: str(x.help, 300), set, required: !!x.required, critical: !!x.critical, onFail: { comment: mode(x.onFail?.comment), photo: mode(x.onFail?.photo), task: mode(x.onFail?.task) }, showIf };
  }).filter(Boolean);
  return out;
}

const setOf = (sets, id) => (sets instanceof Map ? sets.get(id) : sets?.[id]) || null;

/** What's wrong with a checklist before it can be saved (words for people). */
export function checklistIssues(cl, sets) {
  const out = [];
  if (!str(cl?.name, 80)) out.push('Give the checklist a name.');
  const items = cleanItems(cl?.items).filter((x) => x.kind === 'item');
  if (!items.length) out.push('Add at least one item.');
  const before = new Map();
  items.forEach((x, i) => {
    const n = `Item ${i + 1}${x.label ? ` (“${x.label.slice(0, 40)}”)` : ''}`;
    if (!x.label) out.push(`${n} needs a question.`);
    if (!x.set) out.push(`${n} needs an answer type.`);
    else if (!isBuiltIn(x.set) && !setOf(sets, x.set)) out.push(`${n}: its answer set was deleted. Pick another.`);
    if (x.showIf) {
      const src = before.get(x.showIf.item);
      if (!src) out.push(`${n}: “Only if” must point to a choice item above it.`);
      else if (!x.showIf.any.length) out.push(`${n}: pick which answers show it.`);
    }
    if (!isBuiltIn(x.set)) before.set(x.id, x);
  });
  const p = cl?.passAt;
  if (p != null && p !== '' && !(num(p) >= 0 && num(p) <= 100)) out.push('The pass mark is a percent from 0 to 100.');
  return out;
}

/** The checklist ready to fill in: answer sets copied in. ver: its version number. */
export function snapshotOf(cl, sets, ver) {
  const items = cleanItems(cl.items).map((x) => {
    if (x.kind === 'section') return x;
    if (isBuiltIn(x.set)) return { ...x, type: x.set, opts: null };
    const s = setOf(sets, x.set);
    return { ...x, type: 'choice', opts: s ? cleanSet(s).options : [] };
  });
  const p = num(cl.passAt);
  return { name: str(cl.name, 80), passAt: p != null && p >= 0 && p <= 100 ? p : null, ver, items };
}
/** Does this checklist use the answer set? */
export const usesSet = (cl, setId) => (cl?.items || []).some((x) => x.kind === 'item' && x.set === setId);

/* ---------- filling one in ---------- */

const itemsOf = (snap) => (snap?.items || []).filter((x) => x.kind === 'item');
const optOf = (item, id) => (item?.opts || []).find((o) => o.id === id) || null;
/** Is the answer to a choice item a fail? */
export const isFail = (item, ans) => !!(item?.type === 'choice' && optOf(item, ans)?.fail);

/** The items showing for these answers: "Only if" holds (and what it depends on is showing). */
export function visibleItems(snap, answers) {
  const vis = new Set(), a = answers || {};
  itemsOf(snap).forEach((x) => {
    if (!x.showIf) { vis.add(x.id); return; }
    const src = x.showIf.item;
    if (vis.has(src) && x.showIf.any.includes(a[src])) vis.add(x.id);
  });
  return vis;
}

/** Has an item been answered? */
export function answered(item, v) {
  if (isEmpty(v)) return false;
  if (item.type === 'choice') return !!optOf(item, v);
  if (item.type === 'decimal' || item.type === 'percent') return num(v) != null;
  return true;
}

/** The score, progress and result. */
export function summarize(snap, value) {
  const a = value?.a || {}, vis = visibleItems(snap, a);
  let score = 0, max = 0, done = 0, total = 0, critical = false, reqLeft = 0;
  itemsOf(snap).forEach((x) => {
    if (!vis.has(x.id)) return;
    total++;
    const has = answered(x, a[x.id]);
    if (has) done++; else if (x.required) reqLeft++;
    if (x.type !== 'choice' || !has) return;
    const o = optOf(x, a[x.id]);
    if (x.critical && o.fail) critical = true;
    if (typeof o.score !== 'number') return; // N/A
    const m = maxOf(x.opts);
    if (m == null) return;
    score += o.score; max += m;
  });
  const pct = max > 0 ? Math.round((score / max) * 1000) / 10 : null;
  let result = '';
  if (critical) result = 'fail';
  else if (snap?.passAt != null && pct != null && !reqLeft) result = pct >= snap.passAt ? 'pass' : 'fail';
  return { score: round(score), max: round(max), pct, answered: done, total, result, critical };
}
const round = (n) => Math.round(n * 100) / 100;

/** What still needs filling in, by item id: "Answer this", "Add a comment", "Add a photo". */
/** tasksFor(itemId) → how many tasks it has (null: don't check tasks, like the first save of a new record). */
export function missing(snap, value, tasksFor = null) {
  const a = value?.a || {}, n = value?.n || {}, p = value?.p || {}, vis = visibleItems(snap, a), out = {};
  itemsOf(snap).forEach((x) => {
    if (!vis.has(x.id)) return;
    const v = a[x.id];
    if (!answered(x, v)) { if (x.required) out[x.id] = 'Answer this.'; return; }
    if (x.type === 'percent' && (num(v) < 0 || num(v) > 100)) { out[x.id] = 'A percent from 0 to 100.'; return; }
    if (!isFail(x, v)) return;
    const needC = x.onFail?.comment === 'req' && !str(n[x.id], MAX_TEXT), needP = x.onFail?.photo === 'req' && !(Array.isArray(p[x.id]) && p[x.id].length);
    const needT = x.onFail?.task === 'req' && tasksFor && !tasksFor(x.id);
    const what = [needC ? 'a comment' : '', needP ? 'a photo' : '', needT ? 'a task' : ''].filter(Boolean);
    if (what.length) out[x.id] = `Add ${what.length > 1 ? what.slice(0, -1).join(', ') + ' and ' + what[what.length - 1] : what[0]}.`;
  });
  return out;
}

/** The value to save: answers only for items showing, comments and photos only for fails, and the summary. */
export function cleanValue(snap, value, clId) {
  const a = value?.a || {}, n = value?.n || {}, p = value?.p || {}, vis = visibleItems(snap, a);
  const out = { cl: clId || value?.cl || '', ver: snap?.ver ?? value?.ver ?? 1, a: {}, n: {}, p: {}, l: {} };
  itemsOf(snap).forEach((x) => {
    if (!vis.has(x.id) || !answered(x, a[x.id])) return;
    let v = a[x.id];
    if (x.type === 'decimal' || x.type === 'percent') v = num(v);
    else if (x.type === 'text') v = String(v).slice(0, MAX_TEXT);
    else if (x.type === 'date') v = String(v).slice(0, 10);
    out.a[x.id] = v;
    if (x.type === 'choice') { const o = optOf(x, v); if (o?.label) out.l[x.id] = String(o.label).slice(0, 200); }
    if (isFail(x, v)) {
      if (x.onFail?.comment && str(n[x.id], MAX_TEXT)) out.n[x.id] = str(n[x.id], MAX_TEXT);
      if (x.onFail?.photo && Array.isArray(p[x.id]) && p[x.id].length) out.p[x.id] = p[x.id].slice(0, 10);
    }
  });
  if (!Object.keys(out.n).length) delete out.n;
  if (!Object.keys(out.p).length) delete out.p;
  if (!Object.keys(out.l).length) delete out.l;
  const s = summarize(snap, out);
  out.s = { score: s.score, max: s.max, pct: s.pct, answered: s.answered, total: s.total, result: s.result, critical: !!s.critical };
  return out;
}

/** Is a checklist value empty (nothing answered)? */
export const isBlankValue = (v) => !v || typeof v !== 'object' || !v.a || !Object.keys(v.a).length;

/** "14 / 18 · 78% · Fail · 9 of 10 answered" from a saved value's summary. */
export function summaryText(v) {
  const s = v?.s;
  if (!s || isBlankValue(v)) return '';
  const parts = [];
  if (s.max > 0) parts.push(`${fmtN(s.score)} / ${fmtN(s.max)}`, `${fmtN(s.pct)}%`);
  if (s.result) parts.push(s.result === 'pass' ? 'Pass' : 'Fail');
  parts.push(`${s.answered} of ${s.total} answered`);
  return parts.join(' · ');
}
const fmtN = (n) => (typeof n === 'number' ? (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '')) : '');

/** An answer in words. dateText: formats a date. */
export function answerText(item, v, dateText = (d) => d) {
  if (!answered(item, v)) return '';
  if (item.type === 'choice') return optOf(item, v)?.label || '';
  if (item.type === 'percent') return `${fmtN(num(v))}%`;
  if (item.type === 'decimal') return String(num(v));
  if (item.type === 'date') return dateText(v);
  return String(v);
}

/** One row per item for PDFs and the record when read: [{ section } | { label, answer, score, fail, comment, files }]. */
export function rowsOf(snap, value, dateText) {
  const a = value?.a || {}, n = value?.n || {}, p = value?.p || {}, vis = visibleItems(snap, a);
  const out = [];
  (snap?.items || []).forEach((x) => {
    if (x.kind === 'section') { out.push({ section: x.label }); return; }
    if (!vis.has(x.id)) return;
    const o = x.type === 'choice' ? optOf(x, a[x.id]) : null, m = x.type === 'choice' ? maxOf(x.opts) : null;
    out.push({ id: x.id, label: x.label, answer: answerText(x, a[x.id], dateText), score: o && typeof o.score === 'number' && m != null ? `${fmtN(o.score)} / ${fmtN(m)}` : '', fail: isFail(x, a[x.id]), critical: x.critical, comment: n[x.id] || '', files: Array.isArray(p[x.id]) ? p[x.id] : [] });
  });
  // drop sections with nothing showing under them
  return out.filter((r, i) => !r.section || (out[i + 1] && !out[i + 1].section));
}

/** For the audit trail: which answers changed, in words. */
export function answerChanges(snap, before, after, dateText) {
  const a0 = before?.a || {}, a1 = after?.a || {}, out = [];
  itemsOf(snap).forEach((x) => {
    const t0 = answerText(x, a0[x.id], dateText), t1 = answerText(x, a1[x.id], dateText);
    if (t0 !== t1) out.push(`${x.label}: ${t1 || '(cleared)'}`);
  });
  return out;
}
