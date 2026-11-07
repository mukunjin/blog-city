import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
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

interface Car {
  spoke: number;
  t: number;
  speed: number;
  dir: number;
  lane: number;
  len: number;
  kind: number;
}

const CAR_COLORS = ["#e8edf7", "#ffb057", "#7aa6ff", "#c9d3e6", "#ff7a6b"];

export function Traffic({ layout }: { layout: CityLayout }) {
  const spokes = useMemo(() => layout.roads.filter((r) => r.kind === "spoke"), [layout.roads]);
  const meshRef = useRef<THREE.InstancedMesh>(null);

  const cars = useMemo<Car[]>(() => {
    const list: Car[] = [];
    const per = 13;
    const span = spokes[0] ? spokes[0].to - layout.plaza : 600;
    spokes.forEach((_, si) => {
      for (let i = 0; i < per; i++) {
        const seed = si * 977 + i * 131;
        const r1 = ((seed * 9301 + 49297) % 233280) / 233280;
        const r2 = ((seed * 4801 + 9973) % 233281) / 233281;
        list.push({
          spoke: si,
          t: layout.plaza + 6 + r1 * span,
          speed: 16 + r2 * 22,
          dir: i % 2 === 0 ? 1 : -1,
          lane: (i % 4 < 2 ? 1 : -1) * (2.6 + (i % 2) * 1.6),
          len: 3.2 + r1 * 1.6,
          kind: Math.floor(r2 * CAR_COLORS.length) % CAR_COLORS.length,
        });
      }
    });
    return list;
  }, [spokes, layout.plaza]);

  const geo = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: "#ffffff" }), []);

  const tmp = useMemo(
    () => ({
      m: new THREE.Matrix4(),
      p: new THREE.Vector3(),
      q: new THREE.Quaternion(),
      s: new THREE.Vector3(),
      up: new THREE.Vector3(0, 1, 0),
      c: new THREE.Color(),
    }),
    [],
  );

  // colours never change, so they are written once
  const painted = useRef(false);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dt = Math.min(delta, 0.1);
    const end = spokes[0] ? spokes[0].to : 800;

    if (!painted.current) {
      cars.forEach((car, i) => mesh.setColorAt(i, tmp.c.set(CAR_COLORS[car.kind])));
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      painted.current = true;
    }

    cars.forEach((car, i) => {
      car.t += car.speed * dt * car.dir;
      // loop back to the other end of the avenue
      if (car.t > end) car.t = layout.plaza + 4;
      if (car.t < layout.plaza + 2) car.t = end - 2;

      const angle = spokes[car.spoke].at;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      // lane offset is perpendicular to the avenue
      tmp.p.set(cos * car.t - sin * car.lane, 0.75, sin * car.t + cos * car.lane);
      tmp.q.setFromAxisAngle(tmp.up, car.dir > 0 ? -angle : -angle + Math.PI);
      tmp.s.set(car.len, 1.1, 1.7);
      tmp.m.compose(tmp.p, tmp.q, tmp.s);
      mesh.setMatrixAt(i, tmp.m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[geo, mat, cars.length]} frustumCulled={false} />
  );
}
