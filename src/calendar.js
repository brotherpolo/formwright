// Workspace → Calendar: tasks, workflow due dates, scheduled reports, automations, OKs waiting
// and form dates, by day, each kind in its own colour (callogic.js works out what's on).
// Month, Week and List; phones start on List. The legend hides or shows a kind (remembered on
// this device). A day opens on the right with what's on it and a button for each.

import { store, watchMyTasks, canUseTasks } from './store.js';
import { esc, toast } from './ui.js';
import { isAdmin } from './access.js';
import { dayKeyOf, parseLocal, wall, dayName } from './cal.js';
import { KINDS, ADMIN_KINDS, VIEWS, viewRange, step, itemsFor, timeText } from './callogic.js';
import { open as openTask, toggleDone } from './taskmodal.js';
import { cadenceLink } from './tasks.js';

let H = null; // { go, renderMain, recById, formById, recTitle, wfItems, cadenceUrl, openRecord }
export function initCalendar(helpers) { H = helpers; }

const LS_VIEW = 'fw.calView', LS_OFF = 'fw.calOff';
const read = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } };
const phone = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 700px)').matches;

const S = { view: null, anchor: null, sel: null, tasks: [], tasksOn: false, unsub: null, err: '', items: new Map() };
export const calTasks = () => S.tasks;

/** Start or stop listening for my tasks as the Calendar opens and closes. */
export function sync(open) {
  if (open && !S.unsub && canUseTasks()) {
    S.unsub = watchMyTasks((l) => { S.tasks = l; S.tasksOn = true; S.err = ''; H.renderMain(); }, (e) => { console.warn('[formwright] calendar tasks', e?.code || e); S.err = e?.code || 'error'; S.tasksOn = true; H.renderMain(); });
  } else if (!open && S.unsub) { S.unsub(); S.unsub = null; S.tasks = []; S.tasksOn = false; }
}

const today = () => dayKeyOf(Date.now());
function env() {
  return {
    me: store.user?.uid, today: today(), tasks: S.tasks, wf: H.wfItems(), records: store.records, formById: H.formById, recById: H.recById, recTitle: H.recTitle,
    isAdmin: isAdmin(store.me), dashMails: store.dashMails, dashboards: store.dashboards, automations: store.automations, pendingSends: store.pendingSends, timeZone: 'America/Toronto',
  };
}
const kindsFor = () => KINDS.filter(([k]) => isAdmin(store.me) || !ADMIN_KINDS.has(k));

function itemHTML(x, full) {
  return `<button type="button" class="cal-it${x.done ? ' done' : ''}${x.late ? ' late' : ''}" style="--c:var(--k-${x.kind})" data-act="cv-open" data-id="${esc(x.id)}" title="${esc((x.time ? timeText(x.time) + ' · ' : '') + x.title + ' — ' + x.meta)}">${x.time ? `<span class="tm">${esc(timeText(x.time).replace(':00', '').replace(/ ([ap])\.m\./, '$1m'))}</span>` : ''}<span class="tx">${esc(x.title)}</span>${full ? `<span class="mt">${esc(x.meta)}</span>` : ''}</button>`;
}
const ACT = { task: 'Open', wf: 'Open record', rec: 'Open record', ok: 'Review', rep: 'Open dashboard', auto: 'Open automation' };
function rowHTML(x) {
  const task = x.kind === 'task' ? S.tasks.find((t) => x.go.task === t.id) : null;
  return `<div class="cal-row" style="--c:var(--k-${x.kind})"><i aria-hidden="true"></i><div class="b">
    <span class="t${x.done ? ' done' : ''}">${x.time ? esc(timeText(x.time)) + ' · ' : ''}${esc(x.title)}</span>
    <span class="m">${esc(x.meta)}${x.late ? ` · <b class="cal-late">${x.kind === 'task' ? 'overdue' : 'late'}</b>` : ''}</span>
    <span class="a">${task && !task.recordId && H.cadenceUrl ? `<a class="btn sm" href="${esc(cadenceLink(H.cadenceUrl, { task: task.id }))}" target="cadence" rel="noopener">Open in Plan</a>` : `<button type="button" class="btn sm" data-act="cv-open" data-id="${esc(x.id)}">${ACT[x.kind]}</button>`}${task ? `<button type="button" class="btn sm ghost" data-act="cv-done" data-id="${esc(x.id)}">${task.done ? 'Not done' : 'Done'}</button>` : ''}</span></div></div>`;
}

