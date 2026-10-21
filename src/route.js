// Web addresses for Formwright screens, so other apps (Cadence) can link to a record
// and a refreshed or shared page opens where it was.
//   #/record/<recordId>   one record
//   #/form/<formId>       a form's record list
//   #/reports             the Reports list
//   #/report/<reportId>   one saved report
//   #/dashboards          the Dashboards list
//   #/calendar            the Calendar
//   #/dashboard/<id>      one dashboard
//   #/dashboard/<id>?f=…  one dashboard with filters set (Copy link; sharelink.js)
// Pure functions: no DOM, no Firebase.

const RE = /^#\/(record|form|report|dashboard)\/([^/?#]+)\/?(?:\?f=([A-Za-z0-9_-]{1,4000}))?$/;

/** '#/record/abc' -> { kind: 'record', id: 'abc' }; '#/reports' -> { kind: 'reports' }; anything else -> null */
export function parseRoute(hash) {
  if (/^#\/reports\/?$/.test(String(hash || ''))) return { kind: 'reports' };
  if (/^#\/dashboards\/?$/.test(String(hash || ''))) return { kind: 'dashboards' };
  if (/^#\/calendar\/?$/.test(String(hash || ''))) return { kind: 'calendar' };
  const m = RE.exec(String(hash || ''));
  if (!m) return null;
  let id;
  try {
    id = decodeURIComponent(m[2]);
  } catch (e) {
    return null;
  }
  if (!id) return null;
  return m[3] && m[1] === 'dashboard' ? { kind: m[1], id, f: m[3] } : m[3] ? null : { kind: m[1], id };
}

/** The address for a view, or '' for screens that don't get one (designer, admin, new records). */
export function routeFor(view) {
  if (!view) return '';
  if (view.name === 'record' && view.recordId) return '#/record/' + encodeURIComponent(view.recordId);
  if (view.name === 'records' && view.formId) return '#/form/' + encodeURIComponent(view.formId);
  if (view.name === 'reports') return '#/reports';
  if (view.name === 'report' && view.reportId) return '#/report/' + encodeURIComponent(view.reportId);
  if (view.name === 'dashboards') return '#/dashboards';
  if (view.name === 'calendar') return '#/calendar';
  if (view.name === 'dashboard' && view.dashboardId) return '#/dashboard/' + encodeURIComponent(view.dashboardId);
  return '';
}
