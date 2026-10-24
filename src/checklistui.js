// The Checklist field on a record (and in a grid row's pop-up, and the designer's preview): the
// score bar, each item's answer, a comment or photo when an answer is a fail, and Only if.
// Which checklist and version: the record keeps the version it was filled in on (checklistlogic.js).

import './checklists.css';
import { store, checklistVersion } from './store.js';
import { esc } from './ui.js';
import { visibleItems, summarize, missing, isFail, answered, answerText, rowsOf, cleanValue, isBlankValue, maxOf } from './checklistlogic.js';

let H = { draftFor: () => null, markDirty: () => {}, repaint: () => {}, formOf: () => null, upload: null, dateText: (d) => d, toast: () => {} };
export function initChecklistUI(h) { H = { ...H, ...h }; }

const PHOTO_MAX = 25 * 1024 * 1024;

/** The checklist a field shows for a value: { snap, clId } or { state: 'none' | 'loading' | 'missing' }. */
export function snapFor(f, v) {
  if (v && v.cl && v.ver) {
    const s = checklistVersion(v.cl, v.ver);
    return s ? { snap: s, clId: v.cl } : { state: s === false ? 'missing' : 'loading' };
  }
  const id = f.checklist;
  if (!id) return { state: 'none' };
  const cur = store.checklists.find((c) => c.id === id);
  if (!cur || !cur.snap) return { state: store.checklistsReady ? 'missing' : 'loading' };
  return { snap: cur.snap, clId: id };
}

/** Before saving: tidy every Checklist field's value (only showing answers, its summary). Returns the values. */
export function finalizeValues(form, values) {
  (form?.fields || []).forEach((f) => {
    if (f.type !== 'checklist') return;
    const v = values[f.id];
    if (!v || typeof v !== 'object') return;
    const r = snapFor(f, v);
    if (!r.snap) return; // not loaded: saved as it is
    const out = cleanValue(r.snap, v, r.clId);
    values[f.id] = isBlankValue(out) ? null : out;
  });
  return values;
}
/** What's missing in a Checklist field: '' or "3 items need attention". */
export function checkField(f, v) {
  const r = snapFor(f, v);
  if (!r.snap) return '';
  const m = missing(r.snap, v || {}), n = Object.keys(m).length;
  return n ? `${n} item${n === 1 ? ' needs' : 's need'} attention.` : '';
}

const fmtN = (n) => (Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toString());
function summaryHTML(snap, v, scope, fid) {
  const s = summarize(snap, v || {});
  const scored = s.max > 0;
  const pass = snap.passAt != null ? ` · pass at ${fmtN(snap.passAt)}%` : '';
  const res = s.result ? `<span class="cl-res ${s.result}">${s.result === 'pass' ? 'Pass' : 'Fail'}</span>` : '';
  const why = s.critical ? '<span class="cl-why">A critical item failed.</span>' : '';
  return `<div class="cl-sum${s.result ? ' ' + s.result : ''}" id="clsum-${scope}-${esc(fid)}" aria-live="polite">
    ${scored ? `<div class="cl-score"><b>${fmtN(s.score)} / ${fmtN(s.max)}</b><small>${s.pct == null ? '' : fmtN(s.pct) + '%'}${pass}</small></div><div class="cl-bar" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, s.pct || 0))}%"></i>${snap.passAt != null ? `<em style="left:${snap.passAt}%"></em>` : ''}</div>` : ''}
    ${res}<span class="cl-count">${s.answered} of ${s.total} answered</span>${why}</div>`;
}

const photoTile = (x, i, at, edit) => {
  const label = x.pending && !x.url ? `${esc(x.name || 'Photo')} (waiting to upload)` : esc(x.name || 'Photo');
  const img = x.url ? `<img src="${esc(x.url)}" alt="" loading="lazy">` : '<span class="cl-ph0">▣</span>';
  return `<span class="cl-ph">${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener" title="${label}">${img}</a>` : img}${edit ? `<button type="button" class="cl-phx" data-clr="photo-del" ${at} data-n="${i}" aria-label="Remove ${label}">✕</button>` : ''}</span>`;
};

