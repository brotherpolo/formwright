// QR codes (ISO/IEC 18004), for a record's printable label: byte mode (UTF-8), error correction
// level M (about 15% of the code can be scuffed or covered and it still scans), versions 1 to 15
// (up to 412 bytes, plenty for a link). Pure functions, unit-tested; every size is checked
// against a real decoder in the browser tests.

// Level M, per version: [error-correction codewords per block, [blocks, data codewords each], ...]
const BLOCKS = [null,
  [10, [1, 16]], [16, [1, 28]], [26, [1, 44]], [18, [2, 32]], [24, [2, 43]],
  [16, [4, 27]], [18, [4, 31]], [22, [2, 38], [2, 39]], [22, [3, 36], [2, 37]], [26, [4, 43], [1, 44]],
  [30, [1, 50], [4, 51]], [22, [6, 36], [2, 37]], [22, [8, 37], [1, 38]], [24, [4, 40], [5, 41]], [24, [5, 41], [5, 42]],
];
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
  [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70]];
export const MAX_VERSION = 15;

const dataCodewords = (v) => BLOCKS[v].slice(1).reduce((a, [n, k]) => a + n * k, 0);
/** How many bytes fit in a version (byte mode, level M). */
export const capacity = (v) => dataCodewords(v) - (v < 10 ? 2 : 3);

/* ---------- Reed-Solomon over GF(256), polynomial 0x11D ---------- */
const EXP = new Uint8Array(512), LOG = new Uint8Array(256);
for (let i = 0, x = 1; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
function rsGenerator(n) {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(g.length + 1).fill(0);
    g.forEach((c, j) => { next[j] ^= c; next[j + 1] ^= mul(c, EXP[i]); });
    g = next;
  }
  return g;
}
/** The error-correction codewords for one block of data. */
export function rsRemainder(data, n) {
  const g = rsGenerator(n), r = new Array(n).fill(0);
  data.forEach((d) => {
    const f = d ^ r.shift(); r.push(0);
    if (f) for (let i = 0; i < n; i++) r[i] ^= mul(g[i + 1], f);
  });
  return r;
}

/* ---------- the bits ---------- */
function utf8(s) { return Array.from(new TextEncoder().encode(String(s))); }

function codewords(bytes, v) {
  const total = dataCodewords(v), bits = [];
  const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(0b0100, 4); put(bytes.length, v < 10 ? 8 : 16); bytes.forEach((b) => put(b, 8));
  for (let i = 0; i < 4 && bits.length < total * 8; i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; data.length < total; pad ^= 0xec ^ 0x11) data.push(pad);
  // split into blocks, add error correction to each, then interleave
  const [ec, ...groups] = BLOCKS[v], blocks = [];
  let at = 0;
  groups.forEach(([n, k]) => { for (let i = 0; i < n; i++) { const d = data.slice(at, at + k); at += k; blocks.push({ d, e: rsRemainder(d, ec) }); } });
  const out = [], longest = Math.max(...blocks.map((b) => b.d.length));
  for (let i = 0; i < longest; i++) blocks.forEach((b) => { if (i < b.d.length) out.push(b.d[i]); });
  for (let i = 0; i < ec; i++) blocks.forEach((b) => out.push(b.e[i]));
  return out;
}

/* ---------- the grid ---------- */
const MASKS = [
  (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function build(v, cw, mask) {
  const size = v * 4 + 17;
  const m = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, dark) => { m[y][x] = dark; fn[y][x] = true; };
  // timing lines
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  // finders, with their light borders
  [[3, 3], [size - 4, 3], [3, size - 4]].forEach(([cx, cy]) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
    }
  });
  // alignment patterns (not over the finders)
  const al = ALIGN[v], last = al.length - 1;
  al.forEach((cy, i) => al.forEach((cx, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));
  // format bits (level M = 00), twice, and the dark module
  const data = mask; let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const fmt = ((data << 10) | rem) ^ 0x5412, bit = (b, i) => ((b >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) set(8, i, bit(fmt, i));
  set(8, 7, bit(fmt, 6)); set(8, 8, bit(fmt, 7)); set(7, 8, bit(fmt, 8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(fmt, i));
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(fmt, i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(fmt, i));
  set(8, size - 8, true);
  // version bits (7 and up)
  if (v >= 7) {
    let r = v;
    for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
    const vb = (v << 12) | r;
    for (let i = 0; i < 18; i++) { const a = size - 11 + (i % 3), b = Math.floor(i / 3); set(a, b, bit(vb, i)); set(b, a, bit(vb, i)); }
  }
  // the data, in two-column zigzags from the bottom right, masked
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
      if (fn[y][x]) continue;
      const dark = i < cw.length * 8 ? ((cw[i >>> 3] >>> (7 - (i & 7))) & 1) === 1 : false;
      i++;
      m[y][x] = dark !== MASKS[mask](x, y);
    }
  }
  return m;
}

/** How hard a grid is for a scanner (the standard's four penalty rules); lower is better. */
export function penalty(m) {
  const n = m.length; let p = 0, dark = 0;
  const line = (get) => {
    for (let a = 0; a < n; a++) {
      let run = 1;
      for (let b = 1; b <= n; b++) {
        if (b < n && get(a, b) === get(a, b - 1)) run++;
        else { if (run >= 5) p += run - 2; run = 1; }
      }
      for (let b = 0; b + 11 <= n; b++) {
        const s = Array.from({ length: 11 }, (_, k) => (get(a, b + k) ? 1 : 0)).join('');
        if (s === '10111010000' || s === '00001011101') p += 40;
      }
    }
  };
  line((a, b) => m[a][b]); line((a, b) => m[b][a]);
  for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) { const c = m[y][x]; if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3; }
  m.forEach((r) => r.forEach((c) => { if (c) dark++; }));
  return p + Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10;
}

/** A QR code for some text: rows of booleans (true is dark), smallest version that fits, best mask. Null if it's too long. */
export function qrMatrix(text) {
  const bytes = utf8(text);
  let v = 1;
  while (v <= MAX_VERSION && capacity(v) < bytes.length) v++;
  if (v > MAX_VERSION) return null;
  const cw = codewords(bytes, v);
  let best = null, bestP = Infinity;
  for (let mask = 0; mask < 8; mask++) { const m = build(v, cw, mask), p = penalty(m); if (p < bestP) { best = m; bestP = p; } }
  return best;
}

/** The code as an SVG (with the four-module quiet zone around it scanners need). */
export function qrSvg(text, { size = 200, label = 'QR code' } = {}) {
  const m = qrMatrix(text);
  if (!m) return '';
  const n = m.length, q = 4, w = n + q * 2;
  let d = '';
  m.forEach((row, y) => { let x = 0; while (x < n) { if (!row[x]) { x++; continue; } let e = x; while (e < n && row[e]) e++; d += `M${x + q} ${y + q}h${e - x}v1h${x - e}z`; x = e; } });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${w}" width="${size}" height="${size}" shape-rendering="crispEdges" role="img" aria-label="${String(label).replace(/[<>&"]/g, '')}"><rect width="${w}" height="${w}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
