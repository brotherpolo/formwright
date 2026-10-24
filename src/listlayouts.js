// A form's list as a Board or a Timeline (lists.js shows the Table). What goes where is worked
// out in layoutlogic.js; this draws them and handles moving things:
//   Board: drag a card to another column (mouse or pen), or ⋯ → Move to (touch, keyboard).
//     A choice field is set; a stage moves the way the record's own stage buttons do.
//   Timeline: drag a bar to move it, or its ends to change one date (mouse or pen); tap or
//     Enter on a bar → Change dates (touch, keyboard). Today is marked; zoom by weeks, months
//     or quarters. Records with no start date are counted under the chart.
// Only records the person may change can move. Saving goes through lists.js (applySet), which
// checks the form's rules first, like setting a field on several records.

import { paintClass } from './colorlogic.js';
import { esc } from './ui.js';
import {
  LAYOUTS, ZOOMS, boardChoices, sumChoices, dateChoices, colorChoices, boardColumns, targetsOf, keyOf, colSum,
  spanOf, windowOf, ticksOf, shiftSpan, dateValue, spanText, dayDiff, addDays,
} from './layoutlogic.js';

const LL = { menu: null, dates: null, scrolled: '', pos: {} }; // pos: where the Board and Timeline were scrolled, kept across redraws // menu: recId whose ⋯ Move to is open; dates: recId whose dates are being changed
let E = null; // set by lists.js each render: { form, H, canEdit, canWork, admin, applySet, stageMove, today, dayOf, weekStart, nameOf, cellsFor }

/** lists.js hands over what's needed each time the list is drawn, whatever the layout. */
export function bindLayouts(env) { E = env; }

/* ---------- the switch and settings ---------- */

export function layoutSeg(cfg, cls = '') {
  const k = cfg.layout?.kind || 'table';
  return `<div class="lv-seg ll-seg ${cls}" role="group" aria-label="Show as">${LAYOUTS.map(([id, label]) => `<button type="button" class="${k === id ? 'on' : ''}" aria-pressed="${k === id}" data-ll="kind" data-v="${id}">${ICON[id]}<span>${label}</span></button>`).join('')}</div>`;
}

const sel = (key, label, list, value, none) => `<label class="ll-pick"><span>${esc(label)}</span><select class="in" data-llc="${key}">${none ? `<option value=""${value ? '' : ' selected'}>${esc(none)}</option>` : ''}${list.map((c) => `<option value="${esc(c.id)}"${c.id === value ? ' selected' : ''}>${esc(c.label)}</option>`).join('')}</select></label>`;

/** The settings row under the tools for a Board or a Timeline. */
export function layoutTools(form, cfg) {
  const l = cfg.layout;
  if (l.kind === 'board') {
    const bc = boardChoices(form);
    if (!bc.length) return '';
    return `<div class="ll-tools">${sel('by', 'Columns', bc, l.by)}${sumChoices(form).length ? sel('sum', 'Total', sumChoices(form), l.sum, 'Count only') : ''}</div>`;
  }
  if (l.kind === 'timeline') {
    const dc = dateChoices(form);
    return `<div class="ll-tools">${sel('start', 'From', dc, l.start)}${sel('end', 'To', dc.filter((c) => c.id !== l.start), l.end, 'One day')}${sel('color', 'Colour', colorChoices(form), l.color, 'Form colour')}
      <div class="lv-seg" role="group" aria-label="Zoom">${Object.entries(ZOOMS).map(([z, o]) => `<button type="button" class="${l.zoom === z ? 'on' : ''}" aria-pressed="${l.zoom === z}" data-ll="zoom" data-v="${z}">${o.label}</button>`).join('')}</div>
      <button type="button" class="btn" data-ll="today">Today</button></div>`;
  }
  return '';
}

/* ---------- Board ---------- */

