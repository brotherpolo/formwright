// Checklists to and from a spreadsheet (Settings › Checklists › Import / Export). One row per item
// on the Checklists sheet; new answer sets on the Answer sets sheet. Export writes the same layout,
// so a checklist can go out to Excel and come back. Pure functions (no DOM, no Firebase).
//
//   Checklists:  Type | Checklist | Pass at | Section | Question | Category | Answers | Required | Critical | On fail | Help | Show only if
//   Answer sets: Answer set | Answer | Score | Fail
//
//   Answers       an answer set's name, or Text, Date, Decimal, Percent
//   On fail       "comment", "comment required", "photo", "photo required", or both: "comment required, photo"
//   Show only if  "<an earlier question> = Fail" (several answers: "= Fail, N/A")
import { BUILT_IN, isBuiltIn, cleanSet, setIssues, checklistIssues, MAX_ITEMS, MAX_OPTIONS } from './checklistlogic.js';
import { poolMatch } from './poollogic.js';

export const COLS = ['Type', 'Checklist', 'Pass at', 'Section', 'Question', 'Category', 'Answers', 'Required', 'Critical', 'On fail', 'Help', 'Show only if'];
export const SET_COLS = ['Answer set', 'Answer', 'Score', 'Fail'];
export const MAX_ROWS = 5000;
const KEYS = ['type', 'checklist', 'passAt', 'section', 'question', 'category', 'answers', 'required', 'critical', 'onFail', 'help', 'showIf'];
const SET_KEYS = ['set', 'answer', 'score', 'fail'];

const txt = (v) => (v == null ? '' : String(v)).replace(/\s+/g, ' ').trim();
const norm = (s) => txt(s).toLowerCase().replace(/[^\p{L}\p{N}%]+/gu, ' ').trim();
const same = (a, b) => norm(a) === norm(b);
const yes = (v) => /^(y|yes|true|1|x|✓|✔)$/i.test(txt(v));
const BUILT = new Map(BUILT_IN.map(([k, l]) => [norm(l), k]));

/* ---------- writing ---------- */

const onFailText = (o) => [o?.comment ? 'comment' + (o.comment === 'req' ? ' required' : '') : '', o?.photo ? 'photo' + (o.photo === 'req' ? ' required' : '') : ''].filter(Boolean).join(', ');
const head = (cols) => cols.map((c) => ({ v: c, s: 'head' }));

