// Recently deleted (administrators): under a form's record list, the records deleted from that
// form in the last 90 days, with Restore. The copies are the audit trail's (Cadence's audit.js
// keeps one with each deletion); restoring brings the record back with the same ID, so its
// child records, comments and sent emails reconnect. The Audit trail lists the same deletions.

import { loadAudit, restoreDeleted, store } from './store.js';
import { esc, toast, badge } from './ui.js';
import { isAdmin } from './access.js';

const DAYS = 90;
const R = { formId: null, list: null, loading: false, err: '', working: null };
let H = null; // { renderMain, recById, openRecord, personName }
export function initRecentDel(h) { H = h; }

const when = (t) => new Date(t).toLocaleString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

async function load(formId) {
  R.formId = formId; R.loading = true; R.err = ''; R.list = null; H.renderMain();
  try {
    const { entries } = await loadAudit({ filter: ['kind', 'deleted'], from: Date.now() - DAYS * 864e5, size: 500 });
    if (R.formId !== formId) return;
    R.list = entries.filter((e) => e.area === 'record' && e.formId === formId);
  } catch (e) { console.warn('[formwright] recently deleted', e?.code || e); R.err = 'The deleted records couldn’t be loaded. Check your connection and try again.'; }
  R.loading = false; H.renderMain();
  setTimeout(() => document.querySelector('#rd-dlg .rd-x')?.focus(), 0);
}

/** The button under the list, and the window when it's open. */
export function recentDelHTML(form) {
  if (!form || !isAdmin(store.me)) return '';
  const btn = `<div class="rd-foot"><button type="button" class="btn ghost sm" data-act="rd-open" data-id="${esc(form.id)}">Recently deleted</button></div>`;
  if (R.formId !== form.id) return btn;
  const rows = (R.list || []).map((e) => {
    const back = H.recById(e.recordId);
    const state = back ? `<button type="button" class="btn sm ghost" data-act="rd-go" data-id="${esc(e.recordId)}">Open</button>`
      : e.restoredAt ? `<span class="help">Restored ${esc(when(e.restoredAt))}</span>`
      : `<button type="button" class="btn sm" data-act="rd-restore" data-id="${esc(e.id)}"${R.working ? ' disabled' : ''}>${R.working === e.id ? 'Restoring…' : 'Restore'}</button>`;
    return `<li class="rd-row"><div class="rd-t"><b>${esc(e.title || 'Untitled')}</b><span class="help">Deleted ${esc(when(e.at))} by ${esc(e.byName || H.personName(e.by))}</span></div>${state}</li>`;
  }).join('');
  const body = R.loading ? '<p class="help">Loading…</p>' : R.err ? `<p class="help">${esc(R.err)}</p>`
    : rows ? `<ul class="rd-list">${rows}</ul>` : `<p class="help">Nothing deleted from ${esc(form.name)} in the last ${DAYS} days.</p>`;
  return `${btn}<div class="lv-scrim" data-act="rd-scrim"><div class="lv-dlg rd-dlg" id="rd-dlg" role="dialog" aria-modal="true" aria-labelledby="rd-h" data-stop-scrim="1">
    <div class="rd-top">${badge(form)}<h2 id="rd-h">Recently deleted</h2><button type="button" class="ibtn rd-x" data-act="rd-close" aria-label="Close">✕</button></div>
    <p class="help">${esc(form.name)} deleted in the last ${DAYS} days. Restore brings one back exactly as it was, with the same links, child records, comments and emails.</p>
    ${body}</div></div>`;
}

export async function onClick(act, el, e) {
  if (!act.startsWith('rd-')) return false;
  const id = el.dataset.id;
  if (act === 'rd-open') { await load(id); return true; }
  if (act === 'rd-close' || (act === 'rd-scrim' && e && e.target === el)) { const f = R.formId; R.formId = null; H.renderMain(); document.querySelector(`[data-act="rd-open"][data-id="${CSS.escape(f || '')}"]`)?.focus(); return true; }
  if (act === 'rd-scrim') return true;
  if (act === 'rd-go') { R.formId = null; H.openRecord(id); return true; }
  if (act === 'rd-restore') {
    if (R.working) return true;
    R.working = id; H.renderMain();
    try {
      const out = await restoreDeleted(id);
      const x = (R.list || []).find((y) => y.id === id);
      if (x) { x.restoredAt = Date.now(); x.restoredBy = store.user?.uid; }
      toast(`Restored${out?.parentGone ? ' on its own (its parent was deleted too)' : ''}.`);
    } catch (err) {
      console.warn('[formwright] restore', err?.code || err);
      toast(/not-found/.test(err?.code || '') && /function|404/i.test(err?.message || '') ? 'The restore service isn’t set up yet. Deploy the Cadence functions first.' : err?.message || 'Couldn’t restore it. Try again.');
    }
    R.working = null; H.renderMain();
    return true;
  }
  return false;
}

/** Escape closes it. */
export function onKey(e) {
  if (e.key !== 'Escape' || !R.formId) return false;
  e.preventDefault(); const f = R.formId; R.formId = null; H.renderMain();
  document.querySelector(`[data-act="rd-open"][data-id="${CSS.escape(f)}"]`)?.focus();
  return true;
}
/** Leaving the list closes it. */
export function closeRecentDel() { R.formId = null; }
