// The question pool (Settings › Checklists › Questions): every checklist question once, in
// categories, so the same question can be on several checklists and its answers can be trended
// across all of them. Pure functions (no DOM, no Firebase), unit-tested.
//
//   checklistQuestions/{id}  { label, help, set, onFail: { comment, photo }, catId }
//   checklistCats/{id}       { name, color, order }
//
// A checklist item's id IS its question's id, so answers on records are kept by question, whichever
// checklist they came from. The item keeps a copy of the question's wording, help, answers and
// On fail (what the checklist's versions are made from); Required, Critical, Only if and sections
// belong to the checklist. Saving copies the pool's current question into every checklist using it.
import { isBuiltIn } from './checklistlogic.js';

const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const mode = (v) => (v === 'ask' || v === 'req' ? v : '');
export const norm = (s) => String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}%]+/gu, ' ').trim();

/** A question, tidied for saving. */
export function cleanQuestion(d) {
  return { label: str(d?.label, 300), help: str(d?.help, 300), set: str(d?.set, 40), onFail: { comment: mode(d?.onFail?.comment), photo: mode(d?.onFail?.photo), task: mode(d?.onFail?.task) }, catId: str(d?.catId, 60) };
}
export function questionIssues(q, sets) {
  const out = [];
  if (!str(q?.label, 300)) out.push('Write the question.');
  if (!q?.set) out.push('Pick its answers.');
  else if (!isBuiltIn(q.set) && !(sets instanceof Map ? sets.get(q.set) : (sets || []).find((s) => s.id === q.set))) out.push('Its answer set was deleted. Pick another.');
  return out;
}
/** The parts of a question an item copies. */
export const copyOf = (q) => ({ label: q.label, help: q.help || '', set: q.set, onFail: { comment: mode(q.onFail?.comment), photo: mode(q.onFail?.photo), task: mode(q.onFail?.task) } });
/** Does a change alter what the question asks (its wording or its answers)? Help, On fail and category don't. */
export const changesMeaning = (a, b) => norm(a?.label) !== norm(b?.label) || (a?.set || '') !== (b?.set || '');
const differs = (a, b) => JSON.stringify(copyOf(a)) !== JSON.stringify(copyOf(b));

/** Checklists using a question: [checklist]. */
export const usedBy = (qid, checklists) => (checklists || []).filter((c) => (c.items || []).some((x) => x.kind === 'item' && x.id === qid));
/** A pool question with this wording and answers (to link to, not duplicate). */
export function poolMatch(pool, label, set) {
  const k = norm(label);
  return [...(pool instanceof Map ? pool.values() : pool || [])].find((q) => norm(q.label) === k && (!set || q.set === set)) || null;
}
/** Items with the pool's current wording, help, answers and On fail. */
export function syncItems(items, pool) {
  const by = pool instanceof Map ? pool : new Map((pool || []).map((q) => [q.id, q]));
  return (items || []).map((x) => (x.kind === 'item' && by.has(x.id) ? { ...x, ...copyOf(by.get(x.id)) } : x));
}

/**
 * What saving a checklist (its draft items) does to the pool:
 *   creates  questions not in the pool yet: [{ id, q }]
 *   updates  questions this changes: [{ id, q, others: [checklist ids also using it], meaning: bool }]
 *   asks     the updates that change the meaning of a question other checklists use (someone chooses:
 *            update it everywhere, or save this one as a new question)
 */
export function planSave(items, pool, checklists, clId, catFor = () => '') {
  const by = pool instanceof Map ? pool : new Map((pool || []).map((q) => [q.id, q]));
  const creates = [], updates = [];
  (items || []).forEach((x) => {
    if (x.kind !== 'item') return;
    const q = by.get(x.id);
    if (!q) { creates.push({ id: x.id, q: { ...copyOf(x), catId: catFor(x) } }); return; }
    if (!differs(q, x)) return;
    const others = usedBy(x.id, checklists).filter((c) => c.id !== clId).map((c) => c.id);
    updates.push({ id: x.id, q: { ...q, ...copyOf(x) }, others, meaning: changesMeaning(q, x) });
  });
  return { creates, updates, asks: updates.filter((u) => u.meaning && u.others.length) };
}
/** Saving an item as a new question instead: a new id, and this checklist's Only if pointing to it follows. */
export function forkItem(items, oldId, newId) {
  return (items || []).map((x) => (x.id === oldId ? { ...x, id: newId } : x.showIf?.item === oldId ? { ...x, showIf: { ...x.showIf, item: newId } } : x));
}

/**
 * Moving checklists made before the pool into it: each item becomes a pool question; items with the
 * same wording and answers become one. Returns { questions: [{ id, q }], remap: { checklistId: { oldItemId: newId } } }.
 */
export function planMigration(checklists, pool, uid) {
  const by = pool instanceof Map ? new Map(pool) : new Map((pool || []).map((q) => [q.id, q]));
  const questions = [], remap = {};
  const keyOf = (x) => norm(x.label) + '|' + x.set;
  const byKey = new Map([...by.values()].map((q) => [keyOf(q), q.id]));
  (checklists || []).forEach((c) => {
    const seen = new Set();
    const map = (from, to) => { if (from !== to) (remap[c.id] = remap[c.id] || {})[from] = to; seen.add(to); };
    (c.items || []).forEach((x) => {
      if (x.kind !== 'item') return;
      const k = keyOf(x), have = by.get(x.id);
      if (have && keyOf(have) === k && !seen.has(x.id)) { seen.add(x.id); return; } // already in the pool
      const hit = byKey.get(k);
      if (hit && !seen.has(hit)) { map(x.id, hit); return; } // the same question: one in the pool
      const id = have || seen.has(x.id) ? 'i' + uid() : x.id; // that id is another question: a new one
      const q = { ...copyOf(x), catId: '' };
      by.set(id, { id, ...q }); byKey.set(k, id); questions.push({ id, q }); map(x.id, id);
    });
  });
  return { questions, remap };
}
/** A checklist's items with ids remapped (and Only if following). */
export function remapItems(items, map) {
  if (!map) return items;
  return (items || []).map((x) => ({ ...x, id: map[x.id] || x.id, ...(x.showIf ? { showIf: { ...x.showIf, item: map[x.showIf.item] || x.showIf.item } } : {}) }));
}

/** Pool questions matching a search: by words in the wording or help, best first. */
export function searchPool(pool, text, { catId = null, exclude = new Set(), limit = 8 } = {}) {
  const words = norm(text).split(' ').filter(Boolean);
  const list = [...(pool instanceof Map ? pool.values() : pool || [])].filter((q) => !exclude.has(q.id) && (catId == null || (q.catId || '') === catId));
  if (!words.length) return list.slice(0, limit);
  return list.map((q) => {
    const l = norm(q.label), h = norm(q.help);
    if (!words.every((w) => l.includes(w) || h.includes(w))) return null;
    return { q, r: (l.startsWith(words[0]) ? 0 : 1) + (words.every((w) => l.includes(w)) ? 0 : 1) };
  }).filter(Boolean).sort((a, b) => a.r - b.r || a.q.label.localeCompare(b.q.label)).slice(0, limit).map((x) => x.q);
}
