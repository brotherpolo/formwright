// Attachments fields: a record's list of files (any number, any type).
// The value is an array of { name, size, type, path, url, by, byName, at } (url is '' and
// `pending` set while a file waits on the device to upload: offlinequeue.js).
// Pure helpers, unit-tested; used by the app, PDFs, Word templates and the server kit.

/** The value as a list (an older single-file value counts as one). */
export function asFiles(v) {
  if (Array.isArray(v)) return v.filter((x) => x && typeof x === 'object');
  if (v && typeof v === 'object' && (v.name || v.url || v.path)) return [v];
  return [];
}
/** "3 files", "1 file", or '' */
export function filesText(v) {
  const n = asFiles(v).length;
  return n ? `${n} file${n === 1 ? '' : 's'}` : '';
}
export const fileNames = (v) => asFiles(v).map((x) => String(x.name || 'File'));

const fsize = (n) => (n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1) + ' MB');
export const sizeText = (n) => (n ? fsize(n) : '');

/** One line per file, for PDFs: "Permit.pdf · 380 KB" */
export const fileLines = (v) => asFiles(v).map((x) => [x.name || 'File', sizeText(x.size)].filter(Boolean).join(' · ')).join('\n');

/** The tile a file gets: { kind: 'img'|'pdf'|'xls'|'doc'|'ppt'|'zip'|'txt'|'file', tag } */
export function fileKind(f) {
  const n = String(f?.name || '').toLowerCase(), t = String(f?.type || '').toLowerCase();
  const ext = (n.match(/\.([a-z0-9]{1,5})$/) || [])[1] || '';
  if (t.startsWith('image/') || /^(jpe?g|png|gif|webp|heic|heif|bmp|svg)$/.test(ext)) return { kind: 'img', tag: ext ? ext.toUpperCase().slice(0, 4) : 'IMG' };
  if (t === 'application/pdf' || ext === 'pdf') return { kind: 'pdf', tag: 'PDF' };
  if (/^(xlsx?|xlsm|csv|ods|numbers)$/.test(ext) || /spreadsheet|excel|csv/.test(t)) return { kind: 'xls', tag: ext === 'csv' ? 'CSV' : 'XLS' };
  if (/^(docx?|odt|rtf|pages)$/.test(ext) || /wordprocessing|msword/.test(t)) return { kind: 'doc', tag: 'DOC' };
  if (/^(pptx?|odp|key)$/.test(ext) || /presentation|powerpoint/.test(t)) return { kind: 'ppt', tag: 'PPT' };
  if (/^(zip|rar|7z|gz|tgz)$/.test(ext) || /zip|compressed/.test(t)) return { kind: 'zip', tag: 'ZIP' };
  if (/^(txt|md|log|json|xml)$/.test(ext) || t.startsWith('text/')) return { kind: 'txt', tag: (ext || 'TXT').toUpperCase().slice(0, 4) };
  return { kind: 'file', tag: ext ? ext.toUpperCase().slice(0, 4) : 'FILE' };
}

const key = (x) => x.path || x.pending || x.url || x.name;
/** What changed between two lists: { added: [names], removed: [names] } (an upload finishing isn't a change). */
export function filesDiff(before, after) {
  const a = asFiles(before), b = asFiles(after);
  const had = new Set(a.map(key)), has = new Set(b.map(key));
  return { added: b.filter((x) => !had.has(key(x))).map((x) => x.name || 'File'), removed: a.filter((x) => !has.has(key(x))).map((x) => x.name || 'File') };
}
/** The audit's wording: "Added Permit.pdf, Plan.dwg · Removed Storefront.jpg" ('' when nothing). */
export function diffText(d) {
  return [d.added.length ? 'Added ' + d.added.join(', ') : '', d.removed.length ? 'Removed ' + d.removed.join(', ') : ''].filter(Boolean).join(' · ');
}
