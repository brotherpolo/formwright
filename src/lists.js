// A form's records list: saved views, columns chosen on screen, sort, filters, row
// height, and selecting several records to change, export or delete together.
// Column and view logic lives in listlogic.js; app.js passes in its formatting helpers.
import './lists.css';
import { store, saveListView, deleteListView, deleteRecords, setRecordsValue, setRecordsValues, setValuesEach, attachRecords, setOwner, moveStage } from './store.js';
import { wfOn, stagesOf, stageById, stageIndex, stageName, canWork, assigneeFor, movesOf, missingToMove } from './workflow.js';
import { bindLayouts, layoutSeg, layoutTools, boardHTML, timelineHTML, afterLayout, onClick as llClick, onChange as llChange, onKey as llKey, closeMenus as llClose } from './listlayouts.js';
import { cleanLayout } from './layoutlogic.js';
import { openPickParent } from './attach.js';
import { attachChange } from './attachlogic.js';
import { nounOf } from './dashlogic.js';
import { isAdmin, formLevel, canViewForm, canCreate, canEditRecord } from './access.js';
import { $, esc, uid, toast, badge, itemName } from './ui.js';
import { importButton } from './imports.js';
import {
  columnCatalog, defaultConfig, cleanConfig, sameConfig, cellOf, filterRecords, searchRows, sortRows, firstDir,
  columnTotal, viewsFor, canSaveView, canDeleteView, viewDoc, toCsv, optionsOf, defaultViewId, filterCount,
  FILTERABLE, MAX_COLS, bulkFields, parseBulk, multiWith,
} from './listlogic.js';

let H = { ruleImpact: null, applyRuleChange: null, fmt: null, valOf: null, recTitle: null, titleFieldOf: null, parentsOf: null, formById: null, recById: null, recordsOf: null, renderMain: null, withFormulas: (f, r, ch) => ch, search: () => '' };
export function initLists(helpers) { H = { ...H, ...helpers }; }

const UNDO_MS = 6000;
const LV = {
  formId: null, viewId: null, cfg: null, base: null, pop: null, sel: new Set(),
  naming: null, confirm: false, confirmView: false, awaitId: null, busy: false, wantId: null,
  sheet: false, // phones: the ⋯ list options sheet is open
};
let pending = null; // { ids:Set, timer, formId, label } — deletes waiting out the undo window

const me = () => store.user?.uid;
const remembered = (formId) => { try { return localStorage.getItem('fw.listView.' + formId); } catch (e) { return null; } };
const remember = (formId, id) => { try { localStorage.setItem('fw.listView.' + formId, id); } catch (e) { /* private mode */ } };
const plural = (n, form) => n.toLocaleString() + ' ' + nounOf(form, n);

/* ---------- context for one form ---------- */

function ctxFor(form) {
  const titleField = H.titleFieldOf(form);
  const parents = H.parentsOf(form.id).filter((pf) => canViewForm(store.me, pf.id));
  const children = (form.children || []).map((c) => H.formById(c.formId)).filter((cf) => cf && canViewForm(store.me, cf.id));
  const c = { form, titleField, parents, children };
  c.catalog = columnCatalog(c);
  c.byKey = new Map(c.catalog.map((x) => [x.key, x]));
  c.base = defaultConfig(c);
  c.views = viewsFor(form, store.listViews, me(), c.base).map((v) => ({ ...v, cfg: cleanConfig(v.cfg, c.catalog, form) }));
  return c;
}

function cellHelpers(form) {
  const kids = new Map();
  store.records.forEach((r) => { if (r.parentId) { const k = r.parentId + '|' + r.formId; kids.set(k, (kids.get(k) || 0) + 1); } });
  return {
    form, formById: H.formById, recById: H.recById, valOf: H.valOf, fmt: H.fmt,
    recTitle: (r, f) => H.recTitle(r, f),
    kids: (id, fid) => kids.get(id + '|' + fid) || 0,
    nameOf: (u) => store.profiles[u]?.displayName || (u === me() ? 'You' : 'Someone'),
  };
}

/** Keep LV on this form and its chosen view; follow saved changes when nothing is unsaved here. */
function sync(c) {
  const { form, views } = c;
  if (LV.formId !== form.id) {
    Object.assign(LV, { formId: form.id, pop: null, sel: new Set(), naming: null, confirm: false, confirmView: false, awaitId: null });
    const want = LV.force && LV.force.formId === form.id ? LV.force.viewId : remembered(form.id);
    LV.force = null;
    const v = views.find((x) => x.id === want) || views[0];
    LV.viewId = v.id; LV.cfg = structuredClone(v.cfg); LV.base = structuredClone(v.cfg);
    // Saved views may still be on their way: switch to the remembered one when it arrives.
    LV.wantId = want && v.id !== want && !store.listViewsReady ? want : null;
  }
  if (LV.wantId) {
    const w = views.find((x) => x.id === LV.wantId);
    if (w) {
      if (LV.viewId === views[0].id && sameConfig(LV.cfg, LV.base)) { LV.viewId = w.id; LV.cfg = structuredClone(w.cfg); LV.base = structuredClone(w.cfg); }
      LV.wantId = null;
    } else if (store.listViewsReady) LV.wantId = null;
  }
  let v = views.find((x) => x.id === LV.viewId);
  if (v && LV.awaitId === v.id) LV.awaitId = null;
  if (!v && LV.awaitId !== LV.viewId) {
    v = views[0];
    LV.viewId = v.id; LV.cfg = structuredClone(v.cfg); LV.base = structuredClone(v.cfg); LV.naming = null;
  }
  if (v && !sameConfig(v.cfg, LV.base)) {
    if (sameConfig(LV.cfg, LV.base)) LV.cfg = structuredClone(v.cfg);
    LV.base = structuredClone(v.cfg);
  }
  LV.cfg = cleanConfig(LV.cfg, c.catalog, form);
  return v || views[0];
}

/* ---------- the screen ---------- */

export function viewRecords(form) {
  if (!form) return '';
  const c = ctxFor(form);
  const view = sync(c);
  const cfg = LV.cfg;
  const admin = isAdmin(store.me);
  const lvl = formLevel(store.me, form.id), mayCreate = canCreate(store.me, form.id);
  const hidden = pending && pending.formId === form.id ? pending.ids : null;
  const all = H.recordsOf(form.id).filter((r) => !hidden || !hidden.has(r.id));
  const shown = cfg.cols.map((k) => c.byKey.get(k)).filter(Boolean);
  const h = cellHelpers(form);

  // rows: filter → cells → search → sort
  const filtered = filterRecords(all, cfg.filters, form);
  let rows = filtered.map((rec) => ({ rec, title: H.recTitle(rec, form), cells: shown.map((col) => cellOf(col.key, rec, h)) }));
  rows = searchRows(rows, H.search());
  const sk = cfg.sort.key, si = shown.findIndex((x) => x.key === sk);
  rows.forEach((r) => { r.sortVal = sk === 'title' ? cellOf('title', r.rec, h).sort : si >= 0 ? r.cells[si].sort : cellOf(sk, r.rec, h).sort; });
  rows = sortRows(rows, cfg.sort.dir);

  // selection: drop anything that no longer exists
  const live = new Map(all.map((r) => [r.id, r]));
  [...LV.sel].forEach((id) => { if (!live.has(id)) LV.sel.delete(id); });
  const selRecs = [...LV.sel].map((id) => live.get(id));
  const editable = selRecs.filter((r) => canEditRecord(store.me, r));
  const shownIds = new Set(rows.map((r) => r.rec.id));
  const selHidden = selRecs.filter((r) => !shownIds.has(r.id)).length;
  const allOn = rows.length > 0 && rows.every((r) => LV.sel.has(r.rec.id));
  const someOn = !allOn && rows.some((r) => LV.sel.has(r.rec.id));

  const dirty = !sameConfig(cfg, view.cfg);
  const lay = cfg.layout?.kind || 'table';
  bindLayouts(layEnv(form, shown, cfg));
  const filterable = (form.fields || []).filter((f) => FILTERABLE.has(f.type) && optionsOf(f).length);
  const settable = bulkFields(form);

  const scope = lvl.view === 'own'
    ? `<p class="scope-note"><span class="chip acc">Only yours</span> You see the ${esc(form.name.toLowerCase())} you created.${lvl.edit === 'none' ? ' Read only.' : ''}</p>`
    : lvl.edit === 'none' ? `<p class="scope-note"><span class="chip">Read only</span> You can view these ${esc(form.name.toLowerCase())} but not change them.</p>`
    : lvl.edit === 'own' ? `<p class="scope-note"><span class="chip">Edit yours</span> You can view all ${esc(form.name.toLowerCase())} and edit the ones you created.</p>` : '';

  const head = `
  <div class="head">
    <div class="ttl">${badge(form, 1)}<div><h1>${esc(form.name)}</h1>${form.description ? `<p class="sub">${esc(form.description)}</p>` : ''}</div></div>
    <div class="actions">${admin ? `<button class="btn ghost ph-hide" data-act="edit-form" data-id="${form.id}">Edit form</button>` : ''}${admin ? `<span class="ph-hide">${importButton(form)}</span>` : ''}${mayCreate ? `<button class="btn primary${all.length ? ' ph-only' : ''}" data-act="new-record" data-id="${form.id}" aria-label="New ${esc(itemName(form).toLowerCase())}">+ New<span class="ph-hide"> ${esc(itemName(form).toLowerCase())}</span></button>` : ''}</div>
  </div>${scope}`;

  if (!all.length) {
    return head + `<div class="panel empty">${store.recordsLoading.has(form.id) ? `<p>Loading ${esc(form.name.toLowerCase())}…</p>` : `<h2>No ${esc(form.name.toLowerCase())} yet</h2>${mayCreate ? `<p>Add the first ${esc(itemName(form).toLowerCase())} to start the list.</p><button class="btn primary" data-act="new-record" data-id="${form.id}">+ New ${esc(itemName(form).toLowerCase())}</button>` : `<p>Nothing has been shared with you here yet.</p>`}`}</div>`;
  }

  return head + `
  <div class="lv" id="lv">
    ${viewsBar(c, view, dirty, admin, mayCreate ? `<button class="btn primary lv-new ph-hide" data-act="new-record" data-id="${form.id}">+ New ${esc(itemName(form).toLowerCase())}</button>` : '')}
    <div class="lv-tools">
      ${layoutSeg(cfg, 'll-wide')}
      <input class="in lv-search" id="search" type="search" placeholder="Search ${esc(form.name.toLowerCase())}" value="${esc(H.search())}" aria-label="Search records">
      ${sortChip(c, shown, cfg)}
      ${LV.sheet ? '' : `<span class="ph-hide lv-tool">${filterable.length ? filterTool(filterable, all, cfg) : ''}</span>
      <span class="ph-hide lv-tool">${columnsTool(c, shown)}</span>
      ${lay === 'table' ? densitySeg(cfg, 'ph-hide') : ''}`}
      <span class="lv-count ph-hide">${rows.length} of ${all.length}</span>
    </div>
    ${lay !== 'table' ? layoutTools(form, cfg) : ''}
    ${LV.sel.size && lay === 'table' ? bulkBar(form, selRecs, editable, selHidden, settable) : ''}
    ${rows.length && lay === 'board' ? boardHTML(form, rows, cfg, layEnv(form, shown, cfg)) : rows.length && lay === 'timeline' ? timelineHTML(form, rows, cfg, layEnv(form, shown, cfg)) : rows.length ? table(form, c, shown, rows, allOn, someOn, cfg) + cards(form, shown, rows, allOn, `${rows.length} of ${all.length}`, cfg.density) : `<div class="panel empty"><p>No ${esc(form.name.toLowerCase())} match ${H.search().trim() ? `“${esc(H.search())}”` : 'these filters'}.</p>${filterCount(cfg) ? '<button class="btn" data-lv="filter-clear">Clear filters</button>' : ''}</div>`}
    ${LV.sheet ? sheetHTML(form, c, shown, cfg, filterable, all, view, admin, dirty) : ''}
    ${LV.confirm ? confirmDialog(form, selRecs, editable) : ''}${LV.setAsk && LV.setAsk.form.id === form.id ? setAskDialog() : ''}${LV.stageAsk && LV.stageAsk.formId === form.id ? stageAskDialog(form) : ''}
  </div>`;
}

