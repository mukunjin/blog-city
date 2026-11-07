import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { CityLayout } from "../lib/types";

// ─── Downtown ──────────────────────────────────────────────────
// A roundabout in the middle of town, with a signpost standing on it: four
// boards around a column, each carrying the city's name. The lettering is
// painted into a canvas once and used as a texture — real type, no font file,
// one draw call for the whole sign.

const ASPHALT = "#171d29";
const ISLAND = "#0d1512";
const STONE = "#141a24";
const SIGN = "#ffcf7a";

const BOARD_W = 44;
const BOARD_H = 18;
const BOARD_Y = 23; // board block starts on top of the column

function signTexture(): THREE.CanvasTexture {
  const w = 1024;
  const h = Math.round((w * BOARD_H) / BOARD_W);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  // board
  ctx.fillStyle = "#0a1018";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(255, 207, 122, 0.55)";
  ctx.lineWidth = 6;
  ctx.strokeRect(5, 5, w - 10, h - 10);

  // lettering, with a soft glow so it reads as lit rather than printed
  ctx.fillStyle = SIGN;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const size = Math.round(h * 0.52);
  ctx.font = `700 ${size}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
  if ("letterSpacing" in ctx) (ctx as unknown as { letterSpacing: string }).letterSpacing = "8px";
  ctx.shadowColor = "rgba(255, 190, 90, 0.85)";
  ctx.shadowBlur = size * 0.35;
  ctx.fillText("BLOG CITY", w / 2, h * 0.53);
  ctx.shadowBlur = 0;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function Roundabout({ layout }: { layout: CityLayout }) {
  const plaza = layout.plaza;

  const sign = useMemo(() => {
    const geo = new THREE.PlaneGeometry(BOARD_W, BOARD_H);
    const mat = new THREE.MeshBasicMaterial({ map: signTexture() });
    // the four faces of a hollow box: at any angle you see at least one head-on
    const half = BOARD_W / 2;
    const faces: [number, number, number][] = [
      [0, 0, half],
      [Math.PI, 0, -half],
      [Math.PI / 2, half, 0],
      [-Math.PI / 2, -half, 0],
    ];
    const mesh = new THREE.InstancedMesh(geo, mat, faces.length);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3(1, 1, 1);
    const up = new THREE.Vector3(0, 1, 0);
    faces.forEach(([rotY, x, z], i) => {
      q.setFromAxisAngle(up, rotY);
      p.set(x, BOARD_Y, z);
      m.compose(p, q, sc);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
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

      {/* plinth + column, with the sign sitting on top */}
      <mesh position={[0, 0.9, 0]}>
        <cylinderGeometry args={[plaza * 0.24, plaza * 0.26, 1.8, 28]} />
        <meshBasicMaterial color={STONE} />
      </mesh>
      <mesh position={[0, 7.9, 0]}>
        <boxGeometry args={[6.8, 12.2, 6.8]} />
        <meshBasicMaterial color={STONE} />
      </mesh>

      {/* the cap keeps the hollow box from reading as a tube from above */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, BOARD_Y + BOARD_H / 2, 0]}>
        <planeGeometry args={[BOARD_W, BOARD_W]} />
        <meshBasicMaterial color="#0a1018" />
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
