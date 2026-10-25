"use client";
import { Suspense, useEffect, useMemo, useSyncExternalStore } from "react";
import { Canvas, useLoader, useThree } from "@react-three/fiber";
import { OrbitControls, Grid, ContactShadows, Center } from "@react-three/drei";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import * as THREE from "three";

function Mesh({ url, color }: { url: string; color: string }) {
  const geometry = useLoader(STLLoader, url);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    invalidate();
  }, [geometry, invalidate]);
  // STL is Z-up (printer convention); three.js is Y-up.
  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow>
      <meshStandardMaterial color={color} roughness={0.45} metalness={0.05} />
    </mesh>
  );
}

export function ModelViewer({
  url,
  size,
  color = "#8f7cff",
  autoRotate = true,
  interactive = true,
  className,
  frameloop,
}: {
  url: string;
  /** Model size in mm, used to frame the camera. */
  size?: [number, number, number];
  color?: string;
  autoRotate?: boolean;
  interactive?: boolean;
  className?: string;
  frameloop?: "always" | "demand";
}) {
  // Render the WebGL canvas only on the client (no SSR markup for it).
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const radius = useMemo(() => (size ? Math.max(Math.hypot(...size) * 0.9, 20) : 100), [size]);

  if (!mounted) return <div className={className} />;
  return (
    <div className={className}>
      <Canvas
        shadows
        dpr={[1, 1.75]}
        frameloop={frameloop ?? (autoRotate ? "always" : "demand")}
        camera={{ position: [radius * 1.1, radius * 0.8, radius * 1.1], fov: 40, near: 0.1, far: radius * 50 }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
      >
        <color attach="background" args={["#0b0d14"]} />
        <hemisphereLight args={["#cfd6ff", "#1a1530", 0.9]} />
        <ambientLight intensity={0.25} />
        <directionalLight position={[radius, radius * 1.5, radius]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
        <directionalLight position={[-radius, radius * 0.5, -radius]} intensity={0.5} />
        <Suspense fallback={null}>
          <Center top>
            <Mesh url={url} color={color} />
          </Center>
          <ContactShadows position={[0, 0.01, 0]} opacity={0.55} scale={radius * 2.5} blur={2.2} far={radius} />
        </Suspense>
        <Grid
          position={[0, -0.02, 0]}
          args={[radius * 4, radius * 4]}
          cellSize={10}
          sectionSize={50}
          cellColor="#2a2f3f"
          sectionColor="#3a4160"
          fadeDistance={radius * 4}
          infiniteGrid
        />
        <OrbitControls
          enablePan={interactive}
          enableZoom={interactive}
          enableRotate={interactive}
          autoRotate={autoRotate}
          autoRotateSpeed={1.2}
          makeDefault
          target={new THREE.Vector3(0, (size?.[2] ?? 30) / 2, 0)}
        />
      </Canvas>
    </div>
  );
}
