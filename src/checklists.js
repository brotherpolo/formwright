// Settings › Checklists (administrators): the checklist library. Types group checklists; each
// checklist has sections and items, a pass mark and versions; answer sets are the reusable
// choices with scores. Forms use a checklist with the Checklist field. Logic: checklistlogic.js.

import { store, saveChecklistType, deleteChecklistType, saveAnswerSets, deleteAnswerSet, saveChecklist, deleteChecklist } from './store.js';
import { renderMain, go } from './app.js';
import { esc, uid, toast } from './ui.js';
import { writeXlsx, readSheets } from './xlsx.js';
import { exportSheets, templateSheets, planImport, copyName } from './checklistio.js';
import { BUILT_IN, isBuiltIn, MAX_ITEMS, MAX_OPTIONS, FAIL_MODES, starterSets, cleanSet, setIssues, cleanItems, checklistIssues, snapshotOf, usesSet, maxOf } from './checklistlogic.js';

let D = null; // { tab, sel, cl (draft), sets (draft), typeNew, typeRen, confirm, busy }
const fresh = () => ({ tab: 'checklists', sel: null, cl: null, sets: null, typeNew: null, typeRen: null, confirm: null, busy: false, issues: [] });
const S = () => (D = D || fresh());

export const isDirty = () => !!(D && ((D.cl && D.cl.dirty) || (D.sets && D.sets.dirty)));
export function leave() { D = null; }
/** Open one checklist (from #/settings/checklists/<id>); false when it isn't there (yet). */
export function openById(id) { if (!store.checklists.some((c) => c.id === id)) return false; S(); D.tab = 'checklists'; pick(id); return true; }

const setsById = () => new Map(store.answerSets.map((s) => [s.id, s]));
const typeName = (id) => store.checklistTypes.find((t) => t.id === id)?.name || 'No type';
/** Forms (and grids) whose Checklist field uses this checklist: ['Site walks', …]. */
export const formsUsing = (clId) => store.forms.filter((f) => (f.fields || []).some((x) => x.type === 'checklist' && x.checklist === clId)).map((f) => f.name || 'Untitled form');
const blankItem = () => ({ id: 'i' + uid(), kind: 'item', label: '', help: '', set: store.answerSets[0]?.id || 'text', required: false, critical: false, onFail: { comment: '', photo: '' }, showIf: null });

function pick(id) {
  const c = store.checklists.find((x) => x.id === id);
  D.sel = id; D.confirm = null; D.issues = [];
  D.cl = c ? { id: c.id, name: c.name, typeId: c.typeId || '', passAt: c.passAt ?? '', items: JSON.parse(JSON.stringify(c.items || [])), ver: c.ver || 0, isNew: false, dirty: false } : null;
}

/* ---------- the page ---------- */

export function viewChecklists() {
  S();
  if (D.cl && !D.cl.isNew && !D.cl.dirty) { const c = store.checklists.find((x) => x.id === D.cl.id); if (c && c.ver > D.cl.ver) pick(c.id); } // follow saves from elsewhere
  if (D.sets && !D.sets.dirty) D.sets = null;
  const head = `<div class="head"><div class="ttl"><div><h1>Checklists</h1><p class="sub">Reusable checklists with scored answers. Put one on any form with the <b>Checklist</b> field in the Form designer.</p></div></div></div>
  <div class="tabs cl-tabs" role="tablist"><button type="button" role="tab" class="tab${D.tab === 'checklists' ? ' on' : ''}" aria-selected="${D.tab === 'checklists'}" data-act="cl-tab" data-v="checklists">Checklists <span class="cl-n">${store.checklists.length}</span></button><button type="button" role="tab" class="tab${D.tab === 'sets' ? ' on' : ''}" aria-selected="${D.tab === 'sets'}" data-act="cl-tab" data-v="sets">Answer sets <span class="cl-n">${store.answerSets.length}</span></button><span class="cl-io"><button type="button" class="btn sm ghost" data-act="cl-tpl">⇩ Download template</button><button type="button" class="btn sm" data-act="cl-imp">⇧ Import…</button></span></div>`;
  if (!store.checklistsReady) return head + '<div class="panel empty"><p>Loading checklists…</p></div>';
  if (D.imp) return head + importView();
  return head + (D.tab === 'sets' ? setsTab() : checklistsTab());
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
    return `<div class="cl-tg">${hd}${cs.map(row).join('') || '<p class="help cl-none">No checklists yet.</p>'}</div>`;
  }).join('');
  const add = D.typeNew != null ? `<div class="cl-th cl-ren"><input class="in" id="cl-typename" value="${esc(D.typeNew)}" maxlength="80" placeholder="e.g. Safety inspections" aria-label="New type name"><button type="button" class="btn sm primary" data-act="cl-type-save">Add</button><button type="button" class="btn sm ghost" data-act="cl-type-cancel">Cancel</button></div>` : '';
  return `<nav class="cl-tree" aria-label="Checklists">${html || '<p class="help">Start with a type, like “Safety inspections”, then add checklists to it.</p>'}${add}
    <div class="cl-tadd"><button type="button" class="btn sm" data-act="cl-type-new">+ Type</button><button type="button" class="btn sm" data-act="cl-new" data-id="${esc(store.checklistTypes[0]?.id || '')}">+ Checklist</button></div></nav>`;
}

