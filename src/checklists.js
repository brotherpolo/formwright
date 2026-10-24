// Settings › Checklists (administrators): the checklist library. Types group checklists; each
// checklist has sections and items, a pass mark and versions; answer sets are the reusable
// choices with scores. Forms use a checklist with the Checklist field. Logic: checklistlogic.js.

import { store, saveChecklistType, deleteChecklistType, saveAnswerSets, deleteAnswerSet, saveChecklist, deleteChecklist, savePoolWork } from './store.js';
import { cleanQuestion, questionIssues, copyOf, changesMeaning, usedBy, poolMatch, syncItems, planSave, forkItem, planMigration, remapItems, searchPool } from './poollogic.js';
import { renderMain, go } from './app.js';
import { esc, uid, toast } from './ui.js';
import { writeXlsx, readSheets } from './xlsx.js';
import { exportSheets, templateSheets, planImport, copyName } from './checklistio.js';
import { BUILT_IN, isBuiltIn, MAX_ITEMS, MAX_OPTIONS, FAIL_MODES, starterSets, cleanSet, setIssues, cleanItems, checklistIssues, snapshotOf, usesSet, maxOf, SET_COLORS, setColor, scoreBand } from './checklistlogic.js';
const FAIL_WHAT = { comment: 'Comment', photo: 'Photo', task: 'Task' };
const TASK_HELP = '<p class="help cl-fhelp">Task <b>Offer</b>: a fail shows “+ Add a task” (Cadence). <b>Required</b>: one is needed before saving, from the second save on.</p>';

let D = null; // { tab, sel, cl (draft), sets (draft), typeNew, typeRen, confirm, busy }
const fresh = () => ({ tab: 'checklists', sel: null, it: null, fold: new Set(), setEdit: null, pq: { cat: null, q: '', filter: 'all', sel: null, draft: null }, ask: null, picker: null, migrated: false, cl: null, sets: null, typeNew: null, typeRen: null, confirm: null, busy: false, issues: [] });
const S = () => (D = D || fresh());

export const isDirty = () => !!(D && ((D.cl && D.cl.dirty) || (D.sets && D.sets.dirty) || D.pq?.draft?.dirty));
export function leave() { D = null; }
/** Open one checklist (from #/settings/checklists/<id>); false when it isn't there (yet). */
export function openById(id) { if (!store.checklists.some((c) => c.id === id)) return false; S(); D.tab = 'checklists'; pick(id); return true; }

const setsById = () => new Map(store.answerSets.map((s) => [s.id, s]));
const poolMap = () => new Map(store.checklistQuestions.map((q) => [q.id, q]));
const catOf = (id) => store.checklistCats.find((c) => c.id === id) || null;
const catColor = (id) => { const i = store.checklistCats.findIndex((c) => c.id === id); return i < 0 ? 'none' : setColor(store.checklistCats[i], i + 5); };
const typeName = (id) => store.checklistTypes.find((t) => t.id === id)?.name || 'No type';
/** Forms (and grids) whose Checklist field uses this checklist: ['Site walks', …]. */
export const formsUsing = (clId) => store.forms.filter((f) => (f.fields || []).some((x) => x.type === 'checklist' && x.checklist === clId)).map((f) => f.name || 'Untitled form');
const blankItem = () => ({ id: 'i' + uid(), kind: 'item', label: '', help: '', set: store.answerSets[0]?.id || 'text', required: false, critical: false, onFail: { comment: '', photo: '', task: '' }, showIf: null });

function pick(id) {
  const c = store.checklists.find((x) => x.id === id);
  D.sel = id; D.confirm = null; D.issues = []; D.it = null; D.fold = new Set();
  D.cl = c ? { id: c.id, name: c.name, typeId: c.typeId || '', passAt: c.passAt ?? '', items: syncItems(JSON.parse(JSON.stringify(c.items || [])), poolMap()), ver: c.ver || 0, isNew: false, dirty: false } : null;
}

/* ---------- the page ---------- */

export function viewChecklists() {
  S();
  if (D.cl && !D.cl.isNew && !D.cl.dirty) { const c = store.checklists.find((x) => x.id === D.cl.id); if (c && c.ver > D.cl.ver) pick(c.id); } // follow saves from elsewhere
  if (D.sets && !D.sets.dirty) D.sets = null;
  const head = `<div class="head"><div class="ttl"><div><h1>Checklists</h1><p class="sub">Reusable checklists with scored answers. Put one on any form with the <b>Checklist</b> field in the Form designer.</p></div></div></div>
  <div class="tabs cl-tabs" role="tablist"><button type="button" role="tab" class="tab${D.tab === 'checklists' ? ' on' : ''}" aria-selected="${D.tab === 'checklists'}" data-act="cl-tab" data-v="checklists">Checklists <span class="cl-n">${store.checklists.length}</span></button><button type="button" role="tab" class="tab${D.tab === 'pool' ? ' on' : ''}" aria-selected="${D.tab === 'pool'}" data-act="cl-tab" data-v="pool">Questions <span class="cl-n">${store.checklistQuestions.length}</span></button><button type="button" role="tab" class="tab${D.tab === 'sets' ? ' on' : ''}" aria-selected="${D.tab === 'sets'}" data-act="cl-tab" data-v="sets">Answer sets <span class="cl-n">${store.answerSets.length}</span></button><span class="cl-io"><button type="button" class="btn sm ghost" data-act="cl-tpl">⇩ Download template</button><button type="button" class="btn sm" data-act="cl-imp">⇧ Import…</button></span></div>`;
  if (!store.checklistsReady) return head + '<div class="panel empty"><p>Loading checklists…</p></div>';
  if (!D.migrated) { D.migrated = true; setTimeout(migrate, 0); }
  const modal = (D.ask ? askView() : '') + (D.picker ? pickerView() : '');
  if (D.imp) return head + importView();
  return head + (D.tab === 'sets' ? setsTab() : D.tab === 'pool' ? poolTab() : checklistsTab()) + modal;
}

function tree() {
  const groups = [...store.checklistTypes.map((t) => ({ id: t.id, name: t.name })), { id: '', name: 'No type' }];
  const menu = (k, items) => `<span class="cl-menuw"><button type="button" class="ibtn cl-dots" data-act="cl-menu" data-v="${esc(k)}" aria-haspopup="menu" aria-expanded="${D.menu === k}" aria-label="More">⋯</button>${D.menu === k ? `<span class="cl-menu" role="menu">${items}</span>` : ''}</span>`;
  const row = (c) => `<div class="cl-tirow"><button type="button" class="cl-ti${D.sel === c.id ? ' on' : ''}" data-act="cl-pick" data-id="${esc(c.id)}"${D.sel === c.id ? ' aria-current="true"' : ''}>${esc(c.name)} <small>v${c.ver || 1}</small></button>${menu('c:' + c.id, `<button type="button" role="menuitem" data-act="cl-exp" data-id="${esc(c.id)}">⇩ Export this checklist</button>`)}</div>`;
  const known = new Set(store.checklistTypes.map((t) => t.id));
  const html = groups.map((g) => {
    const cs = store.checklists.filter((c) => (g.id ? c.typeId === g.id : !known.has(c.typeId)));
    if (!g.id && !cs.length) return '';
    const ren = D.typeRen === g.id && g.id;
    const hd = ren ? `<div class="cl-th cl-ren"><input class="in" id="cl-typename" value="${esc(g.name)}" maxlength="80" aria-label="Type name"><button type="button" class="btn sm primary" data-act="cl-type-save" data-id="${esc(g.id)}">Save</button><button type="button" class="btn sm ghost" data-act="cl-type-cancel">Cancel</button></div>`
      : `<div class="cl-th"><span>${esc(g.name)}</span>${g.id ? `<span class="cl-tact"><button type="button" class="ibtn" data-act="cl-type-ren" data-id="${esc(g.id)}" aria-label="Rename ${esc(g.name)}" title="Rename">✎</button>${cs.length ? '' : `<button type="button" class="ibtn" data-act="cl-type-del" data-id="${esc(g.id)}" aria-label="Delete ${esc(g.name)}" title="Delete (it’s empty)">✕</button>`}<button type="button" class="ibtn" data-act="cl-new" data-id="${esc(g.id)}" aria-label="New checklist in ${esc(g.name)}" title="New checklist here">＋</button>${menu('t:' + g.id, `${cs.length ? `<button type="button" role="menuitem" data-act="cl-exp" data-type="${esc(g.id)}">⇩ Export the whole type</button>` : ''}<button type="button" role="menuitem" data-act="cl-imp" data-type="${esc(g.id)}">⇧ Import into this type…</button>`)}</span>` : ''}</div>`;
    return `<div class="cl-tg c-${g.id ? typeColor(g.id) : 'none'}">${hd}${cs.map(row).join('') || '<p class="help cl-none">No checklists yet.</p>'}</div>`;
  }).join('');
  const add = D.typeNew != null ? `<div class="cl-th cl-ren"><input class="in" id="cl-typename" value="${esc(D.typeNew)}" maxlength="80" placeholder="e.g. Safety inspections" aria-label="New type name"><button type="button" class="btn sm primary" data-act="cl-type-save">Add</button><button type="button" class="btn sm ghost" data-act="cl-type-cancel">Cancel</button></div>` : '';
  return `<nav class="cl-tree" aria-label="Checklists">${html || '<p class="help">Start with a type, like “Safety inspections”, then add checklists to it.</p>'}${add}
    <div class="cl-tadd"><button type="button" class="btn sm" data-act="cl-type-new">+ Type</button><button type="button" class="btn sm" data-act="cl-new" data-id="${esc(store.checklistTypes[0]?.id || '')}">+ Checklist</button></div></nav>`;
}

function checklistsTab() {
  if (!store.answerSets.length && !store.checklists.length) {
    return `<div class="panel empty"><h2>First, the answers</h2><p>Checklist items are answered from <b>answer sets</b>: choices with scores, like Pass / Fail / N/A. Start with the usual ones and change them any time.</p><button type="button" class="btn primary" data-act="cl-starter">Add Pass / Fail / N/A, Yes / No and Condition 1–5</button> <button type="button" class="btn" data-act="cl-tab" data-v="sets">Make my own</button></div>`;
  }
  const insp = D.cl ? inspector() : '';
  return `<div class="cl-cq"><div class="cl-wrap${insp ? ' has-insp' : ''}">${tree()}<div class="cl-main">${D.cl ? editor() : `<div class="panel empty"><p>${store.checklists.length ? 'Pick a checklist on the left, or make a new one.' : 'No checklists yet.'}</p><button type="button" class="btn primary" data-act="cl-new" data-id="${esc(store.checklistTypes[0]?.id || '')}">+ New checklist</button></div>`}</div>${insp}</div></div>`;
}

/* ---------- colours ---------- */
const setIdx = (id) => store.answerSets.findIndex((s) => s.id === id);
const colorOfSet = (s) => setColor(s, Math.max(0, setIdx(s?.id)));
const typeColor = (id) => { const i = store.checklistTypes.findIndex((t) => t.id === id); return i < 0 ? 'none' : SET_COLORS[(i + 4) % SET_COLORS.length]; };
const BUILT_ICON = { text: 'Aa', date: '📅', decimal: '1.5', percent: '%' };
/** An item's answers as a coloured chip: dots for each answer, best to worst. */
function answerChip(set) {
  if (isBuiltIn(set)) return `<span class="cl-chip c-builtin"><b>${BUILT_ICON[set]}</b>${esc(BUILT_IN.find((b) => b[0] === set)[1])}</span>`;
  const s = store.answerSets.find((y) => y.id === set);
  if (!s) return '<span class="cl-chip c-gone">Pick answers</span>';
  return `<span class="cl-chip c-${colorOfSet(s)}"><span class="cl-dots">${(s.options || []).slice(0, 6).map((o) => `<i class="b-${scoreBand(o, s.options)}"></i>`).join('')}</span>${esc(s.name)}</span>`;
}
const failable = (x) => { const s = !isBuiltIn(x.set) && store.answerSets.find((y) => y.id === x.set); return !!(s && (s.options || []).some((o) => o.fail)); };

/* ---------- the checklist: compact rows ---------- */

