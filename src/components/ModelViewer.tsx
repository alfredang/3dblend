"use client";
import { Suspense, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Canvas, useLoader, useThree } from "@react-three/fiber";
import { OrbitControls, Grid, ContactShadows, Center, Environment, Lightformer } from "@react-three/drei";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import * as THREE from "three";

/** Filament surface presets for the realistic render. */
export const FINISHES = {
  matte: { label: "Matte PLA", roughness: 0.62, metalness: 0, clearcoat: 0, sheen: 0.2 },
  silk: { label: "Silk PLA", roughness: 0.28, metalness: 0.35, clearcoat: 0.25, sheen: 0.6 },
  glossy: { label: "PETG", roughness: 0.18, metalness: 0, clearcoat: 0.8, sheen: 0 },
} as const;
export type Finish = keyof typeof FINISHES;

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

/**
 * FDM layer lines as a shading-only ripple along the build axis (world Y after
 * the Z-up → Y-up rotation). It fades out once a layer is smaller than a pixel
 * or two, so it never moirés and only shows when you zoom in, as on a real print.
 */
function addLayerLines(material: THREE.MeshPhysicalMaterial, layerHeight: number) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uLayer = { value: layerHeight };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying float vBuildZ;")
      .replace("#include <project_vertex>", "#include <project_vertex>\nvBuildZ = (modelMatrix * vec4(transformed, 1.0)).y;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vBuildZ;\nuniform float uLayer;")
      .replace(
        "#include <normal_fragment_maps>",
        `#include <normal_fragment_maps>
        {
          vec3 upView = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
          float side = 1.0 - abs(dot(normal, upView));
          float px = fwidth(vBuildZ) / uLayer;
          float fade = 1.0 - smoothstep(0.2, 0.55, px);
          float ripple = cos(6.2831853 * vBuildZ / uLayer);
          normal = normalize(normal + upView * 0.45 * ripple * side * fade);
        }`,
      );
  };
  material.customProgramCacheKey = () => `layers-${layerHeight}`;
}

function RenderMesh({ url, color, finish, layerHeight }: { url: string; color: string; finish: Finish; layerHeight: number }) {
  const raw = useLoader(STLLoader, url);
  // Smooth curved faces but keep sharp edges crisp — flat facets read as "CAD", not "print".
  const geometry = useMemo(() => toCreasedNormals(raw.clone(), Math.PI / 6), [raw]);
  const material = useMemo(() => {
    const f = FINISHES[finish];
    const m = new THREE.MeshPhysicalMaterial({ color, roughness: f.roughness, metalness: f.metalness, clearcoat: f.clearcoat, clearcoatRoughness: 0.35, sheen: f.sheen, sheenColor: new THREE.Color(color).lerp(new THREE.Color("#ffffff"), 0.5), sheenRoughness: 0.5 });
    addLayerLines(m, layerHeight);
    return m;
  }, [color, finish, layerHeight]);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);
  return <mesh geometry={geometry} material={material} rotation={[-Math.PI / 2, 0, 0]} castShadow receiveShadow />;
}