function itemHTML(x, v, scope, fid, errs, edit, upNames) {
  const a = v?.a || {}, ans = a[x.id], at = `data-scope="${scope}" data-clf="${esc(fid)}" data-item="${esc(x.id)}"`;
  const fail = isFail(x, ans), err = errs && errs[x.id];
  const id = `clin-${scope}-${fid}-${x.id}`;
  let ctl = '';
  if (!edit) ctl = `<span class="cl-ans${fail ? ' fail' : ''}">${esc(answerText(x, ans, H.dateText)) || '<span class="rd-empty">–</span>'}</span>`;
  else if (x.type === 'choice') ctl = `<div class="cl-seg" role="radiogroup" aria-labelledby="${id}-l">${(x.opts || []).map((o) => `<button type="button" role="radio" aria-checked="${o.id === ans}" class="${o.id === ans ? (o.fail ? 'on no' : 'on') : ''}" data-clr="ans" ${at} data-v="${esc(o.id)}">${esc(o.label)}</button>`).join('')}</div>`;
  else if (x.type === 'date') ctl = `<input class="in cl-in" type="date" id="${id}" data-clr="val" ${at} value="${esc(ans || '')}">`;
  else if (x.type === 'decimal' || x.type === 'percent') ctl = `<span class="cl-numw"><input class="in cl-in cl-nin" type="number" step="any" inputmode="decimal" id="${id}" data-clr="val" ${at} value="${esc(ans ?? '')}"${x.type === 'percent' ? ' min="0" max="100"' : ''}>${x.type === 'percent' ? '%' : ''}</span>`;
  else ctl = `<input class="in cl-in" type="text" id="${id}" data-clr="val" ${at} value="${esc(ans || '')}" maxlength="500">`;
  let extra = '';
  if (fail && (x.onFail?.comment || x.onFail?.photo)) {
    const note = v?.n?.[x.id] || '', ph = Array.isArray(v?.p?.[x.id]) ? v.p[x.id] : [];
    if (edit) {
      extra = `<div class="cl-fail">${x.onFail.comment ? `<textarea class="in cl-note" rows="2" data-clr="note" ${at} maxlength="500" placeholder="What’s wrong?${x.onFail.comment === 'req' ? ' (required)' : ''}" aria-label="Comment on ${esc(x.label)}">${esc(note)}</textarea>` : ''}
        ${x.onFail.photo ? `<div class="cl-phs">${ph.map((p, i) => photoTile(p, i, at, true)).join('')}${(upNames || []).map((n) => `<span class="cl-ph up" title="${esc(n)}"><span class="cl-ph0">…</span></span>`).join('')}${ph.length < 10 ? `<label class="btn sm cl-addph">+ Photo${x.onFail.photo === 'req' ? ' (required)' : ''}<input type="file" accept="image/*" capture="environment" data-clr="photo" ${at} hidden></label>` : ''}</div>` : ''}</div>`;
    } else if (note || ph.length) extra = `<div class="cl-fail">${note ? `<p class="cl-notev">${esc(note)}</p>` : ''}${ph.length ? `<div class="cl-phs">${ph.map((p, i) => photoTile(p, i, at, false)).join('')}</div>` : ''}</div>`;
  }
  return `<div class="cl-q${fail ? ' fail' : ''}${err ? ' bad' : ''}${edit ? '' : ' rd'}" id="clq-${scope}-${esc(fid)}-${esc(x.id)}">
    <div class="cl-qh"><span class="cl-qt" id="${id}-l">${x.type !== 'choice' && edit ? `<label for="${id}">${esc(x.label)}</label>` : esc(x.label)}${x.required && edit ? '<span class="req">*</span>' : ''}${x.critical ? ' <span class="cl-crit">Critical</span>' : ''}</span>${ctl}</div>
    ${x.help && edit ? `<p class="help cl-qhelp">${esc(x.help)}</p>` : ''}${extra}${err ? `<p class="err">${esc(err)}</p>` : ''}</div>`;
}

