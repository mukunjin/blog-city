import type { Blog } from "../../shared/blogs";
import { buildingMetrics, rand01 } from "./metrics";
import type { CityBuilding, CityLayout } from "./types";

// ─── City plan ─────────────────────────────────────────────────
// No grid: towers are scattered on the plain with a minimum gap between them
// (rejection sampling against a spatial hash). Placement runs from the centre
// outwards, and blogs are taken freshest-first, so the newest writing always
// ends up in the middle and the quiet ones drift towards the edge.

const GAP = 8.5; // minimum air between two towers
const MAX_ATTEMPTS = 80;
const HASH = 18;

interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

function overlaps(a: Rect, b: Rect): boolean {
  return (
    Math.abs(a.x - b.x) * 2 < a.w + b.w + GAP * 2 &&
    Math.abs(a.z - b.z) * 2 < a.d + b.d + GAP * 2
  );
}

export function buildCity(blogs: Blog[]): CityLayout {
  const members = [...blogs].sort((a, b) => b.fresh - a.fresh || a.num - b.num);
  const n = members.length;
  const specs = members.map((b) => buildingMetrics(b));

  // footprints first, so the city radius can be budgeted up front
  const feet = specs.map((s) => {
    const size = 6.2 + s.breadth * 3.4 + rand01(s.seed ^ 0x2f) * 1.4;
    return { w: size, d: size * (0.86 + rand01(s.seed ^ 0x1b3f) * 0.28) };
  });

  // area budget → radius. The packing factor is kept low on purpose: the city
  // should read as scattered towers with air between them, not a packed field.
  const area = feet.reduce((sum, f) => sum + (f.w + GAP) * (f.d + GAP), 0);
  const radius = Math.max(60, Math.sqrt(area / (Math.PI * 0.32)));

  const buckets = new Map<string, Rect[]>();
  const key = (gx: number, gz: number) => `${gx},${gz}`;
  const hits = (r: Rect): boolean => {
    const x0 = Math.floor((r.x - r.w / 2 - GAP) / HASH);
    const x1 = Math.floor((r.x + r.w / 2 + GAP) / HASH);
    const z0 = Math.floor((r.z - r.d / 2 - GAP) / HASH);
    const z1 = Math.floor((r.z + r.d / 2 + GAP) / HASH);
    for (let gx = x0; gx <= x1; gx++) {
      for (let gz = z0; gz <= z1; gz++) {
        const list = buckets.get(key(gx, gz));
        if (!list) continue;
        for (const other of list) if (overlaps(r, other)) return true;
      }
    }
    return false;
  };

  const buildings: CityBuilding[] = [];

  for (let i = 0; i < n; i++) {
    const blog = members[i];
    const spec = specs[i];
    const foot = feet[i];
    const even = Math.sqrt((i + 0.6) / n); // even coverage, centre first

    let placed: Rect | null = null;
    let pushed = 0;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      // after a while, let the tower slip outwards instead of giving up
      if (attempt > MAX_ATTEMPTS * 0.55) pushed += 0.035;
      const ring = radius * Math.min(1.35, even + pushed);
      const angle = rand01(spec.seed + attempt * 7919) * Math.PI * 2;
      const wobble = 1 + (rand01(spec.seed ^ attempt) - 0.5) * 0.14;
      const candidate: Rect = {
        x: Math.cos(angle) * ring * wobble,
        z: Math.sin(angle) * ring * wobble,
        w: foot.w,
        d: foot.d,
      };
      if (hits(candidate)) continue;
      placed = candidate;
      break;
    }

    if (!placed) {
      // extremely tight spot: park it just outside the built area
      const angle = rand01(spec.seed) * Math.PI * 2;
      const r = radius * (1.3 + rand01(spec.seed ^ 5) * 0.25);
      placed = { x: Math.cos(angle) * r, z: Math.sin(angle) * r, w: foot.w, d: foot.d };
    }

    const box = placed;
    const k = key(Math.floor(box.x / HASH), Math.floor(box.z / HASH));
    const list = buckets.get(k);
    if (list) list.push(box);
    else buckets.set(k, [box]);

    buildings.push({
      i,
      blog,
      x: box.x,
      z: box.z,
      w: box.w,
      d: box.d,
      h: spec.height,
      lit: spec.lit,
      cols: Math.max(2, Math.round(box.w / 2.7)),
      seed: (spec.seed % 9973) / 9973,
      color: facadeColor(spec.seed, blog.fresh, blog.dead),
    });
  }

  let minX = 0;
  let maxX = 0;
  let minZ = 0;
  let maxZ = 0;
  for (const b of buildings) {
    minX = Math.min(minX, b.x - b.w / 2);
    maxX = Math.max(maxX, b.x + b.w / 2);
    minZ = Math.min(minZ, b.z - b.d / 2);
    maxZ = Math.max(maxZ, b.z + b.d / 2);
  }

  return { buildings, extent: { minX, maxX, minZ, maxZ } };
}

// ─── Facade colour ─────────────────────────────────────────────
// Towers get a hue from a small neutral set, then warm up with freshness.
// Downtown reads amber, the outskirts cool blue.

const HUES = ["#5b8cff", "#3fc7c9", "#8b7bff", "#ff9d5c", "#63d6a0"];

function facadeColor(seed: number, fresh: number, dead: boolean): string {
  const hue = HUES[Math.floor(rand01(seed) * HUES.length) % HUES.length];
  const base = shade(hue, 0.14 + rand01(seed ^ 0x77) * 0.1);
  if (dead) return mixHex(base, "#2a3348", 0.55); // silent, forgotten
  return mixHex(base, "#ffb26b", 0.08 + fresh * 0.3);
}

/** Mix a hex colour towards near-black, i.e. "facade at night". */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const base = 0.05;
  const f = (c: number) => Math.round(255 * (base + (c / 255) * amount));
  return rgb((n >> 16) & 255, (n >> 8) & 255, n & 255, f);
}

export function mixHex(a: string, b: string, t: number): string {
  const na = parseInt(a.replace("#", ""), 16);
  const nb = parseInt(b.replace("#", ""), 16);
  const mix = (x: number, y: number) => Math.round(x + (y - x) * Math.max(0, Math.min(1, t)));
  return rgb(
    mix((na >> 16) & 255, (nb >> 16) & 255),
    mix((na >> 8) & 255, (nb >> 8) & 255),
    mix(na & 255, nb & 255),
    (v) => v,
  );
}

function rgb(r: number, g: number, b: number, f: (v: number) => number): string {
  return `#${((1 << 24) | (f(r) << 16) | (f(g) << 8) | f(b)).toString(16).slice(1)}`;
}
