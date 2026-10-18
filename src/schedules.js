// Administration → Schedules: everything that goes out on its own, in one place. Dashboards emailed
// on a schedule (dashMails/{dashboardId}, sent by Cadence's dashMailer) and automations on a
// schedule (automations with trigger.type 'schedule', run by automationMonthly). Each row says
// when it next goes, who to, and how the last one went, with Pause / Resume, Edit, a test, Delete.
import { store, saveDashMail, deleteDashMail, testDashMail, setAutomationOn } from './store.js';
import { esc, toast, badge } from './ui.js';
import { scheduleText as mailText, nextSend } from './dashmail.js';
import { normalize, scheduleText as autoText, nextRun, hourText, dayText } from './autosched.js';

const TZ = 'America/Toronto';
let H = { go: null, renderMain: null, formById: null };
export function initSchedules(helpers) { H = { ...H, ...helpers }; }

const S = { busy: {}, armed: null };
const nameOfUser = (id) => store.profiles?.[id]?.displayName || store.users?.find((u) => u.id === id)?.displayName || 'Someone';
const roleName = (id) => (store.roles || []).find((r) => r.id === id)?.name || 'a removed role';
const when = (ms) => new Date(ms).toLocaleString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: TZ });
const localNow = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };

/** "Adam, Farren, everyone in Accounts and 2 more" */
export function whoText(to) {
  const t = to || {};
  const bits = [...(t.people || []).map(nameOfUser), ...(t.roles || []).map((r) => `everyone in ${roleName(r)}`), ...String(t.addresses || '').split(/[,;\s]+/).filter(Boolean)];
  if (!bits.length) return 'nobody yet';
  return bits.length <= 4 ? bits.join(', ') : `${bits.slice(0, 3).join(', ')} and ${bits.length - 3} more`;
}

function dashRows() {
  const dashes = store.dashboards || [];
  const now = Date.now();
  return Object.values(store.dashMails || {}).map((s) => {
    const d = dashes.find((x) => x.id === (s.dashboardId || s.id));
    const nx = nextSend(s, now, TZ);
    return { s, d, id: s.dashboardId || s.id, nx, sort: s.on ? (nx ? nx.ms : Infinity) : Infinity + 1 };
  }).sort((a, b) => a.sort - b.sort || String(a.d?.name || '').localeCompare(String(b.d?.name || '')));
}
function autoRows() {
  const local = localNow();
  return (store.automations || []).filter((a) => a.trigger?.type === 'schedule').map((a) => {
    const t = normalize(a.trigger), nx = a.on ? nextRun(t, local) : null;
    return { a, t, nx, sort: nx ? nx + 'T' + String(t.hour).padStart(2, '0') : '~' + (a.name || '') };
  }).sort((x, y) => x.sort.localeCompare(y.sort));
}

function lastLine(s) {
  if (!s.lastAt) return '<span class="help">Not sent yet.</span>';
  const ok = !s.lastStatus || s.lastStatus === 'sent';
  return ok
    ? `<span class="sc-ok">✓ Last sent ${esc(when(s.lastAt))}${(s.lastTo || []).length ? ` to ${(s.lastTo || []).length} ${(s.lastTo || []).length === 1 ? 'person' : 'people'}` : ''}</span>`
    : `<span class="sc-bad">⚠ ${esc(when(s.lastAt))}: ${esc(s.lastStatus)}</span>`;
}