function checklistsTab() {
  if (!store.answerSets.length && !store.checklists.length) {
    return `<div class="panel empty"><h2>First, the answers</h2><p>Checklist items are answered from <b>answer sets</b>: choices with scores, like Pass / Fail / N/A. Start with the usual ones and change them any time.</p><button type="button" class="btn primary" data-act="cl-starter">Add Pass / Fail / N/A, Yes / No and Condition 1–5</button> <button type="button" class="btn" data-act="cl-tab" data-v="sets">Make my own</button></div>`;
  }
  return `<div class="cl-wrap">${tree()}<div class="cl-main">${D.cl ? editor() : `<div class="panel empty"><p>${store.checklists.length ? 'Pick a checklist on the left, or make a new one.' : 'No checklists yet.'}</p><button type="button" class="btn primary" data-act="cl-new" data-id="${esc(store.checklistTypes[0]?.id || '')}">+ New checklist</button></div>`}</div></div>`;
}

const setChoices = (cur) => `${store.answerSets.length ? `<optgroup label="Answer sets (scored)">${store.answerSets.map((s) => `<option value="${esc(s.id)}"${s.id === cur ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</optgroup>` : ''}<optgroup label="Not scored">${BUILT_IN.map(([k, l]) => `<option value="${k}"${k === cur ? ' selected' : ''}>${l}</option>`).join('')}</optgroup>${cur && !isBuiltIn(cur) && !store.answerSets.some((s) => s.id === cur) ? '<option value="" selected>(deleted answer set)</option>' : ''}`;

function itemCard(x, i, items) {
  const at = `data-i="${i}"`, n = items.length;
  const moves = `<span class="cl-moves"><button type="button" class="ibtn" data-act="cl-mv" ${at} data-dir="-1" aria-label="Move up"${i === 0 ? ' disabled' : ''}>↑</button><button type="button" class="ibtn" data-act="cl-mv" ${at} data-dir="1" aria-label="Move down"${i === n - 1 ? ' disabled' : ''}>↓</button><button type="button" class="ibtn" data-act="cl-del-item" ${at} aria-label="Remove">✕</button></span>`;
  if (x.kind === 'section') return `<div class="cl-sec" data-item="${esc(x.id)}"><span class="cl-tag">Section</span><input class="in cl-seclab" data-cli="label" ${at} value="${esc(x.label)}" maxlength="120" placeholder="Section heading" aria-label="Section heading">${moves}</div>`;
  const s = !isBuiltIn(x.set) && store.answerSets.find((y) => y.id === x.set);
  const choice = !!s, hasFail = s && (s.options || []).some((o) => o.fail);
  const earlier = items.slice(0, i).filter((y) => y.kind === 'item' && !isBuiltIn(y.set) && store.answerSets.some((z) => z.id === y.set));
  const src = x.showIf && earlier.find((y) => y.id === x.showIf.item), srcSet = src && store.answerSets.find((z) => z.id === src.set);
  const failSel = (k, word) => `<label class="cl-mini">${word} <select class="in" data-clc="fail-${k}" ${at}>${FAIL_MODES.map(([v, l]) => `<option value="${v}"${(x.onFail?.[k] || '') === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>`;
  return `<div class="cl-item" data-item="${esc(x.id)}">
    <div class="cl-r1"><span class="cl-num">${items.slice(0, i + 1).filter((y) => y.kind === 'item').length}</span><input class="in cl-qin" data-cli="label" ${at} value="${esc(x.label)}" maxlength="300" placeholder="Question, e.g. Walkways clear of materials" aria-label="Question"><select class="in cl-set" data-clc="set" ${at} aria-label="Answer type">${setChoices(x.set)}</select>${moves}</div>
    <div class="cl-r2"><label class="cl-ck"><input type="checkbox" data-clc="required" ${at}${x.required ? ' checked' : ''}>Required</label>${choice ? `<label class="cl-ck" title="A fail here fails the whole checklist"><input type="checkbox" data-clc="critical" ${at}${x.critical ? ' checked' : ''}${hasFail ? '' : ' disabled'}>Critical</label>` : ''}
      ${hasFail ? `<span class="cl-onfail">On fail: ${failSel('comment', 'comment')} ${failSel('photo', 'photo')}</span>` : choice ? '<span class="help">Mark an answer as a fail in its answer set for Critical and On fail.</span>' : ''}</div>
    <input class="in cl-help" data-cli="help" ${at} value="${esc(x.help || '')}" maxlength="300" placeholder="Help (optional): what to check" aria-label="Help text">
    ${earlier.length ? `<div class="cl-r2 cl-if"><label class="cl-mini">Show <select class="in" data-clc="if" ${at}><option value="">always</option>${earlier.map((y) => `<option value="${esc(y.id)}"${src && src.id === y.id ? ' selected' : ''}>only if “${esc((y.label || 'Untitled').slice(0, 50))}” is</option>`).join('')}</select></label>
      ${srcSet ? `<span class="cl-ifopts">${(srcSet.options || []).map((o) => `<label class="cl-ck"><input type="checkbox" data-clc="ifopt" ${at} value="${esc(o.id)}"${x.showIf.any.includes(o.id) ? ' checked' : ''}>${esc(o.label)}</label>`).join('')}</span>` : ''}</div>` : ''}
  </div>`;
}

function editor() {
  const c = D.cl, sets = setsById();
  const live = store.checklists.find((x) => x.id === c.id);
  const used = c.isNew ? [] : formsUsing(c.id);
  const nItems = c.items.filter((x) => x.kind === 'item').length;
  const maxScore = c.items.reduce((t, x) => { const s = x.kind === 'item' && sets.get(x.set); const m = s ? maxOf(s.options) : null; return t + (m || 0); }, 0);
  const del = c.isNew ? '' : used.length ? `<span class="help">Used by ${esc(used.join(', '))}, so it can’t be deleted.</span>` : `<button type="button" class="btn ghost danger${D.confirm === 'del' ? ' armed' : ''}" data-act="cl-del">${D.confirm === 'del' ? 'Click again to delete' : 'Delete checklist'}</button>`;
  return `<div class="panel cl-ed">
    <div class="cl-top"><label class="cl-f"><span>Name</span><input class="in cl-name" data-cli="name" value="${esc(c.name)}" maxlength="80" placeholder="e.g. Daily site walk"></label>
      <label class="cl-f"><span>Type</span><select class="in" data-clc="type"><option value="">No type</option>${store.checklistTypes.map((t) => `<option value="${esc(t.id)}"${t.id === c.typeId ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
      <label class="cl-f cl-pass"><span>Pass at</span><span class="cl-pct"><input class="in" type="number" min="0" max="100" step="1" data-cli="passAt" value="${esc(c.passAt ?? '')}" placeholder="—" aria-label="Pass mark, percent">%</span></label></div>
    <p class="help cl-meta">${c.isNew ? 'New checklist.' : `Version ${live?.ver || c.ver}${live?.at ? ` · saved ${esc(new Date(live.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }))}` : ''}${used.length ? ` · used by ${esc(used.join(', '))}` : ' · not on a form yet'}`} · ${nItems} item${nItems === 1 ? '' : 's'}${maxScore ? `, best score ${maxScore}` : ''}. Leave Pass at empty for no pass mark; a failed Critical item still fails it.</p>
    <div class="cl-items">${c.items.map((x, i) => itemCard(x, i, c.items)).join('') || '<p class="help">Add an item: a question and how it’s answered.</p>'}</div>
    <div class="cl-adds">${c.items.length < MAX_ITEMS ? '<button type="button" class="btn sm" data-act="cl-add-item">+ Item</button><button type="button" class="btn sm" data-act="cl-add-sec">+ Section</button>' : ''}</div>
    ${D.issues.length ? `<div class="cl-issues" role="alert"><b>Before saving:</b><ul>${D.issues.map((m) => `<li>${esc(m)}</li>`).join('')}</ul></div>` : ''}
    <div class="cl-foot">${del}<span class="cl-grow"></span><span class="help" id="cl-dirty">${c.dirty ? (c.isNew ? 'Not saved yet' : `Saving makes version ${(live?.ver || c.ver) + 1}. Records already filled in keep theirs.`) : ''}</span>${c.dirty && !c.isNew ? '<button type="button" class="btn ghost" data-act="cl-discard">Discard changes</button>' : ''}<button type="button" class="btn primary" data-act="cl-save"${D.busy ? ' disabled' : ''}>${D.busy ? 'Saving…' : 'Save'}</button></div>
  </div>`;
}

/* ---------- answer sets ---------- */

function setsDraft() {
  if (!D.sets) D.sets = { list: store.answerSets.map((s) => ({ id: s.id, ...cleanSet(s), isNew: false })), dirty: false, del: [] };
  return D.sets;
}
function setsTab() {
  const sd = setsDraft();
  const card = (s, si) => {
    const used = store.checklists.filter((c) => usesSet(c, s.id));
    return `<div class="panel cl-setcard" data-set="${esc(s.id)}">
      <div class="cl-sethd"><input class="in cl-setname" data-csi="name" data-s="${si}" value="${esc(s.name)}" maxlength="80" placeholder="Answer set name, e.g. Pass / Fail / N/A" aria-label="Answer set name">
        ${used.length ? `<span class="help">Used by ${used.length} checklist${used.length === 1 ? '' : 's'}</span>` : `<button type="button" class="ibtn" data-act="cl-set-del" data-s="${si}" aria-label="Delete this answer set" title="Delete">✕</button>`}</div>
      <table class="cl-opts"><thead><tr><th>Answer</th><th>Score</th><th>Counts as a fail</th><th></th></tr></thead><tbody>
      ${s.options.map((o, oi) => `<tr><td><input class="in" data-csi="olabel" data-s="${si}" data-o="${oi}" value="${esc(o.label)}" maxlength="60" aria-label="Answer"></td>
        <td><input class="in cl-score" type="number" step="any" data-csi="oscore" data-s="${si}" data-o="${oi}" value="${o.score ?? ''}" placeholder="not counted" aria-label="Score for ${esc(o.label)}"></td>
        <td><label class="cl-ck"><input type="checkbox" data-csc="ofail" data-s="${si}" data-o="${oi}"${o.fail ? ' checked' : ''}>Fail</label></td>
        <td class="cl-oact"><button type="button" class="ibtn" data-act="cl-opt-mv" data-s="${si}" data-o="${oi}" data-dir="-1" aria-label="Move up"${oi === 0 ? ' disabled' : ''}>↑</button><button type="button" class="ibtn" data-act="cl-opt-mv" data-s="${si}" data-o="${oi}" data-dir="1" aria-label="Move down"${oi === s.options.length - 1 ? ' disabled' : ''}>↓</button><button type="button" class="ibtn" data-act="cl-opt-del" data-s="${si}" data-o="${oi}" aria-label="Remove ${esc(o.label)}"${s.options.length <= 2 ? ' disabled' : ''}>✕</button></td></tr>`).join('')}
      </tbody></table>
      ${s.options.length < MAX_OPTIONS ? `<button type="button" class="btn sm ghost" data-act="cl-opt-add" data-s="${si}">+ Answer</button>` : ''}
      <span class="help">Best score: ${maxOf(s.options) ?? '—'}. Leave a score empty for answers that don’t count, like N/A.</span>
    </div>`;
  };
  const changedIds = changedSets();
  const affected = store.checklists.filter((c) => changedIds.some((id) => usesSet(c, id)));
  return `<p class="help cl-sethelp">Choices with scores, used by checklist items. A checklist’s score adds up its answers out of the best possible; answers marked <b>Fail</b> can ask for a comment or photo, and fail a Critical item. Text, Date, Decimal and Percent are always there and aren’t scored.</p>
    ${sd.list.map(card).join('')}
    <div class="cl-adds"><button type="button" class="btn" data-act="cl-set-add">+ Answer set</button>${!sd.list.length ? '<button type="button" class="btn" data-act="cl-starter">Add the usual ones</button>' : ''}</div>
    ${D.issues.length ? `<div class="cl-issues" role="alert"><b>Before saving:</b><ul>${D.issues.map((m) => `<li>${esc(m)}</li>`).join('')}</ul></div>` : ''}
    <div class="cl-foot"><span class="cl-grow"></span><span class="help" id="cl-dirty">${sd.dirty ? (affected.length ? `Saving also makes new versions of ${affected.map((c) => `“${esc(c.name)}”`).join(', ')}. Records already filled in keep theirs.` : 'Unsaved changes') : ''}</span>${sd.dirty ? '<button type="button" class="btn ghost" data-act="cl-sets-discard">Discard changes</button>' : ''}<button type="button" class="btn primary" data-act="cl-sets-save"${!sd.dirty || D.busy ? ' disabled' : ''}>${D.busy ? 'Saving…' : 'Save answer sets'}</button></div>`;
}
function changedSets() {
  if (!D.sets) return [];
  const live = setsById();
  return D.sets.list.filter((s) => { const l = live.get(s.id); return !l || JSON.stringify(cleanSet(l)) !== JSON.stringify(cleanSet(s)); }).map((s) => s.id);
}

/* ---------- saving ---------- */

async function saveCl() {
  const c = D.cl; if (!c || D.busy) return;
  const sets = setsById();
  const items = cleanItems(c.items);
  const passAt = c.passAt === '' || c.passAt == null ? null : Number(c.passAt);
  const issues = checklistIssues({ name: c.name, items, passAt }, sets);
  D.issues = issues;
  if (issues.length) { renderMain(); document.querySelector('.cl-issues')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
  const live = store.checklists.find((x) => x.id === c.id);
  const ver = (live?.ver || 0) + 1;
  const base = { name: c.name.trim(), typeId: c.typeId || '', passAt, items };
  const data = { ...base, ver, snap: snapshotOf(base, sets, ver), createdAt: live?.createdAt || Date.now() };
  D.busy = true; renderMain();
  try { await saveChecklist(c.id, data); D.cl = { ...c, items, isNew: false, dirty: false, ver }; toast(ver === 1 ? `Saved “${base.name}”. Add it to a form with the Checklist field.` : `Saved version ${ver}.`); }
  catch (e) { console.error(e); toast(e?.code === 'permission-denied' ? 'Only administrators can change checklists. (If you are one, deploy the latest Cadence rules.)' : 'Saving failed. Check your connection and try again.'); }
  D.busy = false; renderMain();
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
    case 'cl-new': { if (D.cl?.dirty) { toast('Save or discard your changes first.'); return true; } const id = 'cl' + uid(); D.sel = id; D.issues = []; D.cl = { id, name: '', typeId: el.dataset.id || '', passAt: 80, items: [blankItem()], ver: 0, isNew: true, dirty: true }; renderMain(); focusLater('.cl-name'); return true; }
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
      D.cl.items.push(it); dirtyCl(); renderMain(); focusLater(`[data-item="${it.id}"] input`); return true;
    }
    case 'cl-mv': { const i = +el.dataset.i, j = i + +el.dataset.dir, xs = D.cl.items; if (j < 0 || j >= xs.length) return true; [xs[i], xs[j]] = [xs[j], xs[i]]; fixIfs(); dirtyCl(); renderMain(); focusLater(`[data-act="cl-mv"][data-i="${j}"][data-dir="${el.dataset.dir}"]:not(:disabled)`); return true; }
    case 'cl-del-item': { const gone = D.cl.items.splice(+el.dataset.i, 1)[0]; D.cl.items.forEach((x) => { if (x.showIf?.item === gone?.id) x.showIf = null; }); dirtyCl(); renderMain(); return true; }
    case 'cl-type-new': D.typeNew = ''; D.typeRen = null; renderMain(); focusLater('#cl-typename'); return true;
    case 'cl-type-ren': D.typeRen = el.dataset.id; D.typeNew = null; renderMain(); focusLater('#cl-typename'); return true;
    case 'cl-type-cancel': D.typeNew = null; D.typeRen = null; renderMain(); return true;
    case 'cl-type-save': return saveType(el.dataset.id), true;
    case 'cl-type-del': { const t = store.checklistTypes.find((x) => x.id === el.dataset.id); if (!t) return true; if (store.checklists.some((c) => c.typeId === t.id)) { toast('Move its checklists to another type first.'); return true; } try { await deleteChecklistType(t.id); toast(`Deleted “${t.name}”.`); } catch (e) { toast('Couldn’t delete it. Try again.'); } return true; }
    case 'cl-starter': await addStarter(); return true;
    case 'cl-set-add': { const sd = setsDraft(); sd.list.push({ id: 'as' + uid(), name: '', options: [{ id: 'o' + uid(), label: '', score: 1, fail: false }, { id: 'o' + uid(), label: '', score: 0, fail: true }], isNew: true }); dirtySets(); renderMain(); focusLater(`.cl-setcard:last-of-type .cl-setname`); return true; }
    case 'cl-set-del': { const sd = setsDraft(), s = sd.list[+el.dataset.s]; if (!s) return true; if (store.checklists.some((c) => usesSet(c, s.id))) { toast('A checklist uses it.'); return true; } sd.list.splice(+el.dataset.s, 1); if (!s.isNew) sd.del.push(s.id); dirtySets(); renderMain(); return true; }
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
    const x = item(t); if (!x) return true;
    if (k === 'set') { x.set = t.value; const s = store.answerSets.find((y) => y.id === x.set); if (!s || !s.options.some((o) => o.fail)) { x.critical = false; x.onFail = { comment: '', photo: '' }; } D.cl.items.forEach((y) => { if (y.showIf?.item === x.id) y.showIf = null; }); }
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
  try { saveFile(await writeXlsx(exportSheets({ checklists: list, types, sets: store.answerSets })), `${name} checklist${list.length === 1 ? '' : 's'}.xlsx`); toast(`Downloaded ${list.length === 1 ? `“${list[0].name}”` : `${list.length} checklists`}. Change it in Excel and import it back to update.`); }
  catch (e) { console.error(e); toast('The export couldn’t be made. Try again.'); }
}
async function readImportFile(file) {
  if (!file || !D?.imp) return;
  D.imp.err = ''; D.imp.reading = true; renderMain();
  try {
    if (file.size > 25 * 1024 * 1024) throw new Error('This file is over 25 MB. Split it into smaller files.');
    const sheets = await readSheets(new Uint8Array(await file.arrayBuffer()), file.name);
    const plan = planImport(sheets, { types: store.checklistTypes, sets: store.answerSets, checklists: store.checklists }, { intoType: D.imp.intoType, uid });
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
    <div class="cl-impsum"><div><b>${p.types.length}</b><small>type${p.types.length === 1 ? '' : 's'}${newTypes.length ? ` (${newTypes.length} new)` : ''}</small></div><div><b>${p.checklists.length}</b><small>checklist${p.checklists.length === 1 ? '' : 's'} (${p.checklists.filter((c) => c.status === 'new').length} new, ${p.checklists.filter((c) => c.status === 'update').length} already here)</small></div><div><b>${nSets}</b><small>answer set${nSets === 1 ? '' : 's'} added or changed</small></div><div><b>${p.checklists.reduce((t, c) => t + items(c), 0)}</b><small>items</small></div></div>
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
  // checklists already here that use an answer set this changes: their next version, as editing the set does
  const changed = setsOut.map((s) => s.id).filter((id) => exSets.some((x) => x.id === id));
  const doneIds = new Set(out.map((o) => o.id));
  const rever = store.checklists.filter((c) => !doneIds.has(c.id) && changed.some((id) => usesSet(c, id))).map((c) => {
    const ver = (c.ver || 0) + 1, base = { name: c.name, typeId: c.typeId || '', passAt: c.passAt ?? null, items: c.items };
    return { id: c.id, data: { ...base, ver, snap: snapshotOf(base, setMap, ver), createdAt: c.createdAt || Date.now() } };
  });
  m.busy = true; renderMain();
  try {
    let order = store.checklistTypes.length;
    for (const t of newTypes) await saveChecklistType(t.id, t.name, order++);
    if (setsOut.length || rever.length) await saveAnswerSets(setsOut, rever);
    for (const o of out) await saveChecklist(o.id, o.data);
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
