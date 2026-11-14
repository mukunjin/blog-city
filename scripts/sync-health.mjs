// Pulls the two upstream facts this project depends on, into data/:
//
//   data/blogs-original.csv   the list itself (mirror of the upstream csv)
//   data/health.json          last post time / dead state per blog
//
//   node scripts/sync-health.mjs
//
// The csv comes from a mirror of the list repo (jsDelivr first: raw.github is
// unreachable on plenty of Chinese networks). The status comes from
//
//   https://indi.blog/api/blogs.json
//   → { blogs: [{ id, url, feed, status, error, lastPost: { publishedAt },
//                 failingSince, dead }] }
//
// One request instead of 1430: their worker already re-checks every feed hourly
// and applies its own thresholds (1 day for permanent errors, 7 days for the
// rest, 90 days to "gone"). This script only translates their vocabulary:
//
//   lastPost.publishedAt → lastPostAt   (unix seconds)
//   dead + failingSince  → deadSince
//   error                → reason
//
// Both files are committed. Both are written only when their content actually
// changed, so an unchanged day produces no commit, no build, no deploy.
//
// Runs daily from .github/workflows/sync-health.yml.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { blogId } from '../shared/blogs.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const healthFile = path.join(root, 'data', 'health.json');
const csvFile = path.join(root, 'data', 'blogs-original.csv');

const API_URL = 'https://indi.blog/api/blogs.json';
const CSV_RAW =
  'https://raw.githubusercontent.com/timqian/chinese-independent-blogs/master/blogs-original.csv';
// jsDelivr mirrors the same file, but caches it for hours.
const CSV_JSDELIVR =
  'https://cdn.jsdelivr.net/gh/timqian/chinese-independent-blogs@master/blogs-original.csv';

// The order depends on where this runs. GitHub runners sit in Azure: raw.github
// answers directly and is never stale. A home connection in China is usually the
// other way round — raw times out, jsDelivr works. Second entry is the fallback.
const CSV_MIRRORS = process.env.GITHUB_ACTIONS ? [CSV_RAW, CSV_JSDELIVR] : [CSV_JSDELIVR, CSV_RAW];
const USER_AGENT =
  'Mozilla/5.0 (compatible; BlogCityBot/1.0; +https://github.com/timqian/chinese-independent-blogs)';
const TIMEOUT_MS = 45_000;
// their own renderer treats a short payload as a broken deployment, and so do we
const MIN_BLOGS = 1000;
const MIN_CSV_ROWS = 1000;

/** ISO string → unix seconds, or null. */
function toUnix(iso) {
  const ms = Date.parse(iso ?? '');
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

async function fetchStatus() {
  // The endpoint sits behind Cloudflare and is occasionally slow to answer from
  // a home connection; one request, three tries, then give up cleanly.
  let last;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(API_URL, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const blogs = Array.isArray(data?.blogs) ? data.blogs : [];
      if (blogs.length < MIN_BLOGS) throw new Error(`only ${blogs.length} blogs in the response`);
      return blogs;
    } catch (err) {
      last = err;
      if (attempt < 3) {
        console.warn(`  attempt ${attempt}/3 failed (${err.message}), retrying…`);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }
  throw last;
}

/** The csv is 160 KB of plainly formatted rows; a truncated copy is worse than none. */
async function fetchCsv() {
  const failures = [];
  for (const url of CSV_MIRRORS) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const rows = text.split('\n').filter((l) => l.trim()).length - 1;
      if (rows < MIN_CSV_ROWS) throw new Error(`only ${rows} rows`);
      return { text, rows, label: new URL(url).host };
    } catch (err) {
      failures.push(`${new URL(url).host}: ${err.message}`);
    }
  }
  throw new Error(`csv — ${failures.join('; ')}`);
}

async function readText(file) {
  try {
    return await readFile(file, 'utf8');
  } catch {
    return null;
  }
}

async function readPrevious() {
  try {
    return JSON.parse(await readFile(healthFile, 'utf8')).blogs ?? {};
  } catch {
    return {};
  }
}

