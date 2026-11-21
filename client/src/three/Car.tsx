import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ChassisKind } from '../lib/livery';

export interface CarSim {
  /** world units / second */
  speed: number;
  /** 0..1 nitro intensity */
  boost: number;
  dnf?: boolean;
}

/** Side profiles (z forward = negative, y up) for three original chassis designs. */
const PROFILES: Record<ChassisKind, [number, number][]> = {
  // VORTEX — wedge hypercar
  0: [[-2.3, 0.22], [-2.3, 0.38], [-1.2, 0.58], [-0.35, 0.98], [0.75, 1.0], [1.55, 0.82], [2.25, 0.78], [2.25, 0.22]],
  // SPECTRE — long-tail prototype
  1: [[-2.4, 0.2], [-2.35, 0.34], [-1.0, 0.5], [-0.2, 0.92], [0.5, 0.95], [1.2, 0.72], [2.45, 0.62], [2.45, 0.2]],
  // HALCYON — muscular GT
  2: [[-2.2, 0.24], [-2.2, 0.55], [-1.45, 0.66], [-0.55, 1.05], [0.95, 1.08], [1.75, 0.9], [2.2, 0.86], [2.2, 0.24]],
};

function useBodyGeometry(kind: ChassisKind) {
  return useMemo(() => {
    const pts = PROFILES[kind];
    const shape = new THREE.Shape();
    shape.moveTo(pts[0][0], pts[0][1]);
    for (const [x, y] of pts.slice(1)) shape.lineTo(x, y);
    shape.closePath();
    const depth = 1.62;
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.1, bevelSegments: 3 });
    g.translate(0, 0, -depth / 2);
    g.rotateY(-Math.PI / 2);
    g.computeVertexNormals();
    return g;
  }, [kind]);
}