/** What the Board and Timeline need (listlayouts.js). */
function layEnv(form, shown, cfg) {
  return {
    form, cfg, H, admin: isAdmin(store.me), cols: shown,
    canEdit: (r) => canEditRecord(store.me, r), canWork: (r) => (H.canWork ? H.canWork(r) : false),
    applySet, stageMove: (rec, f, go) => H.stageMove(rec, f, go), setLayout, repaint,
    today: H.today(), dayOf: H.dayOf, weekStart: H.weekStart(), formColor: H.colorOf(form), cardExtra: H.cardExtra,
  };
}
/** Change the Board or Timeline settings (or switch layout) on screen; Save view keeps them. */
function setLayout(patch) {
  const form = formNow(); if (!form) return;
  LV.cfg = { ...LV.cfg, layout: cleanLayout({ ...(LV.cfg.layout || {}), ...patch }, form) };
  if (patch.kind && patch.kind !== 'table') LV.sel = new Set();
  repaint();
}

/** The saved views row; on computers it starts with + New (newBtn). */
function viewsBar(c, view, dirty, admin, newBtn = '') {
  const tabs = c.views.map((v) => `<button type="button" role="tab" class="lv-tab${v.id === view.id ? ' on' : ''}" aria-selected="${v.id === view.id}" data-lv="view" data-v="${esc(v.id)}">${esc(v.name)}${v.builtin ? '' : v.shared ? '<span class="chip acc">Everyone</span>' : '<span class="chip">Just me</span>'}</button>`).join('');
  let right = '';
  if (LV.naming) {
    const n = LV.naming;
    right = `<div class="lv-namer">
      <input class="in" id="lv-name" type="text" maxlength="80" placeholder="View name" aria-label="View name" value="${esc(n.name)}">
      ${admin && n.mode === 'new' ? `<label class="lv-sw"><input type="checkbox" data-lvc="newshared"${n.shared ? ' checked' : ''}>Share with everyone who sees ${esc(c.form.name)}</label>` : ''}
      <button class="btn ghost" type="button" data-lv="name-cancel">Cancel</button>
      <button class="btn primary" type="button" data-lv="name-save"${LV.busy ? ' disabled' : ''}>Save</button>
    </div>`;
  } else if (dirty) {
    right = `<div class="lv-dirty">
      <span class="lv-msg">Changed from “${esc(view.name)}”</span>
      <button class="btn ghost" type="button" data-lv="reset">Reset</button>
      ${canSaveView(view, me(), admin) ? `<button class="btn ph-hide" type="button" data-lv="save"${LV.busy ? ' disabled' : ''}>Save view${view.shared ? ' for everyone' : ''}</button>` : ''}
      <button class="btn primary ph-hide" type="button" data-lv="save-new">Save as new view</button>
      <button class="btn primary ph-only" type="button" data-lv="sheet" aria-haspopup="dialog">Save…</button>
    </div>`;
  } else {
    const items = [];
    if (!view.builtin && canSaveView(view, me(), admin)) items.push(`<button type="button" class="lv-opt" data-lv="rename">Rename</button>`);
    if (!view.builtin && admin) items.push(`<button type="button" class="lv-opt" data-lv="share">${view.shared ? 'Make it private' : 'Share with everyone'}</button>`);
    if (canDeleteView(view, me(), admin)) items.push(`<button type="button" class="lv-opt danger${LV.confirmView ? ' armed' : ''}" data-lv="view-del">${LV.confirmView ? 'Tap again to confirm' : view.builtin ? 'Go back to the form’s list columns' : 'Delete view'}</button>`);
    if (items.length) right = `<div class="lv-anchor lv-right"><button type="button" class="btn ghost" data-lv="pop" data-v="view" aria-expanded="${LV.pop === 'view'}" aria-label="View options">View options</button>${LV.pop === 'view' ? `<div class="lv-pop right">${items.join('')}</div>` : ''}</div>`;
  }
  const phone = `<div class="lv-phonebar"><select class="in" data-lvc="viewsel" aria-label="View">${c.views.map((v) => `<option value="${esc(v.id)}"${v.id === view.id ? ' selected' : ''}>${esc(v.name)}${v.builtin ? '' : v.shared ? ' · Everyone' : ' · Just me'}</option>`).join('')}</select>
    ${layoutSeg(LV.cfg, 'll-ph')}<button type="button" class="btn lv-more" data-lv="sheet" aria-haspopup="dialog" aria-expanded="${LV.sheet}" aria-label="List options: filter, columns, sort, row height${admin ? ', form settings' : ''}">${ICON_MORE}</button></div>`;
  return `<div class="lv-views">${phone}${newBtn}<div class="lv-tabs" role="tablist" aria-label="Saved views">${tabs}</div>${dirty || LV.naming ? right : `<span class="ph-hide">${right}</span>`}</div>`;
}

const ICON_MORE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';
const densitySeg = (cfg, cls = '') => `<div class="lv-seg ${cls}" role="group" aria-label="Row height">${[['cozy', 'Comfortable'], ['compact', 'Compact']].map(([d, n]) => `<button type="button" class="${cfg.density === d ? 'on' : ''}" aria-pressed="${cfg.density === d}" data-lv="density" data-v="${d}">${n}</button>`).join('')}</div>`;

/** Phones: the ⋯ sheet with everything that isn't needed on every visit. */
function sheetHTML(form, c, shown, cfg, filterable, all, view, admin, dirty = false) {
  const items = [];
  if (dirty && !LV.naming) {
    if (canSaveView(view, me(), admin)) items.push(`<button type="button" class="lv-opt" data-lv="save"${LV.busy ? ' disabled' : ''}>Save changes to “${esc(view.name)}”${view.shared ? ' for everyone' : ''}</button>`);
    items.push(`<button type="button" class="lv-opt" data-lv="save-new">Save as a new view</button>`);
  }
  if (!view.builtin && canSaveView(view, me(), admin)) items.push(`<button type="button" class="lv-opt" data-lv="rename">Rename this view</button>`);
  if (!view.builtin && admin) items.push(`<button type="button" class="lv-opt" data-lv="share">${view.shared ? 'Make this view private' : 'Share this view with everyone'}</button>`);
  if (canDeleteView(view, me(), admin)) items.push(`<button type="button" class="lv-opt danger${LV.confirmView ? ' armed' : ''}" data-lv="view-del">${LV.confirmView ? 'Tap again to confirm' : view.builtin ? 'Go back to the form’s list columns' : 'Delete this view'}</button>`);
  return `<div class="lv-sheetbg" data-lv="sheet-bg"><div class="lv-sheet" role="dialog" aria-modal="true" aria-labelledby="lv-sheet-h">
    <span class="lv-grab" aria-hidden="true"></span>
    <div class="lv-sheet-h"><b id="lv-sheet-h">List options</b><button type="button" class="ibtn" data-lv="sheet-close" aria-label="Close">✕</button></div>
    <div class="lv-sheet-row">${filterable.length ? filterTool(filterable, all, cfg) : ''}${columnsTool(c, shown)}</div>
    <div class="lv-sheet-sec"><span class="lv-sheet-l">Sort</span>${sortTool(c, shown, cfg)}</div>
    <div class="lv-sheet-sec"><span class="lv-sheet-l">Row height</span>${densitySeg(cfg)}</div>
    ${items.length ? `<div class="lv-sheet-sec"><span class="lv-sheet-l">This view</span>${items.join('')}</div>` : ''}
    ${admin ? `<div class="lv-sheet-sec lv-sheet-adm"><span class="lv-sheet-l">Administrators</span><button type="button" class="lv-opt" data-act="edit-form" data-id="${form.id}">Edit form</button>${importButton(form)}</div>` : ''}
  </div></div>`;
}