const PAL = 8;
export function boardHTML(form, rows, cfg, env) {
  E = env;
  const l = cfg.layout;
  if (!l.by) return `<div class="panel empty"><h2>Nothing to make columns from</h2><p>A board needs a workflow, or a dropdown, single-choice or yes/no field, on ${esc(form.name)}.${env.admin ? ' Add one in the Form designer.' : ''}</p></div>`;
  const recs = rows.map((r) => r.rec);
  const byRow = new Map(rows.map((r) => [r.rec.id, r]));
  const cols = boardColumns(form, l.by, recs);
  const sumF = l.sum ? (form.fields || []).find((f) => f.id === l.sum) : null;
  const total = (list) => (sumF ? env.H.fmt(sumF, colSum(list, sumF.id, (r) => env.H.valOf(sumF, r, form))) : '');
  const skip = new Set(['f:' + l.by]);
  const card = (rec) => {
    const r = byRow.get(rec.id), canMove = env.canEdit(rec) && targetsOf(form, l.by, rec, who(rec)).size > 0;
    const vals = (r?.cells || []).map((c, i) => ({ c, key: env.cols[i]?.key })).filter((x) => x.c.text && !skip.has(x.key)).slice(0, 3);
    const sumV = sumF ? env.H.valOf(sumF, rec, form) : null;
    const extra = env.cardExtra ? env.cardExtra(rec, form) : '';
    const p = r?.paint, pc = (key) => (p && p.cells[key] ? ` class="cr-cell ${paintClass(p.cells[key])}"` : ''); // colour rules (colorlogic.js)
    return `<div class="bd-card${canMove ? ' can-move' : ''}${p?.row ? ' cr-row ' + paintClass(p.row) : ''}" data-rec="${esc(rec.id)}" role="listitem">
      <button type="button" class="bd-open${p?.cells.title ? ' cr-cell ' + paintClass(p.cells.title) : ''}" data-act="open-record" data-id="${esc(rec.id)}">${esc(r?.title || 'Untitled')}</button>
      ${vals.length ? `<dl class="bd-vals">${vals.map((x) => `<div><dt>${esc(env.cols.find((c) => c.key === x.key)?.label || '')}</dt><dd${pc(x.key)}>${esc(x.c.text)}</dd></div>`).join('')}</dl>` : ''}
      ${sumV != null && sumV !== '' ? `<b class="bd-sum">${esc(env.H.fmt(sumF, sumV))}</b>` : ''}${extra}
      ${canMove ? `<button type="button" class="ibtn bd-more" data-ll="menu" data-v="${esc(rec.id)}" aria-haspopup="menu" aria-expanded="${LL.menu === rec.id}" aria-label="Move ${esc(r?.title || '')} to another column">${ICON.more}</button>` : ''}
      ${LL.menu === rec.id ? menuHTML(form, l.by, rec, cols) : ''}
    </div>`;
  };
  return `<div class="bd" id="bd" data-key="${esc(form.id + '|' + l.by)}" role="region" aria-label="${esc(form.name)} board">${cols.map((c) => `<section class="bd-col${c.blank ? ' blank' : ''}" data-col="${esc(c.key)}" style="--bc:var(--dc${(c.color ?? 0) % PAL + 1})" aria-label="${esc(c.label)}, ${c.recs.length}">
      <header class="bd-h"><span class="bd-dot" aria-hidden="true"></span><b>${esc(c.label)}</b><span class="bd-n">${c.recs.length}</span>${sumF ? `<span class="bd-tot">${esc(total(c.recs))}</span>` : ''}</header>
      <div class="bd-list" role="list">${c.recs.map(card).join('') || '<p class="bd-empty">Nothing here</p>'}</div>
    </section>`).join('')}</div>`;
}
const who = (rec) => ({ admin: E.admin, canEdit: E.canEdit(rec), canWork: E.canWork(rec) });

