"use client";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { OrbitControls, Grid, TransformControls, Center } from "@react-three/drei";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import * as THREE from "three";
import { Move3D, Rotate3D, Scale3D, Trash2, Check, X, Box, Circle, Cone, Cylinder, Triangle, Loader2, CircleDot } from "lucide-react";
import { cn, colorFor } from "@/lib/utils";
import { SHAPE_PRESETS, newShape, type EditShape, type ShapeKind } from "@/lib/editor";

const ICONS: Record<ShapeKind, React.ComponentType<{ className?: string }>> = { box: Box, cylinder: Cylinder, sphere: Circle, cone: Cone, torus: CircleDot, wedge: Triangle };

function BaseMesh({ url, color }: { url: string; color: string }) {
  const geometry = useLoader(STLLoader, url);
  useEffect(() => { geometry.computeVertexNormals(); }, [geometry]);
  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial color={color} roughness={0.5} transparent opacity={0.55} />
    </mesh>
  );
}

function ShapeGeometry({ s }: { s: EditShape }) {
  // Unit geometries scaled by size; Z-up inside the rotated parent group.
  const [w, d, h] = s.size;
  switch (s.kind) {
    case "box": return <boxGeometry args={[w, d, h]} />;
    case "cylinder": return <cylinderGeometry args={[w / 2, w / 2, h, 48]} />;
    case "cone": return <cylinderGeometry args={[0.001, w / 2, h, 48]} />;
    case "sphere": return <sphereGeometry args={[w / 2, 32, 24]} />;
    case "torus": { const tube = Math.min(h / 2, w / 4); return <torusGeometry args={[w / 2 - tube, tube, 16, 48]} />; }
    case "wedge": {
      const shape = new THREE.Shape(); shape.moveTo(-w / 2, -d / 2); shape.lineTo(w / 2, -d / 2); shape.lineTo(-w / 2, d / 2); shape.closePath();
      return <extrudeGeometry args={[shape, { depth: h, bevelEnabled: false }]} />;
    }
  }
}

function ShapeMesh({ s, selected, onSelect, meshRef }: { s: EditShape; selected: boolean; onSelect: () => void; meshRef: (el: THREE.Mesh | null) => void }) {
  // three primitives are Y-up (cylinder/cone/torus/sphere axis = Y); our frame is Z-up, so rotate those by +90° about X.
  const yUp = s.kind === "cylinder" || s.kind === "cone";
  const torus = s.kind === "torus";
  const wedge = s.kind === "wedge";
  return (
    <group position={s.position} rotation={s.rotation.map((a) => (a * Math.PI) / 180) as [number, number, number]}>
      <mesh
        ref={meshRef}
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
        rotation={yUp ? [Math.PI / 2, 0, 0] : torus ? [0, 0, 0] : [0, 0, 0]}
        position={wedge ? [0, 0, -s.size[2] / 2] : [0, 0, 0]}
        scale={s.kind === "cylinder" || s.kind === "cone" || s.kind === "torus" ? [1, 1, s.size[1] / s.size[0]] : s.kind === "sphere" ? [1, s.size[1] / s.size[0], s.size[2] / s.size[0]] : [1, 1, 1]}
      >
        <ShapeGeometry s={s} />
        <meshStandardMaterial color={s.mode === "hole" ? "#ff5a5a" : s.color} transparent opacity={s.mode === "hole" ? 0.45 : 0.9} wireframe={false} emissive={selected ? "#ffffff" : "#000000"} emissiveIntensity={selected ? 0.12 : 0} />
      </mesh>
    </group>
  );
}

