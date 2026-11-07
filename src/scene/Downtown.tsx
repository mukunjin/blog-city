import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { CityLayout } from "../lib/types";

// ─── Downtown ──────────────────────────────────────────────────
// A roundabout in the middle of town with a pixel sign standing on it, plus
// traffic running the avenues. Everything here is deliberately crude: boxes,
// one instanced mesh each, no text geometry, no font file.

const ASPHALT = "#171d29";
const ISLAND = "#0d1512";
const STONE = "#141a24";
const SIGN = "#ffcf7a";
const CELL = 2.6;
const DEPTH = 2.2;

// 5×7 bitmap font — only the letters the sign needs
const GLYPHS: Record<string, string[]> = {
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  G: ["01110", "10001", "10000", "10000", "10011", "10001", "01110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
};

interface Cell {
  x: number;
  y: number;
}

function layoutText(lines: string[]): Cell[] {
  const cells: Cell[] = [];
  const lineH = 8; // 7 rows + 1 gap
  lines.forEach((line, li) => {
    const chars = [...line];
    const width = chars.length * 6 - 1;
    let col = 0;
    for (const ch of chars) {
      const glyph = GLYPHS[ch];
      if (glyph) {
        for (let r = 0; r < 7; r++) {
          for (let c = 0; c < 5; c++) {
            if (glyph[r][c] === "1") {
              cells.push({
                x: (col + c - width / 2 + 0.5) * CELL,
                y: (lines.length * lineH - 1 - li * lineH - r - 0.5) * CELL,
              });
            }
          }
        }
      }
      col += 6;
    }
  });
  return cells;
}

export function Roundabout({ layout }: { layout: CityLayout }) {
  const plaza = layout.plaza;

  const sign = useMemo(() => {
    const cells = layoutText(["BLOG", "CITY"]);
    // two crossed faces, so the sign reads from any direction
    const faces = [0, Math.PI / 2];
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ color: SIGN });
    const mesh = new THREE.InstancedMesh(geo, mat, cells.length * faces.length);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3(CELL * 0.9, CELL * 0.9, DEPTH);
    const c = new THREE.Color();
    const up = new THREE.Vector3(0, 1, 0);
    let i = 0;
    // stand the sign on the plinth rather than in mid air
    const lowest = Math.min(...cells.map((c) => c.y));
    const dy = 1.95 - lowest;
    faces.forEach((a) => {
      q.setFromAxisAngle(up, a);
      for (const cell of cells) {
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        p.set(cell.x * cos, cell.y + dy, cell.x * sin);
        m.compose(p, q, sc);
        mesh.setMatrixAt(i, m);
        // slightly uneven brightness, like an old bulb matrix
        c.setScalar(0.72 + ((i * 37) % 23) / 60);
        mesh.setColorAt(i, c);
        i++;
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    return mesh;
  }, []);

  return (
    <group>
      {/* the lane around the island */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <ringGeometry args={[plaza - 6, plaza + 6, 96]} />
        <meshBasicMaterial color={ASPHALT} />
      </mesh>

      {/* the island */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
        <circleGeometry args={[plaza - 6, 64]} />
        <meshBasicMaterial color={ISLAND} />
      </mesh>

      {/* a low plinth under the sign */}
      <mesh position={[0, 0.9, 0]}>
        <cylinderGeometry args={[plaza * 0.42, plaza * 0.44, 1.8, 24]} />
        <meshBasicMaterial color={STONE} />
      </mesh>

      <primitive object={sign} />
    </group>
  );
}

// ─── Traffic ───────────────────────────────────────────────────
// Parked traffic: body, cabin, lights and wheels are just boxes, but the
// whole fleet is baked into one InstancedMesh once — no per-frame work at all.

interface Car {
  x: number;
  z: number;
  angle: number;
  dir: number;
  len: number;
  color: string;
}

const CAR_COLORS = ["#dfe7f5", "#ffb057", "#6f9cff", "#c3cfe2", "#ff7a6b", "#8fd6b4"];
const GLASS = "#151d2c";
const TIRE = "#0b1018";
const HEAD = "#ffe6ad";
const TAIL = "#ff5c4a";

export function Traffic({ layout }: { layout: CityLayout }) {
  const spokes = useMemo(() => layout.roads.filter((r) => r.kind === "spoke"), [layout.roads]);

  const cars = useMemo<Car[]>(() => {
    const list: Car[] = [];
    const per = 22;
    const span = spokes[0] ? spokes[0].to - layout.plaza - 20 : 600;
    spokes.forEach((spoke, si) => {
      for (let i = 0; i < per; i++) {
        const seed = si * 977 + i * 131;
        const r1 = ((seed * 9301 + 49297) % 233280) / 233280;
        const r2 = ((seed * 4801 + 9973) % 233281) / 233281;
        const dir = i % 2 === 0 ? 1 : -1;
        // random spacing, so the traffic clumps like real traffic instead of
        // sitting on a grid
        const t = layout.plaza + 16 + Math.pow(r1, 0.85) * span;
        // two lanes, one each way, measured from the centreline
        const lane = dir > 0 ? 3.1 : -3.1;
        const cos = Math.cos(spoke.at);
        const sin = Math.sin(spoke.at);
        list.push({
          x: cos * t - sin * lane,
          z: sin * t + cos * lane,
          angle: spoke.at,
          dir,
          len: 3.4 + r2 * 1.8,
          color: CAR_COLORS[Math.floor(r2 * CAR_COLORS.length) % CAR_COLORS.length],
        });
      }
    });
    return list;
  }, [spokes, layout.plaza]);

  const mesh = useMemo(() => {
    const PARTS = 8; // body, cabin, 2 lights, 4 wheels
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ color: "#ffffff" });
    const inst = new THREE.InstancedMesh(geo, mat, Math.max(1, cars.length * PARTS));

    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    const c = new THREE.Color();
    const up = new THREE.Vector3(0, 1, 0);
    const fwd = new THREE.Vector3();

    let i = 0;
    for (const car of cars) {
      q.setFromAxisAngle(up, car.dir > 0 ? -car.angle : -car.angle + Math.PI);
      fwd.set(car.dir > 0 ? Math.cos(car.angle) : -Math.cos(car.angle), 0, car.dir > 0 ? Math.sin(car.angle) : -Math.sin(car.angle));
      const L = car.len;

      const part = (offset: number, y: number, sx: number, sy: number, sz: number, color: string) => {
        p.set(car.x + fwd.x * offset, y, car.z + fwd.z * offset);
        sc.set(sx, sy, sz);
        m.compose(p, q, sc);
        inst.setMatrixAt(i, m);
        inst.setColorAt(i, c.set(color));
        i++;
      };

      part(0, 0.62, L, 0.72, 1.92, car.color); // body
      part(-L * 0.08, 1.24, L * 0.46, 0.62, 1.64, GLASS); // cabin, set back a little
      part(L * 0.5, 0.64, 0.28, 0.26, 1.5, HEAD); // headlights
      part(-L * 0.5, 0.62, 0.22, 0.22, 1.46, TAIL); // tail lights
      // wheels
      const wx = L * 0.3;
      const wz = 0.86;
      for (const sx of [wx, -wx]) {
        for (const sz of [wz, -wz]) {
          p.set(car.x + fwd.x * sx + fwd.z * sz, 0.32, car.z + fwd.z * sx - fwd.x * sz);
          sc.set(L * 0.2, 0.44, 0.26);
          m.compose(p, q, sc);
          inst.setMatrixAt(i, m);
          inst.setColorAt(i, c.set(TIRE));
          i++;
        }
      }
    }

    inst.count = i;
    inst.instanceMatrix.needsUpdate = true;
    if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
    inst.frustumCulled = false;
    return inst;
  }, [cars]);

  return <primitive object={mesh} />;
}