function filterTool(fields, recs, cfg) {
  const n = filterCount(cfg);
  const open = LV.pop === 'filter';
  let pop = '';
  if (open) {
    pop = `<div class="lv-pop"><h3>Filter</h3><p class="lv-hint">Show records with any ticked option. Every field you tick must match.</p>
      ${fields.map((f) => {
        const on = new Set(cfg.filters[f.id] || []);
        const count = (o) => recs.filter((r) => { const v = r.values?.[f.id]; return f.type === 'checkbox' ? (v ? 'Yes' : 'No') === o : f.type === 'multiselect' ? Array.isArray(v) && v.includes(o) : v === o; }).length;
        return `<div class="lv-sec">${esc(f.label)}</div>${optionsOf(f).map((o) => `<label class="lv-crow"><input type="checkbox" data-lvc="filter" data-f="${esc(f.id)}" value="${esc(o)}"${on.has(o) ? ' checked' : ''}><span>${esc(o)}</span><span class="lv-src">${count(o)}</span></label>`).join('')}`;
      }).join('')}
      <div class="lv-popfoot"><button class="btn ghost" type="button" data-lv="filter-clear">Clear</button><button class="btn" type="button" data-lv="pop-close">Done</button></div></div>`;
  }
  return `<div class="lv-anchor"><button class="btn${n ? ' on' : ''}" type="button" data-lv="pop" data-v="filter" aria-expanded="${open}">${ICON.filter}Filter${n ? `<span class="lv-n">${n}</span>` : ''}</button>${pop}</div>`;
}

function columnsTool(c, shown) {
  const open = LV.pop === 'cols';
  let pop = '';
  if (open) {
    const on = new Set(LV.cfg.cols);
    const groups = [];
    c.catalog.filter((x) => !on.has(x.key)).forEach((x) => { let g = groups.find((y) => y.name === x.group); if (!g) groups.push(g = { name: x.group, cols: [] }); g.cols.push(x); });
    const full = LV.cfg.cols.length >= MAX_COLS;
    pop = `<div class="lv-pop lv-colpop"><h3>Columns</h3><p class="lv-hint">Tick to show, arrows to reorder. The ${esc((c.titleField?.label || 'title').toLowerCase())} always comes first.</p>
      <div class="lv-crow lv-fixed"><input type="checkbox" checked disabled aria-label="${esc(c.titleField?.label || 'Title')} (always shown)"><span>${esc(c.titleField?.label || 'Title')}</span><span class="lv-src">Title</span></div>
      ${shown.map((x, i) => `<div class="lv-crow"><label><input type="checkbox" checked data-lvc="col" data-v="${esc(x.key)}"><span>${esc(x.label)}</span></label><span class="lv-src">${esc(x.src)}</span>
        <button type="button" class="lv-mv" data-lv="col-move" data-v="${esc(x.key)}" data-dir="-1" aria-label="Move ${esc(x.label)} left"${i === 0 ? ' disabled' : ''}>${ICON.up}</button>
        <button type="button" class="lv-mv" data-lv="col-move" data-v="${esc(x.key)}" data-dir="1" aria-label="Move ${esc(x.label)} right"${i === shown.length - 1 ? ' disabled' : ''}>${ICON.down}</button></div>`).join('')}
      ${groups.map((g) => `<div class="lv-sec">${esc(g.name)}</div>${g.cols.map((x) => `<div class="lv-crow"><label><input type="checkbox" data-lvc="col" data-v="${esc(x.key)}"${full ? ' disabled' : ''}><span>${esc(x.label)}</span></label></div>`).join('')}`).join('')}
      <div class="lv-popfoot"><button class="btn ghost" type="button" data-lv="cols-reset">Reset columns</button><button class="btn" type="button" data-lv="pop-close">Done</button></div></div>`;
  }
  return `<div class="lv-anchor"><button class="btn${open ? ' on' : ''}" type="button" data-lv="pop" data-v="cols" aria-expanded="${open}">${ICON.cols}Columns<span class="lv-n">${shown.length + 1}</span></button>${pop}</div>`;
}

function bulkBar(form, selRecs, editable, selHidden, settable) {
  const none = !editable.length;
  const skipped = selRecs.length - editable.length;
  let setPop = '';
  if (LV.pop === 'set' && !none) setPop = `<div class="lv-pop right lv-setpop">${setPopHTML(form, selRecs, editable, skipped, settable)}</div>`;
  return `<div class="lv-bulk" role="region" aria-label="Selected records">
    <b>${selRecs.length} selected</b>${selHidden ? `<span class="lv-note">${selHidden} hidden by filters</span>` : ''}${none ? '<span class="lv-note">You can’t change these</span>' : ''}
    <span class="lv-grow"></span>
    ${settable.length || wfOn(form) ? `<div class="lv-anchor"><button type="button" class="btn" data-lv="pop" data-v="set"${(none && !wfOn(form)) || LV.busy ? ' disabled' : ''}>Set field</button>${setPop}</div>` : ''}
    ${isAdmin(store.me) ? ownerAnchor(selRecs) : ''}
    ${H.parentsOf(form.id).some((pf) => canViewForm(store.me, pf.id)) ? `<button type="button" class="btn" data-lv="attach-to"${none || LV.busy ? ' disabled' : ''}>Attach to…</button>` : ''}
    <button type="button" class="btn" data-lv="export">Export CSV</button>
    <button type="button" class="btn lv-del" data-lv="del-ask"${none || LV.busy ? ' disabled' : ''}>${ICON.trash}Delete</button>
    <button type="button" class="btn" data-lv="sel-clear">Clear</button>
  </div>`;
}

