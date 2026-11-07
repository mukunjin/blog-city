// Regenerates src/data/blogs.json from the chinese-independent-blogs data.
//
//   node scripts/build-blogs.mjs            # use the sibling clone
//   node scripts/build-blogs.mjs --remote   # pull the live CSV/README from GitHub
//
// The sibling clone (../../chinese-independent-blogs) is the default so the
// snapshot matches the exact list you cloned; --remote keeps it current.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCatalog } from '../shared/blogs.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const sibling = path.resolve(root, '..', 'chinese-independent-blogs');

const RAW = 'https://raw.githubusercontent.com/timqian/chinese-independent-blogs/master';
const remote = process.argv.includes('--remote');

async function fromRemote(file) {
  const res = await fetch(`${RAW}/${file}`);
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  return res.text();
}

async function load() {
  if (remote) {
    const [csvText, readmeText] = await Promise.all([fromRemote('blogs-original.csv'), fromRemote('README.md')]);
    return { csvText, readmeText, label: 'github:raw' };
  }
  try {
    const [csvText, readmeText] = await Promise.all([
      readFile(path.join(sibling, 'blogs-original.csv'), 'utf8'),
      readFile(path.join(sibling, 'README.md'), 'utf8'),
    ]);
    return { csvText, readmeText, label: 'local-clone' };
  } catch (err) {
    console.warn(`! local clone not readable (${err.message}), falling back to GitHub raw`);
    const [csvText, readmeText] = await Promise.all([fromRemote('blogs-original.csv'), fromRemote('README.md')]);
    return { csvText, readmeText, label: 'github:raw' };
  }
}

const { csvText, readmeText, label } = await load();
const catalog = buildCatalog({
  csvText,
  readmeText,
  generatedAt: new Date().toISOString(),
});

const out = path.join(root, 'src', 'data', 'blogs.json');
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, JSON.stringify(catalog), 'utf8');

const kb = (Buffer.byteLength(JSON.stringify(catalog)) / 1024).toFixed(0);
console.log(`✓ ${catalog.blogs.length} blogs from ${label} → ${path.relative(root, out)} (${kb} kB)`);
console.log(`  dead: ${catalog.stats.dead} · tagged: ${catalog.stats.tagged} · in README: ${catalog.stats.matchedInReadme}`);
const freshest = catalog.blogs.filter((b) => !b.dead).sort((a, b) => b.fresh - a.fresh)[0];
if (freshest) console.log(`  latest post: ${freshest.name}`);