export function ShapeEditor({ modelId, stlUrl, size, onApplied, onCancel, setup }: {
  modelId: string; stlUrl: string; size?: [number, number, number];
  onApplied: (model: unknown) => void; onCancel: () => void; setup: unknown;
}) {
  const [shapes, setShapes] = useState<EditShape[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<"translate" | "rotate" | "scale">("translate");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const groupRefs = useRef<Map<string, THREE.Object3D>>(new Map());
  const [selObj, setSelObj] = useState<THREE.Object3D | null>(null);
  const radius = useMemo(() => (size ? Math.max(Math.hypot(...size) * 0.9, 30) : 100), [size]);
  const sel = shapes.find((s) => s.id === selected) ?? null;

  function add(kind: ShapeKind) {
    const preset = SHAPE_PRESETS.find((p) => p.kind === kind)!;
    const top = size ? size[2] : 20;
    const s = newShape(kind, [...preset.size] as [number, number, number], [0, 0, top / 2]);
    setShapes((xs) => [...xs, s]);
    setSelected(s.id);
  }
  function update(id: string, patch: Partial<EditShape>) { setShapes((xs) => xs.map((s) => (s.id === id ? { ...s, ...patch } : s))); }
  function remove(id: string) { setShapes((xs) => xs.filter((s) => s.id !== id)); if (selected === id) setSelected(null); }

  // Sync gizmo edits back into state when a drag ends.
  function commitFromObject(id: string) {
    const o = groupRefs.current.get(id);
    const s = shapes.find((x) => x.id === id);
    if (!o || !s) return;
    const r = (n: number) => Math.round(n * 10) / 10;
    const rot = o.rotation;
    const sc = o.scale;
    update(id, {
      position: [r(o.position.x), r(o.position.y), r(o.position.z)],
      rotation: [r((rot.x * 180) / Math.PI), r((rot.y * 180) / Math.PI), r((rot.z * 180) / Math.PI)],
      size: [r(s.size[0] * sc.x), r(s.size[1] * sc.y), r(s.size[2] * sc.z)],
    });
    o.scale.set(1, 1, 1);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selected && !(e.target as HTMLElement).matches("input")) remove(selected);
      if (e.key === "g") setMode("translate"); if (e.key === "r") setMode("rotate"); if (e.key === "s" && !(e.target as HTMLElement).matches("input")) setMode("scale");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  async function apply() {
    if (!shapes.length) { setError("Add at least one shape first."); return; }
    setBusy(true); setError(null);
    const res = await fetch(`/api/models/${modelId}/edit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ shapes, setup }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(j.error || "Could not apply the edit"); return; }
    onApplied(j.model);
  }

  const num = (key: string, v: number, on: (n: number) => void, step = 1) => (
    <input key={key} type="number" step={step} value={v} onChange={(e) => on(Number(e.target.value))} className="w-16 rounded-md border border-line bg-elev px-1.5 py-1 text-xs text-fg" />
  );

  return (
    <div className="relative flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-card/90 px-3 py-2 text-xs">
        <span className="font-medium">Edit shapes</span>
        <span className="mx-1 h-4 w-px bg-line" />
        {SHAPE_PRESETS.map((p) => { const I = ICONS[p.kind]; return <button key={p.kind} onClick={() => add(p.kind)} className="btn-ghost !px-2 !py-1 text-xs" title={`Add ${p.label}`}><I className="h-3.5 w-3.5" />{p.label}</button>; })}
        <span className="mx-1 h-4 w-px bg-line" />
        {([["translate", Move3D, "Move (G)"], ["rotate", Rotate3D, "Rotate (R)"], ["scale", Scale3D, "Scale (S)"]] as const).map(([m, I, t]) => (
          <button key={m} onClick={() => setMode(m)} className={cn("btn-ghost !px-2 !py-1 text-xs", mode === m && "border-accent text-accent")} title={t}><I className="h-3.5 w-3.5" /></button>
        ))}
        <span className="ml-auto flex gap-2">
          <button onClick={onCancel} disabled={busy} className="btn-ghost !px-3 !py-1 text-xs"><X className="h-3.5 w-3.5" />Cancel</button>
          <button onClick={apply} disabled={busy || !shapes.length} className="btn-primary !px-3 !py-1 text-xs">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}{busy ? "Building…" : "Apply & exit"}</button>
        </span>
      </div>

      <div className="relative flex-1">
        <Canvas shadows dpr={[1, 1.75]} camera={{ position: [radius * 1.1, radius * 0.8, radius * 1.1], fov: 40, near: 0.1, far: radius * 50 }} gl={{ antialias: true }} onPointerMissed={() => !dragging && setSelected(null)}>
          <color attach="background" args={["#0b0d14"]} />
          <hemisphereLight args={["#cfd6ff", "#1a1530", 0.9]} />
          <ambientLight intensity={0.25} />
          <directionalLight position={[radius, radius * 1.5, radius]} intensity={1.4} />
          {/* Z-up world: everything inside this group uses model coordinates. */}
          <group rotation={[-Math.PI / 2, 0, 0]}>
            <Suspense fallback={null}>
              <BaseMesh url={stlUrl} color={colorFor(modelId)} />
            </Suspense>
            {shapes.map((s) => (
              <group key={s.id} ref={(el) => { if (el) groupRefs.current.set(s.id, el); else groupRefs.current.delete(s.id); if (s.id === selected) setSelObj(el); }} position={s.position} rotation={s.rotation.map((a) => (a * Math.PI) / 180) as [number, number, number]}>
                <ShapeMesh s={{ ...s, position: [0, 0, 0], rotation: [0, 0, 0] }} selected={s.id === selected} onSelect={() => setSelected(s.id)} meshRef={() => {}} />
              </group>
            ))}
          </group>
          {sel && selObj && (
            <TransformControls
              object={selObj}
              mode={mode}
              space="local"
              translationSnap={1}
              rotationSnap={(15 * Math.PI) / 180}
              scaleSnap={0.1}
              onMouseDown={() => setDragging(true)}
              onMouseUp={() => { setDragging(false); commitFromObject(sel.id); }}
            />
          )}
          <Center top position={[0, -0.01, 0]} />
          <Grid position={[0, -0.02, 0]} args={[radius * 4, radius * 4]} cellSize={10} sectionSize={50} cellColor="#2a2f3f" sectionColor="#3a4160" fadeDistance={radius * 4} infiniteGrid />
          <OrbitControls makeDefault enabled={!dragging} target={new THREE.Vector3(0, (size?.[2] ?? 30) / 2, 0)} />
        </Canvas>

        {/* Properties */}
        <div className="absolute right-3 top-3 w-64 rounded-xl border border-line bg-card/95 p-3 text-xs backdrop-blur">
          {sel ? (
            <>
              <div className="flex items-center justify-between">
                <span className="font-medium capitalize">{sel.kind}</span>
                <div className="flex gap-1">
                  <button aria-label="Toggle solid or hole" onClick={() => update(sel.id, { mode: sel.mode === "solid" ? "hole" : "solid" })} className={cn("rounded-full border px-2 py-0.5", sel.mode === "hole" ? "border-accent-3 text-accent-3" : "border-accent-2 text-accent-2")} title="Click to switch between adding this shape and cutting it out">{sel.mode === "hole" ? "Hole (cuts)" : "Solid (adds)"} ⇄</button>
                  <button onClick={() => remove(sel.id)} className="rounded-full border border-line px-2 py-0.5 text-accent-3" title="Delete (Del)"><Trash2 className="h-3 w-3" /></button>
                </div>
              </div>
              {([["Size (W D H)", "size", 1], ["Position (X Y Z)", "position", 1], ["Rotation (°)", "rotation", 5]] as const).map(([label, key, step]) => (
                <div key={key} className="mt-2">
                  <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
                  <div className="mt-1 flex gap-1">
                    {[0, 1, 2].map((i) => num(`${key}-${i}`, sel[key][i], (n) => { const arr = [...sel[key]] as [number, number, number]; arr[i] = key === "size" ? Math.max(0.5, n) : n; update(sel.id, { [key]: arr } as Partial<EditShape>); }, step))}
                  </div>
                </div>
              ))}
              <p className="mt-2 text-[10px] text-muted">Drag the gizmo or type values. Solid shapes are added; holes are cut out. Anything below the bed (z = 0) is trimmed. Snap: 1 mm / 15°.</p>
            </>
          ) : (
            <p className="text-muted">Add a shape from the toolbar, then click it to move, rotate or scale. Mark it as a <b className="text-accent-3">hole</b> to cut it out of the model.</p>
          )}
          {shapes.length > 0 && (
            <ul className="mt-3 max-h-32 space-y-1 overflow-y-auto border-t border-line pt-2">
              {shapes.map((s) => (
                <li key={s.id}><button onClick={() => setSelected(s.id)} className={cn("flex w-full items-center justify-between rounded-md px-2 py-1 text-left hover:bg-fg/5", selected === s.id && "bg-accent/15 text-accent")}><span className="capitalize">{s.kind}</span><span className={s.mode === "hole" ? "text-accent-3" : "text-muted"}>{s.mode}</span></button></li>
              ))}
            </ul>
          )}
          {error && <p className="mt-2 text-accent-3">{error}</p>}
        </div>
      </div>
    </div>
  );
}