export function viewSchedules() {
  const dr = dashRows(), ar = autoRows();
  const waiting = (id) => (store.pendingSends || []).filter((p) => p.automationId === id).length;
  const btn = (act, id, label, extra = '') => `<button type="button" class="btn sm${extra}" data-act="${act}" data-id="${esc(id)}"${S.busy[act + id] ? ' disabled' : ''}>${esc(label)}</button>`;
  const dashHTML = dr.length ? `<div class="panel flist">${dr.map(({ s, d, id, nx }) => `<div class="fcard sc-card${s.on ? '' : ' off'}">
      <span class="badge sc-ic" aria-hidden="true">✉</span>
      <div class="info"><b>${d ? `<button type="button" class="au-link" data-act="sc-dash" data-id="${esc(id)}">${esc(d.name || 'Dashboard')}</button>` : 'A deleted dashboard'}</b>
        <span class="help">${s.on ? `${esc(mailText(s))} (Eastern time)${nx ? ` · next: <strong>${esc(when(nx.ms))}</strong>` : ''}` : '<span class="chip warn">Paused</span>'}</span>
        <span class="help">To ${esc(whoText(s.to))}</span>
        <span class="help">${lastLine(s)}</span></div>
      <div class="ctl sc-ctl">${btn('sc-mail-on', id, s.on ? 'Pause' : 'Resume', ' ghost')}${d ? `<button type="button" class="btn sm" data-dm="open" data-v="${esc(id)}">Edit</button>` : ''}${d ? btn('sc-mail-test', id, S.busy['sc-mail-test' + id] ? 'Sending…' : 'Send me a test') : ''}${btn('sc-mail-del', id, S.armed === 'm' + id ? 'Tap again to delete' : 'Delete', ` danger${S.armed === 'm' + id ? ' armed' : ''}`)}</div>
    </div>`).join('')}</div>`
    : '<div class="panel empty"><h2>No dashboards are emailed yet</h2><p>Open a dashboard and choose <b>✉ Email schedule</b> to send it to people every weekday, week or month.</p></div>';
  const autoHTML = ar.length ? `<div class="panel flist">${ar.map(({ a, t, nx }) => { const f = H.formById ? H.formById(a.formId) : null; const w = waiting(a.id); return `<div class="fcard sc-card${a.on ? '' : ' off'}">
      ${f ? badge(f, 1) : '<span class="badge sc-ic" aria-hidden="true">↯</span>'}
      <div class="info"><b>${esc(a.name || 'Untitled automation')}</b>
        <span class="help">${a.on ? `${esc(autoText(t))}${nx ? ` · next: <strong>${esc(dayText(nx))} at ${esc(hourText(t.hour))}</strong>` : ''}` : '<span class="chip warn">Paused</span>'}</span>
        <span class="help">For each ${esc((f?.itemName || f?.name || 'record').toLowerCase())} that matches its “Only if”${t.approve ? ' · <span class="chip">Approve first</span>' : ''}${t.headsUp && t.freq !== 'day' ? ' · <span class="chip">Heads-up the day before</span>' : ''}</span>
        ${w ? `<span class="help"><button type="button" class="au-link" data-act="nav-automations">${w} waiting for your OK</button></span>` : ''}</div>
      <div class="ctl sc-ctl">${btn('sc-auto-on', a.id, a.on ? 'Pause' : 'Resume', ' ghost')}<button type="button" class="btn sm" data-act="am-edit" data-id="${esc(a.id)}">Edit</button></div>
    </div>`; }).join('')}</div>`
    : '<div class="panel empty"><h2>No scheduled automations</h2><p>In <button type="button" class="au-link" data-act="nav-automations">Automations</button>, choose <b>is due on a schedule</b>, for example to email invoices on the last business day of each month.</p></div>';
  return `<div class="head"><div class="ttl"><div><h1>Schedules</h1><p class="sub">Everything that goes out on its own: dashboards emailed on a schedule, and automations that run on a schedule. Times are Eastern. Only administrators see this page.</p></div></div></div>
    <section class="sc-sec" aria-labelledby="sc-h1"><h2 class="dz-h" id="sc-h1">Dashboard emails <span class="count">${dr.length}</span></h2>${dashHTML}</section>
    <section class="sc-sec" aria-labelledby="sc-h2"><h2 class="dz-h" id="sc-h2">Scheduled automations <span class="count">${ar.length}</span></h2>${autoHTML}</section>`;
}

/** How many are switched on (the sidebar's number). */
export const scheduleCount = () => Object.values(store.dashMails || {}).filter((s) => s.on).length + (store.automations || []).filter((a) => a.on && a.trigger?.type === 'schedule').length;

const busy = (k, on) => { if (on) S.busy[k] = 1; else delete S.busy[k]; H.renderMain(); };
export async function onClick(a, el) {
  if (!a.startsWith('sc-')) return false;
  const id = el.dataset.id;
  if (a === 'sc-dash') { H.go({ name: 'dashboard', dashboardId: id }); return true; }
  if (a === 'sc-mail-on') {
    const s = store.dashMails?.[id]; if (!s) return true;
    busy(a + id, true);
    try { await saveDashMail(id, { on: !s.on, freq: s.freq, day: s.day ?? 0, hour: s.hour ?? 8, to: s.to || {}, createdAt: s.createdAt || null }); toast(s.on ? 'Paused. It won’t be emailed until you resume it.' : `Resumed. ${mailText(s)}.`); }
    catch (e) { console.error(e); toast('That didn’t save. Check your connection.'); }
    busy(a + id, false); return true;
  }
  if (a === 'sc-mail-test') {
    busy(a + id, true);
    try { const r = await testDashMail(id); toast(`Sent to ${r?.to || 'you'}. It can take a minute to arrive.`); }
    catch (e) { console.error(e); toast('The test didn’t send: ' + (e?.message || 'unknown error') + '.'); }
    busy(a + id, false); return true;
  }
  if (a === 'sc-mail-del') {
    if (S.armed !== 'm' + id) { S.armed = 'm' + id; H.renderMain(); setTimeout(() => { if (S.armed === 'm' + id) { S.armed = null; H.renderMain(); } }, 5000); return true; }
    S.armed = null; busy(a + id, true);
    try { await deleteDashMail(id); toast('Schedule deleted. The dashboard is kept.'); }
    catch (e) { console.error(e); toast('Couldn’t delete it. Check your connection.'); }
    busy(a + id, false); return true;
  }
  if (a === 'sc-auto-on') {
    const x = (store.automations || []).find((y) => y.id === id); if (!x) return true;
    busy(a + id, true);
    try { await setAutomationOn(id, !x.on); toast(x.on ? 'Paused.' : 'Resumed.'); }
    catch (e) { console.error(e); toast('That didn’t save. Check your connection.'); }
    busy(a + id, false); return true;
  }
  return false;
}
