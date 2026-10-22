// Photos and files picked with no signal wait here (IndexedDB, on this device) until they can
// upload. The record gets a stand-in value straight away:
//   { name, size, type, path, url: '', pending: '<queue id>' }
// shown from the device copy; once uploaded, the record's value gets the real url (store.js).
// The pure helpers at the bottom are unit-tested.

const DB = 'fw-offline', STORE = 'uploads';
let dbp = null;
function idb() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
const tx = async (mode, fn) => {
  const d = await idb();
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, mode), s = t.objectStore(STORE);
    const out = fn(s);
    t.oncomplete = () => res(out && 'result' in out ? out.result : out);
    t.onerror = () => rej(t.error);
  });
};

/** Keep a file to upload later: { id, path, blob, name, type, size, formId, uid, at }. */
export const queuePut = (item) => tx('readwrite', (s) => s.put(item));
export const queueAll = () => tx('readonly', (s) => s.getAll());
export const queueGet = (id) => tx('readonly', (s) => s.get(id));
export const queueDel = (id) => tx('readwrite', (s) => s.delete(id));

/* ---------- pure helpers ---------- */

/** Where a stand-in value sits: [{ recordId, fieldId }] (a record's own fields; grid rows are records too). */
export function findPending(records, id) {
  const out = [];
  (records || []).forEach((r) => Object.entries(r.values || {}).forEach(([fid, v]) => { if (v && typeof v === 'object' && v.pending === id) out.push({ recordId: r.id, fieldId: fid }); }));
  return out;
}
/** The value once uploaded: the stand-in with its url, and no longer pending. */
export function uploaded(v, url) {
  const { pending, ...rest } = v || {};
  return { ...rest, url };
}
/** Is this a stand-in still waiting to upload? */
export const isPending = (v) => !!(v && typeof v === 'object' && v.pending && !v.url);
/** Queue items to give up on: older than `days` and not in any record (a form that was never saved). */
export function stale(items, records, now = Date.now(), days = 14) {
  return (items || []).filter((x) => now - (x.at || 0) > days * 864e5 && !findPending(records, x.id).length);
}
