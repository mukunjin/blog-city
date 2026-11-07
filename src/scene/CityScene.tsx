import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import Buildings from "./Buildings";
import { Roads, Trees } from "./Streets";
import { Ground, Moon, PALETTE, Sky, Stars } from "./Backdrop";
import type { CityBuilding, CityLayout } from "../lib/types";
import { useReducedMotion } from "../lib/usePresence";

export interface FocusTarget {
  x: number;
  z: number;
  h: number;
  /** bump to re-trigger the same focus */
  token: number;
}

interface Home {
  pos: THREE.Vector3;
  target: THREE.Vector3;
  distance: number;
}

// the camera and the fog now derive from the actual city footprint, so the
// density knobs never leave the city cropped or lost in haze
function homeFor(layout: CityLayout): Home {
  const reach = Math.max(
    Math.abs(layout.extent.minX),
    layout.extent.maxX,
    Math.abs(layout.extent.minZ),
    layout.extent.maxZ,
  );
  const d = Math.max(360, reach * 2.05);
  return {
    pos: new THREE.Vector3(d * 0.56, d * 0.6, d * 0.8),
    target: new THREE.Vector3(0, 16, 0),
    distance: d,
  };
}

// A critically damped follow, frame-rate independent: motion starts from the
// live camera value and can be re-targeted (or grabbed) at any instant.
// zoom limits: close enough to read a single tower, far enough for the skyline
const ZOOM_MIN = 45;
const ZOOM_MAX_FACTOR = 1.45;

const RESPONSE = 0.24;
const damp = (dt: number) => 1 - Math.exp(-dt / RESPONSE);

function Rig({ focus, homeToken, home }: { focus: FocusTarget | null; homeToken: number; home: Home }) {
  const controls = useRef<OrbitControlsImpl | null>(null);
  const { camera } = useThree();
  const goal = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    camera.position.copy(home.pos);
  }, [camera]);

  useEffect(() => {
    if (!focus) return;
    const ctl = controls.current;
    if (!ctl) return;

    const target = new THREE.Vector3(focus.x, Math.min(focus.h * 0.45, 80), focus.z);
    const dir = new THREE.Vector3().subVectors(camera.position, ctl.target);
    if (dir.lengthSq() < 1) dir.set(0.72, 0.5, 0.62);
    dir.y = Math.max(dir.y, dir.length() * 0.32);
    dir.normalize();
    const distance = Math.max(58, focus.h * 1.9 + 46);
    const pos = target.clone().addScaledVector(dir, distance);

    if (reduce) {
      camera.position.copy(pos);
      ctl.target.copy(target);
      ctl.update();
      return;
    }
    goal.current = { pos, target };
  }, [focus, camera, reduce]);

  // leaving a tower: keep the view, but hand the rotation centre back to town
  useEffect(() => {
    if (!homeToken) return;
    const ctl = controls.current;
    if (!ctl) return;
    if (reduce) {
      ctl.target.copy(home.target);
      ctl.update();
      return;
    }
    goal.current = { pos: camera.position.clone(), target: home.target.clone() };
  }, [homeToken, camera, reduce]);

  useFrame((_state, delta) => {
    const ctl = controls.current;
    if (!ctl) return;

    const g = goal.current;
    if (g) {
      const k = damp(Math.min(delta, 0.1));
      camera.position.lerp(g.pos, k);
      ctl.target.lerp(g.target, k);
      // settle once it is visually there, so damping never fights the visitor
      if (camera.position.distanceTo(g.pos) < 0.6) goal.current = null;
    }
    ctl.update();
  });

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.075}
      rotateSpeed={0.55}
      zoomSpeed={0.7}
      panSpeed={0.6}
      minDistance={ZOOM_MIN}
      maxDistance={home.distance * ZOOM_MAX_FACTOR}
      maxPolarAngle={Math.PI / 2 - 0.045}
      target={home.target}
      // grabbing the city mid-flight takes over instantly
      onStart={() => {
        goal.current = null;
      }}
    />
  );
}