/** Admins: give the ticked records to someone else (owner = whose "mine only" lists they show in) */
function ownerAnchor(selRecs) {
  const people = [...store.users].map((u) => ({ id: u.id, name: store.profiles[u.id]?.displayName || u.displayName || (u.email || '').split('@')[0] || 'Unnamed user' }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const pop = LV.pop === 'owner' ? `<div class="lv-pop right"><p class="lv-hint">Give ${selRecs.length} record${selRecs.length === 1 ? '' : 's'} to… They’ll show in that person’s “mine only” lists. Who created them stays the same.</p>${people.map((p) => `<button type="button" class="lv-opt" data-lv="owner" data-v="${esc(p.id)}">${esc(p.name)}</button>`).join('')}</div>` : '';
  return `<div class="lv-anchor"><button type="button" class="btn" data-lv="pop" data-v="owner"${LV.busy ? ' disabled' : ''}>Set owner</button>${pop}</div>`;
}

async function setOwnerOf(to) {
  const form = formNow(); if (!form) return;
  const recs = H.recordsOf(form.id).filter((r) => LV.sel.has(r.id));
  if (!recs.length) return;
  const name = store.profiles[to]?.displayName || 'them';
  LV.pop = null; LV.busy = true; repaint();
  try { const n = await setOwner(recs.map((r) => r.id), to); toast(`${n} record${n === 1 ? '' : 's'} given to ${name}`); }
  catch (e) { console.error('[formwright] set owner', e); toast('Couldn’t change the owner. Nothing was changed.'); }
  LV.busy = false; repaint();
}

/** Phones: a small chip beside search: tap to reverse; ▾ picks another field. */
function sortChip(c, shown, cfg) {
  const o = sortInfo(c, shown, cfg);
  return `<div class="lv-sortchip"><button type="button" class="lv-chipdir" data-lv="sortdir" aria-label="Sorted by ${esc(o.cur.label)}, ${esc(o.words)}. Tap to reverse."><b aria-hidden="true">${o.asc ? '↑' : '↓'}</b> ${esc(o.short)}</button>
    <label class="lv-chippick"><span aria-hidden="true">▾</span><select data-lvc="sortby" aria-label="Sort by">${o.opts.map((x) => `<option value="${esc(x.key)}"${x.key === o.cur.key ? ' selected' : ''}>${esc(x.label)}</option>`).join('')}</select></label></div>`;
}
function sortInfo(c, shown, cfg) {
  const opts = [{ key: 'title', label: c.titleField?.label || 'Title', field: c.titleField }].concat(shown.map((x) => ({ key: x.key, label: x.label, field: x.field, num: x.num })));
  ['sys:updated', 'sys:created'].forEach((k) => { if (!opts.some((o) => o.key === k) && c.byKey.has(k)) opts.push({ key: k, label: c.byKey.get(k).label, date: true }); });
  const cur = opts.find((o) => o.key === cfg.sort.key) || opts[0];
  const t = cur.field?.type || '';
  const date = cur.date || ['date', 'datetime', 'time'].includes(t) || /^sys:(created|updated)$/.test(cur.key);
  const num = !date && (cur.num || ['number', 'decimal', 'currency', 'percent', 'range', 'rating', 'autonumber', 'formula'].includes(t));
  const asc = cfg.sort.key === cur.key ? cfg.sort.dir === 'asc' : cur.key === 'title';
  const words = date ? (asc ? 'Oldest first' : 'Newest first') : num ? (asc ? 'Low to high' : 'High to low') : (asc ? 'A to Z' : 'Z to A');
  const short = cur.label.length > 12 ? cur.label.split(/\s+/).slice(-1)[0].slice(0, 12) : cur.label;
  return { opts, cur, asc, words, short };
}
/** The sheet's sort: field and order in words. */
function sortTool(c, shown, cfg) {
  const { opts, cur, asc, words } = sortInfo(c, shown, cfg);
  return `<div class="lv-sortm" role="group" aria-label="Sort">
    <label class="lv-sortsel"><span class="sr">Sort by</span><select class="in" data-lvc="sortby" aria-label="Sort by">${opts.map((o) => `<option value="${esc(o.key)}"${o.key === cur.key ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select></label>
    <button type="button" class="btn lv-sortdir" data-lv="sortdir" aria-label="Order: ${esc(words)}. Tap to reverse." title="Tap to reverse"><span aria-hidden="true">${asc ? '↑' : '↓'}</span> ${esc(words)}</button>
  </div>`;
}

function headCell(col, label, cfg) {
  const on = cfg.sort.key === col.key;
  const arr = on ? (cfg.sort.dir === 'asc' ? '▲' : '▼') : '';
  const sortName = on ? (cfg.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  return `<th aria-sort="${sortName}"${col.num ? ' class="num"' : ''}><button type="button" class="lv-hb${on ? ' on' : ''}" data-lv="sort" data-v="${esc(col.key)}">${esc(label)}<span class="lv-arr" aria-hidden="true">${arr}</span></button></th>`;
}

function cellHtml(cell) {
  if (cell.rich) return cell.rich;
  const t = cell.text;
  if (cell.field?.type === 'url' && t) return `<a href="${esc(/^https?:/i.test(t) ? t : 'https://' + t)}" target="_blank" rel="noopener" data-stop>${esc(t)}</a>`;
  return esc(t);
}

function table(form, c, shown, rows, allOn, someOn, cfg) {
  const titleLabel = c.titleField?.label || 'Title';
  const totals = shown.map((col, i) => columnTotal(col, rows, i));
  const showTotals = rows.length > 1 && totals.some((t) => t != null);
  const fmtTotal = (col, t) => (t == null ? '' : col.field ? H.fmt(col.field, t) : t.toLocaleString());
  return `<div class="panel lv-box"><div class="tblwrap"><table class="tbl lv-tbl${cfg.density === 'compact' ? ' compact' : ''}">
    <thead><tr><th class="lv-ck"><label class="lv-cklab"><input type="checkbox" data-lvc="all" aria-label="Select all shown"${allOn ? ' checked' : ''}${someOn ? ' data-mixed="1"' : ''}></label></th>${headCell({ key: 'title' }, titleLabel, cfg)}${shown.map((col) => headCell(col, col.label, cfg)).join('')}</tr></thead>
    <tbody>${rows.map((r) => {
      const sel = LV.sel.has(r.rec.id);
      return `<tr data-act="open-record" data-id="${r.rec.id}"${sel ? ' class="sel"' : ''}><td class="lv-ck" data-stop><label class="lv-cklab"><input type="checkbox" data-lvc="sel" data-v="${r.rec.id}" aria-label="Select ${esc(r.title)}"${sel ? ' checked' : ''}></label></td><td class="title" title="${esc(r.title)}">${esc(r.title)}</td>${r.cells.map((cell) => `<td${cell.num ? ' class="num"' : cell.rich ? ' class="lv-rich"' : cell.long ? ` class="lv-long" title="${esc(cell.text)}"` : cell.text && cell.text.length > 30 ? ` title="${esc(cell.text)}"` : ''}>${cellHtml(cell)}</td>`).join('')}</tr>`;
    }).join('')}</tbody>
    ${showTotals ? `<tfoot><tr><td></td><td>Total</td>${shown.map((col, i) => `<td class="num">${esc(fmtTotal(col, totals[i]))}</td>`).join('')}</tr></tfoot>` : ''}
  </table></div></div>`;
}

function cards(form, shown, rows, allOn, count = '', density = 'cozy') {
  const compact = density === 'compact';
  // Compact on a phone: two tight lines. Line 1 is the main field with the first number column on the
  // right (always the same column, so the numbers line up; blank when that record has none).
  // Line 2 is up to two more values, tidied to one line.
  const numAt = shown.findIndex((col) => col.sum);
  const numCol = shown[numAt];
  const money = numCol && (numCol.field?.type === 'currency' || numCol.field?.format === 'currency');
  const tidy = (t) => String(t || '').replace(/\s+/g, ' ').replace(/^(?:\s|[•·*]|[-–—](?=\s))+/, '').trim();
  const tight = (r) => {
    const vals = shown.map((col, i) => ({ i, text: tidy(r.cells[i].text) })).filter((x) => x.text);
    const right = numAt >= 0 ? vals.find((x) => x.i === numAt) : null;
    const rest = vals.filter((x) => x.i !== numAt).slice(0, 2).map((x) => x.text);
    const cv = right ? `<span class="lv-cv">${esc(right.text)}${money ? '' : ` <small>${esc(numCol.label)}</small>`}</span>` : '';
    return `<span class="lv-c1"><b>${esc(r.title)}</b>${cv}</span>${rest.length ? `<span class="lv-c2">${esc(rest.join(' · '))}</span>` : ''}`;
  };
  return `<div class="lv-cards${compact ? ' compact' : ''}">
    <div class="lv-allrow"><label class="lv-sw lv-allcard"><input type="checkbox" data-lvc="all"${allOn ? ' checked' : ''}>Select all</label>${count ? `<span class="lv-ccount">${esc(count)}</span>` : ''}</div>
    ${rows.map((r) => {
      const sel = LV.sel.has(r.rec.id);
      const meta = shown.map((col, i) => (r.cells[i].rich ? `<span class="lv-richm">${esc(col.label)}:${r.cells[i].rich}</span>` : r.cells[i].text ? `<span${r.cells[i].long ? ' class="lv-long"' : ''}>${esc(col.label)}: ${esc(r.cells[i].text)}</span>` : '')).filter(Boolean).slice(0, 4).join('');
      return `<div class="lv-card${sel ? ' sel' : ''}"><label class="lv-cklab"><input type="checkbox" data-lvc="sel" data-v="${r.rec.id}" aria-label="Select ${esc(r.title)}"${sel ? ' checked' : ''}></label><button class="card" data-act="open-record" data-id="${r.rec.id}">${compact ? tight(r) : `<b>${esc(r.title)}</b>${meta ? `<div class="meta">${meta}</div>` : ''}`}</button></div>`;
    }).join('')}
  </div>`;
}

function confirmDialog(form, selRecs, editable) {
  const skipped = selRecs.length - editable.length;
  const ids = new Set(editable.map((r) => r.id));
  const kids = store.records.filter((r) => r.parentId && ids.has(r.parentId)).length;
  const names = editable.slice(0, 5).map((r) => `<li>${esc(H.recTitle(r, form))}</li>`).join('');
  return `<div class="lv-scrim" data-lv="del-cancel"><div class="lv-dlg" role="dialog" aria-modal="true" aria-labelledby="lv-dlg-h">
    <h2 id="lv-dlg-h">Delete ${plural(editable.length, form)}?</h2>
    <ul>${names}</ul>${editable.length > 5 ? `<p class="lv-hint">and ${editable.length - 5} more</p>` : ''}
    <div class="lv-facts">
      ${skipped ? `<p class="lv-fact warn">${plural(skipped, form)} you can’t edit will be skipped.</p>` : ''}
      ${kids ? `<p class="lv-fact">${kids} child record${kids === 1 ? ' belongs' : 's belong'} to these. ${kids === 1 ? 'It stays' : 'They stay'}, without a parent.</p>` : ''}
      <p class="lv-fact">Cadence tasks linked to these keep their link, marked as removed.</p>
      <p class="lv-fact">You’ll have a few seconds to undo.</p>
    </div>
    <div class="lv-dlgacts"><button class="btn" type="button" data-lv="del-cancel">Cancel</button><button class="btn lv-delfill" type="button" data-lv="del-go" id="lv-del-go">Delete ${plural(editable.length, form)}</button></div>
  </div></div>`;
}

const ICON = {
  filter: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5h18l-7 8v6l-4 2v-8z"/></svg>',
  cols: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/></svg>',
  up: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>',
  down: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
  trash: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
};

/** After the list is drawn: mixed state on select-all, focus for the name box and dialog. */
export function afterRecords() {
  afterLayout();
  document.querySelectorAll('#lv input[data-mixed]').forEach((i) => { i.indeterminate = true; });
  if (LV.naming && LV.naming.focus) { LV.naming.focus = false; const i = $('#lv-name'); if (i) { i.focus(); i.select(); } }
  if (LV.confirm && LV.focusDel) { LV.focusDel = false; $('#lv-del-go')?.focus(); }
}

/* ---------- actions ---------- */

const repaint = () => H.renderMain();
function formNow() { return LV.formId ? H.formById(LV.formId) : null; }

function setCfg(patch) { LV.cfg = { ...LV.cfg, ...patch }; repaint(); }

async function saveCurrent() {
  const form = formNow(); if (!form) return;
  const c = ctxFor(form);
  const v = c.views.find((x) => x.id === LV.viewId); if (!v) return;
  const now = Date.now();
  const data = v.builtin
    ? viewDoc({ formId: form.id, name: 'All', ownerId: v.doc?.ownerId || me(), shared: true, cfg: LV.cfg, createdAt: v.doc?.createdAt, now })
    : viewDoc({ formId: form.id, name: v.name, ownerId: v.ownerId, shared: v.shared, cfg: LV.cfg, createdAt: v.doc?.createdAt, now });
  LV.busy = true; repaint();
  try { await saveListView(v.id, data); LV.base = structuredClone(LV.cfg); toast(v.shared ? `Saved “${v.name}” for everyone` : `Saved “${v.name}”`); }
  catch (e) { console.error('[formwright] view', e); toast('Couldn’t save the view. Try again.'); }
  LV.busy = false; repaint();
}

async function saveNamed() {
  const form = formNow(); const n = LV.naming; if (!form || !n) return;
  const name = (n.name || '').trim();
  if (!name) { toast('Give the view a name.'); $('#lv-name')?.focus(); return; }
  const now = Date.now(), admin = isAdmin(store.me);
  LV.busy = true; repaint();
  try {
    if (n.mode === 'rename') {
      const v = ctxFor(form).views.find((x) => x.id === LV.viewId);
      if (v && !v.builtin) await saveListView(v.id, viewDoc({ formId: form.id, name, ownerId: v.ownerId, shared: v.shared, cfg: v.cfg, createdAt: v.doc?.createdAt, now }));
      toast('View renamed');
    } else {
      const id = uid('lv');
      LV.awaitId = id; LV.viewId = id;
      await saveListView(id, viewDoc({ formId: form.id, name, ownerId: me(), shared: admin && n.shared, cfg: LV.cfg, now }));
      LV.base = structuredClone(LV.cfg);
      remember(form.id, id);
      toast(`Saved view “${name}”`);
    }
    LV.naming = null;
  } catch (e) {
    console.error('[formwright] view', e);
    if (LV.awaitId === LV.viewId) { LV.awaitId = null; LV.viewId = defaultViewId(form.id); }
    toast('Couldn’t save the view. Try again.');
  }
  LV.busy = false; repaint();
}

async function toggleShare() {
  const form = formNow(); if (!form) return;
  const v = ctxFor(form).views.find((x) => x.id === LV.viewId); if (!v || v.builtin) return;
  LV.pop = null;
  try { await saveListView(v.id, viewDoc({ formId: form.id, name: v.name, ownerId: v.ownerId, shared: !v.shared, cfg: v.cfg, createdAt: v.doc?.createdAt, now: Date.now() })); toast(v.shared ? `“${v.name}” is now private to its owner` : `“${v.name}” is shared with everyone`); }
  catch (e) { toast('Couldn’t change sharing. Try again.'); }
  repaint();
}

async function removeView() {
  const form = formNow(); if (!form) return;
  const v = ctxFor(form).views.find((x) => x.id === LV.viewId); if (!v) return;
  if (!LV.confirmView) { LV.confirmView = true; repaint(); return; }
  LV.confirmView = false; LV.pop = null;
  try {
    await deleteListView(v.id);
    toast(v.builtin ? 'Back to the form’s list columns' : `Deleted view “${v.name}”`);
    if (!v.builtin) { LV.viewId = defaultViewId(form.id); remember(form.id, LV.viewId); }
    LV.base = null; LV.formId = v.builtin ? LV.formId : null; // reload the chosen view's columns
    if (v.builtin) { const nv = ctxFor(form).views[0]; LV.cfg = structuredClone(nv.cfg); LV.base = structuredClone(nv.cfg); }
  } catch (e) { toast('Couldn’t delete the view. Try again.'); }
  repaint();
}

function pickView(id) {
  const form = formNow(); if (!form) return;
  const v = ctxFor(form).views.find((x) => x.id === id); if (!v) return;
  Object.assign(LV, { viewId: v.id, cfg: structuredClone(v.cfg), base: structuredClone(v.cfg), pop: null, naming: null, confirmView: false });
  remember(form.id, v.id);
  repaint();
}

function selectedEditable() {
  const form = formNow(); if (!form) return { form: null, recs: [] };
  const hidden = pending && pending.formId === form.id ? pending.ids : null;
  const recs = H.recordsOf(form.id).filter((r) => LV.sel.has(r.id) && (!hidden || !hidden.has(r.id)));
  return { form, all: recs, recs: recs.filter((r) => canEditRecord(store.me, r)) };
}

/* ---------- Set field on the selected records ----------
   Any field people can edit (not read only, lookups, calculations or auto numbers): a value for
   all of them, Clear, Add or Remove one option of a multiple choice; for workflow forms, Move to
   stage and (admins) Person responsible. Only the field itself is written on each record. The
   form's rules are checked first: when they'd empty other fields it asks, and that change goes in
   Import history (Undo, administrators). The audit trail has every change. */
const blankV = (v) => v == null || v === '' || (Array.isArray(v) && !v.length);
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function setPopHTML(form, selRecs, editable, skipped, settable) {
  const applies = `<p class="lv-hint">Applies to ${plural(editable.length, form)}${skipped ? ` (${skipped} you can’t edit ${skipped === 1 ? 'is' : 'are'} skipped)` : ''}.</p>`;
  const k = LV.setF;
  if (!k) {
    const wf = wfOn(form);
    return applies + (settable.length ? `<div class="lv-sec">Fields</div>${settable.map((f) => `<button type="button" class="lv-opt" data-lv="set-pick" data-f="${esc(f.id)}">${esc(f.label || 'Untitled')}</button>`).join('')}` : '')
      + (wf ? `<div class="lv-sec">Workflow</div><button type="button" class="lv-opt" data-lv="set-pick" data-f="_stage">Move to stage…</button>${isAdmin(store.me) ? '<button type="button" class="lv-opt" data-lv="set-pick" data-f="_assignee">Person responsible…</button>' : ''}` : '');
  }
  const back = `<button type="button" class="lv-opt lv-back" data-lv="set-pick" data-f="">‹ All fields</button>`;
  if (k === '_stage') {
    const opts = stagesOf(form).map((st) => { const n = stageMovable(form, selRecs, st).ok.length; return `<button type="button" class="lv-opt" data-lv="stage-ask" data-v="${esc(st.id)}"${n ? '' : ' disabled'}>${esc(st.name)} <span class="lv-n">${n ? n + ' can move' : 'none can move'}</span></button>`; }).join('');
    return back + `<div class="lv-sec">Move to stage</div><p class="lv-hint">${isAdmin(store.me) ? 'As an administrator you can move them to any stage.' : 'Only records you’re responsible for, along the form’s moves.'}</p>${opts}`;
  }
  if (k === '_assignee') {
    const people = [...store.users].map((u) => ({ id: u.id, name: store.profiles[u.id]?.displayName || u.displayName || (u.email || '').split('@')[0] || 'Unnamed user' })).sort((a, b) => a.name.localeCompare(b.name));
    const n = selRecs.filter((r) => r.stage).length;
    return back + `<div class="lv-sec">Person responsible</div><p class="lv-hint">For the ${plural(n, form)} at a stage; it’s noted in each one’s stage history.</p>${people.map((p) => `<button type="button" class="lv-opt" data-lv="set-assignee" data-v="${esc(p.id)}"${n ? '' : ' disabled'}>${esc(p.name)}</button>`).join('')}`;
  }
  const f = (form.fields || []).find((x) => x.id === k); if (!f) return back;
  const clear = f.required ? '' : `<button type="button" class="lv-opt lv-clear" data-lv="set-clear" data-f="${esc(f.id)}">Clear ${esc(f.label)}</button>`;
  const head = back + `<div class="lv-sec">${esc(f.label)}</div>`;
  if (f.type === 'select' || f.type === 'radio') return head + optionsOf(f).map((o) => `<button type="button" class="lv-opt" data-lv="set" data-f="${esc(f.id)}" data-v="${esc(o)}">${esc(o)}</button>`).join('') + clear;
  if (f.type === 'checkbox') return head + ['Yes', 'No'].map((o) => `<button type="button" class="lv-opt" data-lv="set" data-f="${esc(f.id)}" data-v="${o}">${o}</button>`).join('');
  if (f.type === 'multiselect') return head + `<p class="lv-hint">Adds or removes one choice and keeps the others each record has.</p>` + optionsOf(f).map((o) => `<div class="lv-mrow"><span>${esc(o)}</span><button type="button" class="btn sm" data-lv="set-multi" data-op="add" data-f="${esc(f.id)}" data-v="${esc(o)}">Add</button><button type="button" class="btn sm ghost" data-lv="set-multi" data-op="remove" data-f="${esc(f.id)}" data-v="${esc(o)}">Remove</button></div>`).join('') + clear;
  let ctl;
  const mm = (f.min != null && f.min !== '' ? ` min="${f.min}"` : '') + (f.max != null && f.max !== '' && f.type !== 'rating' ? ` max="${f.max}"` : '');
  switch (f.type) {
    case 'relation': { const recs = (H.recordsOf(f.relForm) || []).map((r) => ({ r, t: H.recTitle(r, H.formById(f.relForm)) })).sort((a, b) => a.t.localeCompare(b.t)).slice(0, 1000); ctl = `<select class="in" id="lv-setval" aria-label="${esc(f.label)}"><option value="">Choose…</option>${recs.map(({ r, t }) => `<option value="${esc(r.id)}">${esc(t)}</option>`).join('')}</select>`; break; }
    case 'date': ctl = `<div class="lv-setrow"><input class="in" type="date" id="lv-setval" aria-label="${esc(f.label)}"><button type="button" class="btn sm" data-lv="set-today">Today</button></div>`; break;
    case 'time': ctl = `<input class="in" type="time" id="lv-setval" aria-label="${esc(f.label)}">`; break;
    case 'datetime': ctl = `<input class="in" type="datetime-local" id="lv-setval" aria-label="${esc(f.label)}">`; break;
    case 'number': case 'decimal': case 'currency': case 'percent': case 'range': ctl = `<input class="in" type="number" step="any" inputmode="decimal" id="lv-setval"${mm} aria-label="${esc(f.label)}">`; break;
    case 'rating': { const mx = f.max || 5; ctl = `<select class="in" id="lv-setval" aria-label="${esc(f.label)}">${Array.from({ length: mx }, (_, i) => `<option value="${i + 1}">${'★'.repeat(i + 1)}</option>`).join('')}</select>`; break; }
    case 'color': ctl = `<input type="color" id="lv-setval" value="#3346c8" aria-label="${esc(f.label)}">`; break;
    case 'email': ctl = `<input class="in" type="email" inputmode="email" id="lv-setval" aria-label="${esc(f.label)}">`; break;
    case 'url': ctl = `<input class="in" type="url" inputmode="url" id="lv-setval" placeholder="https://" aria-label="${esc(f.label)}">`; break;
    case 'phone': ctl = `<input class="in" type="tel" inputmode="tel" id="lv-setval" aria-label="${esc(f.label)}">`; break;
    default: ctl = `<input class="in" type="text" id="lv-setval" aria-label="${esc(f.label)}">`;
  }
  return head + `<div class="lv-setbox">${ctl}<button type="button" class="btn primary sm" data-lv="set-apply" data-f="${esc(f.id)}">Set</button></div>` + clear;
}

/** Set (or change) one field on each selected record; setFor(rec) → the value, or undefined to leave it. */
async function bulkSet(form, recs, setFor, what, hist = what) {
  const rows = recs.map((r) => ({ r, set: setFor(r) })).filter((x) => x.set);
  LV.pop = null; LV.setF = null;
  if (!rows.length) { toast('Nothing to change: they already have that.'); repaint(); return; }
  const im = form.rules?.length && H.ruleImpact ? H.ruleImpact(form, rows.map((x) => ({ ...x.r, values: { ...(x.r.values || {}), ...x.set } }))) : { rows: [] };
  if (im.rows.length) { LV.setAsk = { form, recs: rows.map((x) => x.r), sets: new Map(rows.map((x) => [x.r.id, x.set])), what, many: true, hist: ('Set field: ' + hist).slice(0, 80), im, busy: false }; repaint(); setTimeout(() => $('#lv-set-go')?.focus(), 0); return; }
  LV.busy = true; repaint();
  // only the field itself is written on each record, so someone else's edit to another field (or one made offline) is never overwritten
  try { await setValuesEach(rows.map((x) => [x.r, x.set])); toast(`${what} on ${plural(rows.length, form)}`); }
  catch (e) { console.error('[formwright] set field', e); toast(e?.code === 'permission-denied' ? 'You can’t change some of those. Nothing was changed.' : 'Couldn’t change those records. Check your connection and try again.'); }
  LV.busy = false; repaint();
}
async function setField(fid, opt) {
  const { form, recs } = selectedEditable(); if (!form || !recs.length) return;
  const f = (form.fields || []).find((x) => x.id === fid); if (!f) return;
  const value = f.type === 'checkbox' ? opt === 'Yes' : opt;
  await bulkSet(form, recs, (r) => (JSON.stringify(r.values?.[fid] ?? null) === JSON.stringify(value) ? undefined : { [fid]: value }), `Set ${f.label} to ${opt}`, `${f.label} → ${opt}`);
}
async function setTyped(fid) {
  const { form, recs } = selectedEditable(); if (!form || !recs.length) return;
  const f = (form.fields || []).find((x) => x.id === fid); if (!f) return;
  const el = document.getElementById('lv-setval');
  const p = parseBulk(f, el?.value); if (p.error) { toast(p.error); el?.focus(); return; }
  const shown = f.type === 'relation' ? (() => { const r = H.recById(p.value); return r ? H.recTitle(r, H.formById(r.formId)) : 'a record'; })() : f.type === 'rating' ? '★'.repeat(p.value) : String(p.value);
  await bulkSet(form, recs, (r) => (JSON.stringify(r.values?.[fid] ?? null) === JSON.stringify(p.value) ? undefined : { [fid]: p.value }), `Set ${f.label} to ${shown}`, `${f.label} → ${shown}`);
}
async function clearField(fid) {
  const { form, recs } = selectedEditable(); if (!form || !recs.length) return;
  const f = (form.fields || []).find((x) => x.id === fid); if (!f) return;
  await bulkSet(form, recs, (r) => (blankV(r.values?.[fid]) ? undefined : { [fid]: f.type === 'multiselect' ? [] : null }), `Cleared ${f.label}`, `${f.label} cleared`);
}
async function setMulti(fid, opt, op) {
  const { form, recs } = selectedEditable(); if (!form || !recs.length) return;
  const f = (form.fields || []).find((x) => x.id === fid); if (!f) return;
  await bulkSet(form, recs, (r) => { const cur = Array.isArray(r.values?.[fid]) ? r.values[fid] : []; const next = multiWith(cur, opt, op); return next.length === cur.length ? undefined : { [fid]: next }; }, `${op === 'add' ? 'Added' : 'Removed'} ${opt} ${op === 'add' ? 'to' : 'from'} ${f.label}`, `${f.label} ${op === 'add' ? '+' : '−'} ${opt}`);
}

/** Which selected records can move to a stage, and why the others can't: { ok, skip: { why: n } }. */
function stageMovable(form, recs, st) {
  const admin = isAdmin(store.me), ok = [], skip = {};
  const no = (why) => { skip[why] = (skip[why] || 0) + 1; };
  recs.forEach((r) => {
    if (r.stage === st.id) return no('already there');
    if (!admin) {
      if (!canWork(r, store.me)) return no('you’re not responsible for');
      const m = movesOf(form, r.stage).find((x) => x.to === st.id);
      if (!m) return no('can’t move there from their stage');
      if (stageIndex(form, st.id) > stageIndex(form, r.stage) && missingToMove(form, r.stage, r.values || {}, blankV).length) return no('need fields filled in first');
      ok.push({ r, label: m.label || 'Moved', comment: !!m.comment }); return;
    }
    ok.push({ r, label: 'Moved by an administrator', comment: false });
  });
  return { ok, skip };
}
function stageAskDialog(form) {
  const a = LV.stageAsk, st = stageById(form, a.to); if (!st) return '';
  const m = stageMovable(form, a.recs, st), need = m.ok.some((x) => x.comment);
  const skips = Object.entries(m.skip).map(([why, n]) => `${n} ${why}`).join(', ');
  return `<div class="lv-scrim" data-lv="stage-cancel"><div class="lv-dlg" role="dialog" aria-modal="true" aria-labelledby="lv-st-h">
    <h2 id="lv-st-h">Move ${plural(m.ok.length, form)} to ${esc(st.name)}?</h2>
    ${skips ? `<p>Skipped: ${esc(skips)}.</p>` : ''}
    <p class="help">Each one goes to whoever the stage says, and the move is in its stage history.</p>
    <label class="prop full"><span>Comment${need ? '' : ' (optional)'}</span><textarea class="in" id="lv-st-comment" rows="2" maxlength="2000" placeholder="${need ? 'This move needs a comment' : 'Why, for the stage history'}"></textarea></label>
    <div class="lv-dlgacts"><button class="btn" type="button" data-lv="stage-cancel"${a.busy ? ' disabled' : ''}>Cancel</button><button class="btn primary" type="button" data-lv="stage-go" id="lv-st-go"${a.busy || !m.ok.length ? ' disabled' : ''}>${a.busy ? 'Moving…' : `Move ${m.ok.length}`}</button></div>
  </div></div>`;
}
async function stageGo() {
  const a = LV.stageAsk, form = formNow(); if (!a || a.busy || !form) return;
  const st = stageById(form, a.to); if (!st) return;
  const m = stageMovable(form, a.recs, st);
  const comment = String(document.getElementById('lv-st-comment')?.value || '').trim();
  if (m.ok.some((x) => x.comment) && !comment) { toast('This move needs a comment.'); document.getElementById('lv-st-comment')?.focus(); return; }
  a.busy = true; repaint();
  let done = 0, failed = 0;
  for (const { r, label } of m.ok) {
    const next = assigneeFor(st, r, store.user?.uid);
    try {
      await moveStage(r.id, { stage: st.id, assignee: next.assignee || null, assigneeGroup: next.assigneeGroup || null, assigneeRole: next.assigneeRole || null, stageAt: Date.now() },
        { from: r.stage || null, fromName: r.stage ? stageName(form, r) : null, to: st.id, toName: st.name, label: String(label).slice(0, 80), comment: comment.slice(0, 2000), assignee: next.assignee || null, assigneeGroup: next.assigneeGroup || null, assigneeRole: next.assigneeRole || null });
      done++;
    } catch (e) { console.error('[formwright] bulk move', e); failed++; }
  }
  LV.stageAsk = null; LV.busy = false; repaint();
  toast(`Moved ${plural(done, form)} to ${st.name}${failed ? `. ${failed} couldn’t be moved.` : ''}`);
}
async function setAssignee(uidTo) {
  const form = formNow(); if (!form || !isAdmin(store.me)) return;
  const recs = H.recordsOf(form.id).filter((r) => LV.sel.has(r.id) && r.stage && r.assignee !== uidTo);
  LV.pop = null; LV.setF = null;
  if (!recs.length) { toast('Nothing to change.'); repaint(); return; }
  const name = store.profiles[uidTo]?.displayName || 'them';
  LV.busy = true; repaint();
  let done = 0;
  for (const r of recs) {
    try { await moveStage(r.id, { assignee: uidTo, assigneeGroup: null, assigneeRole: null }, { from: r.stage, fromName: stageName(form, r), to: r.stage, toName: stageName(form, r), label: 'Person responsible changed', comment: '', assignee: uidTo, assigneeGroup: null, assigneeRole: null }); done++; }
    catch (e) { console.error('[formwright] bulk assignee', e); }
  }
  LV.busy = false; repaint();
  toast(`${name} is now responsible for ${plural(done, form)}${done < recs.length ? `. ${recs.length - done} couldn’t be changed.` : ''}`);
}

/**
 * Change fields on records (Set field, a Board card, a Timeline bar). The form's rules first:
 * when the change would hide or clear other fields, ask, then do both together.
 * set: { fieldId: value }; what: "Set Stage to Done", said in the question and the message.
 */
export async function applySet(form, recs, set, what, many = false, hist = '') {
  const im = form.rules?.length && H.ruleImpact ? H.ruleImpact(form, recs.map((r) => ({ ...r, values: { ...(r.values || {}), ...set } }))) : { rows: [] };
  if (im.rows.length) { LV.setAsk = { form, recs, set, what, many, hist: hist || what, im, busy: false }; repaint(); setTimeout(() => $('#lv-set-go')?.focus(), 0); return; }
  LV.busy = true; repaint();
  try {
    if (Object.keys(set).length === 1) { const [k, v] = Object.entries(set)[0]; await setRecordsValue(recs, k, v); }
    else await setRecordsValues(recs, set);
    toast(many ? `${what} on ${plural(recs.length, form)}` : what);
  } catch (e) { console.error('[formwright] set field', e); toast(e?.code === 'permission-denied' ? 'You can’t change that one.' : 'Couldn’t change that. Nothing was changed.'); }
  LV.busy = false; repaint();
}

/** Set field when the form's rules would empty other fields: say which, then do both together. */
function setAskDialog() {
  const a = LV.setAsk, form = a.form, labels = new Map((form.fields || []).map((x) => [x.id, x.label]));
  const n = [...a.im.perField.values()].reduce((x, y) => x + y, 0);
  return `<div class="lv-scrim" data-lv="set-cancel"><div class="lv-dlg" role="dialog" aria-modal="true" aria-labelledby="lv-set-h">
    <h2 id="lv-set-h">${esc(a.what)}${a.many ? ` on ${plural(a.recs.length, form)}` : ''}?</h2>
    <p>The form’s rules then hide or clear these, so ${n === 1 ? 'one value is' : `${n} values are`} emptied on ${plural(a.im.rows.length, form)}:</p>
    <ul>${[...a.im.perField].map(([fid, k]) => `<li><b>${esc(labels.get(fid) || 'Field')}</b>: ${k}</li>`).join('')}</ul>
    <div class="lv-facts"><p class="lv-fact">${isAdmin(store.me) ? 'It’s listed in Import history, where you can undo it for 7 days. ' : ''}Every change is in the audit trail.</p></div>
    <div class="lv-dlgacts"><button class="btn" type="button" data-lv="set-cancel"${a.busy ? ' disabled' : ''}>Cancel</button><button class="btn primary" type="button" data-lv="set-go" id="lv-set-go"${a.busy ? ' disabled' : ''}>${a.busy ? 'Saving…' : `Set and empty ${n}`}</button></div>
  </div></div>`;
}
async function setAskGo() {
  const a = LV.setAsk; if (!a || a.busy) return;
  a.busy = true; repaint();
  const clear = new Map(a.im.rows.map((r) => [r.id, r.clear]));
  const rows = a.recs.map((r) => ({ id: r.id, set: { ...(a.sets ? a.sets.get(r.id) : a.set) }, clear: clear.get(r.id) || [] }));
  try { await H.applyRuleChange(a.form, rows, a.hist || a.what); toast(a.many ? `${a.what} on ${plural(a.recs.length, a.form)}` : a.what); LV.setAsk = null; }
  catch (e) { console.error('[formwright] bulk set', e); a.busy = false; toast('Couldn’t change those records. Check your connection and try again.'); }
  repaint();
}

/** Attach the ticked records to one parent record (moving any that are on another). */
function attachTo() {
  const { form, all, recs } = selectedEditable(); if (!form || !recs.length) return;
  const parentForms = H.parentsOf(form.id).filter((pf) => canViewForm(store.me, pf.id));
  if (!parentForms.length) return;
  LV.pop = null;
  openPickParent({
    childForm: form, recs, skipped: all.length - recs.length, parentForms,
    onPick: async (parent, pf) => {
      const rel = (pf.children || []).find((c) => c.formId === form.id);
      const changes = recs.filter((r) => r.parentId !== parent.id).map((r) => H.withFormulas(form, r, attachChange(r, parent, pf, form, !!rel?.copy)));
      LV.busy = true;
      try { await attachRecords(changes); }
      catch (e) { console.error('[formwright] attach', e); LV.busy = false; toast(e?.code === 'permission-denied' ? 'You don’t have permission to change one of those. Nothing was attached.' : 'Attaching failed. Nothing was changed.'); return false; }
      LV.busy = false;
      changes.forEach((c) => LV.sel.delete(c.id));
      toast(`Attached ${plural(changes.length, form)} to ${H.recTitle(parent, pf)}`);
      repaint();
    },
  });
}

function exportCsv() {
  const form = formNow(); if (!form) return;
  const c = ctxFor(form);
  const shown = LV.cfg.cols.map((k) => c.byKey.get(k)).filter(Boolean);
  const h = cellHelpers(form);
  const recs = H.recordsOf(form.id).filter((r) => LV.sel.has(r.id));
  let rows = recs.map((rec) => ({ rec, title: H.recTitle(rec, form), cells: shown.map((col) => cellOf(col.key, rec, h)) }));
  const sk = LV.cfg.sort.key, si = shown.findIndex((x) => x.key === sk);
  rows.forEach((r) => { r.sortVal = sk === 'title' ? cellOf('title', r.rec, h).sort : si >= 0 ? r.cells[si].sort : cellOf(sk, r.rec, h).sort; });
  rows = sortRows(rows, LV.cfg.sort.dir);
  const csv = toCsv([c.titleField?.label || 'Title', ...shown.map((x) => x.label)], rows.map((r) => [r.title, ...r.cells.map((x) => x.text)]));
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${(form.name || 'records').replace(/[\\/:*?"<>|]+/g, ' ').trim()} ${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast(`Exported ${plural(rows.length, form)}`);
}

/* Delete waits out a short undo window, then goes to the database. Closing the app
   inside that window cancels it, so nothing is lost by accident. */
async function commitPending() {
  const p = pending; if (!p) return;
  clearTimeout(p.timer); pending = null; undoBar(null);
  try { await deleteRecords([...p.ids]); }
  catch (e) { console.error('[formwright] bulk delete', e); toast('Couldn’t delete those records. They’re back in the list.'); }
  repaint();
}
async function startDelete() {
  const { form, recs } = selectedEditable(); if (!form || !recs.length) return;
  if (pending) await commitPending();
  const ids = new Set(recs.map((r) => r.id));
  ids.forEach((id) => LV.sel.delete(id));
  pending = { ids, formId: form.id, label: 'Deleted ' + plural(ids.size, form), timer: setTimeout(commitPending, UNDO_MS) };
  LV.confirm = false;
  undoBar(pending.label);
  repaint();
}
function undoDelete() {
  if (!pending) return;
  clearTimeout(pending.timer);
  const n = pending.ids.size; pending = null; undoBar(null);
  toast(`Kept ${n} record${n === 1 ? '' : 's'}`);
  repaint();
}
function undoBar(label) {
  let el = document.getElementById('lv-undo');
  if (!label) { el?.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'lv-undo'; el.className = 'lv-undo'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.innerHTML = `<span>${esc(label)}</span><button type="button" data-lv="undo">Undo</button>`;
  el.querySelector('button').focus({ preventScroll: true });
}
window.addEventListener('pagehide', () => { if (pending) { clearTimeout(pending.timer); pending = null; } });

/** Forget per-form state on sign-out. */
/** Open a form's list with a saved view (a dashboard shortcut): remembered as the one to show next. */
export function useView(formId, viewId) {
  remember(formId, viewId);
  LV.force = { formId, viewId };
  if (LV.formId === formId) LV.formId = null; // pick it up on the next draw
}

export function resetLists() {
  if (pending) { clearTimeout(pending.timer); pending = null; undoBar(null); }
  Object.assign(LV, { formId: null, viewId: null, cfg: null, base: null, pop: null, sel: new Set(), naming: null, confirm: false, confirmView: false, awaitId: null, busy: false, sheet: false });
}

/* ---------- events ---------- */

document.addEventListener('click', async (e) => {
  if (document.getElementById('lv') && llClose(e.target) && !e.target.closest('[data-ll]')) { repaint(); return; }
  const ll = e.target.closest('#lv [data-ll]');
  if (ll && await llClick(ll.dataset.ll, ll, e)) return;
  const el = e.target.closest('[data-lv]');
  const inLv = e.target.closest('#lv') || e.target.closest('#lv-undo');
  // A click anywhere outside an open menu closes it.
  if (LV.pop && document.getElementById('lv') && !e.target.closest('.lv-anchor')) {
    LV.pop = null;
    if (!inLv || !el) { repaint(); return; }
  }
  if (!inLv) return;
  if (LV.confirmView && !(el && el.dataset.lv === 'view-del')) LV.confirmView = false;
  if (!el) return;
  const a = el.dataset.lv, v = el.dataset.v;
  if (a === 'del-cancel' && el.classList.contains('lv-scrim') && e.target !== el) return; // clicks inside the dialog
  if (a === 'sheet-bg' && e.target !== el) return; // clicks inside the sheet
  switch (a) {
    case 'sheet': LV.sheet = true; LV.pop = null; repaint(); setTimeout(() => document.querySelector('#lv .lv-sheet [data-lv="sheet-close"]')?.focus(), 0); break;
    case 'sheet-close': case 'sheet-bg': LV.sheet = false; LV.pop = null; repaint(); setTimeout(() => document.querySelector('#lv [data-lv="sheet"]')?.focus(), 0); break;
    case 'view': pickView(v); break;
    case 'pop': LV.pop = LV.pop === v ? null : v; LV.setF = null; repaint(); break;
    case 'pop-close': LV.pop = null; repaint(); break;
    case 'density': setCfg({ density: v }); break;
    case 'sortdir': {
      const cur = LV.cfg.sort;
      setCfg({ sort: { key: cur.key || 'title', dir: cur.dir === 'asc' ? 'desc' : 'asc' } });
      document.querySelector('#lv [data-lv="sortdir"]')?.focus();
      break;
    }
    case 'sort': {
      const cur = LV.cfg.sort;
      const form = formNow(); const col = form ? ctxFor(form).byKey.get(v) : null;
      setCfg({ sort: cur.key === v ? { key: v, dir: cur.dir === 'asc' ? 'desc' : 'asc' } : { key: v, dir: v === 'title' ? 'asc' : firstDir(col) } });
      break;
    }
    case 'col-move': {
      const cols = LV.cfg.cols.slice(); const i = cols.indexOf(v), j = i + +el.dataset.dir;
      if (i < 0 || j < 0 || j >= cols.length) return;
      [cols[i], cols[j]] = [cols[j], cols[i]];
      setCfg({ cols });
      document.querySelector(`#lv [data-lv="col-move"][data-v="${CSS.escape(v)}"][data-dir="${el.dataset.dir}"]:not(:disabled)`)?.focus();
      break;
    }
    case 'cols-reset': { const form = formNow(); if (form) { const view = ctxFor(form).views.find((x) => x.id === LV.viewId); setCfg({ cols: (view?.cfg || LV.base).cols.slice() }); } break; }
    case 'filter-clear': setCfg({ filters: {} }); break;
    case 'reset': LV.cfg = structuredClone(LV.base); repaint(); break;
    case 'save': LV.sheet = false; saveCurrent(); break;
    case 'save-new': LV.naming = { mode: 'new', name: '', shared: false, focus: true }; LV.pop = null; LV.sheet = false; repaint(); break;
    case 'rename': { const form = formNow(); const vv = form && ctxFor(form).views.find((x) => x.id === LV.viewId); LV.naming = { mode: 'rename', name: vv?.name || '', focus: true }; LV.pop = null; LV.sheet = false; repaint(); break; }
    case 'share': toggleShare(); break;
    case 'view-del': removeView(); break;
    case 'name-cancel': LV.naming = null; repaint(); break;
    case 'name-save': saveNamed(); break;
    case 'set': setField(el.dataset.f, v); break;
    case 'set-pick': LV.setF = el.dataset.f || null; repaint(); setTimeout(() => (document.getElementById('lv-setval') || document.querySelector('#lv .lv-setpop .lv-opt:not(.lv-back)'))?.focus(), 0); break;
    case 'set-today': { const i = document.getElementById('lv-setval'); if (i) i.value = todayKey(); break; }
    case 'set-apply': setTyped(el.dataset.f); break;
    case 'set-clear': clearField(el.dataset.f); break;
    case 'set-multi': setMulti(el.dataset.f, v, el.dataset.op); break;
    case 'set-assignee': setAssignee(v); break;
    case 'stage-ask': { const form = formNow(); if (!form) break; LV.stageAsk = { formId: form.id, to: v, recs: H.recordsOf(form.id).filter((r) => LV.sel.has(r.id)), busy: false }; LV.pop = null; LV.setF = null; repaint(); setTimeout(() => document.getElementById('lv-st-comment')?.focus(), 0); break; }
    case 'stage-cancel': if (el.classList.contains('lv-scrim') && e.target !== el) return; if (LV.stageAsk && !LV.stageAsk.busy) { LV.stageAsk = null; repaint(); } break;
    case 'stage-go': stageGo(); break;
    case 'set-cancel': if (el.classList.contains('lv-scrim') && e.target !== el) return; if (LV.setAsk && !LV.setAsk.busy) { LV.setAsk = null; repaint(); } break;
    case 'set-go': setAskGo(); break;
    case 'owner': setOwnerOf(v); break;
    case 'attach-to': attachTo(); break;
    case 'export': exportCsv(); break;
    case 'sel-clear': LV.sel.clear(); LV.pop = null; repaint(); break;
    case 'del-ask': LV.confirm = true; LV.focusDel = true; LV.pop = null; repaint(); break;
    case 'del-cancel': LV.confirm = false; repaint(); break;
    case 'del-go': startDelete(); break;
    case 'undo': undoDelete(); break;
  }
});

