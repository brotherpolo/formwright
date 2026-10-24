// Settings → Problems (administrators): what went wrong for people in Formwright and Cadence and
// for the server's own jobs, grouped, newest first, with the details; how the nightly backup
// went; and the morning email. Reports older than 30 days are cleared by the server.

import { store, clearProblems, setProblemEmail } from './store.js';
import { esc, toast } from './ui.js';
import { groupProblems, backupText } from './problemlogic.js';

const SEEN = 'fw.problemsSeen';
const P = { app: 'all', open: new Set(), confirm: '', busy: false, since: 0 };
let H = null; // { renderMain }
export function initProblems(h) { H = h; }

const seenAt = () => { try { return +localStorage.getItem(SEEN) || 0; } catch (e) { return 0; } };
/** New since this admin last looked: the number on the Settings card. */
export const freshCount = () => { const s = seenAt(); return (store.problems || []).filter((p) => (p.at || 0) > s).length; };
export function markSeen() { try { localStorage.setItem(SEEN, String(Date.now())); } catch (e) { /* private mode */ } }
/** Opening the page: what's new is marked New this visit, and the Settings card's count clears. */
export function enterProblems() { P.since = seenAt(); P.confirm = ''; markSeen(); }

const APPS = [['all', 'All'], ['formwright', 'Forms'], ['cadence', 'Plan'], ['server', 'Server']];
const appName = (a) => (APPS.find((x) => x[0] === a) || [a, a])[1];
const when = (t) => new Date(t).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
function ago(t, now = Date.now()) {
  const m = Math.round((now - t) / 60e3);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

export function viewProblems() {
  const all = groupProblems(store.problems || [], P.since);
  const list = P.app === 'all' ? all : all.filter((g) => g.app === P.app);
  const counts = Object.fromEntries(APPS.map(([k]) => [k, k === 'all' ? all.length : all.filter((g) => g.app === k).length]));
  const b = backupText(store.backup, Date.now(), when);
  const mine = (store.problemNotify || []).includes(store.user?.uid);
  const seg = APPS.map(([k, l]) => `<button type="button" class="${P.app === k ? 'on' : ''}" aria-pressed="${P.app === k}" data-act="pb-app" data-v="${k}">${esc(l)}${counts[k] ? ` <b>${counts[k]}</b>` : ''}</button>`).join('');
  const row = (g) => {
    const open = P.open.has(g.key), p = g.latest || {};
    const people = g.people.length ? `${g.people.slice(0, 3).map(esc).join(', ')}${g.people.length > 3 ? ` and ${g.people.length - 3} more` : ''}` : '';
    return `<article class="pb-g${g.fresh ? ' fresh' : ''}" data-k="${esc(g.key)}">
      <div class="pb-top"><span class="chip pb-app pb-${esc(g.app)}">${esc(appName(g.app))}</span>${g.fresh ? '<span class="chip acc">New</span>' : ''}<span class="pb-where">${esc(g.where || 'Somewhere')}</span></div>
      <p class="pb-msg">${esc(g.message)}</p>
      <p class="pb-meta"><b>${g.n === 1 ? 'Once' : g.n + ' times'}</b>${people ? ` · ${people}` : ''} · last ${esc(ago(g.last))}${g.n > 1 ? ` · first ${esc(when(g.first))}` : ''}</p>
      <div class="pb-acts"><button type="button" class="btn sm ghost" data-act="pb-open" data-v="${esc(g.key)}" aria-expanded="${open}">${open ? 'Hide details' : 'Details'}</button><button type="button" class="btn sm" data-act="pb-clear" data-v="${esc(g.key)}">Clear</button></div>
      ${open ? `<dl class="pb-det">${p.code ? `<dt>Code</dt><dd><code>${esc(p.code)}</code></dd>` : ''}<dt>Last</dt><dd>${esc(when(p.at))}${p.name ? ` · ${esc(p.name)}` : ''}</dd>${p.url ? `<dt>Page</dt><dd><code>${esc(p.url)}</code></dd>` : ''}${p.agent ? `<dt>Browser</dt><dd>${esc(p.agent)}</dd>` : ''}${p.detail ? `<dt>Details</dt><dd><pre>${esc(p.detail)}</pre></dd>` : ''}</dl>` : ''}
    </article>`;
  };
  return `<div class="head"><div class="ttl"><div><h1>Problems</h1><p class="sub">What went wrong for people in Forms and Plan, and for the server’s own jobs (emails, automations, the nightly backup). Reports clear themselves after 30 days.</p></div></div></div>
  <div class="panel pb-bk ${b.ok === true ? 'ok' : b.ok === false ? 'bad' : ''}" role="status"><span class="pb-dot" aria-hidden="true"></span><span>${esc(b.text)}</span></div>
  <div class="pb-bar"><div class="db-seg" role="group" aria-label="Show">${seg}</div><span class="grow"></span>
    <label class="switch pb-mail"><input type="checkbox" data-act-change="pb-email"${mine ? ' checked' : ''}><span class="tr"></span><span>Email me each morning when there are new ones</span></label>
    ${all.length ? (P.confirm === 'all' ? `<button type="button" class="btn danger armed" data-act="pb-clearall">Tap again to clear ${list.length === all.length ? 'all' : 'these'}</button>` : `<button type="button" class="btn" data-act="pb-clearall">Clear ${list.length === all.length ? 'all' : 'these'}</button>`) : ''}</div>
  ${list.length ? `<div class="pb-list">${list.map(row).join('')}</div>` : `<div class="panel empty"><h2>${all.length ? 'Nothing here' : 'Nothing has gone wrong'}</h2><p>${all.length ? 'No problems from ' + esc(appName(P.app)) + ' in the last 30 days.' : 'No problems in the last 30 days. If something fails for anyone, it shows up here.'}</p></div>`}`;
}

export async function onClick(act, el) {
  if (!act.startsWith('pb-')) return false;
  const v = el.dataset.v;
  if (act === 'pb-app') { P.app = v; P.confirm = ''; H.renderMain(); return true; }
  if (act === 'pb-open') { if (P.open.has(v)) P.open.delete(v); else P.open.add(v); H.renderMain(); return true; }
  const groups = groupProblems(store.problems || []);
  const clear = async (ids, msg) => {
    if (P.busy) return; P.busy = true;
    try { await clearProblems(ids); toast(msg); } catch (e) { console.warn('[formwright] clear problems', e?.code || e); toast('Those couldn’t be cleared. Try again.'); }
    P.busy = false; P.confirm = ''; H.renderMain();
  };
  if (act === 'pb-clear') { const g = groups.find((x) => x.key === v); if (g) await clear(g.ids, g.n === 1 ? 'Cleared' : `Cleared ${g.n} reports`); return true; }
  if (act === 'pb-clearall') {
    if (P.confirm !== 'all') { P.confirm = 'all'; H.renderMain(); return true; }
    const ids = groups.filter((g) => P.app === 'all' || g.app === P.app).flatMap((g) => g.ids);
    await clear(ids, `Cleared ${ids.length} report${ids.length === 1 ? '' : 's'}`);
    return true;
  }
  return false;
}

export async function onChange(t) {
  if (t.dataset.actChange !== 'pb-email') return false;
  try { await setProblemEmail(t.checked); toast(t.checked ? 'You’ll get an email at 7:05 a.m. when there are new problems.' : 'No more problem emails.'); }
  catch (e) { console.warn('[formwright] problem email', e?.code || e); t.checked = !t.checked; toast('That didn’t save. Try again.'); }
  return true;
}
