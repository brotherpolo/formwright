// Settings → Dates and time: the company calendar every report and dashboard counts with
// (cal.js). One document, settings/calendar: { timeZone, weekStart, fyStart }. Administrators
// change it; everyone reads it. Without one: Toronto, weeks from Monday, the year from January.

import { store, saveCalendar } from './store.js';
import { renderMain } from './app.js';
import { esc, toast } from './ui.js';
import { normalizeCal, withCalendar, periodRangeFor, MONTH } from './calpreview.js';

let dr = null; // { timeZone, weekStart, fyStart, dirty, busy }

export const isDirty = () => !!dr?.dirty;
export function leave() { dr = null; }

const ZONES_FALLBACK = ['America/St_Johns', 'America/Halifax', 'America/Toronto', 'America/Winnipeg', 'America/Regina', 'America/Edmonton', 'America/Vancouver', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'Europe/London', 'UTC'];
function zones(cur) {
  let all = [];
  try { all = Intl.supportedValuesOf('timeZone'); } catch (e) { all = ZONES_FALLBACK; }
  if (!all.includes(cur)) all = [cur, ...all];
  return all;
}

export function viewCalendar() {
  if (!dr || (!dr.dirty && !dr.busy)) dr = { ...normalizeCal(store.calendar), dirty: false, busy: false }; // until changed here, follow the saved one
  const c = normalizeCal(dr);
  const p = periodRangeFor(c, Date.now());
  const seg = (k, l) => `<button type="button" class="${c.weekStart === k ? 'on' : ''}" aria-pressed="${c.weekStart === k}" data-act="cal-week" data-v="${k}">${l}</button>`;
  return `
  <div class="head"><div class="ttl"><div><h1>Dates and time</h1><p class="sub">How reports, dashboards and their emails count days, weeks, quarters and years, the same for everyone.</p></div></div></div>
  <div class="panel calset">
    <label class="flabel" for="cal-tz">Time zone</label>
    <select class="in" id="cal-tz" data-cal="timeZone">${zones(c.timeZone).map((z) => `<option value="${esc(z)}"${z === c.timeZone ? ' selected' : ''}>${esc(z.replace(/_/g, ' '))}</option>`).join('')}</select>
    <p class="help">Each day starts at midnight here, whatever time zone someone's device is set to, so a bill entered at 11 p.m. counts on that day for everyone.</p>
    <div class="flabel" style="margin-top:16px">Weeks start on</div>
    <div class="db-seg cal-seg" role="group" aria-label="Weeks start on">${seg(1, 'Monday')}${seg(0, 'Sunday')}</div>
    <p class="help">For This week, Last week and charts by week.</p>
    <label class="flabel" for="cal-fy" style="margin-top:16px">Fiscal year starts in</label>
    <select class="in" id="cal-fy" data-cal="fyStart">${MONTH.map((m, i) => `<option value="${i + 1}"${c.fyStart === i + 1 ? ' selected' : ''}>${m}</option>`).join('')}</select>
    <p class="help">For This quarter, Last quarter, This year, Last year, and charts by quarter or year. Starting in any month but January, they’re named by the year they end in: ${esc(p.fyExample)}.</p>
    <div class="cal-prev" aria-live="polite">
      <div class="flabel">With these settings, right now</div>
      <dl>${p.rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    </div>
    <div class="cal-act"><button type="button" class="btn ghost" data-act="cal-reset"${dr.dirty ? '' : ' disabled'}>Undo changes</button><button type="button" class="btn primary" data-act="cal-save"${dr.dirty && !dr.busy ? '' : ' disabled'}>${dr.busy ? 'Saving…' : 'Save'}</button></div>
  </div>`;
}

export async function onClick(a, el) {
  if (!a.startsWith('cal-')) return false;
  if (a === 'cal-week') { dr.weekStart = +el.dataset.v === 0 ? 0 : 1; dr.dirty = true; renderMain(); return true; }
  if (a === 'cal-reset') { dr = null; renderMain(); return true; }
  if (a === 'cal-save') {
    dr.busy = true; renderMain();
    try { await saveCalendar(normalizeCal(dr)); dr = null; toast('Saved. Reports and dashboards now use these dates.'); }
    catch (e) { console.error(e); dr.busy = false; toast(e?.code === 'permission-denied' ? 'Only administrators can change this.' : 'Saving failed. Check your connection and try again.'); }
    renderMain(); return true;
  }
  return false;
}
export function onChange(t) {
  const k = t.dataset.cal; if (!k || !dr) return false;
  dr[k] = k === 'fyStart' ? +t.value : t.value;
  dr.dirty = true; renderMain();
  return true;
}
