import { Suspense, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Environment, MeshDistortMaterial, Icosahedron } from "@react-three/drei";
import type { Mesh } from "three";
import { MotionValue, useMotionValueEvent } from "framer-motion";

function Artifact({ scroll }: { scroll: MotionValue<number> }) {
  const mesh = useRef<Mesh>(null);
  const target = useRef(0);

  useMotionValueEvent(scroll, "change", (v) => {
    target.current = v;
  });

  useFrame((_, delta) => {
    if (!mesh.current) return;
    mesh.current.rotation.y += delta * 0.15;
    mesh.current.rotation.x += delta * 0.04;
    // gentle scale/position drift driven by scroll
    const s = 1 + target.current * 0.6;
    mesh.current.scale.setScalar(s);
    mesh.current.position.y = -target.current * 1.5;
  });

  return (
    <Float speed={1.2} rotationIntensity={0.4} floatIntensity={0.8}>
      <Icosahedron ref={mesh} args={[1.4, 4]}>
        <MeshDistortMaterial
          color="#caa45a"
          roughness={0.15}
          metalness={0.95}
          distort={0.32}
          speed={1.4}
        />
      </Icosahedron>
    </Float>
  );
}

export default function Scene3D({ scroll }: { scroll: MotionValue<number> }) {
  return (
    <Canvas
      camera={{ position: [0, 0, 4.5], fov: 42 }}
      dpr={[1, 1.8]}
      gl={{ antialias: true, alpha: true }}
    >
      <Suspense fallback={null}>
        <ambientLight intensity={0.4} />
        <directionalLight position={[3, 4, 2]} intensity={2.2} color="#fff4dc" />
        <directionalLight position={[-4, -2, -3]} intensity={0.8} color="#3a4a6a" />
        <Artifact scroll={scroll} />
        <Environment preset="night" />
      </Suspense>
    </Canvas>
  );
}
