import { defineConfig } from 'vite';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';

/**
 * Working offline: precache.json lists every file this build makes, plus the files in public/
 * (not the service worker itself), with an id that changes when they do. The service worker
 * (public/sw.js) keeps them on the device, so Formwright opens with no signal.
 */
function precacheList() {
  const pub = (dir, base = dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? pub(p, base) : ['/' + relative(base, p).split('\\').join('/')]; });
  return {
    name: 'precache-list',
    apply: 'build',
    generateBundle(_, bundle) {
      const built = Object.keys(bundle).filter((f) => !f.endsWith('.map')).map((f) => '/' + f);
      const files = [...new Set([...built, ...pub('public').filter((f) => f !== '/sw.js' && !f.endsWith('.docx'))])].sort();
      const id = createHash('sha1').update(files.join('|')).digest('hex').slice(0, 12);
      this.emitFile({ type: 'asset', fileName: 'precache.json', source: JSON.stringify({ id, files }) });
    },
  };
}

export default defineConfig({
  server: { port: 5173 },
  plugins: [precacheList()],
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2020',
  },
});
