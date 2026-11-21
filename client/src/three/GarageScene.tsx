import { ContactShadows, OrbitControls } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import { useRef } from 'react';
import * as THREE from 'three';
import type { Livery } from '../lib/livery';
import { Car } from './Car';

function Turntable({ livery }: { livery: Livery }) {
  const ref = useRef<THREE.Group>(null);
  const sim = useRef({ speed: 0, boost: 0 });
  useFrame((s, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.35;
    // periodic nitro blip for the showroom
    sim.current.boost = Math.max(0, Math.sin(s.clock.elapsedTime * 0.8)) ** 12;
  });
  return (
    <group ref={ref}>
      <Car primary={livery.primary} accent={livery.accent} chassis={livery.chassis} number={livery.number} sim={sim.current} showcase />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <ringGeometry args={[3.4, 3.55, 96]} />
        <meshBasicMaterial color={livery.accent} toneMapped={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[3.4, 96]} />
        <meshStandardMaterial color="#0d0a22" metalness={0.8} roughness={0.25} />
      </mesh>
    </group>
  );
}

export function GarageScene({ livery }: { livery: Livery }) {
  return (
    <Canvas dpr={[1, 1.75]} camera={{ position: [6.5, 3.2, 6.5], fov: 40 }}>
      <color attach="background" args={['#06051a']} />
      <fog attach="fog" args={['#06051a', 14, 34]} />
      <ambientLight intensity={0.4} />
      <spotLight position={[0, 10, 0]} angle={0.6} penumbra={0.8} intensity={120} color="#ffffff" />
      <pointLight position={[-6, 3, 4]} intensity={40} color={livery.primary} />
      <pointLight position={[6, 2, -4]} intensity={40} color={livery.accent} />
      <Turntable livery={livery} />
      <gridHelper args={[60, 40, '#3b1e8a', '#1a1040']} position={[0, -0.01, 0]} />
      <ContactShadows position={[0, 0.01, 0]} opacity={0.7} scale={10} blur={2.5} far={3} />
      <OrbitControls enablePan={false} minDistance={6} maxDistance={14} maxPolarAngle={Math.PI / 2.1} target={[0, 0.6, 0]} />
      <EffectComposer multisampling={0}>
        <Bloom mipmapBlur luminanceThreshold={0.6} intensity={1.1} />
      </EffectComposer>
    </Canvas>
  );
}