async function main() {
  const now = Math.floor(Date.now() / 1000);
  const [list, previous, csv, currentCsv] = await Promise.all([
    fetchStatus(),
    readPrevious(),
    fetchCsv(),
    readText(csvFile),
  ]);

  // ---- the list first: it changes far less often than the statuses ----
  const csvChanged = csv.text !== currentCsv;
  if (csvChanged) {
    await mkdir(path.dirname(csvFile), { recursive: true });
    await writeFile(csvFile, csv.text, 'utf8');
    const before = currentCsv ? currentCsv.split('\n').filter((l) => l.trim()).length - 1 : 0;
    const sign = before ? (csv.rows >= before ? '+' : '') + (csv.rows - before) : 'new';
    console.log(`✓ ${csv.rows} rows from ${csv.label} → data/blogs-original.csv (${sign} vs before)`);
  } else {
    console.log(`= ${csv.rows} rows unchanged — data/blogs-original.csv left as is`);
  }

  // ---- then the per-blog status ----
  const blogs = {};
  let dated = 0;
  let dead = 0;

  for (const b of list) {
    const id = blogId(b.url || '');
    if (!id) continue;
    const prev = previous[id] ?? {};

    const at = toUnix(b.lastPost?.publishedAt);
    // a blog we already dated keeps its date when the API has none today
    const lastPostAt = at ?? prev.lastPostAt ?? null;
    if (lastPostAt) dated++;

    const failing = toUnix(b.failingSince);
    const isDead = Boolean(b.dead);
    if (isDead) dead++;

    blogs[id] = {
      feed: b.feed ?? prev.feed ?? '',
      ...(lastPostAt ? { lastPostAt } : {}),
      ...(isDead ? { deadSince: failing ?? prev.deadSince ?? now } : {}),
      ...(b.error ? { reason: String(b.error).slice(0, 200) } : {}),
      ...(failing ? { failingSince: failing } : {}),
    };
  }

  // Freshness is computed at build time from lastPostAt, so an unchanged
  // snapshot stays correct for as long as it exists. Only rewrite the file when
  // a fact actually changed.
  const sorted = (obj) =>
    JSON.stringify(
      Object.keys(obj)
        .sort()
        .map((k) => [k, obj[k]]),
    );
  if (sorted(previous) === sorted(blogs)) {
    console.log(`= ${list.length} blogs unchanged (${Object.keys(blogs).length} tracked) — data/health.json left as is`);
    return;
  }

  const payload = {
    updatedAt: new Date(now * 1000).toISOString(),
    source: API_URL,
    unit: 'unix seconds',
    blogs,
  };

  await mkdir(path.dirname(healthFile), { recursive: true });
  await writeFile(healthFile, JSON.stringify(payload), 'utf8');

  const ages = Object.values(blogs)
    .map((b) => b.lastPostAt)
    .filter(Boolean)
    .map((t) => (now - t) / 86400)
    .sort((a, b) => a - b);
  const median = ages.length ? ages[Math.floor(ages.length / 2)].toFixed(0) : '–';
  const kb = (Buffer.byteLength(JSON.stringify(payload)) / 1024).toFixed(0);

  const prevIds = new Set(Object.keys(previous));
  const nextIds = Object.keys(blogs);
  const added = nextIds.filter((id) => !prevIds.has(id)).length;
  const removed = [...prevIds].filter((id) => !blogs[id]).length;
  const changed = nextIds.filter(
    (id) => prevIds.has(id) && JSON.stringify(previous[id]) !== JSON.stringify(blogs[id]),
  ).length;

  console.log(`✓ ${list.length} blogs from ${API_URL} → data/health.json (${kb} kB)`);
  console.log(`  +${added} new · ~${changed} changed · -${removed} gone`);
  console.log(`  dated ${dated} · dead ${dead} · median age ${median} days · newest ${ages[0]?.toFixed(1) ?? '–'} days`);
}

main().catch((err) => {
  console.error(`✗ sync failed: ${err.message}`);
  console.error('  nothing was written; the build keeps using the committed csv and snapshot');
  process.exit(1);
});
