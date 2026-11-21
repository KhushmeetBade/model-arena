import { useMemo, useRef, useLayoutEffect } from 'react';
import * as THREE from 'three';

export const LANE_W = 4.2;
export const TRACK_LEN = 600;

function canvasTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}

function roadTexture(lanes: number, length: number) {
  const W = 512;
  const H = 256;
  return canvasTex(
    W,
    H,
    (ctx) => {
      ctx.fillStyle = '#0a0913';
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 2200; i++) {
        const v = 14 + Math.random() * 14;
        ctx.fillStyle = `rgb(${v},${v},${v + 6})`;
        ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2);
      }
      const margin = W * 0.08;
      const laneW = (W - margin * 2) / lanes;
      // glowing edge lines
      ctx.fillStyle = '#22e5ff';
      ctx.fillRect(margin - 6, 0, 6, H);
      ctx.fillStyle = '#ff2bd6';
      ctx.fillRect(W - margin, 0, 6, H);
      // dashed lane dividers
      ctx.fillStyle = '#cfd8ff';
      for (let l = 1; l < lanes; l++) {
        const x = margin + l * laneW - 2;
        ctx.fillRect(x, 0, 4, H * 0.55);
      }
    },
    [1, length / 14],
  );
}

function checkerTexture() {
  return canvasTex(256, 32, (ctx) => {
    for (let x = 0; x < 32; x++)
      for (let y = 0; y < 4; y++) {
        ctx.fillStyle = (x + y) % 2 ? '#ffffff' : '#0a0913';
        ctx.fillRect(x * 8, y * 8, 8, 8);
      }
  });
}

function bannerTexture(text: string, a: string, b: string) {
  return canvasTex(1024, 160, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 1024, 0);
    g.addColorStop(0, a);
    g.addColorStop(1, b);
    ctx.fillStyle = '#07051a';
    ctx.fillRect(0, 0, 1024, 160);
    ctx.strokeStyle = g;
    ctx.lineWidth = 10;
    ctx.strokeRect(8, 8, 1008, 144);
    ctx.fillStyle = g;
    ctx.font = '900 96px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 512, 86);
  });
}

function windowsTexture() {
  return canvasTex(64, 128, (ctx) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 64, 128);
    const colors = ['#22e5ff', '#ff2bd6', '#ffb627', '#8b5cff', '#ffffff'];
    for (let y = 2; y < 128; y += 6)
      for (let x = 2; x < 64; x += 6)
        if (Math.random() < 0.22) {
          ctx.fillStyle = colors[(Math.random() * colors.length) | 0];
          ctx.globalAlpha = 0.4 + Math.random() * 0.6;
          ctx.fillRect(x, y, 3, 3);
        }
  });
}

function Arch({ z, width, color, height = 9, banner }: { z: number; width: number; color: string; height?: number; banner?: THREE.Texture }) {
  return (
    <group position={[0, 0, z]}>
      {[-1, 1].map((s) => (
        <group key={s} position={[(s * width) / 2, height / 2, 0]}>
          <mesh>
            <boxGeometry args={[0.7, height, 0.7]} />
            <meshStandardMaterial color="#120f26" metalness={0.8} roughness={0.3} />
          </mesh>
          <mesh position={[-s * 0.36, 0, 0]}>
            <boxGeometry args={[0.05, height, 0.12]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={4} toneMapped={false} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, height, 0]}>
        <boxGeometry args={[width + 0.7, 0.8, 0.8]} />
        <meshStandardMaterial color="#120f26" metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position={[0, height - 0.42, 0]}>
        <boxGeometry args={[width, 0.06, 0.82]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={5} toneMapped={false} />
      </mesh>
      {banner &&
        [0, Math.PI].map((ry) => (
          // two single-sided faces so the text reads correctly from both directions
          <mesh key={ry} position={[0, height + 1.4, ry ? -0.05 : 0.05]} rotation={[0, ry, 0]}>
            <planeGeometry args={[Math.min(width, 16), 2.5]} />
            <meshBasicMaterial map={banner} toneMapped={false} />
          </mesh>
        ))}
    </group>
  );
}

function City({ side, roadHalf }: { side: 1 | -1; roadHalf: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const count = 140;
  const tex = useMemo(windowsTexture, []);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const rnd = mulberry(side === 1 ? 7 : 13);
    for (let i = 0; i < count; i++) {
      const w = 6 + rnd() * 12;
      const h = 8 + rnd() * rnd() * 90;
      const x = side * (roadHalf + 14 + rnd() * 70);
      const z = 80 - (i / count) * (TRACK_LEN + 300) + rnd() * 6;
      m.compose(new THREE.Vector3(x, h / 2, z), new THREE.Quaternion(), new THREE.Vector3(w, h, w));
      ref.current!.setMatrixAt(i, m);
    }
    ref.current!.instanceMatrix.needsUpdate = true;
  }, [side, roadHalf]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]}>
      <boxGeometry />
      <meshStandardMaterial color="#07061a" emissiveMap={tex} emissive="#ffffff" emissiveIntensity={1.4} roughness={0.8} />
    </instancedMesh>
  );
}

