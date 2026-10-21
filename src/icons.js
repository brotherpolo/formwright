// Form icons: a form's badge can show an icon (Lucide, chosen in Form designer → Settings) instead
// of its first letter, on the form's colour either way. The chosen icon's shapes are copied onto
// the form (form.icon), so nothing else ever loads the icon set (iconset.js, picker only).
// Pure functions, unit-tested.
//
// form.badge = 'icon' | 'letter' (the default); form.icon = { set: 'lucide', name, shapes: [{ t: tag, ...attrs }] }
// (saved as a list of objects: Firestore can't store a list inside a list; the icon set itself
// uses [tag, attrs], and both are read)

const TAGS = new Set(['path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse']);
const ATTRS = new Set(['d', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height', 'x1', 'y1', 'x2', 'y2', 'points']);
const safe = (v) => String(v).replace(/[^0-9a-zA-Z .,\-+]/g, ''); // numbers, path letters, spaces, commas

/** Tidy shapes from the icon set or a saved form: known shapes and attributes only, at most 40 shapes. */
export function cleanShapes(shapes) {
  return (Array.isArray(shapes) ? shapes : []).map((s) => (Array.isArray(s) ? { ...(s[1] && typeof s[1] === 'object' ? s[1] : {}), t: s[0] } : s))
    .filter((s) => s && typeof s === 'object' && TAGS.has(s.t)).slice(0, 40)
    .map((s) => ({ t: s.t, ...Object.fromEntries(Object.entries(s).filter(([k, v]) => ATTRS.has(k) && v != null && String(v).length <= 4000).map(([k, v]) => [k, safe(v)])) }));
}

/** The <svg> for an icon (24 × 24, 2px rounded outline in the current colour). */
export function iconSvg(icon, size = 16, cls = '') {
  const shapes = cleanShapes(icon && icon.shapes);
  if (!shapes.length) return '';
  return `<svg${cls ? ` class="${cls}"` : ''} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${shapes.map(({ t, ...a }) => `<${t}${Object.entries(a).map(([k, v]) => ` ${k}="${v}"`).join('')}/>`).join('')}</svg>`;
}

/** Does a form show an icon? */
export const showsIcon = (f) => !!(f && f.badge === 'icon' && f.icon && cleanShapes(f.icon.shapes).length);

/** What to save on the form for an icon from the set. */
export function iconFor(name, set) {
  const shapes = cleanShapes(set && set[name]);
  return shapes.length ? { set: 'lucide', name: String(name).slice(0, 60), shapes } : null;
}

/** Words people use for business forms, and icons that fit them. */
export const WORDS = {
  invoice: ['receipt', 'file-text', 'file-spreadsheet', 'receipt-text', 'banknote'],
  bill: ['receipt', 'banknote', 'file-text'],
  customer: ['building-2', 'users', 'user', 'handshake', 'store'],
  client: ['building-2', 'handshake', 'users', 'briefcase'],
  company: ['building-2', 'building', 'factory', 'landmark'],
  contact: ['contact', 'user-round', 'phone', 'mail', 'id-card'],
  person: ['user', 'user-round', 'contact'],
  line: ['list', 'list-ordered', 'rows-3', 'package'],
  item: ['package', 'box', 'list', 'tag'],
  product: ['package', 'box', 'boxes', 'flask-conical', 'tag'],
  spec: ['file-badge', 'flask-conical', 'clipboard-list', 'ruler'],
  project: ['folder-kanban', 'briefcase', 'clipboard-list', 'kanban'],
  job: ['briefcase', 'hammer', 'wrench', 'hard-hat'],
  site: ['map-pin', 'building', 'hard-hat', 'construction'],
  visit: ['map-pin', 'calendar-check', 'footprints'],
  safety: ['shield-check', 'hard-hat', 'triangle-alert', 'siren'],
  incident: ['triangle-alert', 'siren', 'octagon-alert', 'shield-alert'],
  inspection: ['clipboard-check', 'search-check', 'scan-search', 'badge-check'],
  quality: ['badge-check', 'award', 'shield-check'],
  vehicle: ['truck', 'car', 'bus', 'forklift'],
  delivery: ['truck', 'package-check', 'send'],
  order: ['shopping-cart', 'clipboard-list', 'package'],
  payment: ['credit-card', 'banknote', 'wallet', 'dollar-sign'],
  money: ['dollar-sign', 'banknote', 'wallet', 'piggy-bank', 'coins'],
  time: ['clock', 'timer', 'calendar', 'hourglass'],
  timesheet: ['clock', 'calendar-clock', 'timer'],
  equipment: ['wrench', 'hammer', 'cog', 'drill'],
  maintenance: ['wrench', 'cog', 'hammer'],
  document: ['file-text', 'files', 'folder', 'scroll-text'],
  contract: ['file-signature', 'scroll-text', 'handshake', 'pen-line'],
  task: ['check-square', 'list-checks', 'clipboard-check'],
  report: ['chart-bar', 'chart-pie', 'file-chart-column', 'presentation'],
  lab: ['flask-conical', 'microscope', 'test-tube'],
  medical: ['stethoscope', 'heart-pulse', 'pill', 'hospital'],
  food: ['utensils', 'chef-hat', 'coffee'],
  hr: ['users', 'id-card', 'user-check', 'briefcase'],
  training: ['graduation-cap', 'book-open', 'presentation'],
  asset: ['box', 'archive', 'hard-drive', 'barcode'],
  inventory: ['boxes', 'warehouse', 'package', 'barcode'],
  sales: ['trending-up', 'handshake', 'shopping-bag', 'target'],
};

/** Popular icons to show before anything is typed. */
export const START = ['receipt', 'file-text', 'file-spreadsheet', 'building-2', 'building', 'store', 'factory', 'warehouse', 'landmark', 'users', 'user', 'contact', 'id-card', 'handshake', 'briefcase', 'folder-kanban', 'clipboard-list', 'clipboard-check', 'list-checks', 'list', 'package', 'boxes', 'box', 'tag', 'barcode', 'shopping-cart', 'truck', 'car', 'forklift', 'map-pin', 'hard-hat', 'construction', 'wrench', 'hammer', 'drill', 'cog', 'shield-check', 'triangle-alert', 'siren', 'flask-conical', 'microscope', 'stethoscope', 'heart-pulse', 'graduation-cap', 'book-open', 'calendar', 'calendar-check', 'clock', 'timer', 'banknote', 'credit-card', 'wallet', 'piggy-bank', 'chart-bar', 'chart-pie', 'trending-up', 'target', 'award', 'badge-check', 'star', 'flag', 'mail', 'phone', 'camera', 'image', 'leaf', 'zap', 'globe', 'house'];

/**
 * Icons matching what's typed: the words list first (invoice → receipt…), then names that start
 * with it, then names that contain it. names: every icon name in the set. At most `max`.
 */
export function searchIcons(names, q, max = 120) {
  const has = new Set(names);
  const t = String(q || '').trim().toLowerCase().replace(/\s+/g, '-');
  if (!t) return START.filter((n) => has.has(n)); // a hand-picked start; searching finds the rest
  const out = [];
  const add = (n) => { if (has.has(n) && !out.includes(n)) out.push(n); };
  Object.entries(WORDS).forEach(([w, list]) => { if (w.startsWith(t) || t.startsWith(w)) list.forEach(add); });
  names.filter((n) => n.startsWith(t)).forEach(add);
  names.filter((n) => n.split('-').some((p) => p.startsWith(t))).forEach(add);
  names.filter((n) => n.includes(t)).forEach(add);
  return out.slice(0, max);
}