document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset && t.dataset.llc && t.closest('#lv') && llChange(t)) return;
  if (!t.dataset || !t.dataset.lvc || !t.closest('#lv')) return;
  const k = t.dataset.lvc;
  const where = t.closest('.lv-cards') ? '#lv .lv-cards ' : '#lv ';
  const refocus = (sel) => document.querySelector(where + sel)?.focus();
  if (k === 'viewsel') { LV.sheet = false; pickView(t.value); return; }
  if (k === 'sortby') {
    const form = formNow(); const col = form ? ctxFor(form).byKey.get(t.value) : null;
    setCfg({ sort: { key: t.value, dir: t.value === 'title' ? 'asc' : firstDir(col) } });
    document.querySelector('#lv [data-lvc="sortby"]')?.focus();
    return;
  }
  if (k === 'sel') { if (t.checked) LV.sel.add(t.dataset.v); else LV.sel.delete(t.dataset.v); repaint(); refocus(`input[data-lvc="sel"][data-v="${CSS.escape(t.dataset.v)}"]`); return; }
  if (k === 'all') {
    const ids = [...document.querySelectorAll('#lv .lv-tbl tbody input[data-lvc="sel"]')].map((i) => i.dataset.v);
    const list = ids.length ? ids : [...document.querySelectorAll('#lv .lv-cards input[data-lvc="sel"]')].map((i) => i.dataset.v);
    list.forEach((id) => (t.checked ? LV.sel.add(id) : LV.sel.delete(id)));
    repaint(); refocus('input[data-lvc="all"]'); return;
  }
  if (k === 'col') {
    const key = t.dataset.v;
    setCfg({ cols: t.checked ? [...LV.cfg.cols.filter((x) => x !== key), key].slice(0, MAX_COLS) : LV.cfg.cols.filter((x) => x !== key) });
    refocus(`input[data-lvc="col"][data-v="${CSS.escape(key)}"]`);
    return;
  }
  if (k === 'filter') {
    const f = t.dataset.f, cur = new Set(LV.cfg.filters[f] || []);
    if (t.checked) cur.add(t.value); else cur.delete(t.value);
    const filters = { ...LV.cfg.filters };
    if (cur.size) filters[f] = [...cur]; else delete filters[f];
    setCfg({ filters });
    refocus(`input[data-lvc="filter"][data-f="${CSS.escape(f)}"][value="${CSS.escape(t.value)}"]`);
    return;
  }
  if (k === 'newshared' && LV.naming) { LV.naming.shared = t.checked; }
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'lv-name' && LV.naming) LV.naming.name = e.target.value;
});

document.addEventListener('keydown', (e) => {
  if (document.getElementById('lv') && llKey(e)) return;
  if (e.target.id === 'lv-setval' && e.key === 'Enter' && e.target.tagName !== 'SELECT') { e.preventDefault(); const b = document.querySelector('#lv [data-lv="set-apply"]'); if (b) setTyped(b.dataset.f); return; }
  if (e.target.id === 'lv-name') {
    if (e.key === 'Enter') { e.preventDefault(); saveNamed(); }
    else if (e.key === 'Escape') { LV.naming = null; repaint(); }
    return;
  }
  if (e.key !== 'Escape') return;
  if (LV.confirm) { LV.confirm = false; repaint(); }
  else if (LV.pop && LV.sheet && document.getElementById('lv')) { LV.pop = null; repaint(); }
  else if (LV.sheet && document.getElementById('lv')) { LV.sheet = false; repaint(); document.querySelector('#lv [data-lv="sheet"]')?.focus(); }
  else if (LV.pop && document.getElementById('lv')) { LV.pop = null; repaint(); }
});
