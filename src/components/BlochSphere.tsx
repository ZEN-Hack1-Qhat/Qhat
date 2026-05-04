"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { EmotionProbs } from "@/lib/types";
import { emotionVector } from "@/lib/emotion";

function Particles({ decoherence }: { decoherence: number }) {
  const ref = useRef<THREE.Points>(null);
  const count = 80;

  const { positions, basePositions } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const base = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const phi = Math.acos(2 * Math.random() - 1);
      const theta = Math.random() * Math.PI * 2;
      const r = 1.02;
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
      base[i * 3] = x;
      base[i * 3 + 1] = y;
      base[i * 3 + 2] = z;
    }
    return { positions: pos, basePositions: base };
  }, []);

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.getElapsedTime();
    const geo = ref.current.geometry as THREE.BufferGeometry;
    const arr = (geo.getAttribute("position") as THREE.BufferAttribute).array as Float32Array;
    const spread = 1 + (decoherence / 100) * 0.6;
    const drift = 0.04 + (decoherence / 100) * 0.12;
    for (let i = 0; i < count; i++) {
      const bx = basePositions[i * 3];
      const by = basePositions[i * 3 + 1];
      const bz = basePositions[i * 3 + 2];
      arr[i * 3] = bx * spread + Math.sin(t * 0.7 + i) * drift;
      arr[i * 3 + 1] = by * spread + Math.cos(t * 0.8 + i * 1.3) * drift;
      arr[i * 3 + 2] = bz * spread + Math.sin(t * 0.6 + i * 0.7) * drift;
    }
    (geo.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
  });

  const color = decoherence > 60 ? "#7B5BAB" : "#C9A548";

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial size={0.04} color={color} transparent opacity={0.85} />
    </points>
  );
}

function Arrow({ vec }: { vec: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null);
  const target = useMemo(() => new THREE.Vector3(...vec).normalize(), [vec]);

  useFrame(() => {
    if (!ref.current) return;
    const current = new THREE.Vector3(0, 1, 0).applyQuaternion(
      ref.current.quaternion
    );
    const q = new THREE.Quaternion().setFromUnitVectors(current, target);
    ref.current.quaternion.slerp(
      ref.current.quaternion.clone().premultiply(q),
      0.08
    );
  });

  return (
    <group ref={ref}>
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 1, 12]} />
        <meshBasicMaterial color="#C9A548" />
      </mesh>
      <mesh position={[0, 1.05, 0]}>
        <coneGeometry args={[0.07, 0.18, 16]} />
        <meshBasicMaterial color="#C9A548" />
      </mesh>
    </group>
  );
}

function Sphere() {
  return (
    <group>
      <mesh>
        <sphereGeometry args={[1, 32, 32]} />
        <meshBasicMaterial color="#1A1A1A" wireframe transparent opacity={0.08} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.999, 64, 64]} />
        <meshBasicMaterial color="#F8F6F0" transparent opacity={0.04} />
      </mesh>
      {/* axes */}
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={2}
            array={new Float32Array([0, -1.2, 0, 0, 1.2, 0])}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#A09C92" />
      </line>
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={2}
            array={new Float32Array([-1.2, 0, 0, 1.2, 0, 0])}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#A09C92" />
      </line>
      <line>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={2}
            array={new Float32Array([0, 0, -1.2, 0, 0, 1.2])}
            itemSize={3}
          />
        </bufferGeometry>
        <lineBasicMaterial color="#A09C92" />
      </line>
    </group>
  );
}

function Scene({
  probs,
  decoherence,
}: {
  probs: EmotionProbs;
  decoherence: number;
}) {
  const vec = emotionVector(probs);
  const groupRef = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (groupRef.current) groupRef.current.rotation.y += dt * 0.15;
  });
  return (
    <group ref={groupRef}>
      <Sphere />
      <Arrow vec={vec} />
      <Particles decoherence={decoherence} />
    </group>
  );
}

export function BlochSphere({
  probs,
  decoherence,
}: {
  probs: EmotionProbs;
  decoherence: number;
}) {
  return (
    <div className="aspect-square w-full">
      <Canvas camera={{ position: [2.2, 1.6, 2.2], fov: 45 }}>
        <ambientLight intensity={1} />
        <Scene probs={probs} decoherence={decoherence} />
      </Canvas>
    </div>
  );
}