/** The workbook for these checklists: [{ name, rows, cols, freeze }] for xlsx.js writeXlsx. */
export function exportSheets({ checklists, types, sets, questions = [], cats = [] }) {
  const catName = new Map(questions.map((q) => [q.id, (cats.find((c) => c.id === q.catId) || {}).name || '']));
  const typeName = new Map((types || []).map((t) => [t.id, t.name]));
  const setById = new Map((sets || []).map((s) => [s.id, s]));
  const used = new Set();
  const rows = [head(COLS)];
  (checklists || []).forEach((c) => {
    let sec = '', first = true;
    const labels = new Map((c.items || []).filter((x) => x.kind === 'item').map((x) => [x.id, x.label]));
    (c.items || []).forEach((x) => {
      if (x.kind === 'section') { sec = x.label || ''; return; }
      const s = setById.get(x.set);
      if (s) used.add(s.id);
      const showIf = x.showIf && labels.get(x.showIf.item) ? `${labels.get(x.showIf.item)} = ${(x.showIf.any || []).map((id) => (setById.get((c.items.find((y) => y.id === x.showIf.item) || {}).set)?.options || []).find((o) => o.id === id)?.label).filter(Boolean).join(', ')}` : '';
      rows.push([typeName.get(c.typeId) || '', c.name, first && c.passAt != null ? c.passAt : '', sec, x.label, catName.get(x.id) || '', isBuiltIn(x.set) ? BUILT_IN.find((b) => b[0] === x.set)[1] : s ? s.name : '', x.required ? 'Yes' : '', x.critical ? 'Yes' : '', onFailText(x.onFail), x.help || '', showIf]);
      first = false;
    });
  });
  const setRows = [head(SET_COLS)];
  (sets || []).filter((s) => used.has(s.id)).forEach((s) => (s.options || []).forEach((o) => setRows.push([s.name, o.label, o.score ?? '', o.fail ? 'Yes' : ''])));
  return [
    { name: 'Checklists', rows, freeze: 1, cols: [18, 24, 8, 18, 40, 16, 20, 9, 8, 22, 30, 30].map((width) => ({ width })) },
    { name: 'Answer sets', rows: setRows, freeze: 1, cols: [24, 20, 8, 6].map((width) => ({ width })) },
    { name: 'How to fill this in', rows: GUIDE.map((r) => [r[0] ? { v: r[0], s: 'bold' } : '', r[1] || '']), cols: [{ width: 16 }, { width: 100 }] },
  ];
}
const GUIDE = [
  ['Checklists', 'One row per item. Rows with the same Type and Checklist make one checklist, in the order they’re listed.'],
  ['Type', 'The group it goes in, like Safety inspections. A new name makes a new type. (Importing into one type: leave it empty.)'],
  ['Checklist', 'The checklist’s name. If that type already has one with this name, you choose: update it (a new version), add a copy, or skip.'],
  ['Pass at', 'A percent from 0 to 100 on any of its rows (the first one counts). Empty: no pass mark.'],
  ['Section', 'A heading. Items with the same section in a row go under it.'],
  ['Question', 'What to check. Needed on every row. A question already in the question pool (the same words and answers) is linked, not copied, so it trends across checklists.'],
  ['Category', 'The question’s category in the pool, like Fire. A new name makes a new category. (For a question already in the pool, its category there stays.)'],
  ['Answers', 'An answer set by name (one you have, or one on the Answer sets sheet), or Text, Date, Decimal, Percent.'],
  ['Required', 'Yes: it must be answered to save the record.'],
  ['Critical', 'Yes: a fail here fails the whole checklist.'],
  ['On fail', 'comment, comment required, photo, photo required, or both, like “comment required, photo”.'],
  ['Help', 'A line under the question.'],
  ['Show only if', 'Show it only when an earlier question has one of these answers: “Extinguishers in date = Fail” or “= Fail, N/A”.'],
  ['', ''],
  ['Answer sets', 'One row per answer: Answer set, Answer, Score (empty: not counted, like N/A), Fail (Yes: it counts as a fail).'],
];
/** The template: the layout, with an example. */
export function templateSheets() {
  const sheets = exportSheets({ checklists: [], types: [], sets: [] });
  sheets[0].rows.push(
    ['Safety inspections', 'Daily site walk', 80, 'Access', 'Walkways clear of materials', 'Housekeeping', 'Pass / Fail / N/A', 'Yes', '', 'comment required', 'Stairs, corridors and exits', ''],
    ['Safety inspections', 'Daily site walk', '', 'Access', 'Fire extinguishers in date', 'Fire', 'Pass / Fail / N/A', 'Yes', 'Yes', 'photo', '', ''],
    ['Safety inspections', 'Daily site walk', '', 'Access', 'Extinguisher expiry date', 'Fire', 'Date', '', '', '', '', 'Fire extinguishers in date = Fail'],
    ['Safety inspections', 'Daily site walk', '', 'Working at height', 'Harness condition', 'Working at height', 'Condition 1–5', 'Yes', '', '', '', ''],
    ['Vehicle checks', 'Pre-trip', 90, '', 'Tyres', 'Vehicles', 'Good / Worn / Replace', 'Yes', '', 'comment', '', ''],
  );
  sheets[1].rows.push(['Pass / Fail / N/A', 'Pass', 1, ''], ['Pass / Fail / N/A', 'Fail', 0, 'Yes'], ['Pass / Fail / N/A', 'N/A', '', ''],
    ['Condition 1–5', '1', 0, 'Yes'], ['Condition 1–5', '2', 1, ''], ['Condition 1–5', '3', 2, ''], ['Condition 1–5', '4', 3, ''], ['Condition 1–5', '5', 4, ''],
    ['Good / Worn / Replace', 'Good', 2, ''], ['Good / Worn / Replace', 'Worn', 1, ''], ['Good / Worn / Replace', 'Replace', 0, 'Yes']);
  return sheets;
}

/* ---------- reading ---------- */