/** The whole field. mode: 'edit' | 'read' | 'view' (view only at this stage) | 'cleared' (a rule). */
export function blockHTML(f, v, err, scope, mode) {
  const head = `<h3 class="cl-h">${esc(f.label)}${f.required && mode === 'edit' ? '<span class="req">*</span>' : ''}</h3>`;
  const wrap = (body, cls = '') => `<div class="fld w-full cl-fld${err ? ' bad' : ''}${cls}" id="fb-${scope}-${esc(f.id)}">${head}${f.help && mode === 'edit' ? `<p class="help">${esc(f.help)}</p>` : ''}${body}${err ? `<p class="err">${esc(err)}</p>` : ''}</div>`;
  if (mode === 'cleared') return wrap('<p class="help rule-note">Cleared by a rule</p>', ' locked');
  const r = snapFor(f, v);
  if (r.state === 'none') return wrap(`<p class="help">No checklist picked yet. ${store.me?.role === 'admin' ? 'Pick one for this field in the Form designer.' : 'An administrator needs to pick one in the Form designer.'}</p>`);
  if (r.state === 'loading') return wrap('<p class="help">Loading the checklist…</p>');
  if (r.state === 'missing') return wrap(mode === 'edit' && isBlankValue(v) ? '<p class="help">This checklist was deleted. An administrator can pick another in the Form designer.</p>' : `<p class="help">The checklist this was filled in on is no longer available.${v?.s ? ` It scored: ${esc(v.s.max ? `${v.s.score} / ${v.s.max}` : '')} ${v.s.result || ''}` : ''}</p>`);
  const snap = r.snap, edit = mode === 'edit';
  if (!edit && isBlankValue(v)) return wrap('<span class="rd-empty" aria-label="Empty">–</span>', ' rd');
  const d = H.draftFor(scope);
  const errs = err && edit ? missing(snap, v || {}) : null;
  const ups = (d?._clUp || {})[f.id] || {};
  const vis = visibleItems(snap, v?.a || {});
  let body = '';
  if (edit) {
    let sec = '';
    (snap.items || []).forEach((x) => {
      if (x.kind === 'section') { sec = x.label; body += `<div class="cl-sech" data-sec="1">${esc(x.label)}</div>`; return; }
      if (!vis.has(x.id)) return;
      body += itemHTML(x, v, scope, f.id, errs, true, ups[x.id]);
    });
    body = body.replace(/<div class="cl-sech" data-sec="1">[^<]*<\/div>(?=<div class="cl-sech"|$)/g, ''); // a section with nothing showing
  } else {
    rowsOf(snap, v, H.dateText).forEach((row) => {
      if (row.section) { body += `<div class="cl-sech">${esc(row.section)}</div>`; return; }
      const x = (snap.items || []).find((y) => y.id === row.id);
      body += itemHTML(x, v, scope, f.id, null, false);
    });
  }
  const ver = `<span class="cl-ver" title="The version of “${esc(snap.name)}” this was filled in on">${esc(snap.name)} · v${snap.ver}</span>`;
  return wrap(`${ver}${summaryHTML(snap, v, scope, f.id)}<div class="cl-items">${body}</div>${mode === 'view' ? '<p class="help rule-note">View only at this stage</p>' : ''}`, edit ? '' : ' rd');
}

/** Read view, PDFs and lists: one line. */
export { summaryText } from './checklistlogic.js';

/* ---------- filling it in ---------- */