function menuHTML(form, by, rec, cols) {
  const t = targetsOf(form, by, rec, who(rec));
  const here = keyOf(form, by, rec);
  return `<div class="bd-menu" role="menu" aria-label="Move to">${cols.filter((c) => c.key !== here || true).map((c) => {
    const go = t.get(c.key), cur = c.key === here;
    return `<button type="button" role="menuitem" class="bd-mi${cur ? ' cur' : ''}" data-ll="move" data-v="${esc(rec.id)}" data-col="${esc(c.key)}"${go ? '' : ' disabled'}>${esc(c.label)}${cur ? ' <small>(here)</small>' : go && go.kind === 'move' ? ` <small>${esc(go.move.label)}</small>` : go && go.kind === 'jump' ? ' <small>(administrator)</small>' : ''}</button>`;
  }).join('')}</div>`;
}

/** Put a card in a column: set the field, or move the stage the record's own way. */
async function moveTo(recId, col) {
  const form = E.form, rec = E.H.recById(recId); if (!rec) return;
  const by = E.cfg.layout.by;
  const go = targetsOf(form, by, rec, who(rec)).get(col);
  LL.menu = null;
  if (!go) { E.repaint(); return; }
  if (go.kind === 'set') {
    const f = (form.fields || []).find((x) => x.id === by);
    const shown = go.value === null ? 'nothing' : go.value === true ? 'Yes' : go.value === false ? 'No' : go.value;
    await E.applySet(form, [rec], { [by]: go.value }, `Set ${f?.label || 'it'} to ${shown}`, false, `Set field: ${f?.label || 'it'} → ${shown}`);
    return;
  }
  await E.stageMove(rec, form, go);
}

/* ---------- Timeline ---------- */