/** Procedural photo-studio lighting: no HDRI download, so it works offline and loads instantly. */
function StudioLights({ radius }: { radius: number }) {
  return (
    <Environment resolution={256} frames={1} environmentIntensity={1.6}>
      <color attach="background" args={["#202024"]} />
      <Lightformer form="rect" intensity={3} position={[0, 5, -3]} scale={[10, 4, 1]} target={[0, 0, 0]} />
      <Lightformer form="rect" intensity={1.6} position={[-6, 2, 2]} scale={[4, 6, 1]} target={[0, 0, 0]} />
      <Lightformer form="rect" intensity={1.2} position={[6, 1.5, 3]} scale={[3, 5, 1]} target={[0, 0, 0]} />
      <Lightformer form="ring" intensity={0.8} position={[0, 3, 6]} scale={2} target={[0, 0, 0]} />
      <Lightformer form="rect" intensity={0.4} color="#ffe9d6" position={[0, -radius * 0.02 - 1, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[20, 20, 1]} />
    </Environment>
  );
}

/** Seamless photo-backdrop tones (a sweep of paper, not the dark grid). */
const renderColors = (dark: boolean) => (dark ? { renderBg: "#2a2b31", shadow: "#0d0d12" } : { renderBg: "#ecebe7", shadow: "#5b5850" });

function useThemeColors() {
  const readColors = () => {
    const cs = getComputedStyle(document.documentElement);
    const dark = document.documentElement.dataset.theme !== "light";
    return { bg: cs.getPropertyValue("--viewer-bg").trim() || "#0b0d14", cell: cs.getPropertyValue("--grid-cell").trim() || "#2a2f3f", section: cs.getPropertyValue("--grid-section").trim() || "#3a4160", ...renderColors(dark) };
  };
  const [colors, setColors] = useState({ bg: "#0b0d14", cell: "#2a2f3f", section: "#3a4160", ...renderColors(true) });
  useEffect(() => {
    const update = () => setColors(readColors());
    update();
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);
  return colors;
}

export function ModelViewer({
  url,
  size,
  color = "#8f7cff",
  autoRotate = true,
  interactive = true,
  className,
  frameloop,
  look = "standard",
  finish = "matte",
  layerHeight = 0.2,
  onCanvas,
}: {
  url: string;
  /** Model size in mm, used to frame the camera. */
  size?: [number, number, number];
  color?: string;
  autoRotate?: boolean;
  interactive?: boolean;
  className?: string;
  frameloop?: "always" | "demand";
  /** "render" = photo-studio lighting, filament material and soft shadows instead of the grid. */
  look?: "standard" | "render";
  finish?: Finish;
  layerHeight?: number;
  /** Receives the canvas element (e.g. to save a PNG; the drawing buffer is preserved). */
  onCanvas?: (canvas: HTMLCanvasElement) => void;
}) {
  // Render the WebGL canvas only on the client (no SSR markup for it).
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const radius = useMemo(() => (size ? Math.max(Math.hypot(...size) * 0.9, 20) : 100), [size]);
  const theme = useThemeColors();

  if (!mounted) return <div className={className} />;
  const render = look === "render";
  const target = new THREE.Vector3(0, (size?.[2] ?? 30) / 2, 0);
  return (
    <div className={className}>
      <Canvas
        shadows
        dpr={render ? [1, 2] : [1, 1.75]}
        frameloop={render ? "always" : frameloop ?? (autoRotate ? "always" : "demand")}
        camera={{ position: [radius * 1.1, radius * 0.8, radius * 1.1], fov: 40, near: 0.1, far: radius * 50 }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        onCreated={({ gl }) => onCanvas?.(gl.domElement)}
      >
        {render ? (
          <>
            <color attach="background" args={[theme.renderBg]} />
            <fog attach="fog" args={[theme.renderBg, radius * 3, radius * 9]} />
            <StudioLights radius={radius} />
            {/* Key light with a shadow frustum sized (in mm) to the model. */}
            <directionalLight
              position={[-radius * 0.9, radius * 1.8, -radius * 0.5]}
              intensity={1.1}
              castShadow
              shadow-mapSize={[2048, 2048]}
              shadow-camera-left={-radius * 1.5}
              shadow-camera-right={radius * 1.5}
              shadow-camera-top={radius * 1.5}
              shadow-camera-bottom={-radius * 1.5}
              shadow-camera-near={radius * 0.5}
              shadow-camera-far={radius * 5}
              shadow-radius={8}
              shadow-blurSamples={16}
              shadow-bias={-0.0004}
              shadow-normalBias={radius * 0.002}
            />
            <Suspense fallback={null}>
              <Center top>
                <RenderMesh url={url} color={color} finish={finish} layerHeight={layerHeight} />
              </Center>
            </Suspense>
            {/* Shadow-only floor: transparent except where the model's shadow falls, so the backdrop stays seamless. */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
              <planeGeometry args={[radius * 10, radius * 10]} />
              <shadowMaterial transparent opacity={0.35} color={theme.shadow} />
            </mesh>
          </>
        ) : (
          <>
            <color attach="background" args={[theme.bg]} />
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
              cellColor={theme.cell}
              sectionColor={theme.section}
              fadeDistance={radius * 4}
              infiniteGrid
            />
          </>
        )}
        <OrbitControls
          enablePan={interactive}
          enableZoom={interactive}
          enableRotate={interactive}
          autoRotate={autoRotate && !render}
          autoRotateSpeed={1.2}
          makeDefault
          target={target}
        />
      </Canvas>
    </div>
  );
}
