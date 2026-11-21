// Regenerates src/data/blogs.json — the snapshot the browser actually reads.
//
//   node scripts/build-blogs.mjs
//
// Inputs are local and committed on purpose:
//
//   data/blogs-original.csv   the list itself (copy of the upstream csv)
//   data/health.json          last post time / dead state per blog
//
// Both are refreshed by `npm run sync`. Nothing here touches the network, so
// the same commit always produces the same city — and a build can never break
// because a mirror is slow, or because someone's clone sits on an old commit.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCatalog } from '../shared/blogs.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const csvFile = path.join(root, 'data', 'blogs-original.csv');
const healthFile = path.join(root, 'data', 'health.json');
const out = path.join(root, 'src', 'data', 'blogs.json');

async function loadHealth() {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(healthFile, 'utf8'));
  } catch (err) {
    throw new Error(`${path.relative(root, healthFile)} is missing or invalid: ${err.message}`);
  }
  if (!parsed?.blogs || typeof parsed.blogs !== 'object' || Array.isArray(parsed.blogs)) {
    throw new Error(`${path.relative(root, healthFile)} has no blogs object`);
  }
  if (!Object.keys(parsed.blogs).length) {
    throw new Error(`${path.relative(root, healthFile)} has an empty blogs object`);
  }
  const at = Date.parse(parsed.updatedAt ?? '');
  if (!Number.isFinite(at)) throw new Error(`${path.relative(root, healthFile)} has an invalid updatedAt`);
  return { health: parsed.blogs, count: Object.keys(parsed.blogs).length, at };
}

let csvText;
try {
  csvText = await readFile(csvFile, 'utf8');
} catch {
  console.error(`✗ ${path.relative(root, csvFile)} is missing — run \`npm run sync\` first`);
  process.exit(1);
}

let snapshot;
try {
  snapshot = await loadHealth();
} catch (err) {
  console.error(`✗ ${err.message}`);
  console.error('  refusing to rebuild or deploy without the last valid health snapshot');
  process.exit(1);
}
const { health, count: healthCount, at: snapshotAt } = snapshot;
const catalog = buildCatalog({
  csvText,
  health,
  // Freshness is measured against the snapshot's own timestamp, not against
  // "now". Otherwise every rebuild decays every blog by another few hours,
  // blogs.json changes on its own, and the daily job commits (and redeploys) for
  // nothing. Tying it to the snapshot means an unchanged snapshot rebuilds to
  // byte-identical output.
  now: snapshotAt,
  generatedAt: new Date().toISOString(),
});

await mkdir(path.dirname(out), { recursive: true });

// `generatedAt` would make every run look like new data, which turns a data
// sync into a redeploy even when nothing changed. Strip it before comparing: if
// the payload is identical the file (and its date) is left alone, so git only
// sees a diff when a blog really appeared or changed state.
const strip = (c) => JSON.stringify({ source: c.source, stats: c.stats, blogs: c.blogs });
let previous = null;
try {
  previous = JSON.parse(await readFile(out, 'utf8'));
} catch {
  // first run
}
const unchanged = previous !== null && strip(previous) === strip(catalog);

if (!unchanged) {
  await writeFile(out, JSON.stringify(catalog), 'utf8');
}

const kb = (Buffer.byteLength(JSON.stringify(catalog)) / 1024).toFixed(0);
const mark = unchanged ? '=' : '✓';
const tail = unchanged ? '— unchanged, file left as it is' : `→ ${path.relative(root, out)} (${kb} kB)`;
console.log(`${mark} ${catalog.blogs.length} blogs from data/blogs-original.csv ${tail}`);
console.log(`  dead: ${catalog.stats.dead} · alive: ${catalog.stats.alive} · tagged: ${catalog.stats.tagged}`);
console.log(`  health: ${healthCount} blogs from the committed data/health.json snapshot`);
const freshest = catalog.blogs.filter((b) => !b.dead).sort((a, b) => b.fresh - a.fresh)[0];
if (freshest) console.log(`  latest post: ${freshest.name}`);
