import { Html, Stars } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import { Suspense, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { lineupLiveries } from '../lib/livery';
import { targetProgress, type CarState, type RaceView } from '../lib/raceState';
import { Car, type CarSim } from './Car';
import { LANE_W, Track, TRACK_LEN } from './Track';

interface SimState extends CarSim {
  progress: number;
}

function laneX(lane: number, n: number) {
  return (lane - (n - 1) / 2) * LANE_W;
}

function RaceCars({ view, sims, mode }: { view: RaceView; sims: React.MutableRefObject<SimState[]>; mode: 'race' | 'showcase' }) {
  const cars = view.cars;
  const liveries = useMemo(() => lineupLiveries(cars), [cars.map((c) => c.modelId).join('|')]);
  const groups = useRef<(THREE.Group | null)[]>([]);
  const viewRef = useRef(view);
  viewRef.current = view;

  if (sims.current.length !== cars.length) sims.current = cars.map(() => ({ progress: 0, speed: 0, boost: 0 }));

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const now = performance.now();
    viewRef.current.cars.forEach((c: CarState, i) => {
      const s = sims.current[i];
      if (!s) return;
      const target = mode === 'showcase' ? 0 : targetProgress(c, now, s.progress);
      const prev = s.progress;
      // ease toward target; finishing cars accelerate harder
      const k = c.status === 'finished' ? 1.6 : 2.4;
      let next = prev + (target - prev) * (1 - Math.exp(-dt * k));
      const maxStep = (c.status === 'finished' ? 0.55 : 0.32) * dt;
      next = Math.min(next, prev + maxStep);
      s.progress = next;
      s.speed = ((next - prev) * TRACK_LEN) / Math.max(dt, 1e-3);
      const boosting = now < c.boostUntilWall ? 1 : 0;
      s.boost += (boosting - s.boost) * (1 - Math.exp(-dt * 8));
      s.dnf = c.status === 'dnf';
      const g = groups.current[i];
      if (g) g.position.z = -next * TRACK_LEN;
    });
  });

  return (
    <>
      {cars.map((c, i) => (
        <group key={c.modelId} ref={(el) => void (groups.current[i] = el)} position={[laneX(c.lane, cars.length), 0, 0]}>
          <Car primary={liveries[i].primary} accent={liveries[i].accent} chassis={liveries[i].chassis} number={liveries[i].number} sim={sims.current[i] ?? { speed: 0, boost: 0 }} showcase={mode === 'showcase'} />
          {mode === 'race' && (
            <Html position={[0, 2.6, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
              <div
                className="whitespace-nowrap rounded px-2 py-0.5 font-display text-[11px] font-bold tracking-wider text-white"
                style={{ background: 'rgba(5,4,13,.8)', border: `1px solid ${liveries[i].primary}`, boxShadow: `0 0 12px ${liveries[i].primary}` }}
              >
                {c.finishPos ? `P${c.finishPos} · ` : c.status === 'dnf' ? 'DNF · ' : ''}
                {liveries[i].callsign.slice(0, 16)}
              </div>
            </Html>
          )}
        </group>
      ))}
    </>
  );
}

function ChaseCamera({ sims, view, mode }: { sims: React.MutableRefObject<SimState[]>; view: RaceView; mode: 'race' | 'showcase' }) {
  const { camera } = useThree();
  const look = useRef(new THREE.Vector3(0, 1, -20));
  const viewRef = useRef(view);
  viewRef.current = view;
  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const t = state.clock.elapsedTime;
    const cam = camera as THREE.PerspectiveCamera;
    const v = viewRef.current;
    const list = sims.current;
    if (mode === 'showcase' || v.phase === 'grid') {
      // slow cinematic orbit around the starting grid
      const r = 17;
      const a = t * 0.18 + 0.6;
      cam.position.lerp(new THREE.Vector3(Math.sin(a) * r, 4.2 + Math.sin(t * 0.3) * 1.2, Math.cos(a) * r - 2), 1 - Math.exp(-dt * 2));
      look.current.lerp(new THREE.Vector3(0, 0.8, -1), 1 - Math.exp(-dt * 3));
    } else if (v.phase === 'complete' || v.phase === 'judging' || v.phase === 'failed') {
      const a = t * 0.12;
      const z = -TRACK_LEN - 6;
      cam.position.lerp(new THREE.Vector3(Math.sin(a) * 22, 7, z + Math.cos(a) * 22), 1 - Math.exp(-dt * 1.2));
      look.current.lerp(new THREE.Vector3(0, 1, z - 2), 1 - Math.exp(-dt * 2));
    } else {
      // follow the pack, biased toward the leader
      const ps = list.map((s) => s.progress);
      const lead = Math.max(...ps, 0);
      const mean = ps.reduce((a, b) => a + b, 0) / Math.max(ps.length, 1);
      // frame the whole pack: bias toward the leader but keep trailing cars in shot
      const tail = Math.min(...ps, lead);
      const spread = (lead - tail) * TRACK_LEN;
      const focus = Math.min(lead * 0.4 + mean * 0.6, 1.02);
      const z = -focus * TRACK_LEN;
      const boost = Math.max(...list.map((s) => s.boost), 0);
      const speed = Math.max(...list.map((s) => s.speed), 0);
      const shake = boost * 0.12;
      const back = Math.min(16 + spread * 0.45, 70);
      const target = new THREE.Vector3(Math.sin(t * 0.4) * 3 + (Math.random() - 0.5) * shake, 6.5 + back * 0.18 - boost * 0.8 + (Math.random() - 0.5) * shake, z + back + boost * 3);
      cam.position.lerp(target, 1 - Math.exp(-dt * 3));
      look.current.lerp(new THREE.Vector3(0, 1, z - 22), 1 - Math.exp(-dt * 4));
      cam.fov += (58 + Math.min(speed / 6, 8) + boost * 10 - cam.fov) * (1 - Math.exp(-dt * 3));
      cam.updateProjectionMatrix();
    }
    cam.lookAt(look.current);
  });
  return null;
}

export function RaceScene({ view, mode = 'race', lowPower = false }: { view: RaceView; mode?: 'race' | 'showcase'; lowPower?: boolean }) {
  const sims = useRef<SimState[]>([]);
  const lanes = Math.max(view.cars.length, 3);
  return (
    <Canvas
      dpr={lowPower ? [1, 1.25] : [1, 1.75]}
      camera={{ position: [12, 5, 14], fov: 58, near: 0.1, far: 1800 }}
      gl={{ antialias: !lowPower, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
      }}
    >
      <color attach="background" args={['#05040d']} />
      <fog attach="fog" args={['#0b0620', 70, 520]} />
      <ambientLight intensity={0.35} color="#6b5cff" />
      <hemisphereLight args={['#5b3cff', '#05040d', 0.6]} />
      <directionalLight position={[20, 30, 10]} intensity={1.2} color="#ffd9f6" />
      <directionalLight position={[-20, 10, -30]} intensity={0.8} color="#22e5ff" />
      <Suspense fallback={null}>
        <Stars radius={500} depth={120} count={lowPower ? 1500 : 4000} factor={6} fade speed={0.6} />
        <Track lanes={lanes} />
        <RaceCars view={view} sims={sims} mode={mode} />
      </Suspense>
      <ChaseCamera sims={sims} view={view} mode={mode} />
      <EffectComposer multisampling={0}>
        <Bloom mipmapBlur luminanceThreshold={0.55} luminanceSmoothing={0.2} intensity={lowPower ? 0.8 : 1.15} />
        <Vignette eskil={false} offset={0.2} darkness={0.75} />
      </EffectComposer>
    </Canvas>
  );
}
