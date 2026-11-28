// Geometry invariants for the city plan.
//
// `layout.ts` is the most intricate code in the repo — radial placement,
// rejection sampling against a spatial hash, trees that must dodge towers — and
// until now nothing checked it. Every mistake found in it so far (a doubled
// distance in the tower test, a neighbour search too short for its own minimum)
// compiled cleanly, produced a wrong picture, and was found by measuring the
// output by hand.
//
// These tests measure that output instead: they build the real city from the
// committed snapshot and assert what the renderer is entitled to assume.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

// layout.ts is TypeScript and the repo has no test transpiler. esbuild is
// already installed as vite's bundler, so bundle the module in memory and import
// the result — no build step, no temp files on disk.
async function loadLayout() {
  const out = await build({
    entryPoints: [path.join(root, 'src/lib/layout.ts')],
    bundle: true,
    format: 'esm',
    write: false,
    logLevel: 'silent',
  });
  const code = Buffer.from(out.outputFiles[0].text, 'utf8').toString('base64');
  return import(`data:text/javascript;base64,${code}`);
}

const { buildCity } = await loadLayout();
const catalog = JSON.parse(await readFile(path.join(root, 'src/data/blogs.json'), 'utf8'));
const city = buildCity(catalog.blogs);

/** a footprint is a box: { x, z, w, d } — buildings and candidate rects alike */
const halfMax = (b) => Math.max(b.w, b.d) / 2;

/** every pair that shares ground, found through a coarse grid */
function overlappingPairs(boxes, cell = 60) {
  const buckets = new Map();
  const key = (x, z) => `${x},${z}`;
  const out = [];
  for (const b of boxes) {
    const x0 = Math.floor((b.x - b.w / 2) / cell);
    const x1 = Math.floor((b.x + b.w / 2) / cell);
    const z0 = Math.floor((b.z - b.d / 2) / cell);
    const z1 = Math.floor((b.z + b.d / 2) / cell);
    for (let gx = x0; gx <= x1; gx++) {
      for (let gz = z0; gz <= z1; gz++) {
        for (const other of buckets.get(key(gx, gz)) ?? []) {
          if (Math.abs(b.x - other.x) * 2 < b.w + other.w && Math.abs(b.z - other.z) * 2 < b.d + other.d) {
            out.push([b, other]);
          }
        }
      }
    }
    const k = key(Math.floor(b.x / cell), Math.floor(b.z / cell));
    const list = buckets.get(k);
    if (list) list.push(b);
    else buckets.set(k, [b]);
  }
  return out;
}

/** crown radius of a tree, matching the geometry in scene/Streets.tsx */
const crownOf = (t) => (t.kind === 1 ? 1.75 : 1.9 + t.tint * 0.7) * t.scale;

test('every blog gets a tower', () => {
  assert.equal(city.buildings.length, catalog.blogs.length);
  assert.equal(city.buildings.length, catalog.stats.total);
});

test('no two towers share ground', () => {
  const pairs = overlappingPairs(city.buildings);
  assert.deepEqual(
    pairs.map(([a, b]) => `${a.blog.id} / ${b.blog.id}`),
    [],
    'overlapping footprints',
  );
});

test('no tower stands on asphalt', () => {
  const spokes = city.roads.filter((r) => r.kind === "spoke");
  const rings = city.roads.filter((r) => r.kind === "ring");
  const offenders = [];
  for (const b of city.buildings) {
    const d = Math.hypot(b.x, b.z);
    // the layout pads every tower by its half-diagonal, so clearing the asphalt
    // by the half-width alone is the weakest claim that must still hold
    for (const r of rings) {
      if (Math.abs(d - r.at) < r.width / 2 + halfMax(b)) offenders.push(`${b.blog.id} → ring ${r.at}`);
    }
    for (const s of spokes) {
      if (d > s.to) continue;
      const perp = Math.abs(Math.sin(Math.atan2(b.z, b.x) - s.at)) * d;
      if (perp < s.width / 2 + halfMax(b)) offenders.push(`${b.blog.id} → avenue`);
    }
  }
  assert.deepEqual(offenders.slice(0, 10), []);
});

test('no tree grows inside or against a tower', () => {
  const cell = 60;
  const buckets = new Map();
  for (const b of city.buildings) {
    const k = `${Math.floor(b.x / cell)},${Math.floor(b.z / cell)}`;
    const list = buckets.get(k);
    if (list) list.push(b);
    else buckets.set(k, [b]);
  }
  const offenders = [];
  for (const t of city.trees) {
    const cx = Math.floor(t.x / cell);
    const cz = Math.floor(t.z / cell);
    // a tree is only in trouble with towers whose box the crown could reach
    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      for (let gz = cz - 1; gz <= cz + 1; gz++) {
        for (const b of buckets.get(`${gx},${gz}`) ?? []) {
          const dx = Math.max(0, Math.abs(t.x - b.x) - b.w / 2);
          const dz = Math.max(0, Math.abs(t.z - b.z) - b.d / 2);
          if (Math.hypot(dx, dz) < crownOf(t)) offenders.push(`${b.blog.id} @ ${t.x.toFixed(0)},${t.z.toFixed(0)}`);
        }
      }
    }
  }
  assert.deepEqual(offenders.slice(0, 10), []);
});

test('no two tree crowns intersect', () => {
  const cell = 30;
  const grid = new Map();
  const offenders = [];
  for (const t of city.trees) {
    const cx = Math.floor(t.x / cell);
    const cz = Math.floor(t.z / cell);
    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      for (let gz = cz - 1; gz <= cz + 1; gz++) {
        for (const o of grid.get(`${gx},${gz}`) ?? []) {
          if (Math.hypot(t.x - o.x, t.z - o.z) < crownOf(t) + crownOf(o)) {
            offenders.push(`${t.x.toFixed(0)},${t.z.toFixed(0)}`);
          }
        }
      }
    }
    const k = `${cx},${cz}`;
    const list = grid.get(k);
    if (list) list.push(t);
    else grid.set(k, [t]);
  }
  assert.deepEqual(offenders.slice(0, 10), []);
});

test('the same list always draws the same city', () => {
  const again = buildCity(catalog.blogs);
  const digest = (c) =>
    c.buildings.map((b) => `${b.x.toFixed(3)}:${b.z.toFixed(3)}:${b.h.toFixed(3)}`).join('|');
  assert.equal(digest(again), digest(city));
});

test('a longer list gets a bigger city, not overlapping towers', () => {
  // doubling the snapshot is the shape of "more blogs arrive tomorrow"
  const doubled = [
    ...catalog.blogs,
    ...catalog.blogs.map((b) => ({ ...b, id: `${b.id}#copy`, url: `${b.url}#copy` })),
  ];
  const bigger = buildCity(doubled);
  assert.equal(bigger.buildings.length, doubled.length);
  assert.deepEqual(overlappingPairs(bigger.buildings).slice(0, 5), []);
  const reach = (c) =>
    Math.max(Math.abs(c.extent.minX), c.extent.maxX, Math.abs(c.extent.minZ), c.extent.maxZ);
  assert.ok(reach(bigger) > reach(city), 'the disc should have grown');
});