function mulberry(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function Sun() {
  const tex = useMemo(
    () =>
      canvasTex(512, 512, (ctx) => {
        const g = ctx.createLinearGradient(0, 0, 0, 512);
        g.addColorStop(0, '#ffd36b');
        g.addColorStop(0.55, '#ff2bd6');
        g.addColorStop(1, '#5b1cff');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(256, 256, 250, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'destination-out';
        for (let i = 0; i < 9; i++) {
          const y = 290 + i * 26;
          ctx.fillRect(0, y, 512, 4 + i * 1.6);
        }
      }),
    [],
  );
  return (
    <mesh position={[0, 70, -TRACK_LEN - 520]}>
      <planeGeometry args={[260, 260]} />
      <meshBasicMaterial map={tex} transparent toneMapped={false} fog={false} />
    </mesh>
  );
}

export function Track({ lanes }: { lanes: number }) {
  const roadW = Math.max(lanes, 3) * LANE_W + 2.4;
  const len = TRACK_LEN + 260;
  const road = useMemo(() => roadTexture(Math.max(lanes, 3), len), [lanes, len]);
  const checker = useMemo(checkerTexture, []);
  const finish = useMemo(() => bannerTexture('FINISH', '#ff2bd6', '#22e5ff'), []);
  const start = useMemo(() => bannerTexture('MODEL ARENA', '#22e5ff', '#b6ff3b'), []);

  const arches = useMemo(() => {
    const out: { z: number; color: string }[] = [];
    for (let z = -60, i = 0; z > -TRACK_LEN + 20; z -= 75, i++) out.push({ z, color: i % 2 ? '#ff2bd6' : '#22e5ff' });
    return out;
  }, []);

  return (
    <group>
      {/* ground grid */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, -TRACK_LEN / 2]}>
        <planeGeometry args={[900, TRACK_LEN + 900]} />
        <meshStandardMaterial color="#05040d" roughness={1} />
      </mesh>
      <gridHelper args={[1400, 140, '#3b1e8a', '#1c1145']} position={[0, 0, -TRACK_LEN / 2]} />

      {/* road */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 60 - len / 2]} receiveShadow>
        <planeGeometry args={[roadW, len]} />
        <meshStandardMaterial map={road} emissiveMap={road} emissive="#ffffff" emissiveIntensity={0.9} roughness={0.55} metalness={0.3} />
      </mesh>

      {/* barriers */}
      {[-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[(s * roadW) / 2 + s * 0.35, 0.45, 60 - len / 2]}>
            <boxGeometry args={[0.35, 0.9, len]} />
            <meshStandardMaterial color="#0f0c22" metalness={0.7} roughness={0.4} />
          </mesh>
          <mesh position={[(s * roadW) / 2 + s * 0.15, 0.75, 60 - len / 2]}>
            <boxGeometry args={[0.06, 0.08, len]} />
            <meshStandardMaterial color={s < 0 ? '#22e5ff' : '#ff2bd6'} emissive={s < 0 ? '#22e5ff' : '#ff2bd6'} emissiveIntensity={4} toneMapped={false} />
          </mesh>
        </group>
      ))}

      {/* start & finish */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <planeGeometry args={[roadW, 1.4]} />
        <meshStandardMaterial map={checker} emissiveMap={checker} emissive="#ffffff" emissiveIntensity={0.5} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, -TRACK_LEN]}>
        <planeGeometry args={[roadW, 3]} />
        <meshStandardMaterial map={checker} emissiveMap={checker} emissive="#ffffff" emissiveIntensity={1.2} />
      </mesh>
      <Arch z={-1.5} width={roadW + 1.4} color="#b6ff3b" height={8} banner={start} />
      <Arch z={-TRACK_LEN} width={roadW + 1.4} color="#ff2bd6" height={11} banner={finish} />
      {arches.map((a) => (
        <Arch key={a.z} z={a.z} width={roadW + 1.4} color={a.color} />
      ))}

      <City side={1} roadHalf={roadW / 2} />
      <City side={-1} roadHalf={roadW / 2} />
      <Sun />
    </group>
  );
}
