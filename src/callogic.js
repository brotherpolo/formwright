// The Calendar (Workspace → Calendar): what's on each day. Pure functions, unit-tested.
//
// Kinds, each with its own colour:
//   task   Cadence tasks that are mine (or given to a role I hold), on their due date and time
//   wf     records waiting on me (or a group or role I'm in) at a workflow stage with a due date
//   rep    dashboard emails (administrators), every send from today on
//   auto   automations (administrators), from today on: scheduled runs, the heads-up the day
//          before, and "N days before a date" ones for each record (7:00 a.m.)
//   ok     approve-first sends waiting for an OK (administrators), on today
//   rec    form dates: date fields switched on for the calendar (Form designer), one per record
//
// Days are 'YYYY-MM-DD' in the company's calendar (Settings → Dates and time), weeks start on
// its week-start day.

import { parseLocal, dayKeyOf, startOf, nextOf, wall, MONTH, dayName } from './cal.js';
import { normalize as normSchedule, nextRuns } from './autosched.js';
import { nextSend } from './dashmail.js';

export const KINDS = [
  ['task', 'Tasks'], ['wf', 'Workflow due'], ['rep', 'Scheduled reports'], ['auto', 'Automations'], ['ok', 'Waiting for your OK'], ['rec', 'Form dates'],
];
export const ADMIN_KINDS = new Set(['rep', 'auto', 'ok']);
export const VIEWS = ['month', 'week', 'list'];

const key = (t) => dayKeyOf(t);
export const addDays = (k, n) => key(nextOf(parseLocal(k), 'day', n));

/**
 * The days a view shows around a day: month (whole weeks covering the month), week or list
 * (the week it's in). { days: [key], from, to (the day after the last), title, month: 'YYYY-MM' }
 */
export function viewRange(view, anchor) {
  const a = parseLocal(anchor) ?? startOf(Date.now(), 'day');
  if (view === 'month') {
    const m0 = startOf(a, 'month'), m1 = nextOf(m0, 'month');
    const s = startOf(m0, 'week');
    let e = startOf(m1 - 1, 'week'); e = nextOf(e, 'week');
    const days = []; for (let t = s; t < e; t = nextOf(t, 'day')) days.push(key(t));
    const w = wall(m0);
    return { days, from: days[0], to: key(e), title: `${MONTH[w.m]} ${w.y}`, month: key(m0).slice(0, 7) };
  }
  const s = startOf(a, 'week'), e = nextOf(s, 'week');
  const days = []; for (let t = s; t < e; t = nextOf(t, 'day')) days.push(key(t));
  const ws = wall(s), we = wall(e - 1);
  const title = ws.m === we.m ? `${MONTH[ws.m].slice(0, 3)} ${ws.d} – ${we.d}, ${we.y}` : ws.y === we.y ? `${MONTH[ws.m].slice(0, 3)} ${ws.d} – ${MONTH[we.m].slice(0, 3)} ${we.d}, ${we.y}` : `${dayName(s)} – ${dayName(e - 1)}`;
  return { days, from: days[0], to: key(e), title, month: key(s).slice(0, 7) };
}
/** The day a ‹ or › goes to: a month or a week away. */
export function step(view, anchor, dir) {
  const a = parseLocal(anchor) ?? startOf(Date.now(), 'day');
  return key(view === 'month' ? nextOf(startOf(a, 'month'), 'month', dir) : nextOf(startOf(a, 'week'), 'week', dir));
}

