// Web addresses for Formwright screens: every page has one, so a refresh keeps your place, Back
// and Forward work, and links (bookmarks, emails, QR codes, Cadence tasks) open the right page.
//   #/home                      Home                 #/mywork                 My work
//   #/record/<id>               one record           #/record/<id>/history    its audit trail
//   #/form/<formId>             a form's list        #/form/<formId>/new      a new record
//   #/reports  #/report/<id>    Reports              #/dashboards  #/dashboard/<id>[?f=…]
//   #/calendar                  Calendar             #/problems               Problems (admins)
//   #/designer                  Form designer        #/designer/<formId>[/<tab>]  one form's designer
//   #/settings[/<page>]         Settings (admins): users, groups[/<id>], roles[/<id>],
//                               automations[/<id>], schedules, dates, imports, exports, audit, problems,
//                               checklists[/<id>]
// Step 1 of clean addresses: the app writes these # addresses, and also opens the same address
// without the # (/settings/users), which hosting already serves (firebase.json rewrites).
// Pure functions: no DOM, no Firebase.

const ID = '([^/?#]+)';
const TABS = { fields: 'fields', relationships: 'relations', rules: 'rules', workflow: 'workflow', settings: 'settings', preview: 'preview', history: 'history' };
const TAB_URL = Object.fromEntries(Object.entries(TABS).map(([k, v]) => [v, k]));
export const SETTINGS_PAGES = ['users', 'groups', 'roles', 'automations', 'schedules', 'dates', 'imports', 'exports', 'audit', 'problems', 'checklists'];
const dec = (s) => { try { const v = decodeURIComponent(s); return v || null; } catch (e) { return null; } };

/** '#/record/abc' -> { kind: 'record', id: 'abc' }, '#/settings/users' -> { kind: 'settings', page: 'users' }; anything else -> null */
export function parseRoute(hash) {
  const h = String(hash || '').replace(/\/+$/, '');
  let m;
  if (/^#\/reports$/.test(h)) return { kind: 'reports' };
  if (/^#\/dashboards$/.test(h)) return { kind: 'dashboards' };
  if (/^#\/calendar$/.test(h)) return { kind: 'calendar' };
  if (/^#\/problems$/.test(h)) return { kind: 'problems' };
  if (/^#\/home$/.test(h)) return { kind: 'home' };
  if (/^#\/mywork$/.test(h)) return { kind: 'mywork' };
  if (/^#\/designer$/.test(h)) return { kind: 'designer' };
  if ((m = new RegExp(`^#/designer/${ID}(?:/([a-z]+))?$`).exec(h))) {
    const id = dec(m[1]); if (!id) return null;
    if (m[2] && !TABS[m[2]]) return null;
    return { kind: 'formEdit', id, tab: m[2] ? TABS[m[2]] : 'fields' };
  }
  if (/^#\/settings$/.test(h)) return { kind: 'settings' };
  if ((m = new RegExp(`^#/settings/([a-z]+)(?:/${ID})?$`).exec(h))) {
    if (!SETTINGS_PAGES.includes(m[1])) return null;
    if (m[2]) { if (!['groups', 'roles', 'automations', 'checklists'].includes(m[1])) return null; const id = dec(m[2]); return id ? { kind: 'settings', page: m[1], id } : null; }
    return { kind: 'settings', page: m[1] };
  }
  if ((m = new RegExp(`^#/record/${ID}/history$`).exec(h))) { const id = dec(m[1]); return id ? { kind: 'recordHistory', id } : null; }
  if ((m = new RegExp(`^#/form/${ID}/new$`).exec(h))) { const id = dec(m[1]); return id ? { kind: 'newRecord', id } : null; }
  m = /^#\/(record|form|report|dashboard)\/([^/?#]+)(?:\?f=([A-Za-z0-9_-]{1,4000}))?$/.exec(h);
  if (!m) return null;
  const id = dec(m[2]);
  if (!id) return null;
  return m[3] && m[1] === 'dashboard' ? { kind: m[1], id, f: m[3] } : m[3] ? null : { kind: m[1], id };
}

/** The same address without the #: '/settings/users' -> the route for '#/settings/users' (null for files like /index.html). */
export function parsePath(pathname) {
  const p = String(pathname || '');
  if (!p || p === '/' || /\.[a-z0-9]+$/i.test(p)) return null;
  return parseRoute('#' + p);
}
/** Where the page is: its # address, or failing that its clean path. */
export const routeOf = (loc) => parseRoute(loc?.hash) || parsePath(loc?.pathname);

/** The address for a view, or '' for screens that don't get one. */
export function routeFor(view) {
  if (!view) return '';
  const e = encodeURIComponent;
  switch (view.name) {
    case 'record': return view.recordId ? '#/record/' + e(view.recordId) : view.formId ? '#/form/' + e(view.formId) + '/new' : '';
    case 'records': return view.formId ? '#/form/' + e(view.formId) : '';
    case 'reports': return '#/reports';
    case 'report': return view.reportId ? '#/report/' + e(view.reportId) : '';
    case 'dashboards': return '#/dashboards';
    case 'dashboard': return view.dashboardId ? '#/dashboard/' + e(view.dashboardId) : '';
    case 'calendar': return '#/calendar';
    case 'problems': return '#/problems';
    case 'home': return '#/home';
    case 'mywork': return '#/mywork';
    case 'designer': return '#/designer';
    case 'formEdit': return view.formId ? '#/designer/' + e(view.formId) + (view.tab && view.tab !== 'fields' && TAB_URL[view.tab] ? '/' + TAB_URL[view.tab] : '') : '#/designer';
    case 'settings': return '#/settings';
    case 'audit': return view.recordId ? '#/record/' + e(view.recordId) + '/history' : '#/settings/audit';
    case 'groupEdit': return view.groupId ? '#/settings/groups/' + e(view.groupId) : '#/settings/groups';
    case 'roleEdit': return view.roleId ? '#/settings/roles/' + e(view.roleId) : '#/settings/roles';
    case 'automation': return view.autoId && !view.isNew ? '#/settings/automations/' + e(view.autoId) : '#/settings/automations';
    case 'import': return '#/settings/imports';
    case 'checklists': return '#/settings/checklists' + (view.clId ? '/' + e(view.clId) : '');
    default: return SETTINGS_PAGES.includes(view.name) ? '#/settings/' + view.name : '';
  }
}