function ctx(el) {
  const scope = el.dataset.scope, d = H.draftFor(scope);
  if (!d || d.readOnly) return null;
  const form = H.formOf(d), f = (form?.fields || []).find((x) => x.id === el.dataset.clf);
  if (!f) return null;
  let v = d.values[f.id];
  if (!v || typeof v !== 'object' || !v.cl) {
    const r = snapFor(f, null);
    if (!r.snap) return null;
    v = d.values[f.id] = { cl: r.clId, ver: r.snap.ver, a: {} };
  } else { v = d.values[f.id] = { ...v, a: { ...(v.a || {}) }, n: { ...(v.n || {}) }, p: { ...(v.p || {}) } }; }
  const r = snapFor(f, v);
  if (!r.snap) return null;
  const x = (r.snap.items || []).find((y) => y.id === el.dataset.item);
  return { d, form, f, v, snap: r.snap, x, scope };
}
function settle(c, focusSel) {
  H.markDirty(c.d);
  if (c.d.errors?.[c.f.id]) { const m = checkField(c.f, c.d.values[c.f.id]); if (m) c.d.errors[c.f.id] = m; else delete c.d.errors[c.f.id]; }
  if (focusSel === false) { // typed: just the score line, and this item's message once it's sorted
    const el = document.getElementById(`clsum-${c.scope}-${c.f.id}`);
    if (el) el.outerHTML = summaryHTML(c.snap, c.d.values[c.f.id], c.scope, c.f.id);
    const q = c.x && document.getElementById(`clq-${c.scope}-${c.f.id}-${c.x.id}`);
    if (q && q.classList.contains('bad') && !missing(c.snap, c.d.values[c.f.id])[c.x.id]) { q.classList.remove('bad'); q.querySelector(':scope > .err')?.remove(); }
    if (!c.d.errors?.[c.f.id]) { const fb = document.getElementById(`fb-${c.scope}-${c.f.id}`); if (fb) { fb.classList.remove('bad'); fb.querySelector(':scope > .err')?.remove(); } }
    return;
  }
  H.repaint(c.d, c.f);
  if (focusSel) document.querySelector(focusSel)?.focus({ preventScroll: true });
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-clr]');
  if (!el || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return;
  const c = ctx(el); if (!c || !c.x) return;
  const at = `[data-scope="${c.scope}"][data-clf="${CSS.escape(c.f.id)}"][data-item="${CSS.escape(c.x.id)}"]`;
  if (el.dataset.clr === 'ans') {
    if (c.v.a[c.x.id] === el.dataset.v) delete c.v.a[c.x.id]; else c.v.a[c.x.id] = el.dataset.v; // pressing the chosen answer again clears it
    settle(c, `[data-clr="ans"]${at}[data-v="${CSS.escape(el.dataset.v)}"]`);
  } else if (el.dataset.clr === 'photo-del') {
    const list = [...(c.v.p[c.x.id] || [])]; list.splice(+el.dataset.n, 1); c.v.p[c.x.id] = list;
    settle(c, `[data-clr="photo"]${at}`);
  }
});
document.addEventListener('input', (e) => {
  const el = e.target;
  if (!el.dataset || (el.dataset.clr !== 'val' && el.dataset.clr !== 'note')) return;
  const c = ctx(el); if (!c || !c.x) return;
  if (el.dataset.clr === 'note') c.v.n[c.x.id] = el.value;
  else if (c.x.type === 'decimal' || c.x.type === 'percent') { if (el.value === '') delete c.v.a[c.x.id]; else c.v.a[c.x.id] = Number(el.value); }
  else if (el.value === '') delete c.v.a[c.x.id]; else c.v.a[c.x.id] = el.value;
  settle(c, false);
});
document.addEventListener('change', async (e) => {
  const el = e.target;
  if (!el.dataset || el.dataset.clr !== 'photo') return;
  const c = ctx(el); if (!c || !c.x || !H.upload) return;
  const files = [...(el.files || [])].filter((x) => /^image\//.test(x.type) && x.size <= PHOTO_MAX);
  if (!files.length) { H.toast('Pick a photo under 25 MB.'); return; }
  const at = `[data-scope="${c.scope}"][data-clf="${CSS.escape(c.f.id)}"][data-item="${CSS.escape(c.x.id)}"]`;
  const d = c.d, f = c.f, item = c.x.id;
  d._clUp = d._clUp || {}; const ups = (d._clUp[f.id] = d._clUp[f.id] || {}); const mine = (ups[item] = ups[item] || []);
  files.forEach((x) => mine.push(x.name));
  H.repaint(d, f);
  let waiting = 0;
  for (const file of files) {
    try {
      const val = await H.upload(file, c.form.id);
      const cur = d.values[f.id] || { cl: c.v.cl, ver: c.v.ver, a: {} };
      d.values[f.id] = { ...cur, p: { ...(cur.p || {}), [item]: [...((cur.p || {})[item] || []), { ...val, by: store.user?.uid || '', at: Date.now() }] } };
      if (val.pending) waiting++;
    } catch (err) { console.error(err); H.toast(err?.code === 'storage/unauthorized' ? 'You don’t have permission to upload files to this form.' : `“${file.name}” couldn’t be uploaded. Check your connection and try again.`); }
    finally { const i = mine.indexOf(file.name); if (i >= 0) mine.splice(i, 1); }
  }
  settle({ ...c, v: d.values[f.id] }, `[data-clr="photo"]${at}`);
  if (waiting) H.toast('No signal: the photo is kept on this device and uploads when you’re back. Save as usual.', { duration: 7000 });
});

/** Are photos still uploading in this draft? */
export const uploading = (d) => Object.values(d?._clUp || {}).some((m) => Object.values(m).some((a) => a.length));
export { maxOf, answered };