function itemRow(x, i, items, n) {
  const sel = D.it === x.id;
  if (x.kind === 'section') {
    const count = (() => { let k = 0; for (let j = i + 1; j < items.length && items[j].kind !== 'section'; j++) k++; return k; })();
    const shut = D.fold.has(x.id);
    return `<div class="cl-band${sel ? ' sel' : ''}${shut ? ' shut' : ''}" data-row="${i}" draggable="true"><button type="button" class="cl-fold" data-act="cl-fold" data-id="${esc(x.id)}" aria-expanded="${!shut}" aria-label="${shut ? 'Open' : 'Fold'} ${esc(x.label || 'section')}">${shut ? '▸' : '▾'}</button><button type="button" class="cl-bandl" data-act="cl-item" data-i="${i}">${esc(x.label || 'Untitled section')}<small> · ${count} item${count === 1 ? '' : 's'}</small></button></div>`;
  }
  const src = x.showIf && items.find((y) => y.id === x.showIf.item);
  const srcN = src ? items.filter((y) => y.kind === 'item').indexOf(src) + 1 : 0;
  const ifWords = src ? (store.answerSets.find((z) => z.id === src.set)?.options || []).filter((o) => x.showIf.any.includes(o.id)).map((o) => o.label).join(' or ') : '';
  const fail = [x.onFail?.comment ? '💬' : '', x.onFail?.photo ? '📷' : '', x.onFail?.task ? '✅' : ''].join('');
  const failReq = x.onFail?.comment === 'req' || x.onFail?.photo === 'req' || x.onFail?.task === 'req';
  const badges = [x.required ? '<span class="cl-b req">Required</span>' : '', x.critical ? '<span class="cl-b crit">▲ Critical</span>' : '', fail ? `<span class="cl-b fail">${fail} ${failReq ? 'required' : 'on fail'}</span>` : '', src ? `<span class="cl-b if">↳ if ${srcN} is ${esc(ifWords || '…')}</span>` : ''].join('');
  return `<div class="cl-row${sel ? ' sel' : ''}${x.critical ? ' crit' : ''}${src ? ' child' : ''}" data-row="${i}" draggable="true">
    <span class="cl-grip" aria-hidden="true" title="Drag to move">⋮⋮</span><span class="cl-n">${n}</span>
    <button type="button" class="cl-rq" data-act="cl-item" data-i="${i}" aria-pressed="${sel}">${rowCat(x)}${esc(x.label || 'New question')}${x.help ? `<small>${esc(x.help)}</small>` : ''}</button>
    ${answerChip(x.set)}<span class="cl-bdg">${badges}</span></div>`;
}

