import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { CityLayout } from "../lib/types";

export const PALETTE = {
  skyTop: "#03050d",
  skyMid: "#0a1226",
  skyHorizon: "#1b2b52",
  skyBottom: "#080b13",
  fog: "#080b13",
  ground: "#04060a",
  plinth: "#101724",
  road: "#1c2637",
};

// ─── Sky ───────────────────────────────────────────────────────
// One dome, one draw call: vertical gradient, a warm band right above the
// skyline, and a faint nebula from 3 octaves of value noise. Nothing to load.

const skyVertex = /* glsl */ `
  varying vec3 vPos;
  void main() {
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const skyFragment = /* glsl */ `
  varying vec3 vPos;
  uniform vec3 uTop, uMid, uHorizon, uBottom;
  uniform float uTime;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 3; i++) {
      v += a * noise(p);
      p = p * 2.03 + 17.0;
      a *= 0.5;
    }
    return v;
  }

  // ── stars ──
  // Painted into the sky instead of being geometry. A point cloud sits at some
  // finite radius, and no matter how far you push it, moving the camera reveals
  // the shell. Here the stars are a function of view direction only: they have
  // no position, so they are at infinity by construction.
  //
  // The grid is per cube face: a spherical grid would clump at the zenith and
  // leave a visible pole.
  float hash13(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  vec3 starField(vec3 dir, float t) {
    vec3 a = abs(dir);
    vec2 uv;
    float face;
    if (a.x >= a.y && a.x >= a.z) {
      uv = dir.yz / max(a.x, 1e-4);
      face = dir.x > 0.0 ? 1.0 : 2.0;
    } else if (a.y >= a.z) {
      uv = dir.xz / max(a.y, 1e-4);
      face = dir.y > 0.0 ? 3.0 : 4.0;
    } else {
      uv = dir.xy / max(a.z, 1e-4);
      face = dir.z > 0.0 ? 5.0 : 6.0;
    }

    const float CELLS = 44.0;
    vec2 g = uv * CELLS;
    vec2 id = floor(g);
    vec2 f = fract(g) - 0.5;

    // most cells are empty sky; the rest hold exactly one star
    float h = hash13(vec3(id, face));
    if (h < 0.79) return vec3(0.0);

    vec2 off = (vec2(hash13(vec3(id, face + 3.0)), hash13(vec3(id, face + 7.0))) - 0.5) * 0.62;
    float d = length(f - off);
    float rad = 0.055 + 0.115 * hash13(vec3(id, face + 11.0));
    float core = 1.0 - smoothstep(rad * 0.3, rad, d);
    if (core <= 0.0) return vec3(0.0);

    float twinkle = 0.62 + 0.38 * sin(t * 0.9 + h * 61.0);
    float tint = hash13(vec3(id, face + 19.0));
    vec3 col = tint > 0.88 ? vec3(1.0, 0.86, 0.70)
             : tint > 0.60 ? vec3(0.74, 0.84, 1.0)
             : vec3(1.0);
    float mag = 0.30 + 0.70 * hash13(vec3(id, face + 29.0));
    return col * core * twinkle * mag;
  }

  void main() {
    vec3 dir = normalize(vPos);
    float h = dir.y;

    vec3 c = mix(uHorizon, uMid, smoothstep(0.0, 0.34, h));
    c = mix(c, uTop, smoothstep(0.3, 0.86, h));
    c = mix(uBottom, c, smoothstep(-0.2, 0.02, h));

    // warm haze just above the skyline: the city's own glow
    float band = smoothstep(0.24, 0.0, abs(h - 0.03));
    c += vec3(0.055, 0.04, 0.07) * band;

    // a faint milky-way ribbon, tilted across the sky
    float bandCoord = dir.y * 0.75 + dir.x * 0.42 + dir.z * 0.12;
    float ribbon = smoothstep(0.5, 0.0, abs(bandCoord - 0.2));
    vec2 uv = vec2(atan(dir.z, dir.x) * 1.6, dir.y * 2.6);
    float n = fbm(uv * 2.3);
    float neb = pow(max(0.0, n - 0.18), 1.7) * ribbon;
    c += vec3(0.22, 0.18, 0.36) * neb * 1.5;

    // stars, thinning out in the last few degrees so there is no hard edge
    c += starField(dir, uTime) * smoothstep(0.012, 0.085, h) * 0.95;

    gl_FragColor = vec4(c, 1.0);
  }
`;

export function Sky() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: skyVertex,
        fragmentShader: skyFragment,
        uniforms: {
          uTop: { value: new THREE.Color(PALETTE.skyTop) },
          uMid: { value: new THREE.Color(PALETTE.skyMid) },
          uHorizon: { value: new THREE.Color(PALETTE.skyHorizon) },
          uBottom: { value: new THREE.Color(PALETTE.skyBottom) },
          uTime: { value: 0 },
        },
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    [],
  );
  useFrame((state) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <mesh material={material} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[3400, 32, 16]} />
    </mesh>
  );
}

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Moon ──────────────────────────────────────────────────────
// A single camera-facing quad. The disc, the mottled surface, the terminator
// and the halo are all computed in one shader — no sprite sheets, no flat
// circle that turns into an ellipse when you orbit.

const moonVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const moonFragment = /* glsl */ `
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    float r = length(p);

    // disc with a soft limb
    float disc = 1.0 - smoothstep(0.40, 0.425, r);

    // mare / highlands: low-frequency blotches plus a fine grain
    float mare = noise(p * 5.5 + 3.0);
    float grain = noise(p * 26.0);
    float shade = 0.78 + 0.16 * mare + 0.06 * grain;

    // terminator: light comes from the lower right
    float terminator = smoothstep(-0.3, 0.6, p.x * 0.9 + p.y * 0.25 + 0.28);

    vec3 body = vec3(0.98, 0.94, 0.83) * shade * (0.3 + 0.7 * terminator);

    // halo falls off outside the limb
    float halo = exp(-max(0.0, r - 0.42) * 5.0) * 0.22;

    vec3 col = body * disc + vec3(0.42, 0.55, 0.85) * halo;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function Moon() {
  const mesh = useRef<THREE.Mesh>(null);
  const { camera } = useThree();

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: moonVertex,
        fragmentShader: moonFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
      }),
    [],
  );

  // billboard: always faces the camera, never a squashed disc
  useFrame(() => {
    if (mesh.current) mesh.current.quaternion.copy(camera.quaternion);
  });

  // Sits just above the skyline on the far side of downtown, at the same
  // bearing it has always had. Coordinates are relative to the camera (the
  // dome follows it), so the moon keeps a fixed bearing like a body at
  // infinity: 6° above the horizon, 3000 out — inside the 3400 dome, well
  // outside the city, and clear of the ground plane.
  return (
    <mesh ref={mesh} position={[-1446, 314, -2609]} material={material} renderOrder={-8} frustumCulled={false}>
      <planeGeometry args={[330, 330]} />
    </mesh>
  );
}