function Wheel({ position, accent, spin }: { position: [number, number, number]; accent: string; spin: React.MutableRefObject<number> }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (ref.current) ref.current.rotation.x = spin.current;
  });
  return (
    <group position={position}>
      <group ref={ref}>
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.42, 0.42, 0.34, 28]} />
          <meshStandardMaterial color="#07070c" roughness={0.65} metalness={0.2} />
        </mesh>
        <mesh rotation={[0, Math.PI / 2, 0]} position={[position[0] > 0 ? 0.175 : -0.175, 0, 0]}>
          <torusGeometry args={[0.27, 0.035, 8, 28]} />
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={3} toneMapped={false} />
        </mesh>
        {/* spokes make rotation visible */}
        {[0, 1, 2].map((i) => (
          <mesh key={i} rotation={[(i * Math.PI) / 3, 0, 0]} position={[position[0] > 0 ? 0.172 : -0.172, 0, 0]}>
            <boxGeometry args={[0.02, 0.5, 0.06]} />
            <meshStandardMaterial color="#9aa3c7" metalness={0.9} roughness={0.25} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

export function Car({
  primary,
  accent,
  chassis,
  sim,
  number,
  showcase = false,
}: {
  primary: string;
  accent: string;
  chassis: ChassisKind;
  sim: CarSim;
  number?: number;
  showcase?: boolean;
}) {
  const body = useBodyGeometry(chassis);
  const spin = useRef(0);
  const flameL = useRef<THREE.Mesh>(null);
  const flameR = useRef<THREE.Mesh>(null);
  const trailL = useRef<THREE.Mesh>(null);
  const trailR = useRef<THREE.Mesh>(null);
  const chassisRef = useRef<THREE.Group>(null);
  const glow = useRef<THREE.PointLight>(null);

  const decal = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#05040d';
    ctx.beginPath();
    ctx.arc(64, 64, 58, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.strokeStyle = accent;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 64px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(number ?? ''), 64, 68);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [accent, number]);

  const trailMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({ color: new THREE.Color(accent).multiplyScalar(2), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
    [accent],
  );
  const flameMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: new THREE.Color('#7ff6ff').multiplyScalar(3), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    [],
  );

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    spin.current -= (sim.speed / 0.42) * dt;
    const boost = sim.boost;
    const flick = 0.75 + Math.sin(t * 60) * 0.15 + Math.random() * 0.1;
    const flameLen = sim.dnf ? 0 : 0.25 + boost * 2.4 * flick + Math.min(sim.speed / 60, 0.6);
    for (const f of [flameL.current, flameR.current]) {
      if (!f) continue;
      f.scale.set(1 + boost * 0.6, flameLen, 1 + boost * 0.6);
      f.position.z = 2.35 + flameLen * 0.45;
    }
    flameMat.color.set(boost > 0.15 ? '#9ffcff' : accent).multiplyScalar(boost > 0.15 ? 4 : 2);
    const trailLen = Math.min(sim.speed * 0.35, 26) + boost * 10;
    for (const tr of [trailL.current, trailR.current]) {
      if (!tr) continue;
      tr.visible = trailLen > 0.4;
      tr.scale.set(1, trailLen, 1);
      tr.position.z = 2.3 + trailLen / 2;
    }
    trailMat.opacity = 0.25 + boost * 0.5;
    if (chassisRef.current) {
      // engine idle shake + squat under boost
      const shake = sim.speed < 1 && !showcase ? Math.sin(t * 38) * 0.008 : Math.sin(t * 22) * 0.004 * Math.min(sim.speed / 30, 1);
      chassisRef.current.position.y = shake;
      chassisRef.current.rotation.x = -boost * 0.035;
    }
    if (glow.current) glow.current.intensity = 6 + boost * 18;
  });

  const wing = chassis === 1 ? 1.0 : chassis === 2 ? 1.18 : 1.24;

  return (
    <group>
      <group ref={chassisRef}>
        <mesh geometry={body} castShadow>
          <meshPhysicalMaterial color={primary} metalness={0.75} roughness={0.28} clearcoat={1} clearcoatRoughness={0.1} emissive={primary} emissiveIntensity={0.08} />
        </mesh>
        {/* canopy */}
        <mesh position={[0, chassis === 2 ? 1.02 : 0.92, chassis === 1 ? 0.05 : 0.15]} scale={[0.62, 0.3, 1.15]}>
          <sphereGeometry args={[1, 32, 16]} />
          <meshPhysicalMaterial color="#0b1030" metalness={0.2} roughness={0.05} transmission={0.2} clearcoat={1} emissive={accent} emissiveIntensity={0.15} />
        </mesh>
        {/* side neon blades */}
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.93, 0.42, 0.1]}>
            <boxGeometry args={[0.04, 0.05, 3.6]} />
            <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={4} toneMapped={false} />
          </mesh>
        ))}
        {/* number decal on the hood */}
        <mesh position={[0, chassis === 2 ? 0.67 : 0.6, -1.45]} rotation={[-Math.PI / 2 + 0.22, 0, 0]}>
          <planeGeometry args={[0.62, 0.62]} />
          <meshStandardMaterial map={decal} transparent />
        </mesh>
        {/* rear wing */}
        <mesh position={[0, wing, 1.95]}>
          <boxGeometry args={[1.95, 0.06, 0.42]} />
          <meshStandardMaterial color="#0d0b1c" metalness={0.6} roughness={0.35} />
        </mesh>
        <mesh position={[0, wing + 0.04, 2.15]}>
          <boxGeometry args={[1.95, 0.03, 0.03]} />
          <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={4} toneMapped={false} />
        </mesh>
        {[-0.6, 0.6].map((x) => (
          <mesh key={x} position={[x, (wing + 0.7) / 2, 1.95]}>
            <boxGeometry args={[0.06, wing - 0.7, 0.18]} />
            <meshStandardMaterial color="#0d0b1c" />
          </mesh>
        ))}
        {/* headlights */}
        {[-0.6, 0.6].map((x) => (
          <mesh key={x} position={[x, 0.42, -2.4]}>
            <boxGeometry args={[0.45, 0.06, 0.05]} />
            <meshStandardMaterial color="#e8fbff" emissive="#e8fbff" emissiveIntensity={6} toneMapped={false} />
          </mesh>
        ))}
        {/* tail light bar */}
        <mesh position={[0, 0.62, chassis === 1 ? 2.52 : 2.33]}>
          <boxGeometry args={[1.6, 0.06, 0.04]} />
          <meshStandardMaterial color="#ff2040" emissive="#ff2040" emissiveIntensity={5} toneMapped={false} />
        </mesh>
        {/* exhausts */}
        {[-0.42, 0.42].map((x) => (
          <mesh key={x} position={[x, 0.36, 2.3]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.1, 0.12, 0.25, 16]} />
            <meshStandardMaterial color="#2a2a33" metalness={1} roughness={0.3} />
          </mesh>
        ))}
        <mesh ref={flameL} position={[-0.42, 0.36, 2.5]} rotation={[-Math.PI / 2, 0, 0]} material={flameMat}>
          <coneGeometry args={[0.1, 1, 12, 1, true]} />
        </mesh>
        <mesh ref={flameR} position={[0.42, 0.36, 2.5]} rotation={[-Math.PI / 2, 0, 0]} material={flameMat}>
          <coneGeometry args={[0.1, 1, 12, 1, true]} />
        </mesh>
      </group>

      {/* light trails behind the car (scale with real speed) */}
      <mesh ref={trailL} position={[-0.8, 0.62, 3]} rotation={[-Math.PI / 2, 0, 0]} material={trailMat}>
        <planeGeometry args={[0.07, 1]} />
      </mesh>
      <mesh ref={trailR} position={[0.8, 0.62, 3]} rotation={[-Math.PI / 2, 0, 0]} material={trailMat}>
        <planeGeometry args={[0.07, 1]} />
      </mesh>

      <Wheel position={[-0.96, 0.42, -1.38]} accent={accent} spin={spin} />
      <Wheel position={[0.96, 0.42, -1.38]} accent={accent} spin={spin} />
      <Wheel position={[-0.96, 0.42, 1.42]} accent={accent} spin={spin} />
      <Wheel position={[0.96, 0.42, 1.42]} accent={accent} spin={spin} />

      {/* underglow */}
      <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.3, 4.8]} />
        <meshBasicMaterial color={primary} transparent opacity={sim.dnf ? 0.05 : 0.35} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <pointLight ref={glow} position={[0, 0.25, 0]} color={primary} distance={6} intensity={6} />
    </group>
  );
}