function headerMap(row, cols, keys) {
  const at = {};
  (row || []).forEach((h, i) => { const k = cols.findIndex((c) => same(c, h) || (c === 'Show only if' && /^show (only )?if$/.test(norm(h))) || (c === 'Answers' && /^answer( type| set)?s?$/.test(norm(h)))); if (k >= 0 && at[keys[k]] == null) at[keys[k]] = i; });
  return at;
}
/** Which sheets hold the checklists and the answer sets. */
function findSheets(sheets) {
  const vis = (sheets || []).filter((s) => !s.hidden);
  const score = (s, cols) => { const at = headerMap(s.rows[0], cols, cols); return Object.keys(at).length; };
  const core = (s) => { const at = headerMap(s.rows[0], COLS, KEYS); return at.checklist != null && at.question != null; };
  const items = vis.find((s) => /checklist/i.test(s.name) && score(s, COLS) >= 2) || vis.find(core) || vis.find((s) => score(s, COLS) >= 3);
  const sets = vis.find((s) => s !== items && /answer/i.test(s.name) && score(s, SET_COLS) >= 2) || vis.find((s) => s !== items && score(s, SET_COLS) >= 3);
  return { items, sets };
}
const parseOnFail = (v) => {
  const t = txt(v).toLowerCase(), out = { comment: '', photo: '' };
  if (!t) return out;
  t.split(/\s*(?:,|and|\+|\/)\s*/).forEach((part) => {
    const req = /requir|must|need/.test(part);
    if (/comment|note/.test(part)) out.comment = req ? 'req' : 'ask';
    if (/photo|picture|image/.test(part)) out.photo = req ? 'req' : 'ask';
  });
  return out;
};
const num = (v) => { const t = txt(v).replace('%', ''); if (t === '') return null; const n = Number(t); return Number.isFinite(n) ? n : NaN; };

/**
 * What a file would do: { sets, types, checklists, problems, error }.
 *   existing { types, checklists, sets }; intoType: a type id (Type column optional) or ''; uid() for new ids.
 *   sets       [{ key, name, options, status: 'new'|'same'|'changed', id }]
 *   types      [{ key, name, status: 'new'|'same', id }]
 *   checklists [{ key, typeKey, typeName, name, passAt, items, status: 'new'|'update', existingId, existingVer, rows }]
 *   problems   [{ sheet, row, msg }] (rows with a problem are left out)
 */