// ─── Ground ────────────────────────────────────────────────────
// One plane, one colour everywhere: no slabs, no light pools. A whisper of
// grain keeps it from looking flat, and it dissolves into the fog by distance.

// The floor is a plain black disc. No shader: at this scale the only thing
// that matters is that it never ends on screen, so it is drawn far past the
// camera's far plane and the scene fog does the rest.
const GROUND_RADIUS = 26000;

export function Ground({ layout }: { layout: CityLayout }) {
  // one shallow pad under each tower — a plinth, not a city block grid
  const plinths = useMemo(() => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshBasicMaterial({ color: PALETTE.plinth });
    const mesh = new THREE.InstancedMesh(geo, mat, layout.buildings.length);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    layout.buildings.forEach((b, i) => {
      p.set(b.x, 0, b.z);
      s.set(b.w + 2.8, 0.5, b.d + 2.8);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    return mesh;
  }, [layout.buildings]);

  // a ring road around the settled area, so the city has an edge
  const reach = Math.max(
    Math.abs(layout.extent.minX),
    layout.extent.maxX,
    Math.abs(layout.extent.minZ),
    layout.extent.maxZ,
  );
  const ringInner = reach + 30;
  const ringOuter = ringInner + 18;

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <circleGeometry args={[GROUND_RADIUS, 64]} />
        <meshBasicMaterial color={PALETTE.ground} />
      </mesh>

      <primitive object={plinths} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
        <ringGeometry args={[ringInner, ringOuter, 128]} />
        <meshBasicMaterial color={PALETTE.road} transparent opacity={0.55} depthWrite={false} />
      </mesh>
    </group>
  );
}
