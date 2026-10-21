// Clicking a chart to filter the dashboard, shareable dashboard links, and record QR codes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rowsFor, PERIODS } from '../../src/dashlogic.js';
import { shareState, encodeShare, decodeShare, shareUrl } from '../../src/sharelink.js';
import { parseRoute } from '../../src/route.js';
import { qrMatrix, qrSvg, capacity, rsRemainder, MAX_VERSION } from '../../src/qr.js';
import { recordUrl } from '../../src/qrlabel.js';

const forms = [
  { id: 'clients', name: 'Clients', titleField: 'name', children: [{ formId: 'projects' }], fields: [
    { id: 'name', type: 'text', label: 'Company name' }, { id: 'status', type: 'select', label: 'Status', options: ['Lead', 'Active'] }] },
  { id: 'projects', name: 'Projects', titleField: 'title', children: [], fields: [
    { id: 'title', type: 'text', label: 'Project name' }, { id: 'stage', type: 'select', label: 'Stage', options: ['Scoping', 'Done'] }, { id: 'start', type: 'date', label: 'Start' }] },
];
const rec = (id, formId, values, parentId = null) => ({ id, formId, values, parentId, ownerId: 'u1', createdAt: 1 });
const records = [
  rec('c1', 'clients', { name: 'Acme', status: 'Active' }), rec('c2', 'clients', { name: 'Globex', status: 'Lead' }),
  rec('p1', 'projects', { title: 'Lobby', stage: 'Scoping', start: '2026-03-02' }, 'c1'), rec('p2', 'projects', { title: 'Roof', stage: 'Done', start: '2026-04-10' }, 'c1'),
  rec('p3', 'projects', { title: 'Yard', stage: 'Scoping', start: '2026-04-20' }, 'c2'),
];
const byF = new Map(forms.map((f) => [f.id, f])), byR = new Map(records.map((r) => [r.id, r]));
const ctx = { forms, records, profiles: {}, formById: (id) => byF.get(id) || null, recById: (id) => byR.get(id) || null, fmt: (f, v) => String(v), recTitle: (r) => r.values.name || r.values.title || r.id };
const ids = (l) => l.map((r) => r.id).sort().join();
const NAME = { form: 'clients', id: 'name' }, STAGE = { form: 'projects', id: 'stage' };

/* ---------- click to filter ---------- */

test('a clicked bar filters other reports to the records it stands for, down through links', () => {
  const click = { id: 'click0', click: true, ref: NAME, refs: [NAME], hit: { ref: NAME, keys: ['Acme'], title: 'Acme' }, values: ['Acme'] };
  assert.equal(ids(rowsFor(ctx, { form: 'projects' }, { fields: [click] })), 'p1,p2', 'Projects of Acme');
  assert.equal(ids(rowsFor(ctx, { form: 'clients' }, { fields: [click] })), 'c1', 'Clients: just Acme');
  const stage = { id: 'click0', click: true, ref: STAGE, refs: [STAGE], hit: { ref: STAGE, keys: ['Scoping'], title: 'Scoping' }, values: ['Scoping'] };
  assert.equal(ids(rowsFor(ctx, { form: 'projects' }, { fields: [stage] })), 'p1,p3');
  assert.equal(ids(rowsFor(ctx, { form: 'clients' }, { fields: [stage] })), 'c1,c2', 'Clients sit above Projects: not reached, so unfiltered');
});

test('a clicked point on a line filters to its stretch of time; an "Other" slice to all it holds', () => {
  const from = Date.UTC(2026, 3, 1, 4), to = Date.UTC(2026, 4, 1, 4); // April, Toronto
  const START = { form: 'projects', id: 'start' };
  const pt = { id: 'click0', click: true, ref: START, refs: [START], hit: { ref: START, from, to, text: 'Apr 2026', title: 'Apr 2026' }, values: ['Apr 2026'], range: { from, to } };
  assert.equal(ids(rowsFor(ctx, { form: 'projects' }, { fields: [pt] })), 'p2,p3');
  const other = { id: 'click0', click: true, ref: NAME, refs: [NAME], hit: { ref: NAME, keys: ['Acme', 'Globex'], title: 'Other' }, values: ['Acme', 'Globex'] };
  assert.equal(ids(rowsFor(ctx, { form: 'projects' }, { fields: [other] })), 'p1,p2,p3');
});

test('a click and a live filter together: both apply', () => {
  const click = { id: 'click0', click: true, ref: STAGE, refs: [STAGE], hit: { ref: STAGE, keys: ['Scoping'], title: 'Scoping' }, values: ['Scoping'] };
  const lf = { id: 'lf1', ref: NAME, refs: [NAME], values: ['Acme'] };
  assert.equal(ids(rowsFor(ctx, { form: 'projects' }, { fields: [click, lf] })), 'p1');
});

/* ---------- shareable links ---------- */