export function timelineHTML(form, rows, cfg, env) {
  E = env;
  const l = cfg.layout, z = ZOOMS[l.zoom] || ZOOMS.month, pd = z.pd;
  const startF = (form.fields || []).find((f) => f.id === l.start), endF = (form.fields || []).find((f) => f.id === l.end);
  const items = rows.map((r) => ({ r, span: spanOf(r.rec, l.start, l.end, env.dayOf) }));
  const dated = items.filter((x) => x.span).sort((a, b) => a.span.from.localeCompare(b.span.from) || a.span.to.localeCompare(b.span.to) || String(a.r.title).localeCompare(String(b.r.title))); // by start date
  const undated = items.length - dated.length;
  if (!dated.length) return `<div class="panel empty"><h2>No dates to show</h2><p>None of these ${esc(form.name.toLowerCase())} has a ${esc(startF?.label || 'start date')} yet.${dateChoices(form).length > 1 ? ' Pick another date in From.' : ''}</p></div>`;
  const win = windowOf(dated.map((x) => x.span), env.today, l.zoom);
  const W = Math.round(win.days * pd);
  const ticks = ticksOf(win, l.zoom, env.weekStart);
  const todayX = dayDiff(win.from, env.today) * pd;
  const colors = l.color ? boardColumns(form, l.color, dated.map((x) => x.r.rec)) : [];
  const colorOf = (rec) => { if (!l.color) return 'var(--fc)'; const k = keyOf(form, l.color, rec); const c = colors.find((x) => x.key === k); return c && !c.blank ? `var(--dc${(c.color ?? 0) % PAL + 1})` : 'var(--muted)'; };
  const stageOrField = l.color === '_stage' ? 'Stage' : (form.fields || []).find((f) => f.id === l.color)?.label || '';
  const legend = l.color ? `<div class="tl-legend" aria-label="Colours">${colors.filter((c) => !c.blank && c.recs.length).map((c) => `<span><i style="background:var(--dc${(c.color ?? 0) % PAL + 1})"></i>${esc(c.label)}</span>`).join('')}</div>` : '';
  const months = l.zoom === 'week' ? ticks.filter((t) => t.major).map((t) => `<span class="tl-mon" style="left:${t.at * pd}px">${esc(t.month)}</span>`).join('') : '';
  const bar = (x) => {
    const { r, span } = x, rec = r.rec, can = env.canEdit(rec) && l.start !== '_created';
    const left = dayDiff(win.from, span.from) * pd, w = Math.max(pd, (dayDiff(span.from, span.to) + 1) * pd);
    const label = `${r.title}: ${spanText(span)}${span.open ? ` (no ${endF?.label || 'end date'})` : ''}`;
    const ck = l.color ? keyOf(form, l.color, rec) : '';
    const cname = l.color ? (colors.find((c) => c.key === ck)?.label || '') : '';
    return `<div class="tl-row" role="listitem">
      <div class="tl-lab"><button type="button" class="tl-name" data-act="open-record" data-id="${esc(rec.id)}">${esc(r.title || 'Untitled')}</button><small>${esc([cname, spanText(span)].filter(Boolean).join(' · '))}</small></div>
      <div class="tl-track" style="width:${W}px"><span class="tl-edge l" aria-hidden="true">‹ Ended ${esc(spanText({ from: span.to, to: span.to }).replace(/, \d{4}$/, ''))}</span><span class="tl-edge r" aria-hidden="true">Starts ${esc(spanText({ from: span.from, to: span.from }).replace(/, \d{4}$/, ''))} ›</span>
        <div class="tl-bar${can ? ' can-move' : ''}${span.from === span.to ? ' one' : ''}${span.open ? ' open' : ''}" data-rec="${esc(rec.id)}" data-from="${span.from}" data-to="${span.to}" style="left:${left}px;width:${w}px;--c:${colorOf(rec)}" ${can ? `tabindex="0" role="button" aria-label="${esc(label)}. Change dates" data-ll="dates" data-v="${esc(rec.id)}"` : `title="${esc(label)}"`}>
          ${can && l.zoom !== 'quarter' ? '<span class="tl-h s" data-part="start" aria-hidden="true"></span>' : ''}<span class="tl-t">${esc(r.title || '')}</span>${can && l.end && l.zoom !== 'quarter' ? '<span class="tl-h e" data-part="end" aria-hidden="true"></span>' : ''}
        </div>
      </div>
      ${LL.dates === rec.id ? datesHTML(form, rec, span, startF, endF) : ''}
    </div>`;
  };
  return `<div class="tl" id="tl" style="--pd:${pd}px;--fc:${env.formColor}">
    ${legend}
    <div class="tl-scroll" id="tl-scroll" data-key="${esc(form.id + '|' + l.start + '|' + l.zoom)}" data-today="${todayX}">
      <div class="tl-grid" style="width:calc(var(--tl-lab) + ${W}px)">
        <div class="tl-head"><div class="tl-lab tl-corner">${esc(form.name)}</div><div class="tl-axis" style="width:${W}px">${months}${env.today >= win.from && env.today <= win.to ? `<span class="tl-tday" style="left:${todayX + pd / 2}px">Today</span>` : ''}${ticks.map((t) => `<span class="tl-tick${t.major ? ' major' : ''}" style="left:${t.at * pd}px">${esc(t.label)}</span>`).join('')}</div></div>
        <div class="tl-body" role="list" aria-label="${esc(form.name)} timeline">
          <div class="tl-lines" aria-hidden="true" style="width:${W}px">${ticks.map((t) => `<i class="${t.major ? 'major' : ''}" style="left:${t.at * pd}px"></i>`).join('')}${env.today >= win.from && env.today <= win.to ? `<b class="tl-today" style="left:${todayX + pd / 2}px"></b>` : ''}</div>
          ${dated.map(bar).join('')}
        </div>
      </div>
    </div>
    ${undated ? `<p class="help tl-undated">${undated} ${undated === 1 ? 'has' : 'have'} no ${esc(startF?.label || 'start date')}, so ${undated === 1 ? 'isn’t' : 'aren’t'} shown.</p>` : ''}
    ${l.start === '_created' ? '<p class="help tl-undated">Bars start when each record was made, so they can’t be moved here.</p>' : ''}
  </div>`;
}