function editor() {
  const c = D.cl, sets = setsById();
  const live = store.checklists.find((x) => x.id === c.id);
  const used = c.isNew ? [] : formsUsing(c.id);
  const its = c.items.filter((x) => x.kind === 'item');
  const maxScore = its.reduce((t, x) => { const s = sets.get(x.set); const m = s ? maxOf(s.options) : null; return t + (m || 0); }, 0);
  let n = 0, shut = false;
  const rows = c.items.map((x, i) => {
    if (x.kind === 'section') { shut = D.fold.has(x.id); return itemRow(x, i, c.items, 0); }
    n++;
    return shut ? '' : itemRow(x, i, c.items, n);
  }).join('');
  const pass = c.passAt === '' || c.passAt == null ? null : Number(c.passAt);
  const tc = typeColor(c.typeId);
  const stat = (k, cls, label) => (k ? `<span class="cl-stat ${cls}">${k} ${label}</span>` : '');
  const del = c.isNew ? '' : used.length ? `<span class="help" title="Used by ${esc(used.join(', '))}">On a form, so it can’t be deleted</span>` : `<button type="button" class="btn sm ghost danger${D.confirm === 'del' ? ' armed' : ''}" data-act="cl-del">${D.confirm === 'del' ? 'Click again to delete' : 'Delete checklist'}</button>`;
  return `<div class="panel cl-ed">
    <div class="cl-hdr"><input class="in cl-name" data-cli="name" value="${esc(c.name)}" maxlength="80" placeholder="Checklist name, e.g. Daily site walk" aria-label="Checklist name">
      <label class="cl-typepill c-${tc}"><span class="sr">Type</span><select data-clc="type" aria-label="Type"><option value="">No type</option>${store.checklistTypes.map((t) => `<option value="${esc(t.id)}"${t.id === c.typeId ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
      <span class="cl-pass"><span>Pass at</span><input type="range" min="0" max="100" step="5" data-clc="passRange" value="${pass ?? 0}" aria-label="Pass mark"${pass == null ? ' class="off"' : ''}><input class="in" type="number" min="0" max="100" step="1" data-cli="passAt" value="${esc(c.passAt ?? '')}" placeholder="—" aria-label="Pass mark, percent"><b>%</b></span></div>
    <div class="cl-stats">${stat(its.length, '', its.length === 1 ? 'item' : 'items')}${stat(its.filter((x) => x.critical).length, 's-crit', 'critical')}${stat(its.filter((x) => x.required).length, '', 'required')}${stat(its.filter((x) => x.showIf).length, 's-if', 'only if')}${maxScore ? `<span class="cl-stat s-best">best score ${maxScore}</span>` : ''}<span class="cl-meta">${c.isNew ? 'New' : `v${live?.ver || c.ver}`}${used.length ? ` · on ${esc(used.join(', '))}` : c.isNew ? '' : ' · not on a form yet'}</span></div>
    <div class="cl-list" id="cl-list">${rows || '<p class="help cl-none">Add the first question below.</p>'}</div>
    ${c.items.length < MAX_ITEMS ? `<div class="cl-quickw"><span class="cl-qwrap"><input class="in cl-quick" id="cl-quick" maxlength="300" placeholder="Add a question… (searches the pool; Enter adds it)" aria-label="Add a question" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="cl-qdd" autocomplete="off"><span class="cl-qdd" id="cl-qdd" role="listbox" hidden></span></span><button type="button" class="btn sm" data-act="cl-picker">☰ From the pool</button><button type="button" class="btn sm" data-act="cl-add-sec">+ Section</button></div>` : ''}
    ${D.issues.length ? `<div class="cl-issues" role="alert"><b>Before saving:</b><ul>${D.issues.map((m) => `<li>${esc(m)}</li>`).join('')}</ul></div>` : ''}
    <div class="cl-foot">${del}<span class="cl-grow"></span><span class="help" id="cl-dirty">${c.dirty ? (c.isNew ? 'Not saved yet' : `Unsaved · saving makes v${(live?.ver || c.ver) + 1}`) : ''}</span>${c.dirty && !c.isNew ? '<button type="button" class="btn ghost" data-act="cl-discard">Discard</button>' : ''}<button type="button" class="btn primary" data-act="cl-save"${D.busy ? ' disabled' : ''}>${D.busy ? 'Saving…' : 'Save'}</button></div>
  </div>`;
}

/* ---------- the picked item's settings ---------- */

/** Is the item panel a slide-in (not enough room for three panels)? Same width as checklists.css's @container. */
const drawerMode = () => { const c = document.querySelector('.cl-cq'); return !c || c.clientWidth <= (c.querySelector('.cl-pool') ? 1300 : 1060); };
function inspector() {
  const c = D.cl, i = c.items.findIndex((x) => x.id === D.it), x = c.items[i];
  if (!x) return `<aside class="panel cl-insp cl-insp0" aria-label="Item settings"><p class="help">Click a question to change its answers, Required, Critical, what a fail asks for, and when it shows.</p></aside>`;
  const at = `data-i="${i}"`, n = c.items.slice(0, i + 1).filter((y) => y.kind === 'item').length;
  const tools = `<span class="cl-itools"><button type="button" class="ibtn" data-act="cl-mv" ${at} data-dir="-1" aria-label="Move up"${i === 0 ? ' disabled' : ''}>↑</button><button type="button" class="ibtn" data-act="cl-mv" ${at} data-dir="1" aria-label="Move down"${i === c.items.length - 1 ? ' disabled' : ''}>↓</button>${x.kind === 'item' ? `<button type="button" class="ibtn" data-act="cl-dup" ${at} aria-label="Duplicate" title="Duplicate">⧉</button>` : ''}<button type="button" class="ibtn cl-danger" data-act="cl-del-item" ${at} aria-label="Delete" title="Delete">🗑</button><button type="button" class="ibtn cl-iclose" data-act="cl-insp-close" aria-label="Close">✕</button></span>`;
  if (x.kind === 'section') {
    return `<div class="cl-scrim" data-act="cl-insp-close" aria-hidden="true"></div><aside class="panel cl-insp" aria-label="Section settings"><div class="cl-ih"><b>Section</b>${tools}</div><div class="cl-ib">
      <label class="cl-lab" for="cl-in-label">Heading</label><input class="in" id="cl-in-label" data-cli="label" ${at} value="${esc(x.label)}" maxlength="120" placeholder="e.g. Working at height">
      <p class="help">Questions under it, until the next section, show under this heading on the record.</p></div></aside>`;
  }
  const s = !isBuiltIn(x.set) && store.answerSets.find((y) => y.id === x.set);
  const canFail = failable(x);
  const earlier = c.items.slice(0, i).filter((y) => y.kind === 'item' && !isBuiltIn(y.set) && store.answerSets.some((z) => z.id === y.set));
  const src = x.showIf && earlier.find((y) => y.id === x.showIf.item), srcSet = src && store.answerSets.find((z) => z.id === src.set);
  const seg = (k, v) => `<span class="cl-seg2" role="group" aria-label="${FAIL_WHAT[k]} on a fail">${FAIL_MODES.map(([m, l]) => `<button type="button" class="${(x.onFail?.[k] || '') === m ? 'on' : ''}" aria-pressed="${(x.onFail?.[k] || '') === m}" data-act="cl-fail" ${at} data-k="${k}" data-v="${m}">${m === '' ? 'Off' : k === 'task' && m === 'ask' ? 'Offer' : l}</button>`).join('')}</span>`;
  const setBtn = (y) => `<button type="button" class="cl-sp c-${colorOfSet(y)}${y.id === x.set ? ' on' : ''}" aria-pressed="${y.id === x.set}" data-act="cl-setpick" ${at} data-v="${esc(y.id)}"><i class="cl-sw"></i><span>${esc(y.name)}</span><span class="cl-mini">${(y.options || []).slice(0, 5).map((o) => `<em class="b-${scoreBand(o, y.options)}">${o.score ?? '–'}</em>`).join('')}</span></button>`;
  const prev = s ? `<div class="cl-pseg">${(s.options || []).map((o) => `<span class="${o.fail ? 'f' : ''}">${esc(o.label)}</span>`).join('')}</div>` : `<div class="cl-pin">${x.set === 'date' ? 'mm / dd / yyyy' : x.set === 'percent' ? '… %' : x.set === 'decimal' ? '0.0' : 'Type an answer'}</div>`;
  return `<div class="cl-scrim" data-act="cl-insp-close" aria-hidden="true"></div><aside class="panel cl-insp${x.critical ? ' crit' : ''}" aria-label="Item ${n} settings"><div class="cl-ih"><b>Item ${n}</b>${tools}</div><div class="cl-ib">
    <div><label class="cl-lab" for="cl-in-label">Question</label><input class="in" id="cl-in-label" data-cli="label" ${at} value="${esc(x.label)}" maxlength="300" placeholder="e.g. Walkways clear of materials"></div>
    <div><label class="cl-lab" for="cl-in-help">Help</label><input class="in" id="cl-in-help" data-cli="help" ${at} value="${esc(x.help || '')}" maxlength="300" placeholder="What to check (optional)"></div>
    <div class="cl-qpool">${(() => { const others = usedBy(x.id, store.checklists).filter((y) => y.id !== c.id); const inPool = poolMap().has(x.id); return `<div><label class="cl-lab" for="cl-in-cat">Category</label>${catSelect(x.catId ?? poolMap().get(x.id)?.catId ?? '', `id="cl-in-cat" data-clc="cat" ${at}`)}</div><p class="help">${!inPool ? 'A new question: saving puts it in the pool.' : others.length ? `Shared with ${esc(others.map((y) => y.name).join(', '))}. Wording, help, answers and On fail are the pool’s; Required, Critical and Show are this checklist’s.` : 'In the pool. Required, Critical and Show are this checklist’s.'}</p>`; })()}</div>
    <div><span class="cl-lab">Answers</span><div class="cl-setpick">${store.answerSets.map(setBtn).join('')}<div class="cl-builtins">${BUILT_IN.map(([k, l]) => `<button type="button" class="${x.set === k ? 'on' : ''}" aria-pressed="${x.set === k}" data-act="cl-setpick" ${at} data-v="${k}">${BUILT_ICON[k]} ${l}</button>`).join('')}</div></div></div>
    <div class="cl-tog"><button type="button" class="t-req${x.required ? ' on' : ''}" aria-pressed="${!!x.required}" data-act="cl-tog" ${at} data-k="required">${x.required ? '✓ ' : ''}Required</button><button type="button" class="t-crit${x.critical ? ' on' : ''}" aria-pressed="${!!x.critical}" data-act="cl-tog" ${at} data-k="critical"${canFail ? '' : ' disabled title="Needs answers with a Fail"'}>▲ Critical</button></div>
    ${canFail ? `<div class="cl-failbox"><span class="cl-lab">When the answer is a fail</span><div class="cl-frow">💬 Comment ${seg('comment')}</div><div class="cl-frow">📷 Photo ${seg('photo')}</div><div class="cl-frow">✅ Task ${seg('task')}</div>${TASK_HELP}</div>` : s ? '<p class="help">Mark an answer as <b>Fail</b> in its answer set to use Critical, and to ask for a comment, photo or task.</p>' : ''}
    <div class="cl-ifbox"><span class="cl-lab">Show</span>${earlier.length ? `<select class="in" data-clc="if" ${at} aria-label="When it shows"><option value="">Always</option>${earlier.map((y) => `<option value="${esc(y.id)}"${src && src.id === y.id ? ' selected' : ''}>Only if “${esc((y.label || 'Untitled').slice(0, 40))}” is…</option>`).join('')}</select>
      ${srcSet ? `<div class="cl-ifopts">${(srcSet.options || []).map((o) => `<button type="button" class="${x.showIf.any.includes(o.id) ? 'on' : ''}" aria-pressed="${x.showIf.any.includes(o.id)}" data-act="cl-ifopt" ${at} data-v="${esc(o.id)}">${esc(o.label)}</button>`).join('')}</div>` : ''}` : '<p class="help">Always. (“Only if” can use a choice question above this one.)</p>'}</div>
    <div class="cl-prev"><span class="cl-lab">Looks like</span><div class="cl-pq">${esc(x.label || 'Your question')}${x.required ? '<span class="req">*</span>' : ''}${x.critical ? ' <span class="cl-b crit">Critical</span>' : ''}</div>${x.help ? `<p class="help">${esc(x.help)}</p>` : ''}${prev}</div>
  </div></aside>`;
}

/* ---------- answer sets: a card each ---------- */

function setsDraft() {
  if (!D.sets) D.sets = { list: store.answerSets.map((s, i) => ({ id: s.id, ...cleanSet(s), color: setColor(s, i), isNew: false })), dirty: false, del: [] };
  return D.sets;
}
function scale(s) {
  return `<div class="cl-scale">${(s.options || []).map((o) => `<div class="b-${scoreBand(o, s.options)}${o.fail ? ' isfail' : ''}"><b>${esc(o.label || '—')}</b><small>${o.score == null ? 'not counted' : o.score}</small></div>`).join('')}</div>`;
}
function setsTab() {
  const sd = setsDraft();
  const card = (s, si) => {
    const used = store.checklists.filter((c) => usesSet(c, s.id));
    const nItems = used.reduce((t, c) => t + (c.items || []).filter((x) => x.kind === 'item' && x.set === s.id).length, 0);
    const best = maxOf(s.options), fails = s.options.filter((o) => o.fail).length;
    if (D.setEdit !== si) {
      return `<div class="panel cl-scard c-${s.color}"><div class="cl-schd"><b>${esc(s.name || 'Untitled answer set')}</b><button type="button" class="btn sm ghost" data-act="cl-set-edit" data-s="${si}">Edit</button></div>
        <span class="help">${used.length ? `Used by ${plural(used.length, 'checklist')} · ${plural(nItems, 'item')}` : 'Not used yet'}</span>${scale(s)}
        <div class="cl-smeta"><span>Best score ${best ?? '—'}</span><span>${fails ? plural(fails, 'fail') : 'No fails'}</span></div></div>`;
    }
    return `<div class="panel cl-scard cl-sedit c-${s.color}"><div class="cl-schd"><input class="in cl-setname" data-csi="name" data-s="${si}" value="${esc(s.name)}" maxlength="80" placeholder="Answer set name, e.g. Pass / Fail / N/A" aria-label="Answer set name">
        <span class="cl-swatches" role="radiogroup" aria-label="Colour">${SET_COLORS.map((k) => `<button type="button" role="radio" aria-checked="${s.color === k}" aria-label="${k}" title="${k}" class="c-${k}${s.color === k ? ' on' : ''}" data-act="cl-set-color" data-s="${si}" data-v="${k}"></button>`).join('')}</span>
        <button type="button" class="btn sm" data-act="cl-set-edit" data-s="">Done</button></div>
      <div class="cl-orows">${s.options.map((o, oi) => `<div class="cl-orow"><span class="cl-osw b-${scoreBand(o, s.options)}" aria-hidden="true"></span><input class="in" data-csi="olabel" data-s="${si}" data-o="${oi}" value="${esc(o.label)}" maxlength="60" placeholder="Answer" aria-label="Answer ${oi + 1}">
        <input class="in cl-score" type="number" step="any" data-csi="oscore" data-s="${si}" data-o="${oi}" value="${o.score ?? ''}" placeholder="not counted" aria-label="Score for ${esc(o.label || 'this answer')}">
        <button type="button" class="cl-fx${o.fail ? ' on' : ''}" aria-pressed="${o.fail}" data-act="cl-opt-fail" data-s="${si}" data-o="${oi}">${o.fail ? '⚑ ' : ''}Fail</button>
        <span class="cl-oact"><button type="button" class="ibtn" data-act="cl-opt-mv" data-s="${si}" data-o="${oi}" data-dir="-1" aria-label="Move up"${oi === 0 ? ' disabled' : ''}>↑</button><button type="button" class="ibtn" data-act="cl-opt-mv" data-s="${si}" data-o="${oi}" data-dir="1" aria-label="Move down"${oi === s.options.length - 1 ? ' disabled' : ''}>↓</button><button type="button" class="ibtn" data-act="cl-opt-del" data-s="${si}" data-o="${oi}" aria-label="Remove ${esc(o.label)}"${s.options.length <= 2 ? ' disabled' : ''}>✕</button></span></div>`).join('')}</div>
      <div class="cl-sfoot">${s.options.length < MAX_OPTIONS ? `<button type="button" class="btn sm ghost" data-act="cl-opt-add" data-s="${si}">+ Answer</button>` : ''}<span class="help">Best score ${best ?? '—'}. Leave a score empty for answers that don’t count, like N/A.</span><span class="cl-grow"></span>${used.length ? `<span class="help">Used by ${plural(used.length, 'checklist')}</span>` : `<button type="button" class="btn sm ghost danger" data-act="cl-set-del" data-s="${si}">Delete answer set</button>`}</div></div>`;
  };
  const changedIds = changedSets();
  const affected = store.checklists.filter((c) => changedIds.some((id) => usesSet(c, id)));
  return `<p class="help cl-sethelp">Choices with scores. Each answer is coloured by its score: best green, lowest red, not counted grey; <b>Fail</b> answers can ask for a comment or photo, and fail a Critical item. Text, Date, Decimal and Percent are always there and aren’t scored.</p>
    <div class="cl-sgrid">${sd.list.map(card).join('')}</div>
    <div class="cl-adds"><button type="button" class="btn" data-act="cl-set-add">+ Answer set</button>${!sd.list.length ? '<button type="button" class="btn" data-act="cl-starter">Add the usual ones</button>' : ''}</div>
    ${D.issues.length ? `<div class="cl-issues" role="alert"><b>Before saving:</b><ul>${D.issues.map((m) => `<li>${esc(m)}</li>`).join('')}</ul></div>` : ''}
    <div class="cl-foot"><span class="cl-grow"></span><span class="help" id="cl-dirty">${sd.dirty ? (affected.length ? `Saving also makes new versions of ${affected.map((c) => `“${esc(c.name)}”`).join(', ')}. Records already filled in keep theirs.` : 'Unsaved changes') : ''}</span>${sd.dirty ? '<button type="button" class="btn ghost" data-act="cl-sets-discard">Discard changes</button>' : ''}<button type="button" class="btn primary" data-act="cl-sets-save"${!sd.dirty || D.busy ? ' disabled' : ''}>${D.busy ? 'Saving…' : 'Save answer sets'}</button></div>`;
}
function changedSets() {
  if (!D.sets) return [];
  const live = new Map(store.answerSets.map((s, i) => [s.id, { ...s, color: setColor(s, i) }]));
  return D.sets.list.filter((s) => { const l = live.get(s.id); return !l || JSON.stringify(cleanSet(l)) !== JSON.stringify(cleanSet(s)); }).map((s) => s.id);
}

/* ---------- saving ---------- */

async function saveCl(choices = null) {
  const c = D.cl; if (!c || D.busy) return;
  const sets = setsById(), pool = poolMap();
  let items = cleanItems(c.items).map((x, i) => (x.kind === 'item' ? { ...x, catId: c.items.find((y) => y.id === x.id)?.catId } : x));
  const passAt = c.passAt === '' || c.passAt == null ? null : Number(c.passAt);
  const issues = checklistIssues({ name: c.name, items, passAt }, sets);
  D.issues = issues;
  if (issues.length) { renderMain(); document.querySelector('.cl-issues')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
  let plan = planSave(items, pool, store.checklists, c.id, (x) => x.catId || '');
  if (plan.asks.length && !choices) { D.ask = { from: 'cl', list: plan.asks.map((u) => ({ id: u.id, was: pool.get(u.id).label, now: u.q.label, others: u.others })), choice: {} }; renderMain(); setTimeout(() => document.querySelector('.cl-askbox input')?.focus(), 0); return; }
  // "Save as a new question": this checklist gets its own copy; the pool's stays as it was
  (plan.asks || []).forEach((u) => { if ((choices || {})[u.id] === 'new') items = forkItem(items, u.id, 'i' + uid()); });
  if (choices) plan = planSave(items, pool, store.checklists, c.id, (x) => x.catId || '');
  const qOut = new Map();
  plan.creates.forEach((x) => qOut.set(x.id, cleanQuestion(x.q)));
  plan.updates.forEach((u) => qOut.set(u.id, cleanQuestion(u.q)));
  items.forEach((x) => { if (x.kind !== 'item' || x.catId == null) return; const q = qOut.get(x.id) || pool.get(x.id); if (q && (q.catId || '') !== x.catId) qOut.set(x.id, cleanQuestion({ ...q, catId: x.catId })); }); // a new category: everywhere
  items = items.map(({ catId, ...x }) => x);
  const after = new Map([...pool, ...[...qOut].map(([id, q]) => [id, { id, ...q }])]);
  const live = store.checklists.find((x) => x.id === c.id);
  const ver = (live?.ver || 0) + 1;
  const base = { name: c.name.trim(), typeId: c.typeId || '', passAt, items: syncItems(items, after) };
  const outs = [{ id: c.id, data: { ...base, ver, snap: snapshotOf(base, sets, ver), createdAt: live?.createdAt || Date.now() } }];
  const touched = new Set(plan.updates.map((u) => u.id));
  outs.push(...reversion(store.checklists.filter((x) => x.id !== c.id && (x.items || []).some((y) => touched.has(y.id))), after));
  D.busy = true; D.ask = null; renderMain();
  try {
    await savePoolWork({ questions: [...qOut].map(([id, data]) => ({ id, data })), checklists: outs });
    D.cl = { ...c, items: base.items, isNew: false, dirty: false, ver };
    const n = outs.length - 1;
    toast((ver === 1 ? `Saved “${base.name}”. Add it to a form with the Checklist field.` : `Saved version ${ver}.`) + (n ? ` ${n} other checklist${n === 1 ? '' : 's'} sharing its questions also got a new version.` : ''), { duration: n ? 7000 : 4000 });
  } catch (e) { console.error(e); toast(e?.code === 'permission-denied' ? 'Only administrators can change checklists. (If you are one, deploy the latest Cadence rules.)' : 'Saving failed. Check your connection and try again.'); }
  D.busy = false; renderMain();
}
/** Checklists' next versions with the pool's current questions: [{ id, data }]. */
function reversion(list, pool) {
  const sets = setsById();
  return list.map((x) => {
    const v = (x.ver || 0) + 1, base = { name: x.name, typeId: x.typeId || '', passAt: x.passAt ?? null, items: syncItems(x.items || [], pool) };
    return { id: x.id, data: { ...base, ver: v, snap: snapshotOf(base, sets, v), createdAt: x.createdAt || Date.now() } };
  });
}
/** Checklists made before the pool: their questions go into it (once, quietly, by an administrator). */
async function migrate() {
  if (!D || !store.checklistsReady || store.me?.role !== 'admin') { if (D) D.migrated = !store.checklistsReady ? false : D.migrated; return; }
  const { questions, remap } = planMigration(store.checklists, store.checklistQuestions, uid);
  if (!questions.length && !Object.keys(remap).length) return;
  const pool = new Map([...poolMap(), ...questions.map((x) => [x.id, { id: x.id, ...x.q }])]);
  const outs = reversion(store.checklists.filter((c) => remap[c.id]).map((c) => ({ ...c, items: remapItems(c.items, remap[c.id]) })), pool);
  try {
    await savePoolWork({ questions: questions.map((x) => ({ id: x.id, data: cleanQuestion(x.q) })), checklists: outs });
    toast(`Moved ${questions.length} checklist question${questions.length === 1 ? '' : 's'} into the question pool${outs.length ? `; ${outs.length} checklist${outs.length === 1 ? '' : 's'} sharing the same questions now point to one` : ''}. Give them categories under Questions.`, { duration: 9000 });
    if (D?.cl && !D.cl.dirty && remap[D.cl.id]) pick(D.cl.id);
  } catch (e) { console.warn('[formwright] question pool', e?.code || e); } // older rules: try again next time
}

async function saveSets() {
  const sd = D.sets; if (!sd || D.busy) return;
  const issues = sd.list.flatMap((s, i) => setIssues(s).map((m) => `${s.name || 'Answer set ' + (i + 1)}: ${m}`));
  D.issues = issues;
  if (issues.length) { renderMain(); return; }
  const ids = changedSets();
  const after = new Map([...setsById(), ...sd.list.map((s) => [s.id, cleanSet(s)])]);
  const cls = store.checklists.filter((c) => ids.some((id) => usesSet(c, id))).map((c) => {
    const ver = (c.ver || 0) + 1;
    const base = { name: c.name, typeId: c.typeId || '', passAt: c.passAt ?? null, items: c.items };
    return { id: c.id, data: { ...base, ver, snap: snapshotOf(base, after, ver), createdAt: c.createdAt || Date.now() } };
  });
  D.busy = true; renderMain();
  try {
    await saveAnswerSets(sd.list.filter((s) => ids.includes(s.id)).map((s) => ({ id: s.id, data: cleanSet(s) })), cls);
    for (const id of sd.del) await deleteAnswerSet(id);
    D.sets = null; toast(cls.length ? `Saved. ${cls.length} checklist${cls.length === 1 ? '' : 's'} updated to a new version.` : 'Saved.');
  } catch (e) { console.error(e); toast(e?.code === 'permission-denied' ? 'Only administrators can change answer sets.' : 'Saving failed. Check your connection and try again.'); }
  D.busy = false; renderMain();
}
async function addStarter() {
  const have = new Set(store.answerSets.map((s) => s.name));
  const list = starterSets(() => 'o' + uid()).filter((s) => !have.has(s.name)).map((s) => ({ id: s.id + '_' + uid().slice(0, 4), data: cleanSet(s) }));
  try { await saveAnswerSets(list); toast('Added Pass / Fail / N/A, Yes / No and Condition 1–5.'); D.sets = null; }
  catch (e) { console.error(e); toast('Couldn’t add them. Check your connection, and that the latest Cadence rules are deployed.'); }
  renderMain();
}

/* ---------- events (from admin.js) ---------- */

const item = (el) => D?.cl?.items[+el.dataset.i];
function dirtyCl() {
  if (!D.cl) return;
  const first = !D.cl.dirty; D.cl.dirty = true;
  if (first) renderMainKeep(); // shows "Saving makes version N" and Discard changes
}
/** Redraw, keeping the cursor where it was (typing a name or a question). */
function renderMainKeep() {
  const ae = document.activeElement, sel = ae && ae.dataset && (ae.dataset.cli || ae.dataset.csi) ? `[data-${ae.dataset.cli ? 'cli' : 'csi'}="${ae.dataset.cli || ae.dataset.csi}"]${ae.dataset.i != null ? `[data-i="${ae.dataset.i}"]` : ''}${ae.dataset.s != null ? `[data-s="${ae.dataset.s}"]` : ''}${ae.dataset.o != null ? `[data-o="${ae.dataset.o}"]` : ''}` : null;
  const pos = sel ? [ae.selectionStart, ae.selectionEnd] : null;
  renderMain();
  if (sel) { const n = document.querySelector(sel); if (n) { n.focus({ preventScroll: true }); try { n.setSelectionRange(pos[0], pos[1]); } catch (e) { /* number inputs */ } } }
}
function dirtySets() { D.sets.dirty = true; const n = document.getElementById('cl-dirty'); if (n && !n.textContent) n.textContent = 'Unsaved changes'; const b = document.querySelector('[data-act="cl-sets-save"]'); if (b) b.disabled = false; }
const focusLater = (sel) => setTimeout(() => document.querySelector(sel)?.focus(), 0);

export async function onClick(a, el) {
  if (!a.startsWith('cl-')) return false;
  S();
  if (a !== 'cl-del') D.confirm = null;
  if (a !== 'cl-menu') D.menu = null;
  if (await poolClick(a, el)) return true;
  switch (a) {
    case 'cl-menu': D.menu = D.menu === el.dataset.v ? null : el.dataset.v; renderMain(); return true;
    case 'cl-tpl': await downloadTemplate(); return true;
    case 'cl-exp': await exportFile(el.dataset.id ? store.checklists.filter((c) => c.id === el.dataset.id) : store.checklists.filter((c) => c.typeId === el.dataset.type)); renderMain(); return true;
    case 'cl-imp': if (isDirty()) { toast('Save or discard your changes first.'); renderMain(); return true; } D.imp = { intoType: el.dataset.type || '', plan: null, choice: {}, err: '', busy: false, fileName: '' }; renderMain(); setTimeout(() => document.getElementById('cl-impfile')?.focus(), 0); return true;
    case 'cl-imp-cancel': D.imp = null; renderMain(); return true;
    case 'cl-imp-again': D.imp = { ...D.imp, plan: null, err: '', fileName: '' }; renderMain(); return true;
    case 'cl-imp-go': await applyImport(); return true;
    case 'cl-tab': D.tab = el.dataset.v; D.issues = []; D.imp = null; renderMain(); return true;
    case 'cl-pick': if (D.cl?.dirty && D.cl.id !== el.dataset.id) { toast('You have unsaved changes. Save or discard them first.'); return true; } pick(el.dataset.id); go({ name: 'checklists', clId: el.dataset.id }, true); renderMain(); return true;
    case 'cl-new': { if (D.cl?.dirty) { toast('Save or discard your changes first.'); return true; } const id = 'cl' + uid(); D.sel = id; D.issues = []; const first = blankItem(); D.cl = { id, name: '', typeId: el.dataset.id || '', passAt: 80, items: [first], ver: 0, isNew: true, dirty: true }; D.it = first.id; D.fold = new Set(); renderMain(); focusLater('.cl-name'); return true; }
    case 'cl-discard': pick(D.cl.id); renderMain(); return true;
    case 'cl-save': await saveCl(); return true;
    case 'cl-del': {
      if (D.confirm !== 'del') { D.confirm = 'del'; renderMain(); setTimeout(() => { if (D?.confirm === 'del') { D.confirm = null; renderMain(); } }, 5000); return true; }
      D.confirm = null; const c = D.cl;
      if (formsUsing(c.id).length) { toast('A form uses it. Take it off the form first.'); return true; }
      try { await deleteChecklist(c.id); D.cl = null; D.sel = null; toast(`Deleted “${c.name}”. Records filled in on it keep their answers.`); } catch (e) { console.error(e); toast('Couldn’t delete it. Try again.'); }
      renderMain(); return true;
    }
    case 'cl-add-item': case 'cl-add-sec': {
      const it = a === 'cl-add-item' ? blankItem() : { id: 's' + uid(), kind: 'section', label: '' };
      D.cl.items.push(it); D.it = it.id; dirtyCl(); renderMain(); focusLater('#cl-in-label'); return true;
    }
    case 'cl-mv': { const i = +el.dataset.i, j = i + +el.dataset.dir, xs = D.cl.items; if (j < 0 || j >= xs.length) return true; [xs[i], xs[j]] = [xs[j], xs[i]]; fixIfs(); dirtyCl(); renderMain(); focusLater(`[data-act="cl-mv"][data-i="${j}"][data-dir="${el.dataset.dir}"]:not(:disabled)`); return true; }
    case 'cl-del-item': { const gone = D.cl.items.splice(+el.dataset.i, 1)[0]; D.it = null; D.cl.items.forEach((x) => { if (x.showIf?.item === gone?.id) x.showIf = null; }); dirtyCl(); renderMain(); return true; }
    case 'cl-type-new': D.typeNew = ''; D.typeRen = null; renderMain(); focusLater('#cl-typename'); return true;
    case 'cl-type-ren': D.typeRen = el.dataset.id; D.typeNew = null; renderMain(); focusLater('#cl-typename'); return true;
    case 'cl-type-cancel': D.typeNew = null; D.typeRen = null; renderMain(); return true;
    case 'cl-type-save': return saveType(el.dataset.id), true;
    case 'cl-type-del': { const t = store.checklistTypes.find((x) => x.id === el.dataset.id); if (!t) return true; if (store.checklists.some((c) => c.typeId === t.id)) { toast('Move its checklists to another type first.'); return true; } try { await deleteChecklistType(t.id); toast(`Deleted “${t.name}”.`); } catch (e) { toast('Couldn’t delete it. Try again.'); } return true; }
    case 'cl-starter': await addStarter(); return true;
    case 'cl-set-add': { const sd = setsDraft(); sd.list.push({ id: 'as' + uid(), name: '', color: SET_COLORS[sd.list.length % SET_COLORS.length], options: [{ id: 'o' + uid(), label: '', score: 1, fail: false }, { id: 'o' + uid(), label: '', score: 0, fail: true }], isNew: true }); D.setEdit = sd.list.length - 1; dirtySets(); renderMain(); focusLater('.cl-sedit .cl-setname'); return true; }
    case 'cl-set-edit': D.setEdit = el.dataset.s === '' ? null : +el.dataset.s; renderMain(); if (D.setEdit != null) focusLater('.cl-sedit .cl-setname'); else focusLater(`[data-act="cl-set-edit"][data-s="${el.dataset.s}"]`); return true;
    case 'cl-set-color': { const s = setsDraft().list[+el.dataset.s]; if (!s) return true; s.color = el.dataset.v; dirtySets(); renderMain(); focusLater(`[data-act="cl-set-color"][data-s="${el.dataset.s}"][data-v="${el.dataset.v}"]`); return true; }
    case 'cl-opt-fail': { const o = setsDraft().list[+el.dataset.s]?.options[+el.dataset.o]; if (!o) return true; o.fail = !o.fail; dirtySets(); renderMain(); focusLater(`[data-act="cl-opt-fail"][data-s="${el.dataset.s}"][data-o="${el.dataset.o}"]`); return true; }
    case 'cl-item': { const x = D.cl?.items[+el.dataset.i]; if (!x) return true; D.it = D.it === x.id && drawerMode() ? null : x.id; renderMain(); if (D.it && !drawerMode()) focusLater(`[data-act="cl-item"][data-i="${el.dataset.i}"]`); else if (D.it) focusLater('#cl-in-label'); return true; }
    case 'cl-insp-close': { const i = D.cl?.items.findIndex((x) => x.id === D.it); D.it = null; renderMain(); focusLater(`[data-act="cl-item"][data-i="${i}"]`); return true; }
    case 'cl-fold': { const id = el.dataset.id; if (D.fold.has(id)) D.fold.delete(id); else D.fold.add(id); renderMain(); focusLater(`[data-act="cl-fold"][data-id="${CSS.escape(id)}"]`); return true; }
    case 'cl-dup': { const i = +el.dataset.i, x = D.cl.items[i]; if (!x || D.cl.items.length >= MAX_ITEMS) return true; const c = { ...JSON.parse(JSON.stringify(x)), id: 'i' + uid(), label: (x.label + ' (copy)').slice(0, 300) }; D.cl.items.splice(i + 1, 0, c); D.it = c.id; dirtyCl(); renderMain(); focusLater('#cl-in-label'); return true; }
    case 'cl-setpick': case 'cl-tog': case 'cl-fail': case 'cl-ifopt': {
      const i = +el.dataset.i, x = D.cl?.items[i]; if (!x) return true;
      if (a === 'cl-setpick') { x.set = el.dataset.v; if (!failable(x)) { x.critical = false; x.onFail = { comment: '', photo: '', task: '' }; } D.cl.items.forEach((y) => { if (y.showIf?.item === x.id) y.showIf = null; }); }
      else if (a === 'cl-tog') { if (el.dataset.k === 'critical' && !failable(x)) return true; x[el.dataset.k] = !x[el.dataset.k]; }
      else if (a === 'cl-fail') x.onFail = { ...(x.onFail || {}), [el.dataset.k]: el.dataset.v };
      else { const have = new Set(x.showIf?.any || []); if (have.has(el.dataset.v)) have.delete(el.dataset.v); else have.add(el.dataset.v); x.showIf = { item: x.showIf.item, any: [...have] }; }
      dirtyCl(); renderMain();
      focusLater(`[data-act="${a}"][data-i="${i}"]${el.dataset.k ? `[data-k="${el.dataset.k}"]` : ''}${el.dataset.v != null && a !== 'cl-tog' ? `[data-v="${CSS.escape(el.dataset.v)}"]` : ''}`);
      return true;
    }
    case 'cl-set-del': { const sd = setsDraft(), s = sd.list[+el.dataset.s]; if (!s) return true; if (store.checklists.some((c) => usesSet(c, s.id)) || store.checklistQuestions.some((q) => q.set === s.id)) { toast('A checklist or a pool question uses it.'); return true; } sd.list.splice(+el.dataset.s, 1); if (!s.isNew) sd.del.push(s.id); dirtySets(); renderMain(); return true; }
    case 'cl-opt-add': { const s = setsDraft().list[+el.dataset.s]; if (!s || s.options.length >= MAX_OPTIONS) return true; s.options.push({ id: 'o' + uid(), label: '', score: null, fail: false }); dirtySets(); renderMain(); focusLater(`[data-csi="olabel"][data-s="${el.dataset.s}"][data-o="${s.options.length - 1}"]`); return true; }
    case 'cl-opt-del': { const s = setsDraft().list[+el.dataset.s]; if (!s || s.options.length <= 2) return true; s.options.splice(+el.dataset.o, 1); dirtySets(); renderMain(); return true; }
    case 'cl-opt-mv': { const s = setsDraft().list[+el.dataset.s], i = +el.dataset.o, j = i + +el.dataset.dir; if (!s || j < 0 || j >= s.options.length) return true; [s.options[i], s.options[j]] = [s.options[j], s.options[i]]; dirtySets(); renderMain(); return true; }
    case 'cl-sets-discard': D.sets = null; D.issues = []; renderMain(); return true;
    case 'cl-sets-save': await saveSets(); return true;
  }
  return false;
}
/** After moving items: an "Only if" can only look up the list. */
function fixIfs() {
  const seen = new Set();
  D.cl.items.forEach((x) => { if (x.showIf && !seen.has(x.showIf.item)) x.showIf = null; seen.add(x.id); });
}
async function saveType(id) {
  const name = String(document.getElementById('cl-typename')?.value || '').trim();
  if (!name) { toast('Give the type a name.'); return; }
  try { await saveChecklistType(id || 'ct' + uid(), name, id ? store.checklistTypes.find((t) => t.id === id)?.order ?? 0 : store.checklistTypes.length); D.typeNew = null; D.typeRen = null; }
  catch (e) { console.error(e); toast(e?.code === 'permission-denied' ? 'Only administrators can do this. (If you are one, deploy the latest Cadence rules.)' : 'Saving failed. Try again.'); }
  renderMain();
}

export function onInput(t) {
  if (!D) return false;
  if (t.dataset.cli && D.cl) {
    const k = t.dataset.cli;
    if (k === 'name') D.cl.name = t.value;
    else if (k === 'passAt') D.cl.passAt = t.value;
    else { const x = item(t); if (!x) return true; x[k] = t.value; }
    dirtyCl(); return true;
  }
  if (t.dataset.csi && D.sets) {
    const s = D.sets.list[+t.dataset.s]; if (!s) return true;
    const k = t.dataset.csi, o = s.options[+t.dataset.o];
    if (k === 'name') s.name = t.value;
    else if (k === 'olabel' && o) o.label = t.value;
    else if (k === 'oscore' && o) o.score = t.value === '' ? null : Number(t.value);
    dirtySets(); return true;
  }
  if (t.id === 'cl-typename') { if (D.typeNew != null) D.typeNew = t.value; return true; }
  return false;
}
export function onChange(t) {
  if (!D) return false;
  if (t.dataset.clc && D.cl) {
    const k = t.dataset.clc;
    if (k === 'type') { D.cl.typeId = t.value; dirtyCl(); renderMain(); return true; }
    if (k === 'passRange') { D.cl.passAt = String(t.value); dirtyCl(); renderMain(); focusLater('[data-clc="passRange"]'); return true; }
    const x = item(t); if (!x) return true;
    if (k === 'set') { x.set = t.value; const s = store.answerSets.find((y) => y.id === x.set); if (!s || !s.options.some((o) => o.fail)) { x.critical = false; x.onFail = { comment: '', photo: '', task: '' }; } D.cl.items.forEach((y) => { if (y.showIf?.item === x.id) y.showIf = null; }); }
    else if (k === 'required' || k === 'critical') x[k] = t.checked;
    else if (k === 'fail-comment' || k === 'fail-photo') x.onFail = { ...(x.onFail || {}), [k.slice(5)]: t.value };
    else if (k === 'if') { const src = D.cl.items.find((y) => y.id === t.value); const s = src && store.answerSets.find((z) => z.id === src.set); x.showIf = src ? { item: src.id, any: (s?.options || []).filter((o) => o.fail).map((o) => o.id) } : null; }
    else if (k === 'ifopt') { const have = new Set(x.showIf?.any || []); if (t.checked) have.add(t.value); else have.delete(t.value); x.showIf = { item: x.showIf.item, any: [...have] }; }
    dirtyCl(); renderMain(); focusLater(`[data-clc="${k}"][data-i="${t.dataset.i}"]${k === 'ifopt' ? `[value="${CSS.escape(t.value)}"]` : ''}`); return true;
  }
  if (t.dataset.csc === 'ofail' && D.sets) { const o = D.sets.list[+t.dataset.s]?.options[+t.dataset.o]; if (o) { o.fail = t.checked; dirtySets(); renderMain(); } return true; }
  if (t.dataset.cli || t.dataset.csi) return true; // typed: already kept (redrawing here would swallow the click that follows)
  return false;
}
document.addEventListener('keydown', (e) => {
  if (e.target.id !== 'cl-typename' || !D) return;
  if (e.key === 'Enter') { e.preventDefault(); saveType(D.typeRen || ''); }
  else if (e.key === 'Escape') { e.preventDefault(); D.typeNew = null; D.typeRen = null; renderMain(); }
});

/* ---------- import and export (checklistio.js) ---------- */

function saveFile(bytes, name) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url; a.download = name.replace(/[\\/:*?"<>|]+/g, ' ');
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
async function downloadTemplate() {
  try { saveFile(await writeXlsx(templateSheets()), 'Checklists template.xlsx'); toast('Downloaded the checklists template, with an example to copy.'); }
  catch (e) { console.error(e); toast('The template couldn’t be made. Try again.'); }
}
async function exportFile(list) {
  if (!list.length) { toast('Nothing to export yet.'); return; }
  const types = store.checklistTypes, name = list.length === 1 ? list[0].name : (types.find((t) => t.id === list[0].typeId)?.name || 'Checklists');
  try { saveFile(await writeXlsx(exportSheets({ checklists: list, types, sets: store.answerSets, questions: store.checklistQuestions, cats: store.checklistCats })), `${name} checklist${list.length === 1 ? '' : 's'}.xlsx`); toast(`Downloaded ${list.length === 1 ? `“${list[0].name}”` : `${list.length} checklists`}. Change it in Excel and import it back to update.`); }
  catch (e) { console.error(e); toast('The export couldn’t be made. Try again.'); }
}
async function readImportFile(file) {
  if (!file || !D?.imp) return;
  D.imp.err = ''; D.imp.reading = true; renderMain();
  try {
    if (file.size > 25 * 1024 * 1024) throw new Error('This file is over 25 MB. Split it into smaller files.');
    const sheets = await readSheets(new Uint8Array(await file.arrayBuffer()), file.name);
    const plan = planImport(sheets, { types: store.checklistTypes, sets: store.answerSets, checklists: store.checklists, questions: store.checklistQuestions, cats: store.checklistCats }, { intoType: D.imp.intoType, uid });
    if (plan.error) throw new Error(plan.error);
    D.imp.plan = plan; D.imp.fileName = file.name; D.imp.choice = {};
  } catch (e) { if (!/^[A-Z]/.test(e?.message || '')) console.error(e); D.imp.err = e?.message && /^[A-Z]/.test(e.message) ? e.message : 'This file couldn’t be read. Use an .xlsx or .csv file.'; }
  D.imp.reading = false; renderMain();
}
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
function importView() {
  const m = D.imp, into = m.intoType && store.checklistTypes.find((t) => t.id === m.intoType);
  const title = `<h2 class="cl-imph">Import checklists${into ? ` into “${esc(into.name)}”` : ''}</h2>`;
  if (!m.plan) {
    return `<div class="panel cl-imp">${title}
      <p class="help">An Excel (.xlsx) or CSV file: one row per item on a <b>Checklists</b> sheet, and any new answer sets on an <b>Answer sets</b> sheet. ${into ? 'The Type column can be left empty: everything goes into this type.' : ''} <button type="button" class="linkbtn" data-act="cl-tpl">Download the template</button> to see the layout, or export a checklist to change it.</p>
      <label class="cl-drop" id="cl-drop"><span><b>Drop the file here</b> or</span><span class="btn sm">Browse…<input type="file" id="cl-impfile" accept=".xlsx,.xlsm,.csv,text/csv" hidden></span>${m.reading ? '<span class="help">Reading…</span>' : ''}</label>
      ${m.err ? `<p class="err" role="alert">${esc(m.err)}</p>` : ''}
      <div class="cl-foot"><span class="cl-grow"></span><button type="button" class="btn ghost" data-act="cl-imp-cancel">Cancel</button></div></div>`;
  }
  const p = m.plan, ch = (k, d) => m.choice[k] || d;
  const useCl = p.checklists.filter((c) => ch(c.key, 'update') !== 'skip');
  const typesUsed = new Set(useCl.map((c) => c.typeKey));
  const newTypes = p.types.filter((t) => t.status === 'new' && typesUsed.has(t.key));
  const sel = (k, opts, d) => `<select class="in cl-impch" data-clic="${esc(k)}" aria-label="What to do">${opts.map(([v, l]) => `<option value="${v}"${ch(k, d) === v ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
  const chip = (st) => `<span class="cl-st ${st}">${{ new: 'New', update: 'Update', same: 'Same', changed: 'Changed', newtype: 'New type' }[st]}</span>`;
  const items = (c) => c.items.filter((x) => x.kind === 'item').length;
  const rows = [
    ...p.checklists.map((c) => {
      const t = p.types.find((x) => x.key === c.typeKey);
      const live = store.checklists.find((x) => x.id === c.existingId);
      const what = c.status === 'update' ? (ch(c.key, 'update') === 'update' ? `becomes v${(live?.ver || c.existingVer) + 1}` : ch(c.key, 'update') === 'copy' ? 'a copy' : 'left as it is') : '';
      return `<div class="cl-impli">${chip(c.status === 'new' && t?.status === 'new' ? 'newtype' : c.status)}<b class="cl-grow">${esc(c.typeName)} › ${esc(c.name)}</b><span class="help">${plural(items(c), 'item')}${c.passAt != null ? ` · pass at ${c.passAt}%` : ''}${what ? ' · ' + what : ''}</span>${c.status === 'update' ? sel(c.key, [['update', 'Update it'], ['copy', 'Add a copy'], ['skip', 'Skip']], 'update') : ''}</div>`;
    }),
    ...p.sets.filter((s) => s.status !== 'bad').map((s) => `<div class="cl-impli">${chip(s.status)}<b class="cl-grow">Answer set: ${esc(s.name)}</b><span class="help">${s.status === 'same' ? 'already here, unchanged' : plural(s.options.length, 'answer') + (s.status === 'changed' ? ': different from yours' : '')}</span>${s.status === 'changed' ? sel(s.key, [['update', 'Update mine'], ['keep', 'Keep mine'], ['copy', 'Add a copy']], 'update') : ''}</div>`),
  ].join('');
  const nSets = p.sets.filter((s) => s.status === 'new' || (s.status === 'changed' && ch(s.key, 'update') !== 'keep')).length;
  const probs = p.problems.length ? `<div class="cl-impprob" role="status"><b>${plural(p.problems.length, 'thing')} to know</b> (rows with a problem are left out; fix the file and import again, or import the rest):<ul>${p.problems.slice(0, 30).map((x) => `<li>${esc(x.sheet)} row ${x.row}: ${esc(x.msg)}</li>`).join('')}${p.problems.length > 30 ? `<li>…and ${p.problems.length - 30} more.</li>` : ''}</ul></div>` : '';
  return `<div class="panel cl-imp">${title}<p class="help">${esc(m.fileName)} · nothing changes until you press Import. <button type="button" class="linkbtn" data-act="cl-imp-again">Pick another file</button></p>
    <div class="cl-impsum"><div><b>${p.types.length}</b><small>type${p.types.length === 1 ? '' : 's'}${newTypes.length ? ` (${newTypes.length} new)` : ''}</small></div><div><b>${p.checklists.length}</b><small>checklist${p.checklists.length === 1 ? '' : 's'} (${p.checklists.filter((c) => c.status === 'new').length} new, ${p.checklists.filter((c) => c.status === 'update').length} already here)</small></div><div><b>${nSets}</b><small>answer set${nSets === 1 ? '' : 's'} added or changed</small></div><div><b>${p.checklists.reduce((t, c) => t + items(c), 0)}</b><small>items: ${p.linked || 0} from the question pool, ${(p.questions || []).length} new${(p.cats || []).length ? `; ${p.cats.length} new categor${p.cats.length === 1 ? 'y' : 'ies'}` : ''}</small></div></div>
    <div class="cl-impls">${rows || '<p class="help">Nothing to import from this file.</p>'}</div>${probs}
    <div class="cl-foot"><span class="cl-grow"></span><button type="button" class="btn ghost" data-act="cl-imp-cancel"${m.busy ? ' disabled' : ''}>Cancel</button><button type="button" class="btn primary" data-act="cl-imp-go"${m.busy || (!useCl.length && !nSets) ? ' disabled' : ''}>${m.busy ? 'Importing…' : useCl.length ? `Import ${plural(useCl.length, 'checklist')}` : `Import ${plural(nSets, 'answer set')}`}</button></div></div>`;
}

async function applyImport() {
  const m = D.imp; if (!m?.plan || m.busy) return;
  const p = m.plan, ch = (k) => m.choice[k] || 'update';
  const exSets = store.answerSets, remap = {}, setsOut = [], keep = new Set();
  p.sets.forEach((s) => {
    if (s.status === 'bad' || s.status === 'same') return;
    const data = cleanSet(s);
    if (s.status === 'new') setsOut.push({ id: s.id, data });
    else if (ch(s.key) === 'update') setsOut.push({ id: s.id, data: { ...data, name: exSets.find((x) => x.id === s.id)?.name || data.name } });
    else if (ch(s.key) === 'copy') { const id = 'as' + uid(); remap[s.id] = id; setsOut.push({ id, data: { ...data, name: copyName(data.name, exSets.map((x) => x.name)) } }); }
    else keep.add(s.id);
  });
  const setMap = new Map([...exSets.map((s) => [s.id, s]), ...setsOut.map((s) => [s.id, { id: s.id, ...s.data }])]);
  const todo = p.checklists.filter((c) => ch(c.key) !== 'skip');
  const typesUsed = new Set(todo.map((c) => c.typeKey));
  const newTypes = p.types.filter((t) => t.status === 'new' && typesUsed.has(t.key));
  const out = todo.map((c) => {
    const items = c.items.map((x) => {
      if (x.kind !== 'item') return x;
      const y = { ...x, set: remap[x.set] || x.set };
      if (y.showIf) { const src = c.items.find((z) => z.id === y.showIf.item); const opts = (setMap.get(remap[src?.set] || src?.set)?.options || []).map((o) => o.id); y.showIf = { ...y.showIf, any: y.showIf.any.filter((id) => opts.includes(id)) }; if (!y.showIf.any.length) y.showIf = null; }
      return y;
    });
    const live = c.status === 'update' && ch(c.key) === 'update' ? store.checklists.find((x) => x.id === c.existingId) : null;
    const id = live ? live.id : 'cl' + uid(), ver = (live?.ver || 0) + 1;
    const name = c.status === 'update' && ch(c.key) === 'copy' ? copyName(c.name, store.checklists.filter((x) => x.typeId === c.typeId).map((x) => x.name)) : c.name;
    const base = { name, typeId: c.typeId, passAt: c.passAt, items: cleanItems(items) };
    return { id, data: { ...base, ver, snap: snapshotOf(base, setMap, ver), createdAt: live?.createdAt || Date.now() } };
  });
  // the question pool: new questions (with their categories), and help or On fail changed in the file
  const poolNow = poolMap(), qOut = new Map();
  const fileQ = new Map((p.questions || []).map((q) => [q.id, q]));
  out.forEach((o) => o.data.items.forEach((x) => {
    if (x.kind !== 'item' || qOut.has(x.id)) return;
    const pq = poolNow.get(x.id);
    if (!pq) { qOut.set(x.id, cleanQuestion({ ...copyOf(x), catId: fileQ.get(x.id)?.catId || '' })); return; }
    if (JSON.stringify(copyOf(pq)) !== JSON.stringify(copyOf(x))) qOut.set(x.id, cleanQuestion({ ...pq, ...copyOf(x) }));
  }));
  const catsOut = (p.cats || []).filter((c) => [...qOut.values()].some((q) => q.catId === c.id)).map((c, i) => ({ id: c.id, data: { name: c.name, color: SET_COLORS[(store.checklistCats.length + i + 5) % SET_COLORS.length], order: store.checklistCats.length + i } }));
  const poolAfter = new Map([...poolNow, ...[...qOut].map(([id, q]) => [id, { id, ...q }])]);
  // checklists already here that use an answer set this changes, or a question it changes: their next version
  const changed = setsOut.map((s) => s.id).filter((id) => exSets.some((x) => x.id === id));
  const doneIds = new Set(out.map((o) => o.id));
  const qChanged = new Set([...qOut.keys()].filter((id) => poolNow.has(id)));
  const reverQ = reversion(store.checklists.filter((c) => !doneIds.has(c.id) && !changed.some((id) => usesSet(c, id)) && (c.items || []).some((x) => qChanged.has(x.id))), poolAfter);
  const rever = store.checklists.filter((c) => !doneIds.has(c.id) && changed.some((id) => usesSet(c, id))).map((c) => {
    const ver = (c.ver || 0) + 1, base = { name: c.name, typeId: c.typeId || '', passAt: c.passAt ?? null, items: c.items };
    return { id: c.id, data: { ...base, ver, snap: snapshotOf(base, setMap, ver), createdAt: c.createdAt || Date.now() } };
  });
  m.busy = true; renderMain();
  try {
    let order = store.checklistTypes.length;
    for (const t of newTypes) await saveChecklistType(t.id, t.name, order++);
    if (setsOut.length || rever.length) await saveAnswerSets(setsOut, rever);
    await savePoolWork({ cats: catsOut, questions: [...qOut].map(([id, data]) => ({ id, data })), checklists: [...out, ...reverQ] });
    const nNew = out.filter((o) => o.data.ver === 1).length, nUp = out.length - nNew;
    toast([out.length ? `Imported ${plural(out.length, 'checklist')}${nUp ? ` (${nUp} updated to a new version)` : ''}` : '', newTypes.length ? plural(newTypes.length, 'new type') : '', setsOut.length ? plural(setsOut.length, 'answer set') + ' added or changed' : '', rever.length ? `${plural(rever.length, 'other checklist')} updated for the changed answers` : ''].filter(Boolean).join(', ') + '.', { duration: 7000 });
    D.imp = null; D.tab = 'checklists';
    if (out[0]) { D.sel = out[0].id; D.cl = { id: out[0].id, name: out[0].data.name, typeId: out[0].data.typeId, passAt: out[0].data.passAt ?? '', items: JSON.parse(JSON.stringify(out[0].data.items)), ver: out[0].data.ver, isNew: false, dirty: false }; D.issues = []; }
  } catch (e) { console.error(e); m.busy = false; toast(e?.code === 'permission-denied' ? 'Only administrators can import checklists. (If you are one, deploy the latest Cadence rules.)' : 'The import stopped partway: check your connection, then import the same file again (what came in is updated, not doubled).', { duration: 9000 }); }
  renderMain();
}

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'cl-impfile') { readImportFile(t.files && t.files[0]); return; }
  if (t.dataset && t.dataset.clic && D?.imp) { D.imp.choice[t.dataset.clic] = t.value; renderMain(); document.querySelector(`[data-clic="${CSS.escape(t.dataset.clic)}"]`)?.focus(); }
});
document.addEventListener('dragover', (e) => { const d = e.target.closest && e.target.closest('#cl-drop'); if (!d) return; e.preventDefault(); d.classList.add('over'); });
document.addEventListener('dragleave', (e) => { const d = e.target.closest && e.target.closest('#cl-drop'); if (d) d.classList.remove('over'); });
document.addEventListener('drop', (e) => { const d = e.target.closest && e.target.closest('#cl-drop'); if (!d) return; e.preventDefault(); d.classList.remove('over'); readImportFile(e.dataTransfer?.files?.[0]); });
document.addEventListener('click', (e) => { if (D?.menu && !(e.target.closest && e.target.closest('.cl-menuw'))) { D.menu = null; renderMain(); } });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && D?.menu) { D.menu = null; renderMain(); } });

/* ---------- adding fast, and dragging rows ---------- */
/** Add a question to the checklist: one from the pool (q), or a new one with these words. */
function addQuestion(q, label) {
  if (D.cl.items.length >= MAX_ITEMS) { toast(`A checklist has at most ${MAX_ITEMS} lines.`); return null; }
  const prev = [...D.cl.items].reverse().find((x) => x.kind === 'item');
  const it = q ? { ...blankItem(), ...copyOf(q), id: q.id, required: !!prev?.required }
    : { ...blankItem(), label: String(label).slice(0, 300), set: prev?.set || blankItem().set, required: !!prev?.required, catId: prev ? (prev.catId ?? poolMap().get(prev.id)?.catId ?? '') : '' };
  D.cl.items.push(it); D.cl.dirty = true;
  return it;
}
const inList = () => new Set((D?.cl?.items || []).map((x) => x.id));
let qdd = { list: [], at: -1 };
function paintQdd(input) {
  const box = document.getElementById('cl-qdd'); if (!box) return;
  const text = input.value.trim();
  qdd.list = text.length >= 2 ? searchPool(store.checklistQuestions, text, { exclude: inList(), limit: 6 }) : [];
  if (qdd.at >= qdd.list.length + 1) qdd.at = -1;
  const opt = (html, i, extra = '') => `<span class="cl-qo${qdd.at === i ? ' hi' : ''}" role="option" aria-selected="${qdd.at === i}" id="cl-qo${i}" data-act="cl-qpick" data-n="${i}"${extra}>${html}</span>`;
  const rows = qdd.list.map((q, i) => { const c = catOf(q.catId), n = usedBy(q.id, store.checklists).length; return opt(`${c ? `<span class="cl-cat c-${catColor(c.id)}">${esc(c.name)}</span>` : ''}<b>${esc(q.label)}</b><small>${n ? `in ${n} checklist${n === 1 ? '' : 's'}` : 'not used yet'}</small>`, i); });
  if (text) rows.push(opt(`<span class="cl-qnew">＋ New question “${esc(text.slice(0, 60))}”</span>`, qdd.list.length));
  box.innerHTML = rows.join(''); box.hidden = !text;
  input.setAttribute('aria-expanded', String(!!text));
  if (qdd.at >= 0) input.setAttribute('aria-activedescendant', 'cl-qo' + qdd.at); else input.removeAttribute('aria-activedescendant');
}
function pickQuick(n) {
  const input = document.getElementById('cl-quick'); if (!input || !D?.cl) return;
  const text = input.value.trim();
  let q = n >= 0 && n < qdd.list.length ? qdd.list[n] : null;
  if (!q && n !== qdd.list.length) q = poolMatch(store.checklistQuestions.filter((x) => !inList().has(x.id)), text); // the same words as one in the pool: link it
  if (!q && !text) return;
  const it = addQuestion(q, text); if (!it) return;
  if (!drawerMode()) D.it = it.id; // on narrow screens the panel would cover the box: keep typing
  qdd = { list: [], at: -1 };
  renderMain();
  const nq = document.getElementById('cl-quick'); if (nq) { nq.focus(); nq.scrollIntoView({ block: 'nearest' }); }
}
document.addEventListener('input', (e) => { if (e.target.id === 'cl-quick') { qdd.at = -1; paintQdd(e.target); } });
document.addEventListener('keydown', (e) => {
  if (e.target.id !== 'cl-quick' || !D?.cl) return;
  const max = qdd.list.length + (e.target.value.trim() ? 1 : 0);
  if (e.key === 'ArrowDown' && max) { e.preventDefault(); qdd.at = (qdd.at + 1) % max; paintQdd(e.target); return; }
  if (e.key === 'ArrowUp' && max) { e.preventDefault(); qdd.at = qdd.at <= 0 ? max - 1 : qdd.at - 1; paintQdd(e.target); return; }
  if (e.key === 'Escape') { qdd = { list: [], at: -1 }; e.target.value = ''; paintQdd(e.target); return; }
  if (e.key !== 'Enter') return;
  e.preventDefault(); pickQuick(qdd.at);
});

document.addEventListener('input', (e) => { if (e.target.dataset?.clc === 'passRange' && D?.cl) { const n = document.querySelector('[data-cli="passAt"]'); if (n) n.value = e.target.value; } });
let drag = null;
document.addEventListener('dragstart', (e) => { const r = e.target.closest && e.target.closest('#cl-list [data-row]'); if (!r || !D?.cl) return; drag = +r.dataset.row; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(drag)); } catch (err) { /* old browsers */ } r.classList.add('dragging'); });
document.addEventListener('dragover', (e) => { if (drag == null) return; const r = e.target.closest && e.target.closest('#cl-list [data-row]'); if (!r) return; e.preventDefault(); document.querySelectorAll('#cl-list .drop-before').forEach((x) => x.classList.remove('drop-before')); r.classList.add('drop-before'); });
document.addEventListener('dragend', () => { drag = null; document.querySelectorAll('#cl-list .drop-before,#cl-list .dragging').forEach((x) => x.classList.remove('drop-before', 'dragging')); });
document.addEventListener('drop', (e) => {
  if (drag == null || !D?.cl) return;
  const r = e.target.closest && e.target.closest('#cl-list [data-row]'); if (!r) return;
  e.preventDefault();
  const from = drag, to = +r.dataset.row; drag = null;
  if (from === to) { renderMain(); return; }
  const xs = D.cl.items, [x] = xs.splice(from, 1);
  xs.splice(to > from ? to - 1 : to, 0, x); // dropped before the row it was over
  fixIfs(); D.it = x.id; D.cl.dirty = true; renderMain();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && D?.it && D.cl && drawerMode() && document.querySelector('.cl-insp')) { const i = D.cl.items.findIndex((x) => x.id === D.it); D.it = null; renderMain(); document.querySelector(`[data-act="cl-item"][data-i="${i}"]`)?.focus(); } });

/* ---------- the question pool (poollogic.js) ---------- */

/** A row's category: a coloured dot (its name on hover). */
function rowCat(x) {
  const id = x.catId ?? poolMap().get(x.id)?.catId ?? '';
  const c = catOf(id);
  return c ? `<i class="cl-cdot c-${catColor(c.id)}" title="${esc(c.name)}" aria-label="${esc(c.name)}: "></i>` : '';
}
const catSelect = (cur, attrs) => `<select class="in" ${attrs}><option value="">No category</option>${store.checklistCats.map((c) => `<option value="${esc(c.id)}"${c.id === cur ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`;

/** "Update it everywhere" or "Save as a new question", for each shared question whose meaning changes. */
function askView() {
  const a = D.ask, names = (ids) => ids.map((id) => store.checklists.find((c) => c.id === id)?.name).filter(Boolean);
  const one = (u) => {
    const ch = a.choice[u.id] || 'all', others = names(u.others);
    const radio = (v, title, words) => `<label class="cl-choice${ch === v ? ' on' : ''}"><input type="radio" name="ask-${esc(u.id)}" value="${v}" data-clask="${esc(u.id)}"${ch === v ? ' checked' : ''}><span><b>${title}</b><small>${words}</small></span></label>`;
    return `<div class="cl-askq"><b>“${esc(u.was)}” is in ${others.length + (a.from === 'cl' ? 1 : 0)} checklists</b><p class="help">You changed it to “${esc(u.now)}”.</p>
      ${radio('all', 'Update it everywhere', `For small fixes, like a typo. ${others.length ? esc(others.join(', ')) + (others.length === 1 ? ' gets' : ' get') + ' a new version; ' : ''}answers so far count toward the same question.`)}
      ${radio('new', 'Save as a new question', a.from === 'cl' ? `For a different question. Only this checklist uses the new one; the trend for “${esc(u.was)}” stays as it was.` : 'For a different question. The new one goes in the pool, not in any checklist yet; checklists keep the old one.')}</div>`;
  };
  return `<div class="cl-scrim2" data-act="cl-ask-cancel" aria-hidden="true"></div><div class="panel cl-dlg cl-askbox" role="dialog" aria-modal="true" aria-label="A shared question changed">${a.list.map(one).join('')}
    <div class="cl-foot"><span class="cl-grow"></span><button type="button" class="btn ghost" data-act="cl-ask-cancel">Cancel</button><button type="button" class="btn primary" data-act="cl-ask-go">Save</button></div></div>`;
}

/** Add several questions from the pool at once. */
function pickerView() {
  const P = D.picker, have = inList();
  const list = searchPool(store.checklistQuestions, P.q, { catId: P.cat, limit: 400 });
  const chip = (id, name) => `<button type="button" class="cl-fchip${P.cat === id ? ' on' : ''}" data-act="cl-pk-cat" data-v="${id == null ? '*' : esc(id)}">${esc(name)}</button>`;
  return `<div class="cl-scrim2" data-act="cl-pk-cancel" aria-hidden="true"></div><div class="panel cl-dlg cl-pick" role="dialog" aria-modal="true" aria-labelledby="cl-pk-h">
    <div class="cl-pkh"><b id="cl-pk-h">Add from the pool</b><input class="in" id="cl-pk-q" value="${esc(P.q)}" placeholder="Search questions" aria-label="Search questions" autocomplete="off"></div>
    <div class="cl-pkc">${chip(null, 'All')}${store.checklistCats.map((c) => chip(c.id, c.name)).join('')}${chip('', 'No category')}</div>
    <div class="cl-pkl">${list.map((q) => { const on = P.sel.has(q.id), already = have.has(q.id), s = store.answerSets.find((y) => y.id === q.set); return `<label class="cl-pki${already ? ' off' : ''}"><input type="checkbox" data-clpk="${esc(q.id)}"${on || already ? ' checked' : ''}${already ? ' disabled' : ''}><b>${esc(q.label)}</b><small>${already ? 'already in this checklist' : esc(s ? s.name : BUILT_IN.find((b) => b[0] === q.set)?.[1] || '')}</small></label>`; }).join('') || `<p class="help">${store.checklistQuestions.length ? 'No questions match.' : 'The pool is empty. Questions you add to checklists go into it.'}</p>`}</div>
    <div class="cl-foot"><span class="cl-grow"></span><button type="button" class="btn ghost" data-act="cl-pk-cancel">Cancel</button><button type="button" class="btn primary" data-act="cl-pk-go"${P.sel.size ? '' : ' disabled'}>Add ${P.sel.size} question${P.sel.size === 1 ? '' : 's'}</button></div></div>`;
}

/** Settings › Checklists › Questions. */
function poolTab() {
  const P = D.pq, pool = store.checklistQuestions;
  const count = (id) => pool.filter((q) => (q.catId || '') === id).length;
  const catRow = (c) => {
    if (P.catEdit === c.id) return `<div class="cl-catedit c-${catColor(c.id)}"><input class="in" id="cl-catname" value="${esc(c.name)}" maxlength="60" aria-label="Category name"><span class="cl-swatches">${SET_COLORS.map((k) => `<button type="button" aria-label="${k}" class="c-${k}${catColor(c.id) === k ? ' on' : ''}" data-act="cl-cat-color" data-id="${esc(c.id)}" data-v="${k}"></button>`).join('')}</span><span class="cl-catbtns"><button type="button" class="btn sm primary" data-act="cl-cat-save" data-id="${esc(c.id)}">Save</button>${count(c.id) ? '' : `<button type="button" class="btn sm ghost danger" data-act="cl-cat-del" data-id="${esc(c.id)}">Delete</button>`}<button type="button" class="btn sm ghost" data-act="cl-cat-cancel">Cancel</button></span></div>`;
    return `<div class="cl-catrow"><button type="button" class="cl-cat2 c-${catColor(c.id)}${P.cat === c.id ? ' on' : ''}" data-act="cl-pq-cat" data-v="${esc(c.id)}"><i></i><span>${esc(c.name)}</span><small>${count(c.id)}</small></button><button type="button" class="ibtn" data-act="cl-cat-edit" data-id="${esc(c.id)}" aria-label="Change ${esc(c.name)}" title="Rename or colour">✎</button></div>`;
  };
  const cats = `<nav class="panel cl-cats" aria-label="Categories">
    <button type="button" class="cl-cat2${P.cat == null ? ' on' : ''}" data-act="cl-pq-cat" data-v="*"><span>All questions</span><small>${pool.length}</small></button>
    ${store.checklistCats.map(catRow).join('')}
    <button type="button" class="cl-cat2 c-none${P.cat === '' ? ' on' : ''}" data-act="cl-pq-cat" data-v=""><i></i><span>No category</span><small>${count('')}</small></button>
    ${P.catNew != null ? `<div class="cl-catedit"><input class="in" id="cl-catname" value="${esc(P.catNew)}" maxlength="60" placeholder="e.g. Fire" aria-label="New category name"><span class="cl-catbtns"><button type="button" class="btn sm primary" data-act="cl-cat-save">Add</button><button type="button" class="btn sm ghost" data-act="cl-cat-cancel">Cancel</button></span></div>` : `<button type="button" class="btn sm cl-catadd" data-act="cl-cat-new">+ Category</button>`}</nav>`;
  const uses = new Map(pool.map((q) => [q.id, usedBy(q.id, store.checklists)]));
  let list = searchPool(pool, P.q, { catId: P.cat, limit: 2000 });
  if (P.filter === 'unused') list = list.filter((q) => !uses.get(q.id).length);
  if (P.filter === 'multi') list = list.filter((q) => uses.get(q.id).length >= 2);
  const fchip = (v, l) => `<button type="button" class="cl-fchip${P.filter === v ? ' on' : ''}" data-act="cl-pq-filter" data-v="${v}">${l}</button>`;
  const row = (q) => {
    const c = catOf(q.catId), n = uses.get(q.id).length;
    return `<button type="button" class="cl-pqr${P.sel === q.id ? ' sel' : ''}" data-act="cl-pq-pick" data-id="${esc(q.id)}"><span class="cl-pqt"><b>${esc(q.label)}</b>${q.help ? `<small>${esc(q.help)}</small>` : ''}</span><span>${c ? `<span class="cl-cat c-${catColor(c.id)}">${esc(c.name)}</span>` : '<span class="help">—</span>'}</span>${answerChip(q.set)}<span class="cl-pqu${n ? '' : ' none'}">${n ? `in <b>${n}</b> checklist${n === 1 ? '' : 's'}` : 'Not used yet'}</span></button>`;
  };
  const listHTML = `<div class="panel cl-pql"><div class="cl-pqbar"><input class="in" id="cl-pq-q" value="${esc(P.q)}" placeholder="Search questions" aria-label="Search questions" autocomplete="off">${fchip('all', 'All')}${fchip('unused', 'Not used')}${fchip('multi', 'Used in 2+')}<button type="button" class="btn sm primary" data-act="cl-pq-new">+ Question</button></div>
    <div class="cl-pqh" aria-hidden="true"><span>Question</span><span>Category</span><span>Answers</span><span>Used in</span></div>
    <div class="cl-pqrows">${list.map(row).join('') || `<p class="help cl-none">${pool.length ? 'No questions match.' : 'No questions yet. Add one here, or add questions to a checklist: they come into the pool.'}</p>`}</div></div>`;
  return `<div class="cl-cq"><div class="cl-pool${P.draft ? ' has-insp' : ''}">${cats}${listHTML}${P.draft ? questionPanel() : ''}</div></div>`;
}
function questionPanel() {
  const P = D.pq, d = P.draft, isNew = !store.checklistQuestions.some((q) => q.id === d.id);
  const users = isNew ? [] : usedBy(d.id, store.checklists);
  const s = !isBuiltIn(d.set) && store.answerSets.find((y) => y.id === d.set), canFail = !!(s && (s.options || []).some((o) => o.fail));
  const seg = (k) => `<span class="cl-seg2" role="group" aria-label="${FAIL_WHAT[k]} on a fail">${FAIL_MODES.map(([m, l]) => `<button type="button" class="${(d.onFail?.[k] || '') === m ? 'on' : ''}" aria-pressed="${(d.onFail?.[k] || '') === m}" data-act="cl-pq-fail" data-k="${k}" data-v="${m}">${m === '' ? 'Off' : k === 'task' && m === 'ask' ? 'Offer' : l}</button>`).join('')}</span>`;
  return `<div class="cl-scrim" data-act="cl-pq-close" aria-hidden="true"></div><aside class="panel cl-insp" aria-label="Question"><div class="cl-ih"><b>${isNew ? 'New question' : 'Question'}</b><span class="cl-itools">${!isNew && !users.length ? `<button type="button" class="ibtn cl-danger" data-act="cl-pq-del" aria-label="Delete" title="Delete (no checklist uses it)">🗑</button>` : ''}<button type="button" class="ibtn" data-act="cl-pq-close" aria-label="Close">✕</button></span></div><div class="cl-ib">
    <div><label class="cl-lab" for="cl-pq-label">Wording</label><input class="in" id="cl-pq-label" data-pqi="label" value="${esc(d.label)}" maxlength="300" placeholder="e.g. Fire extinguishers in date"></div>
    <div><label class="cl-lab" for="cl-pq-help">Help</label><input class="in" id="cl-pq-help" data-pqi="help" value="${esc(d.help || '')}" maxlength="300" placeholder="What to check (optional)"></div>
    <div><label class="cl-lab" for="cl-pq-cat">Category</label>${catSelect(d.catId || '', 'id="cl-pq-cat" data-pqc="cat"')}</div>
    <div><span class="cl-lab">Answers</span><div class="cl-setpick">${store.answerSets.map((y) => `<button type="button" class="cl-sp c-${colorOfSet(y)}${y.id === d.set ? ' on' : ''}" aria-pressed="${y.id === d.set}" data-act="cl-pq-set" data-v="${esc(y.id)}"><i class="cl-sw"></i><span>${esc(y.name)}</span><span class="cl-mini">${(y.options || []).slice(0, 5).map((o) => `<em class="b-${scoreBand(o, y.options)}">${o.score ?? '–'}</em>`).join('')}</span></button>`).join('')}<div class="cl-builtins">${BUILT_IN.map(([k, l]) => `<button type="button" class="${d.set === k ? 'on' : ''}" aria-pressed="${d.set === k}" data-act="cl-pq-set" data-v="${k}">${BUILT_ICON[k]} ${l}</button>`).join('')}</div></div></div>
    ${canFail ? `<div class="cl-failbox"><span class="cl-lab">When the answer is a fail</span><div class="cl-frow">💬 Comment ${seg('comment')}</div><div class="cl-frow">📷 Photo ${seg('photo')}</div><div class="cl-frow">✅ Task ${seg('task')}</div>${TASK_HELP}</div>` : ''}
    <div><span class="cl-lab">${users.length ? `Used in ${users.length} checklist${users.length === 1 ? '' : 's'}` : 'Not in a checklist yet'}</span>${users.length ? `<div class="cl-uses">${users.map((c) => { const x = c.items.find((y) => y.id === d.id); return `<button type="button" class="cl-use" data-act="cl-pq-open" data-id="${esc(c.id)}"><span>${esc(c.name)}</span><span>${x?.required ? '<span class="cl-b req">Required</span>' : ''}${x?.critical ? '<span class="cl-b crit">▲ Critical</span>' : ''}${!x?.required && !x?.critical ? '<small>optional</small>' : ''}</span></button>`; }).join('')}</div>` : '<p class="help">Add it to a checklist from that checklist’s “Add a question…” or ☰ From the pool.</p>'}</div>
    ${P.issues?.length ? `<div class="cl-issues" role="alert"><ul>${P.issues.map((m) => `<li>${esc(m)}</li>`).join('')}</ul></div>` : ''}
    <div class="cl-foot"><span class="cl-grow"></span>${d.dirty ? '<button type="button" class="btn ghost" data-act="cl-pq-discard">Discard</button>' : ''}<button type="button" class="btn primary" data-act="cl-pq-save"${d.dirty && !D.busy ? '' : ' disabled'}>${D.busy ? 'Saving…' : isNew ? 'Add to the pool' : 'Save question'}</button></div>
  </div></aside>`;
}
function openQuestion(id) {
  const q = store.checklistQuestions.find((x) => x.id === id);
  D.pq.sel = id; D.pq.issues = [];
  D.pq.draft = q ? { id: q.id, ...cleanQuestion(q), dirty: false } : null;
}
async function saveQuestion(choice = null) {
  const P = D.pq, d = P.draft; if (!d || D.busy) return;
  const q = cleanQuestion(d), issues = questionIssues(q, setsById());
  P.issues = issues; if (issues.length) { renderMain(); return; }
  const old = store.checklistQuestions.find((x) => x.id === d.id), users = old ? usedBy(d.id, store.checklists) : [];
  if (old && users.length >= 2 && changesMeaning(old, q) && !choice) { D.ask = { from: 'pool', list: [{ id: d.id, was: old.label, now: q.label, others: users.map((c) => c.id) }], choice: {} }; renderMain(); return; }
  let id = d.id, outs = [];
  if (old && choice === 'new') id = 'q' + uid(); // a new question; checklists keep the old one
  else if (old && JSON.stringify(copyOf(old)) !== JSON.stringify(copyOf(q))) outs = reversion(users, new Map([...poolMap(), [id, { id, ...q }]])); // a category alone doesn't make new versions
  D.busy = true; D.ask = null; renderMain();
  try {
    await savePoolWork({ questions: [{ id, data: q }], checklists: outs });
    toast(choice === 'new' ? 'Saved as a new question. Add it to checklists from the pool.' : !old ? 'Added to the pool.' : outs.length ? `Saved. ${outs.length} checklist${outs.length === 1 ? '' : 's'} using it got a new version.` : 'Saved.');
    D.pq.sel = id; D.pq.draft = drawerMode() ? null : { id, ...q, dirty: false }; // slid in over the list: close it once saved
  } catch (e) { console.error(e); toast(e?.code === 'permission-denied' ? 'Only administrators can change the pool. (If you are one, deploy the latest Cadence rules.)' : 'Saving failed. Check your connection and try again.'); }
  D.busy = false; renderMain();
}

async function poolClick(a, el) {
  const P = D.pq;
  switch (a) {
    case 'cl-qpick': pickQuick(+el.dataset.n); return true;
    case 'cl-picker': D.picker = { q: '', cat: null, sel: new Set() }; renderMain(); setTimeout(() => document.getElementById('cl-pk-q')?.focus(), 0); return true;
    case 'cl-pk-cat': D.picker.cat = el.dataset.v === '*' ? null : el.dataset.v; renderMain(); return true;
    case 'cl-pk-cancel': D.picker = null; renderMain(); setTimeout(() => document.querySelector('[data-act="cl-picker"]')?.focus(), 0); return true;
    case 'cl-pk-go': { const pool = poolMap(); let added = 0; for (const id of D.picker.sel) { if (inList().has(id)) continue; const q = pool.get(id); if (q && addQuestion(q)) added++; } D.picker = null; renderMain(); toast(`Added ${added} question${added === 1 ? '' : 's'}. Set Required and Critical for this checklist.`); return true; }
    case 'cl-ask-cancel': D.ask = null; renderMain(); return true;
    case 'cl-ask-go': { const a2 = D.ask, ch = {}; a2.list.forEach((u) => { ch[u.id] = a2.choice[u.id] || 'all'; }); if (a2.from === 'cl') await saveCl(ch); else await saveQuestion(ch[a2.list[0].id]); return true; }
    case 'cl-pq-cat': P.cat = el.dataset.v === '*' ? null : el.dataset.v; renderMain(); return true;
    case 'cl-pq-filter': P.filter = el.dataset.v; renderMain(); return true;
    case 'cl-pq-pick': if (P.draft?.dirty && P.draft.id !== el.dataset.id) { toast('Save or discard the question you’re changing first.'); return true; } openQuestion(el.dataset.id); renderMain(); if (!drawerMode()) setTimeout(() => document.querySelector(`[data-act="cl-pq-pick"][data-id="${CSS.escape(el.dataset.id)}"]`)?.focus(), 0); else setTimeout(() => document.getElementById('cl-pq-label')?.focus(), 0); return true;
    case 'cl-pq-new': if (P.draft?.dirty) { toast('Save or discard the question you’re changing first.'); return true; } P.sel = null; P.issues = []; P.draft = { id: 'q' + uid(), label: '', help: '', set: store.answerSets[0]?.id || 'text', onFail: { comment: '', photo: '', task: '' }, catId: P.cat || '', dirty: true }; renderMain(); setTimeout(() => document.getElementById('cl-pq-label')?.focus(), 0); return true;
    case 'cl-pq-close': if (P.draft?.dirty) { toast('Save or discard your changes first.'); return true; } P.draft = null; P.sel = null; renderMain(); return true;
    case 'cl-pq-discard': if (store.checklistQuestions.some((q) => q.id === P.draft.id)) openQuestion(P.draft.id); else P.draft = null; renderMain(); return true;
    case 'cl-pq-save': await saveQuestion(); return true;
    case 'cl-pq-set': P.draft.set = el.dataset.v; { const s = store.answerSets.find((y) => y.id === el.dataset.v); if (!s || !s.options.some((o) => o.fail)) P.draft.onFail = { comment: '', photo: '', task: '' }; } P.draft.dirty = true; renderMain(); return true;
    case 'cl-pq-fail': P.draft.onFail = { ...(P.draft.onFail || {}), [el.dataset.k]: el.dataset.v }; P.draft.dirty = true; renderMain(); return true;
    case 'cl-pq-del': { const id = P.draft.id; if (usedBy(id, store.checklists).length) { toast('A checklist uses it.'); return true; } try { await savePoolWork({ delQuestions: [id] }); P.draft = null; P.sel = null; toast('Deleted from the pool. Records answered on it keep their answers.'); } catch (e) { toast('Couldn’t delete it. Try again.'); } renderMain(); return true; }
    case 'cl-pq-open': if (P.draft?.dirty) { toast('Save or discard the question first.'); return true; } D.tab = 'checklists'; pick(el.dataset.id); D.it = P.sel; renderMain(); return true;
    case 'cl-cat-new': P.catNew = ''; P.catEdit = null; renderMain(); setTimeout(() => document.getElementById('cl-catname')?.focus(), 0); return true;
    case 'cl-cat-edit': P.catEdit = el.dataset.id; P.catNew = null; P.catColor = null; renderMain(); setTimeout(() => document.getElementById('cl-catname')?.focus(), 0); return true;
    case 'cl-cat-cancel': P.catNew = null; P.catEdit = null; renderMain(); return true;
    case 'cl-cat-color': { const c = catOf(el.dataset.id); if (!c) return true; try { await savePoolWork({ cats: [{ id: c.id, data: { name: c.name, color: el.dataset.v, order: c.order ?? 0 } }] }); } catch (e) { toast('Couldn’t save the colour. Try again.'); } renderMain(); return true; }
    case 'cl-cat-save': await saveCat(el.dataset.id); return true;
    case 'cl-cat-del': { const id = el.dataset.id; if (store.checklistQuestions.some((q) => q.catId === id)) { toast('Move its questions to another category first.'); return true; } try { await savePoolWork({ delCats: [id] }); P.catEdit = null; if (P.cat === id) P.cat = null; } catch (e) { toast('Couldn’t delete it. Try again.'); } renderMain(); return true; }
  }
  return false;
}
async function saveCat(id) {
  const name = String(document.getElementById('cl-catname')?.value || '').trim();
  if (!name) { toast('Give the category a name.'); return; }
  const c = id ? catOf(id) : null, n = store.checklistCats.length;
  try { await savePoolWork({ cats: [{ id: id || 'cc' + uid(), data: { name: name.slice(0, 60), color: c?.color || SET_COLORS[(n + 5) % SET_COLORS.length], order: c?.order ?? n } }] }); D.pq.catNew = null; D.pq.catEdit = null; }
  catch (e) { console.error(e); toast(e?.code === 'permission-denied' ? 'Only administrators can do this. (If you are one, deploy the latest Cadence rules.)' : 'Saving failed. Try again.'); }
  renderMain();
}
document.addEventListener('input', (e) => {
  const t = e.target; if (!D) return;
  if (t.id === 'cl-pq-q') { D.pq.q = t.value; const pos = t.selectionStart; renderMain(); const n = document.getElementById('cl-pq-q'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } return; }
  if (t.id === 'cl-pk-q' && D.picker) { D.picker.q = t.value; const pos = t.selectionStart; renderMain(); const n = document.getElementById('cl-pk-q'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } return; }
  if (t.dataset?.pqi && D.pq.draft) { D.pq.draft[t.dataset.pqi] = t.value; if (!D.pq.draft.dirty) { D.pq.draft.dirty = true; renderMainKeepPool(t); } }
});
function renderMainKeepPool(t) { const id = t.id, pos = t.selectionStart; renderMain(); const n = document.getElementById(id); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { /* */ } } }
document.addEventListener('change', (e) => {
  const t = e.target; if (!D) return;
  if (t.dataset?.clpk && D.picker) { if (t.checked) D.picker.sel.add(t.dataset.clpk); else D.picker.sel.delete(t.dataset.clpk); renderMain(); document.querySelector(`[data-clpk="${CSS.escape(t.dataset.clpk)}"]`)?.focus(); return; }
  if (t.dataset?.clask && D.ask) { D.ask.choice[t.dataset.clask] = t.value; renderMain(); document.querySelector(`[data-clask="${CSS.escape(t.dataset.clask)}"][value="${t.value}"]`)?.focus(); return; }
  if (t.dataset?.pqc === 'cat' && D.pq.draft) { D.pq.draft.catId = t.value; D.pq.draft.dirty = true; renderMain(); document.getElementById('cl-pq-cat')?.focus(); return; }
  if (t.dataset?.clc === 'cat' && D.cl) { const x = D.cl.items[+t.dataset.i]; if (x) { x.catId = t.value; D.cl.dirty = true; renderMain(); document.querySelector(`[data-clc="cat"][data-i="${t.dataset.i}"]`)?.focus(); } }
});
document.addEventListener('keydown', (e) => {
  if (!D) return;
  if (e.target.id === 'cl-catname') { if (e.key === 'Enter') { e.preventDefault(); saveCat(D.pq.catEdit || ''); } else if (e.key === 'Escape') { D.pq.catNew = null; D.pq.catEdit = null; renderMain(); } return; }
  if (e.key === 'Escape' && (D.picker || D.ask)) { D.picker = null; D.ask = null; renderMain(); }
});
