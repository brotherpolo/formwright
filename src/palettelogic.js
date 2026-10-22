// Ctrl K: one box to jump to a page, a form or a record. No DOM here, so it can be tested on its own.

const words = (q) => String(q || '').toLowerCase().trim().split(/\s+/).filter(Boolean);

/** How well an item matches what's typed: 0 = not at all; higher is better. Every word must appear. */
export function matchScore(label, sub, q) {
  const ws = words(q);
  if (!ws.length) return 1;
  const l = String(label || '').toLowerCase(), all = l + ' ' + String(sub || '').toLowerCase();
  if (!ws.every((w) => all.includes(w))) return 0;
  const first = ws[0];
  if (l.startsWith(first)) return 4;
  if (l.split(/[^a-z0-9]+/).some((t) => t.startsWith(first))) return 3;
  if (l.includes(first)) return 2;
  return 1;
}

/**
 * items: [{ kind: 'page'|'form'|'new'|'record', id, label, sub, at }] (at: last change, for records).
 * mine: { starred: [recordId], recent: [recordId] } (your stars, and what you opened lately, newest first).
 * Typed: the best matches, pages and forms before records at the same score, your starred and
 * recently opened records before others; up to `limit`.
 * Empty: your starred records, those you opened lately, then pages and forms, then the most
 * recently changed records, each with its group's name (item.group) for a heading.
 * Starred records are marked (item.starred).
 */
export function paletteResults(items, q, limit = 12, mine = {}) {
  const rank = { page: 0, form: 1, new: 2, record: 3 };
  const starred = new Set(mine.starred || []);
  const recentAt = new Map((mine.recent || []).map((id, i) => [id, i]));
  const mark = (it) => (it.kind === 'record' && starred.has(it.id) ? { ...it, starred: true } : it);
  const typed = words(q).length > 0;
  const scored = (items || []).map((it, i) => ({ it, i, s: matchScore(it.label, it.sub, q) })).filter((x) => x.s > 0);
  if (!typed) {
    const recs = new Map(scored.filter((x) => x.it.kind === 'record').map((x) => [x.it.id, x.it]));
    const shown = new Set();
    const take = (ids, n, group) => ids.filter((id) => recs.has(id) && !shown.has(id)).slice(0, n).map((id) => { shown.add(id); return { ...mark(recs.get(id)), group }; });
    const st = take(mine.starred || [], 6, 'Starred');
    const rc = take(mine.recent || [], 6, 'Recently opened');
    // pages, then forms, then administrators' Settings pages (so forms aren't pushed out of sight)
    const head = [
      ...scored.filter((x) => x.it.kind === 'page' && !x.it.admin).map((x) => ({ ...x.it, group: 'Pages' })),
      ...scored.filter((x) => x.it.kind === 'form').map((x) => ({ ...x.it, group: 'Forms' })),
      ...scored.filter((x) => x.it.kind === 'page' && x.it.admin).map((x) => ({ ...x.it, group: 'Settings' })),
    ];
    const changed = [...recs.values()].filter((it) => !shown.has(it.id)).sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 5).map((it) => ({ ...mark(it), group: 'Recently changed' }));
    const mineN = st.length + rc.length;
    // yours first; pages and forms and recent changes fill what's left (more room when there's more of yours)
    return [...st, ...rc, ...[...head, ...changed].slice(0, Math.max(limit - mineN, 6))];
  }
  const near = (it) => (it.kind !== 'record' ? 0 : starred.has(it.id) ? 0 : recentAt.has(it.id) ? 1 + recentAt.get(it.id) / 100 : 2);
  return scored.sort((a, b) => b.s - a.s || rank[a.it.kind] - rank[b.it.kind] || near(a.it) - near(b.it) || (b.it.at || 0) - (a.it.at || 0) || a.i - b.i)
    .slice(0, limit).map((x) => mark(x.it));
}

/** What you opened lately, newest first, without repeats, at most `max` (kept on this device). */
export function noteRecent(list, id, max = 12) {
  return [id, ...(Array.isArray(list) ? list : []).filter((x) => x !== id && typeof x === 'string')].slice(0, max);
}
/** Star or unstar a record: the new list (newest star first; at most 100). */
export function toggleStar(list, id) {
  const cur = Array.isArray(list) ? list.filter((x) => typeof x === 'string') : [];
  return cur.includes(id) ? cur.filter((x) => x !== id) : [id, ...cur].slice(0, 100);
}