function datesHTML(form, rec, span, startF, endF) {
  return `<div class="tl-pop" role="dialog" aria-label="Change dates">
    <label><span>${esc(startF?.label || 'From')}</span><input class="in" type="date" data-llc="d-from" value="${span.from}"></label>
    ${endF ? `<label><span>${esc(endF.label || 'To')}</span><input class="in" type="date" data-llc="d-to" value="${span.open ? '' : span.to}"></label>` : ''}
    <div class="tl-pacts"><button type="button" class="btn ghost" data-ll="dates-cancel">Cancel</button><button type="button" class="btn primary" data-ll="dates-save" data-v="${esc(rec.id)}">Save</button></div>
  </div>`;
}

/** Save new dates for a record: { from, to } day keys (to omitted when there's no end field). */
async function saveSpan(recId, span) {
  const form = E.form, l = E.cfg.layout, rec = E.H.recById(recId); if (!rec) return;
  const sf = (form.fields || []).find((f) => f.id === l.start), ef = (form.fields || []).find((f) => f.id === l.end);
  const set = {};
  if (sf && span.from && rec.values?.[sf.id]?.slice?.(0, 10) !== span.from) set[sf.id] = dateValue(rec.values?.[sf.id], span.from, sf.type);
  if (ef && span.to && String(rec.values?.[ef.id] || '').slice(0, 10) !== span.to) set[ef.id] = dateValue(rec.values?.[ef.id], span.to, ef.type);
  LL.dates = null;
  if (!Object.keys(set).length) { E.repaint(); return; }
  await E.applySet(form, [rec], set, `${E.H.recTitle(rec, form)}: ${spanText({ from: span.from, to: span.to || span.from })}`);
}

/* ---------- after drawing: scroll to today, wire up dragging ---------- */

/** Rows whose bar is out of sight say so at the edge ("‹ Ended Jul 1", "Starts Mar 2 ›"). */
function edges(sc) {
  const lab = labW(sc), left = sc.scrollLeft, right = left + sc.clientWidth - lab;
  sc.querySelectorAll('.tl-row').forEach((row) => {
    const b = row.querySelector('.tl-bar'); if (!b) return;
    const x = parseFloat(b.style.left), w = b.offsetWidth;
    row.classList.toggle('past', x + w < left + 4);
    row.classList.toggle('future', x > right - 4);
  });
}
export function afterLayout() {
  const sc = document.getElementById('tl-scroll');
  if (sc && !sc.dataset.wired) { sc.dataset.wired = '1'; let raf = 0; sc.addEventListener('scroll', () => { LL.pos.tl = { key: sc.dataset.key, left: sc.scrollLeft, top: sc.scrollTop }; cancelAnimationFrame(raf); raf = requestAnimationFrame(() => edges(sc)); }, { passive: true }); }
  if (sc && LL.scrolled !== sc.dataset.key) { // first time on this timeline (or a new zoom): today a quarter of the way in
    LL.scrolled = sc.dataset.key;
    sc.scrollLeft = Math.max(0, +sc.dataset.today - (sc.clientWidth - labW(sc)) / 4);
  } else if (sc && LL.pos.tl && LL.pos.tl.key === sc.dataset.key) { sc.scrollLeft = LL.pos.tl.left; sc.scrollTop = LL.pos.tl.top; } // redrawn after a change: where it was
  const bd = document.getElementById('bd');
  if (bd) {
    if (!bd.dataset.wired) { bd.dataset.wired = '1'; bd.addEventListener('scroll', () => { LL.pos.bd = { key: bd.dataset.key, left: bd.scrollLeft }; }, { passive: true }); }
    if (LL.pos.bd && LL.pos.bd.key === bd.dataset.key) bd.scrollLeft = LL.pos.bd.left;
    bd.querySelectorAll('.bd-list').forEach((l) => { const k = bd.dataset.key + '|' + l.closest('.bd-col').dataset.col; if (LL.pos[k] != null) l.scrollTop = LL.pos[k]; if (!l.dataset.wired) { l.dataset.wired = '1'; l.addEventListener('scroll', () => { LL.pos[k] = l.scrollTop; }, { passive: true }); } });
  }
  if (sc) edges(sc);
  document.querySelector('.bd-menu .bd-mi:not([disabled]):not(.cur)')?.focus();
  if (LL.dates) document.querySelector('.tl-pop input')?.focus();
}
const labW = (sc) => sc.querySelector('.tl-corner')?.getBoundingClientRect().width || 200;