export function planImport(sheets, existing, { intoType = '', uid }) {
  const exPool = existing.questions || [], exCats = existing.cats || [];
  const fileQs = new Map(), cats = [], catBy = new Map(); // questions new in this file (by wording + answers), new categories
  const catOf = (name) => { const t = txt(name); if (!t) return ''; const ex = exCats.find((c) => same(c.name, t)); if (ex) return ex.id; let c = catBy.get(norm(t)); if (!c) { c = { id: 'cc' + uid(), name: t.slice(0, 60), status: 'new' }; catBy.set(norm(t), c); cats.push(c); } return c.id; };
  const { items: sh, sets: ssh } = findSheets(sheets);
  if (!sh) return { error: 'This file has no Checklists sheet: a header row with at least Checklist and Question. Download the template to see the layout.' };
  const problems = [];
  const at = headerMap(sh.rows[0], COLS, KEYS);
  if (at.checklist == null || at.question == null) return { error: 'The Checklists sheet needs a Checklist column and a Question column. Download the template to see the layout.' };
  if (!intoType && at.type == null) return { error: 'The Checklists sheet needs a Type column (or import into one type, from that type’s ⋯ menu).' };
  if (sh.rows.length - 1 > MAX_ROWS) return { error: `That’s ${sh.rows.length - 1} rows. Import up to ${MAX_ROWS} at a time.` };
  const exSets = existing.sets || [], exTypes = existing.types || [], exCls = existing.checklists || [];

  // answer sets in the file
  const sets = [], setByName = new Map();
  if (ssh) {
    const sa = headerMap(ssh.rows[0], SET_COLS, SET_KEYS);
    if (sa.set == null || sa.answer == null) problems.push({ sheet: ssh.name, row: 1, msg: 'The Answer sets sheet needs Answer set and Answer columns, so it was left out.' });
    else ssh.rows.slice(1).forEach((r, i) => {
      const row = i + 2, name = txt(r[sa.set]), label = txt(r[sa.answer]);
      if (!name && !label) return;
      if (!name || !label) { problems.push({ sheet: ssh.name, row, msg: 'Needs both an Answer set and an Answer.' }); return; }
      let s = setByName.get(norm(name));
      if (!s) { s = { key: 's' + sets.length, name, options: [], rows: [] }; setByName.set(norm(name), s); sets.push(s); }
      if (s.options.some((o) => same(o.label, label))) { problems.push({ sheet: ssh.name, row, msg: `“${label}” is in “${name}” twice.` }); return; }
      if (s.options.length >= MAX_OPTIONS) { problems.push({ sheet: ssh.name, row, msg: `An answer set has at most ${MAX_OPTIONS} answers.` }); return; }
      const sc = sa.score == null ? null : num(r[sa.score]);
      if (Number.isNaN(sc)) { problems.push({ sheet: ssh.name, row, msg: `The score “${txt(r[sa.score])}” isn’t a number.` }); return; }
      s.options.push({ id: '', label, score: sc, fail: sa.fail == null ? false : yes(r[sa.fail]) });
      s.rows.push(row);
    });
  }
  sets.forEach((s) => {
    const ex = exSets.find((x) => same(x.name, s.name));
    s.options.forEach((o) => { o.id = ex?.options?.find((y) => same(y.label, o.label))?.id || 'o' + uid(); }); // keep answer ids where the label matches
    const iss = setIssues(s);
    if (iss.length) { s.status = 'bad'; problems.push({ sheet: ssh.name, row: s.rows[0], msg: `${s.name}: ${iss.join(' ')}` }); return; }
    if (!ex) { s.status = 'new'; s.id = 'as' + uid(); return; }
    s.id = ex.id;
    const a = cleanSet(ex), b = cleanSet(s);
    s.status = JSON.stringify(a.options) === JSON.stringify(b.options) ? 'same' : 'changed';
  });
  const okSets = sets.filter((s) => s.status !== 'bad');
  /** The answer set an Answers cell names: { set } (an id, or a built-in), or null. */
  const answerFor = (v) => {
    const t = norm(v);
    if (BUILT.has(t)) return { set: BUILT.get(t) };
    const f = okSets.find((s) => same(s.name, v));
    if (f) return { set: f.id, opts: f.options };
    const e = exSets.find((s) => same(s.name, v));
    return e ? { set: e.id, opts: e.options || [] } : null;
  };

  // types and checklists
  const types = [], typeBy = new Map(), cls = [], clBy = new Map();
  const intoT = intoType ? exTypes.find((t) => t.id === intoType) : null;
  const typeOf = (name) => {
    if (intoT) return { key: 't:' + intoT.id, name: intoT.name, status: 'same', id: intoT.id };
    let t = typeBy.get(norm(name));
    if (t) return t;
    const ex = exTypes.find((x) => same(x.name, name));
    t = ex ? { key: 't:' + ex.id, name: ex.name, status: 'same', id: ex.id } : { key: 'tn' + types.length, name, status: 'new', id: 'ct' + uid() };
    typeBy.set(norm(name), t); types.push(t);
    return t;
  };
  if (intoT) types.push({ key: 't:' + intoT.id, name: intoT.name, status: 'same', id: intoT.id });
  sh.rows.slice(1).forEach((r, i) => {
    const row = i + 2, cell = (k) => (at[k] == null ? '' : r[at[k]]);
    if (KEYS.every((k) => !txt(cell(k)))) return; // an empty row
    const tName = intoT ? intoT.name : txt(cell('type')), name = txt(cell('checklist')), q = txt(cell('question'));
    if (!intoT && !tName) { problems.push({ sheet: sh.name, row, msg: 'Needs a Type.' }); return; }
    if (!name) { problems.push({ sheet: sh.name, row, msg: 'Needs a Checklist name.' }); return; }
    if (!q) { problems.push({ sheet: sh.name, row, msg: 'Needs a Question.' }); return; }
    const t = typeOf(tName);
    const ck = t.key + '|' + norm(name);
    let c = clBy.get(ck);
    if (!c) {
      const ex = exCls.find((x) => (x.typeId || '') === (t.status === 'same' ? t.id : '__new') && same(x.name, name));
      c = { key: 'c' + cls.length, typeKey: t.key, typeName: t.name, typeId: t.id, name: name.slice(0, 80), passAt: null, items: [], rows: [], sec: null, status: ex ? 'update' : 'new', existingId: ex?.id || null, existingVer: ex?.ver || 0, exItems: ex?.items || [] };
      clBy.set(ck, c); cls.push(c);
    }
    const p = num(cell('passAt'));
    if (Number.isNaN(p) || (p != null && (p < 0 || p > 100))) problems.push({ sheet: sh.name, row, msg: `Pass at “${txt(cell('passAt'))}” isn’t a percent from 0 to 100, so it was left out.` });
    else if (p != null && c.passAt == null) c.passAt = p;
    const ans = answerFor(cell('answers'));
    if (!ans) { problems.push({ sheet: sh.name, row, msg: txt(cell('answers')) ? `“${txt(cell('answers'))}” isn’t an answer set here or on the Answer sets sheet.` : 'Needs Answers: an answer set, or Text, Date, Decimal, Percent.' }); return; }
    if (c.items.filter((x) => x.kind === 'item').length >= MAX_ITEMS - 20) { problems.push({ sheet: sh.name, row, msg: `A checklist has at most ${MAX_ITEMS - 20} items.` }); return; }
    const sec = txt(cell('section'));
    if (sec && !same(sec, c.sec || '')) c.items.push({ id: 's' + uid(), kind: 'section', label: sec.slice(0, 120) });
    c.sec = sec || c.sec;
    const canFail = !!ans.opts && ans.opts.some((o) => o.fail);
    const onFail = parseOnFail(cell('onFail')), critical = yes(cell('critical'));
    if ((onFail.comment || onFail.photo || critical) && !canFail) problems.push({ sheet: sh.name, row, msg: `Critical and On fail need answers that can fail; “${txt(cell('answers'))}” has none, so they were left out.` });
    const inPool = poolMatch(exPool, q, ans.set), fk = norm(q) + '|' + ans.set;
    if (!inPool && !fileQs.has(fk)) fileQs.set(fk, { id: c.exItems.find((x) => x.kind === 'item' && same(x.label, q) && x.set === ans.set && !exPool.some((p) => p.id === x.id))?.id || 'i' + uid(), catId: catOf(cell('category')) });
    const item = { id: inPool ? inPool.id : fileQs.get(fk).id, kind: 'item', label: q.slice(0, 300), help: txt(cell('help')).slice(0, 300), set: ans.set, required: yes(cell('required')), critical: canFail && critical, onFail: canFail ? onFail : { comment: '', photo: '' }, showIf: null, _opts: ans.opts };
    if (c.items.some((x) => x.id === item.id)) { problems.push({ sheet: sh.name, row, msg: `“${q}” is in “${c.name}” twice; the second was left out.` }); return; }
    const si = txt(cell('showIf'));
    if (si) {
      const m = /^(.*?)\s*(?:=|\bis\b|:)\s*(.+)$/i.exec(si);
      const src = m && [...c.items].reverse().find((x) => x.kind === 'item' && same(x.label, m[1]));
      if (!m) problems.push({ sheet: sh.name, row, msg: `Show only if “${si}”: write it like “Question = Fail”. It shows always for now.` });
      else if (!src) problems.push({ sheet: sh.name, row, msg: `Show only if names “${m[1]}”, which isn’t a question above it. It shows always for now.` });
      else if (!src._opts) problems.push({ sheet: sh.name, row, msg: `Show only if: “${src.label}” is answered with ${BUILT_IN.find((b) => b[0] === src.set)?.[1] || 'text'}, not choices. It shows always for now.` });
      else {
        const want = m[2].split(/\s*,\s*|\s+or\s+/i).map(txt).filter(Boolean);
        const ids = want.map((w) => src._opts.find((o) => same(o.label, w))?.id);
        if (ids.some((x) => !x)) problems.push({ sheet: sh.name, row, msg: `Show only if: “${src.label}” has no answer “${want[ids.findIndex((x) => !x)]}”. It shows always for now.` });
        else item.showIf = { item: src.id, any: ids };
      }
    }
    c.items.push(item); c.rows.push(row);
  });
  const setMap = new Map([...exSets.map((s) => [s.id, s]), ...okSets.map((s) => [s.id, s])]);
  cls.forEach((c) => {
    c.items.forEach((x) => { delete x._opts; });
    delete c.sec; delete c.exItems;
    const iss = checklistIssues({ name: c.name, items: c.items, passAt: c.passAt }, setMap);
    if (iss.length) { c.status = 'bad'; problems.push({ sheet: sh.name, row: c.rows[0] || 1, msg: `${c.name}: ${iss.join(' ')}` }); }
  });
  // answer sets in the file that no imported checklist uses still come in (they're useful on their own)
  const questions = [...fileQs.values()].map((f) => ({ id: f.id, catId: f.catId }));
  return { sets, types, questions, cats: cats.filter((c) => questions.some((q) => q.catId === c.id)), linked: cls.reduce((t, c) => t + c.items.filter((x) => x.kind === 'item' && exPool.some((p) => p.id === x.id)).length, 0), checklists: cls.filter((c) => c.status !== 'bad'), problems: problems.sort((a, b) => (a.sheet === b.sheet ? a.row - b.row : String(a.sheet).localeCompare(b.sheet))), sheet: sh.name };
}

/** "Daily site walk (2)": a name no checklist in that type has. */
export function copyName(name, taken) {
  const have = new Set((taken || []).map(norm));
  for (let n = 2; n < 100; n++) { const t = `${name} (${n})`.slice(0, 80); if (!have.has(norm(t))) return t; }
  return name;
}