const P = PERIODS.map((q) => q[0]);
test('a link carries the period, live filter picks and a chart click, and reads back the same', () => {
  const fv = { period: 'custom', from: '2026-01-01', to: '2026-03-31', fields: {}, lf: { t1: ['Acme', 'Café Ré'], t2: [], t3: { period: 'lastmonth' } },
    click: { tid: 'b', name: 'Budget by client', filters: [{ ref: NAME, keys: ['Acme'], title: 'Acme' }] } };
  const code = encodeShare(shareState(fv));
  assert.match(code, /^[A-Za-z0-9_-]+$/, 'safe in a link');
  const back = decodeShare(code, P);
  assert.equal(back.period, 'custom'); assert.equal(back.from, '2026-01-01'); assert.equal(back.to, '2026-03-31');
  assert.deepEqual(back.lf, { t1: ['Acme', 'Café Ré'], t3: { period: 'lastmonth' } }, 'empty picks left out; accents kept');
  assert.deepEqual(back.click, { tid: 'b', name: 'Budget by client', filters: [{ ref: NAME, keys: ['Acme'], title: 'Acme' }] });
  const pt = decodeShare(encodeShare({ c: { t: 'v', f: [{ ref: NAME, from: 10, to: 20, text: 'Apr 2026', title: 'Apr 2026' }] } }), P);
  assert.deepEqual(pt.click.filters[0], { ref: NAME, from: 10, to: 20, text: 'Apr 2026', title: 'Apr 2026' });
});

test('nothing set: the plain dashboard link', () => {
  assert.equal(shareState({ period: 'all', lf: { t1: [] }, click: null }), null);
  assert.equal(shareUrl('https://x.app/', 'd 1', { period: 'all', lf: {} }), 'https://x.app/#/dashboard/d%201');
  assert.match(shareUrl('https://x.app/', 'd1', { period: 'thismonth', lf: {} }), /^https:\/\/x\.app\/#\/dashboard\/d1\?f=[A-Za-z0-9_-]+$/);
});

test('whatever a link holds is checked: junk, unknown periods and odd values are dropped', () => {
  assert.equal(decodeShare('', P), null);
  assert.equal(decodeShare('!!!', P), null);
  assert.equal(decodeShare('bm90IGpzb24', P), null, 'not JSON');
  assert.equal(decodeShare('x'.repeat(5000), P), null, 'too long');
  const b = decodeShare(encodeShare({ p: 'nextcentury', a: '<script>', l: { t1: [1, 'ok', { x: 1 }], t2: { period: 'nope' }, '': ['x'] }, c: { t: 'b', f: [{ ref: { form: 1 }, keys: ['x'] }, { ref: NAME, keys: [] }] } }), P);
  assert.equal(b.period, 'all', 'an unknown period: All time');
  assert.equal(b.from, '');
  assert.deepEqual(b.lf, { t1: ['ok'] });
  assert.equal(b.click, null, 'no usable click');
});

test('the address: #/dashboard/<id>?f=… opens the dashboard with filters; other screens ignore f', () => {
  assert.deepEqual(parseRoute('#/dashboard/d1?f=eyJwIjoiYWxsIn0'), { kind: 'dashboard', id: 'd1', f: 'eyJwIjoiYWxsIn0' });
  assert.deepEqual(parseRoute('#/dashboard/d1'), { kind: 'dashboard', id: 'd1' });
  assert.equal(parseRoute('#/record/r1?f=abc'), null);
  assert.equal(parseRoute('#/dashboard/d1?f=a<b'), null);
});

/* ---------- QR codes ---------- */

test('Reed-Solomon: the worked example from the standard (HELLO WORLD, version 1-M)', () => {
  const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
  assert.deepEqual(rsRemainder(data, 10), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
});

test('a code: the smallest size that fits, finder squares in three corners, quiet zone in the SVG', () => {
  const url = recordUrl('r_p1', { origin: 'https://tasks-2ae9d.web.app', pathname: '/' });
  assert.equal(url, 'https://tasks-2ae9d.web.app/#/record/r_p1');
  const m = qrMatrix(url);
  assert.equal(m.length, 29, 'version 3 for a record link');
  const finder = (x0, y0) => [0, 1, 2, 3, 4, 5, 6].every((y) => [0, 1, 2, 3, 4, 5, 6].every((x) => m[y0 + y][x0 + x] === (Math.max(Math.abs(x - 3), Math.abs(y - 3)) !== 2)));
  assert.ok(finder(0, 0) && finder(22, 0) && finder(0, 22), 'three finder squares');
  assert.ok(!finder(22, 22), 'not in the fourth corner');
  for (let i = 8; i < 21; i++) assert.equal(m[6][i], i % 2 === 0, 'timing line');
  assert.equal(qrMatrix('x'.repeat(capacity(MAX_VERSION) + 1)), null, 'too long: no code');
  assert.equal(qrMatrix('x'.repeat(capacity(MAX_VERSION))).length, MAX_VERSION * 4 + 17);
  const svg = qrSvg(url, { size: 120, label: 'QR <code>' });
  assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 37 37" width="120" height="120"/);
  assert.match(svg, /aria-label="QR code"/, 'label text is made safe');
  assert.match(svg, /<path d="M4 4h7v1h-7z/, 'starts at the quiet zone with the top-left finder');
});