export function viewCalendar() {
  if (!S.view) S.view = VIEWS.includes(read(LS_VIEW, '')) ? read(LS_VIEW, '') : phone() ? 'list' : 'month';
  if (!S.anchor) S.anchor = today();
  const off = new Set(read(LS_OFF, []));
  const r = viewRange(S.view, S.anchor);
  const all = itemsFor(env(), r);
  S.items = new Map(all.map((x) => [x.id, x]));
  const shown = all.filter((x) => !off.has(x.kind));
  const byDay = new Map(); shown.forEach((x) => { if (!byDay.has(x.day)) byDay.set(x.day, []); byDay.get(x.day).push(x); });
  const t = today();
  if (!S.sel || !r.days.includes(S.sel)) S.sel = r.days.includes(t) ? t : S.view === 'month' ? r.days.find((d) => d.slice(0, 7) === r.month) : r.days[0];
  const counts = new Map(); all.forEach((x) => counts.set(x.kind, (counts.get(x.kind) || 0) + 1));
  const keys = kindsFor().map(([k, l]) => `<button type="button" class="cal-key${off.has(k) ? ' off' : ''}" style="--c:var(--k-${k})" data-act="cv-key" data-v="${k}" aria-pressed="${!off.has(k)}"><i aria-hidden="true"></i>${esc(l)} <b>${counts.get(k) || 0}</b></button>`).join('');
  const dows = r.days.slice(0, 7).map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][wall(parseLocal(d)).dow]);
  const seg = VIEWS.map((v) => `<button type="button" class="${S.view === v ? 'on' : ''}" aria-pressed="${S.view === v}" data-act="cv-view" data-v="${v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('');
  const head = `<div class="head"><div class="ttl"><div><h1>Calendar</h1><p class="sub">Your tasks, workflow due dates${isAdmin(store.me) ? ', scheduled reports, automations' : ''} and form dates, by day.</p></div></div></div>
    <div class="cal-top"><div class="cal-nav" role="group" aria-label="Move"><button type="button" data-act="cv-step" data-v="-1" aria-label="${S.view === 'month' ? 'Previous month' : 'Previous week'}">‹</button><button type="button" data-act="cv-today">Today</button><button type="button" data-act="cv-step" data-v="1" aria-label="${S.view === 'month' ? 'Next month' : 'Next week'}">›</button></div>
      <h2 class="cal-title" aria-live="polite">${esc(r.title)}</h2><span class="grow"></span><div class="db-seg" role="group" aria-label="View">${seg}</div></div>
    <div class="cal-keys" role="group" aria-label="Show or hide">${keys}</div>
    ${S.err && canUseTasks() ? `<p class="help cal-warn">Your tasks couldn’t be read (${esc(S.err)}). Everything else is here.</p>` : ''}`;
  const selItems = byDay.get(S.sel) || [];
  const side = `<aside class="cal-side" aria-label="${esc(dayName(parseLocal(S.sel), { weekday: true }))}"><h3>${S.sel === t ? 'Today · ' : ''}${esc(dayName(parseLocal(S.sel), { weekday: true, year: false }))}</h3><p class="sub">${selItems.length ? `${selItems.length} thing${selItems.length === 1 ? '' : 's'}` : 'Nothing on this day.'}</p>${selItems.map(rowHTML).join('')}</aside>`;
  if (S.view === 'list') {
    const days = r.days.filter((d) => byDay.has(d) || d === t);
    return `<div class="cal">${head}<div class="cal-agenda">${days.length ? days.map((d) => `<section class="cal-ag"><h4 class="${d === t ? 'today' : ''}">${d === t ? 'Today · ' : ''}${esc(dayName(parseLocal(d), { weekday: true, year: false }))}</h4>${(byDay.get(d) || []).map(rowHTML).join('') || '<p class="help">Nothing today.</p>'}</section>`).join('') : '<div class="panel empty"><p>Nothing this week.</p></div>'}</div></div>`;
  }
  const max = S.view === 'month' ? 3 : 50;
  const cells = r.days.map((d, i) => {
    const its = byDay.get(d) || [], w = wall(parseLocal(d));
    const out = S.view === 'month' && d.slice(0, 7) !== r.month;
    return `<div class="cal-d${out ? ' out' : ''}${w.dow === 0 || w.dow === 6 ? ' we' : ''}${d === t ? ' today' : ''}${d === S.sel ? ' sel' : ''}" data-act="cv-day" data-v="${d}" role="gridcell" aria-selected="${d === S.sel}" aria-label="${esc(dayName(parseLocal(d), { weekday: true }))}${its.length ? `, ${its.length} thing${its.length === 1 ? '' : 's'}` : ''}"><span class="cal-n">${w.d}</span>${its.slice(0, max).map((x) => itemHTML(x, false)).join('')}${its.length > max ? `<button type="button" class="cal-more" data-act="cv-day" data-v="${d}">+${its.length - max} more</button>` : ''}</div>`;
  }).join('');
  return `<div class="cal">${head}<div class="cal-wrap"><div class="cal-grid cal-${S.view}" role="grid" aria-label="${esc(r.title)}"><div class="cal-dow" role="row">${dows.map((x) => `<span role="columnheader">${x}</span>`).join('')}</div><div class="cal-days" role="row">${cells}</div></div>${side}</div></div>`;
}

export async function onClick(a, el) {
  if (!a.startsWith('cv-')) return false;
  const v = el.dataset.v;
  if (a === 'cv-view') { S.view = v; write(LS_VIEW, v); H.renderMain(); return true; }
  if (a === 'cv-step') { S.anchor = step(S.view, S.anchor || today(), +v); S.sel = null; H.renderMain(); return true; }
  if (a === 'cv-today') { S.anchor = today(); S.sel = today(); H.renderMain(); return true; }
  if (a === 'cv-day') { S.sel = v; H.renderMain(); if (phone()) document.querySelector('.cal-side')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); return true; }
  if (a === 'cv-key') { const off = new Set(read(LS_OFF, [])); if (off.has(v)) off.delete(v); else off.add(v); write(LS_OFF, [...off]); H.renderMain(); return true; }
  const x = S.items.get(el.dataset.id);
  if (!x) return true;
  if (a === 'cv-done') {
    const t = S.tasks.find((y) => y.id === x.go.task); if (!t) return true;
    try { const r = await toggleDone(t); toast(r === 'next' ? 'Done. The next one is on the calendar.' : r === 'reopened' ? 'Marked not done.' : 'Done.'); } catch (e) { console.error(e); toast('That didn’t save. Check your connection.'); }
    return true;
  }
  if (a === 'cv-open') {
    if (x.kind === 'task') {
      const t = S.tasks.find((y) => y.id === x.go.task); if (!t) return true;
      if (t.recordId) openTask(t.recordId, t.id, { task: t });
      else if (H.cadenceUrl) window.open(cadenceLink(H.cadenceUrl, { task: t.id }), 'cadence', 'noopener'); // Plan opens that task (?task=)
      else toast('Open Plan to change this task.');
    } else if (x.kind === 'rep') H.go({ name: 'dashboard', dashboardId: x.go.dashboardId });
    else if (x.kind === 'auto') H.openAutomation(x.go.automationId);
    else if (x.go.recordId) H.openRecord(x.go.recordId);
    else H.go({ name: 'automations' });
    return true;
  }
  return false;
}