const beamFragment = /* glsl */ `
  varying float vY;
  uniform vec3 uColor;
  uniform float uOpacity;
  void main() {
    float a = pow(1.0 - vY, 1.6) * uOpacity;
    gl_FragColor = vec4(uColor, a);
  }
`;

function Beam({ x, z, y, color }: { x: number; z: number; y: number; color: string }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: /* glsl */ `
          varying float vY;
          void main() {
            vY = uv.y;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: beamFragment,
        uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0.5 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        fog: false,
      }),
    [color],
  );

  return (
    <mesh position={[x, y + 150, z]} material={material} renderOrder={5}>
      <cylinderGeometry args={[1.6, 2.6, 300, 8, 1, true]} />
    </mesh>
  );
}

function SelectionMarker({ building }: { building: CityBuilding | null }) {
  const ring = useRef<THREE.Mesh>(null);
  const beamColor = building?.color && building.color !== "#000000" ? "#ffe3a8" : "#ffe3a8";

  useFrame((state) => {
    if (!ring.current) return;
    const s = 1 + Math.sin(state.clock.elapsedTime * 2.4) * 0.06;
    ring.current.scale.setScalar(s);
  });

  if (!building) return null;

  return (
    <group>
      <mesh ref={ring} position={[building.x, 0.9, building.z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={6}>
        <ringGeometry args={[building.w * 0.95, building.w * 1.18, 6]} />
        <meshBasicMaterial color="#ffe3a8" transparent opacity={0.75} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      <Beam x={building.x} z={building.z} y={building.h} color={beamColor} />
    </group>
  );
}

function HoverMarker({ building }: { building: CityBuilding | null }) {
  if (!building) return null;
  return (
    <mesh position={[building.x, (building.h + 1) / 2, building.z]}>
      <boxGeometry args={[building.w + 1.6, building.h + 1, building.d + 1.6]} />
      <meshBasicMaterial color="#fff6d8" transparent opacity={0.22} wireframe depthWrite={false} />
    </mesh>
  );
}

interface CitySceneProps {
  layout: CityLayout;
  selected: CityBuilding | null;
  hovered: CityBuilding | null;
  focus: FocusTarget | null;
  homeToken: number;
  onHover: (b: CityBuilding | null) => void;
  onSelect: (b: CityBuilding | null) => void;
}

export default function CityScene({
  layout,
  selected,
  hovered,
  focus,
  homeToken,
  onHover,
  onSelect,
}: CitySceneProps) {
  const home = useMemo(() => homeFor(layout), [layout]);
  const fog = useMemo(
    () => ({ color: PALETTE.fog, near: home.distance * 0.8, far: home.distance * 2.3 }),
    [home],
  );
  // a press that turned into an orbit drag must not count as "clicked the sky"
  const missPress = useRef<{ x: number; y: number } | null>(null);

  return (
    <Canvas
      dpr={[1, 1.8]}
      camera={{ position: [home.pos.x, home.pos.y, home.pos.z], fov: 42, near: 2, far: 12000 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onCreated={({ gl }) => {
        gl.setClearColor(PALETTE.skyBottom);
      }}
      onPointerDown={(e) => {
        missPress.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerMissed={(e) => {
        const p = missPress.current;
        missPress.current = null;
        if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8) return;
        onSelect(null);
      }}
    >
      <fog attach="fog" args={[fog.color, fog.near, fog.far]} />
      <Sky />
      <Stars />
      <Moon />
      <ambientLight intensity={0.5} />
      <Ground layout={layout} fog={fog} />
      <Roads layout={layout} />
      <Trees layout={layout} />
      <Buildings layout={layout} onHover={onHover} onSelect={onSelect} fog={fog} />
      <SelectionMarker building={selected} />
      <HoverMarker building={hovered} />
      <Rig focus={focus} homeToken={homeToken} home={home} />
    </Canvas>
  );
}
