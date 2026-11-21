import { Stars } from '@react-three/drei';
import { useLiveryVersion } from '../store/useLiveries';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
import { Suspense, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { fitName, lineupLiveries } from '../lib/livery';
import { targetProgress, type CarState, type RaceView } from '../lib/raceState';
import { Car, type CarSim } from './Car';
import { LANE_W, Track, TRACK_LEN } from './Track';

interface SimState extends CarSim {
  progress: number;
}

function laneX(lane: number, n: number) {
  return (lane - (n - 1) / 2) * LANE_W;
}

function RaceCars({ view, sims, mode, labels }: { view: RaceView; sims: React.MutableRefObject<SimState[]>; mode: 'race' | 'showcase'; labels: React.MutableRefObject<(HTMLDivElement | null)[]> }) {
  const { camera, size } = useThree();
  const tmp = useMemo(() => new THREE.Vector3(), []);
  const liveryVersion = useLiveryVersion();
  const cars = view.cars;
  const liveries = useMemo(() => lineupLiveries(cars), [cars.map((c) => c.modelId).join('|'), liveryVersion]);
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
      // Name tag: project the point above the car to screen space (plain DOM, no extra React roots).
      const el = labels.current[i];
      if (el) {
        tmp.set(laneX(c.lane, viewRef.current.cars.length), 2.6 + (i % 2) * 0.9, -next * TRACK_LEN).project(camera);
        const visible = mode === 'race' && tmp.z < 1 && Math.abs(tmp.x) < 1.2 && Math.abs(tmp.y) < 1.2;
        el.style.display = visible ? 'block' : 'none';
        if (visible) el.style.transform = `translate(-50%, -50%) translate(${((tmp.x + 1) / 2) * size.width}px, ${((1 - tmp.y) / 2) * size.height}px)`;
      }
    });
  });

  return (
    <>
      {cars.map((c, i) => (
        <group key={c.modelId} ref={(el) => void (groups.current[i] = el)} position={[laneX(c.lane, cars.length), 0, 0]}>
          <Car primary={liveries[i].primary} accent={liveries[i].accent} chassis={liveries[i].chassis} number={liveries[i].number} sim={sims.current[i] ?? { speed: 0, boost: 0 }} showcase={mode === 'showcase'} />
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
      // follow the cars still racing (finished cars are already parked past the line), biased toward the leader
      const racing = list.filter((_, i) => {
        const st = v.cars[i]?.status;
        return st !== 'finished' && st !== 'dnf';
      });
      const ps = (racing.length ? racing : list).map((s) => s.progress);
      const lead = Math.max(...ps, 0);
      // Real AI races spread out by hundreds of metres (one model still thinking on the grid while
      // another streams at 300+ tok/s), so chase the race leader closely instead of framing the
      // whole pack from far away. The HUD standings always show every car.
      const tail = Math.min(...ps, lead);
      const spread = (lead - tail) * TRACK_LEN;
      const focus = Math.min(lead, 1.02);
      const z = -focus * TRACK_LEN;
      const boost = Math.max(...list.map((s) => s.boost), 0);
      const speed = Math.max(...list.map((s) => s.speed), 0);
      const shake = boost * 0.12;
      const back = 10 + Math.min(spread * 0.04, 6);
      const target = new THREE.Vector3(Math.sin(t * 0.4) * 3 + (Math.random() - 0.5) * shake, 4.6 + back * 0.15 - boost * 0.6 + (Math.random() - 0.5) * shake, z + back + boost * 3);
      // Real free models can cross the whole track in ~2 s, so track along the road (z) tightly and
      // keep the softer, cinematic smoothing for sideways/height motion only.
      const soft = 1 - Math.exp(-dt * 3);
      const tight = 1 - Math.exp(-dt * 30);
      cam.position.x += (target.x - cam.position.x) * soft;
      cam.position.y += (target.y - cam.position.y) * soft;
      cam.position.z += (target.z - cam.position.z) * tight;
      const lookTarget = new THREE.Vector3(0, 1, z - 22);
      look.current.x += (lookTarget.x - look.current.x) * soft;
      look.current.y += (lookTarget.y - look.current.y) * soft;
      look.current.z += (lookTarget.z - look.current.z) * tight;
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
  const labels = useRef<(HTMLDivElement | null)[]>([]);
  const liveryVersion = useLiveryVersion();
  const liveries = useMemo(() => lineupLiveries(view.cars), [view.cars.map((c) => c.modelId).join('|'), liveryVersion]);
  return (
    <div className="relative h-full w-full">
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
        <RaceCars view={view} sims={sims} mode={mode} labels={labels} />
      </Suspense>
      <ChaseCamera sims={sims} view={view} mode={mode} />
      <EffectComposer multisampling={0}>
        <Bloom mipmapBlur luminanceThreshold={0.55} luminanceSmoothing={0.2} intensity={lowPower ? 0.8 : 1.15} />
        <Vignette eskil={false} offset={0.2} darkness={0.75} />
      </EffectComposer>
    </Canvas>
      {mode === 'race' && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          {view.cars.map((c, i) => (
            <div
              key={c.modelId}
              ref={(el) => void (labels.current[i] = el)}
              className="absolute left-0 top-0 whitespace-nowrap rounded px-2 py-0.5 font-display text-[11px] font-bold tracking-wider text-white"
              style={{ display: 'none', background: 'rgba(5,4,13,.8)', border: `1px solid ${liveries[i]?.primary}`, boxShadow: `0 0 12px ${liveries[i]?.primary}` }}
            >
              {c.finishPos ? `P${c.finishPos} · ` : c.status === 'dnf' ? 'DNF · ' : ''}
              {fitName(liveries[i]?.callsign ?? '', 18)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