// Dragging with a mouse or pen. Touch keeps scrolling, and uses ⋯ / tap instead.
let drag = null, swallow = false;
document.addEventListener('pointerdown', (e) => {
  if (!E || e.button !== 0 || e.pointerType === 'touch') return;
  const card = e.target.closest('.bd-card.can-move');
  const bar = e.target.closest('.tl-bar.can-move');
  if (card && !e.target.closest('.bd-more, .bd-menu')) drag = { kind: 'card', el: card, id: card.dataset.rec, x: e.clientX, y: e.clientY, on: false };
  else if (bar) drag = { kind: 'bar', el: bar, id: bar.dataset.rec, part: e.target.closest('.tl-h')?.dataset.part || 'move', x: e.clientX, from: bar.dataset.from, to: bar.dataset.to, left: parseFloat(bar.style.left), width: parseFloat(bar.style.width), on: false, days: 0 };
});
document.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = (e.clientY - (drag.y || 0));
  if (!drag.on) { if (Math.hypot(dx, drag.kind === 'card' ? dy : 0) < 6) return; start(e); }
  e.preventDefault();
  if (drag.kind === 'card') {
    drag.ghost.style.transform = `translate(${e.clientX - drag.ox}px, ${e.clientY - drag.oy}px) rotate(1.5deg)`;
    const col = document.elementsFromPoint(e.clientX, e.clientY).map((x) => x.closest && x.closest('.bd-col')).find(Boolean);
    document.querySelectorAll('.bd-col.over').forEach((c) => c !== col && c.classList.remove('over'));
    drag.col = col && drag.ok.has(col.dataset.col) ? col.dataset.col : null;
    if (col && drag.col != null) col.classList.add('over');
  } else {
    const pd = parseFloat(getComputedStyle(document.getElementById('tl')).getPropertyValue('--pd')) || 12;
    const n = Math.round(dx / pd);
    if (n === drag.days) return;
    drag.days = n;
    const s = shiftSpan({ from: drag.from, to: drag.to }, drag.part, n);
    drag.span = s;
    drag.el.style.left = (drag.left + dayDiff(drag.from, s.from) * pd) + 'px';
    drag.el.style.width = Math.max(pd, (dayDiff(s.from, s.to) + 1) * pd) + 'px';
    drag.tip.textContent = spanText(s);
  }
});
function start(e) {
  drag.on = true;
  if (drag.kind === 'card') {
    const rec = E.H.recById(drag.id);
    drag.ok = rec ? targetsOf(E.form, E.cfg.layout.by, rec, who(rec)) : new Map();
    const r = drag.el.getBoundingClientRect();
    drag.ox = e.clientX - r.left; drag.oy = e.clientY - r.top;
    drag.ghost = drag.el.cloneNode(true); drag.ghost.classList.add('bd-ghost'); drag.ghost.style.width = r.width + 'px';
    document.body.appendChild(drag.ghost);
    drag.el.classList.add('dragging');
    document.querySelectorAll('.bd-col').forEach((c) => c.classList.toggle('no-drop', !drag.ok.has(c.dataset.col) && c !== drag.el.closest('.bd-col')));
    document.getElementById('bd')?.classList.add('dragging');
  } else {
    drag.el.classList.add('dragging');
    drag.tip = document.createElement('span'); drag.tip.className = 'tl-tip'; drag.el.appendChild(drag.tip);
    drag.tip.textContent = spanText({ from: drag.from, to: drag.to });
  }
}
document.addEventListener('pointerup', async () => {
  const d = drag; drag = null;
  if (!d || !d.on) return;
  swallow = true; setTimeout(() => { swallow = false; }, 0); // the click that ends a drag doesn't open the record
  if (d.kind === 'card') {
    d.ghost.remove(); d.el.classList.remove('dragging');
    document.querySelectorAll('.bd-col').forEach((c) => c.classList.remove('over', 'no-drop'));
    document.getElementById('bd')?.classList.remove('dragging');
    if (d.col != null) await moveTo(d.id, d.col);
  } else {
    d.tip?.remove(); d.el.classList.remove('dragging');
    if (d.span && (d.span.from !== d.from || d.span.to !== d.to)) await saveSpan(d.id, { from: d.span.from, to: E.cfg.layout.end ? d.span.to : '' });
    else E.repaint();
  }
});
document.addEventListener('click', (e) => { if (swallow) { e.stopPropagation(); e.preventDefault(); } }, true);