/** '9:00 a.m.' from 'HH:MM' or an hour; '' for none. */
export function timeText(t) {
  if (t == null || t === '') return '';
  const [h, m] = typeof t === 'number' ? [t, 0] : String(t).split(':').map(Number);
  if (!Number.isFinite(h)) return '';
  if (h === 0 && !m) return 'midnight';
  if (h === 12 && !m) return 'noon';
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${h < 12 ? 'a.m.' : 'p.m.'}`;
}
const hhmm = (h) => `${String(h).padStart(2, '0')}:00`;
const inRange = (d, r) => d && d >= r.from && d < r.to;

/**
 * Everything on the calendar between r.from and r.to.
 * env: { me, today, tasks, wf: [{ rec, form, due, stage, late, who }], dashMails, dashboards,
 *        automations, pendingSends, records, formById, recTitle, recById, isAdmin, timeZone }
 * → [{ id, kind, day, time ('HH:MM' or ''), title, meta, done, late, go }] sorted by day, then time.
 */
export function itemsFor(env, r) {
  const out = [];
  const today = env.today;
  // tasks
  (env.tasks || []).forEach((t) => {
    if (!inRange(t.due, r)) return;
    const rec = t.recordId && env.recById ? env.recById(t.recordId) : null;
    const who = t.assigneeRole ? `for ${t.assigneeRoleName || 'a role'}` : t.ownerId === env.me ? (t.assigneeId && t.assigneeId !== env.me ? `given to ${t.assigneeName || t.assigneeEmail || 'someone'}` : 'yours') : `from ${t.ownerName || 'someone'}`;
    out.push({ id: 't:' + t.id, kind: 'task', day: t.due, time: t.time || '', title: t.title || 'Untitled task', done: !!t.done, late: !t.done && t.due < today,
      meta: ['Task', who, rec ? env.recTitle(rec) : '', t.repeat && t.repeat !== 'none' ? 'repeats' : ''].filter(Boolean).join(' · '), go: { task: t.id, recordId: t.recordId || null } });
  });
  // workflow due dates
  (env.wf || []).forEach((x) => {
    if (!inRange(x.due, r)) return;
    out.push({ id: 'w:' + x.rec.id, kind: 'wf', day: x.due, time: '', title: `${env.recTitle(x.rec)} · ${x.stage}`, late: x.due < today,
      meta: `${x.form.name} › ${x.stage} · ${x.who}${x.due < today ? ' · overdue' : ''}`, go: { recordId: x.rec.id } });
  });
  // form dates
  (env.records || []).forEach((rec) => {
    const form = env.formById(rec.formId);
    (form?.fields || []).forEach((f) => {
      if (!f.calendar || (f.type !== 'date' && f.type !== 'datetime')) return;
      const v = rec.values?.[f.id];
      if (!v) return;
      const t = parseLocal(String(v)) ?? (typeof v === 'number' ? v : null);
      if (t == null) return;
      const day = key(t);
      if (!inRange(day, r)) return;
      const w = wall(t);
      out.push({ id: `r:${rec.id}:${f.id}`, kind: 'rec', day, time: f.type === 'datetime' && String(v).length > 10 ? `${String(w.h).padStart(2, '0')}:${String(w.mi).padStart(2, '0')}` : '',
        title: `${env.recTitle(rec)} · ${f.label || 'Date'}`, meta: `${form.name} · ${f.label || 'Date'}`, go: { recordId: rec.id } });
    });
  });
  if (env.isAdmin) {
    // what's still to come (past sends and runs aren't listed: they've happened, or didn't)
    const ahead = (d) => inRange(d, r) && d >= today;
    // dashboard emails
    const tz = env.timeZone || 'America/Toronto';
    const fromMs = parseLocal(r.from), toMs = parseLocal(r.to);
    Object.values(env.dashMails || {}).forEach((s) => {
      if (!s || !s.on) return;
      const id = s.dashboardId || s.id, d = (env.dashboards || []).find((x) => x.id === id);
      const n = (s.to?.people || []).length + (s.to?.roles || []).length + String(s.to?.addresses || '').split(/[,;\s]+/).filter(Boolean).length;
      let at = fromMs - 3600e3;
      for (let i = 0; i < 400; i++) {
        const nx = nextSend(s, at, tz);
        if (!nx || nx.ms >= toMs) break;
        at = nx.ms;
        if (nx.ms < fromMs || nx.key < today) continue;
        out.push({ id: `e:${id}:${nx.key}`, kind: 'rep', day: nx.key, time: hhmm(nx.hour), title: d?.name || 'A deleted dashboard',
          meta: `Dashboard email · to ${n} ${n === 1 ? 'recipient' : 'recipients'}`, go: { dashboardId: id } });
      }
    });
    // automations
    (env.automations || []).forEach((a) => {
      if (!a.on) return;
      const t = a.trigger || {}, form = env.formById(a.formId);
      if (t.type === 'schedule') {
        const s = normSchedule(t);
        const runs = nextRuns(s, addDays(r.from, -1) + 'T00:00', 62).filter((d) => d <= addDays(r.to, 1));
        runs.forEach((d) => {
          if (ahead(d)) out.push({ id: `a:${a.id}:${d}`, kind: 'auto', day: d, time: hhmm(s.hour ?? 17), title: a.name || 'Untitled automation',
            meta: `Scheduled automation${form ? ' · ' + form.name : ''}${s.approve ? ' · needs your OK first' : ''}`, go: { automationId: a.id } });
          const hd = addDays(d, -1);
          if (s.headsUp && s.freq !== 'day' && ahead(hd)) out.push({ id: `h:${a.id}:${hd}`, kind: 'auto', day: hd, time: hhmm(s.hour ?? 17), title: `Heads-up: ${a.name || 'Untitled automation'}`,
            meta: `Runs tomorrow${s.approve ? ', waiting for your OK' : ''}`, go: { automationId: a.id } });
        });
      } else if (t.type === 'date' && form) {
        const f = (form.fields || []).find((x) => x.id === t.dateField);
        if (!f) return;
        const n = Math.max(0, Math.round(Number(t.days) || 0)), shift = t.rel === 'before' ? -n : t.rel === 'after' ? n : 0;
        (env.records || []).forEach((rec) => {
          if (rec.formId !== form.id) return;
          const v = rec.values?.[f.id]; const tt = v ? parseLocal(String(v).slice(0, 10)) : null;
          if (tt == null) return;
          const d = addDays(key(tt), shift);
          if (ahead(d)) out.push({ id: `d:${a.id}:${rec.id}`, kind: 'auto', day: d, time: '07:00', title: `${a.name || 'Untitled automation'} · ${env.recTitle(rec)}`,
            meta: `Automation · ${shift ? `${n} day${n === 1 ? '' : 's'} ${shift < 0 ? 'before' : 'after'}` : 'on'} its ${f.label}, if its “Only if” holds`, go: { automationId: a.id } });
        });
      }
    });
    // waiting for an OK: on today
    (env.pendingSends || []).forEach((p) => {
      if (!inRange(today, r)) return;
      const a = (env.automations || []).find((x) => x.id === p.automationId), rec = p.recordId && env.recById ? env.recById(p.recordId) : null;
      out.push({ id: 'p:' + p.id, kind: 'ok', day: today, time: '', title: `OK to send: ${rec ? env.recTitle(rec) : p.title || 'a record'}`,
        meta: `Waiting for your OK · ${a?.name || 'an automation'}`, go: { recordId: p.recordId || null } });
    });
  }
  const ord = Object.fromEntries(KINDS.map(([k], i) => [k, i]));
  return out.sort((a, b) => a.day.localeCompare(b.day) || (a.time ? 0 : -1) - (b.time ? 0 : -1) || a.time.localeCompare(b.time) || ord[a.kind] - ord[b.kind] || a.title.localeCompare(b.title));
}