/* ---------- clicks and changes (lists.js passes them on) ---------- */

export async function onClick(a, el, e) {
  const v = el.dataset.v;
  switch (a) {
    case 'kind': E.setLayout({ kind: v }); LL.menu = null; LL.dates = null; return true;
    case 'zoom': E.setLayout({ zoom: v }); return true;
    case 'today': { const sc = document.getElementById('tl-scroll'); if (sc) sc.scrollTo({ left: Math.max(0, +sc.dataset.today - (sc.clientWidth - labW(sc)) / 4), behavior: 'smooth' }); return true; }
    case 'menu': LL.menu = LL.menu === v ? null : v; E.repaint(); if (!LL.menu) document.querySelector(`.bd-more[data-v="${CSS.escape(v)}"]`)?.focus(); return true;
    case 'move': await moveTo(v, el.dataset.col); return true;
    case 'dates': if (e && e.target.closest('.tl-pop')) return true; LL.dates = LL.dates === v ? null : v; E.repaint(); return true;
    case 'dates-cancel': { const id = LL.dates; LL.dates = null; E.repaint(); document.querySelector(`.tl-bar[data-rec="${CSS.escape(id || '')}"]`)?.focus(); return true; }
    case 'dates-save': {
      const pop = el.closest('.tl-pop'), from = pop.querySelector('[data-llc="d-from"]').value, to = pop.querySelector('[data-llc="d-to"]')?.value || '';
      if (!from) { pop.querySelector('[data-llc="d-from"]').focus(); return true; }
      await saveSpan(v, { from, to: to && to < from ? from : to });
      return true;
    }
  }
  return false;
}
export function onChange(t) {
  const k = t.dataset.llc;
  if (['by', 'sum', 'start', 'end', 'color'].includes(k)) { E.setLayout({ [k]: t.value }); return true; }
  return false;
}
export function onKey(e) {
  if (e.key === 'Escape' && (LL.menu || LL.dates)) {
    const back = LL.menu ? `.bd-more[data-v="${CSS.escape(LL.menu)}"]` : `.tl-bar[data-rec="${CSS.escape(LL.dates)}"]`;
    LL.menu = null; LL.dates = null; E.repaint(); document.querySelector(back)?.focus(); e.preventDefault(); return true;
  }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.tl-bar[data-ll="dates"]')) { e.preventDefault(); LL.dates = e.target.dataset.rec; E.repaint(); return true; }
  return false;
}
/** A click outside an open Move to closes it. */
export function closeMenus(target) {
  if (LL.menu && !target.closest('.bd-menu, .bd-more')) { LL.menu = null; return true; }
  if (LL.dates && !target.closest('.tl-pop, .tl-bar')) { LL.dates = null; return true; }
  return false;
}

const ICON = {
  table: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 10v10"/></svg>',
  board: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="7" rx="1.5"/></svg>',
  timeline: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h9M8 12h11M6 18h7"/></svg>',
  more: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
};
