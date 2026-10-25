"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useLoader, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Grid, TransformControls, GizmoHelper, GizmoViewcube } from "@react-three/drei";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import * as THREE from "three";
import { Move3D, Rotate3D, Scale3D, Trash2, Check, X, Box, Circle, Cone, Cylinder, Triangle, Loader2, CircleDot, Undo2, Redo2, Copy, ArrowDownToLine, Crosshair, Eraser } from "lucide-react";
import { cn, colorFor } from "@/lib/utils";
import { SHAPE_PRESETS, newShape, type EditShape, type ShapeKind } from "@/lib/editor";

const ICONS: Record<ShapeKind, React.ComponentType<{ className?: string }>> = { box: Box, cylinder: Cylinder, sphere: Circle, cone: Cone, torus: CircleDot, wedge: Triangle };
type Tool = "move" | "rotate" | "scale";

/* ---------- geometry helpers ---------- */
function BaseMesh({ url, color }: { url: string; color: string }) {
  const geometry = useLoader(STLLoader, url);
  useEffect(() => { geometry.computeVertexNormals(); }, [geometry]);
  return <mesh geometry={geometry}><meshStandardMaterial color={color} roughness={0.5} transparent opacity={0.55} /></mesh>;
}

function ShapeGeometry({ s }: { s: EditShape }) {
  const [w, d, h] = s.size;
  switch (s.kind) {
    case "box": return <boxGeometry args={[w, d, h]} />;
    case "cylinder": return <cylinderGeometry args={[w / 2, w / 2, h, 48]} />;
    case "cone": return <cylinderGeometry args={[0.001, w / 2, h, 48]} />;
    case "sphere": return <sphereGeometry args={[w / 2, 32, 24]} />;
    case "torus": { const tube = Math.min(h / 2, w / 4); return <torusGeometry args={[w / 2 - tube, tube, 16, 48]} />; }
    case "wedge": { const shape = new THREE.Shape(); shape.moveTo(-w / 2, -d / 2); shape.lineTo(w / 2, -d / 2); shape.lineTo(-w / 2, d / 2); shape.closePath(); return <extrudeGeometry args={[shape, { depth: h, bevelEnabled: false }]} />; }
  }
}

/** Visual for one shape, in model (Z-up) coordinates; parent group carries position/rotation. */
function ShapeVisual({ s, selected, onPointerDown }: { s: EditShape; selected: boolean; onPointerDown: (e: ThreeEvent<PointerEvent>) => void }) {
  const yUp = s.kind === "cylinder" || s.kind === "cone";
  const scale: [number, number, number] = yUp || s.kind === "torus" ? [1, 1, s.size[1] / s.size[0]] : s.kind === "sphere" ? [1, s.size[1] / s.size[0], s.size[2] / s.size[0]] : [1, 1, 1];
  return (
    <mesh onPointerDown={onPointerDown} rotation={yUp ? [Math.PI / 2, 0, 0] : [0, 0, 0]} position={s.kind === "wedge" ? [0, 0, -s.size[2] / 2] : [0, 0, 0]} scale={scale}>
      <ShapeGeometry s={s} />
      <meshStandardMaterial color={s.mode === "hole" ? "#ff5a5a" : s.color} transparent opacity={s.mode === "hole" ? 0.45 : 0.92} emissive={selected ? "#ffffff" : "#000000"} emissiveIntensity={selected ? 0.15 : 0} />
      {selected && <lineSegments><edgesGeometry args={[new THREE.BoxGeometry(s.size[0] + 0.6, s.kind === "wedge" || s.kind === "box" ? s.size[1] + 0.6 : s.size[1] + 0.6, s.size[2] + 0.6)]} /><lineBasicMaterial color="#ffffff" /></lineSegments>}
    </mesh>
  );
}

/** Exposes camera + canvas size to the DOM layer so palette drops can be projected onto the workplane. */
function CameraBridge({ onReady }: { onReady: (camera: THREE.Camera, el: HTMLElement) => void }) {
  const { camera, gl } = useThree();
  useEffect(() => { onReady(camera, gl.domElement); }, [camera, gl, onReady]);
  return null;
}

/* ---------- editor ---------- */
export function ShapeEditor({ modelId, stlUrl, size, onApplied, onCancel, setup }: {
  modelId: string; stlUrl: string; size?: [number, number, number];
  onApplied: (model: unknown) => void; onCancel: () => void; setup: unknown;
}) {
  const [shapes, setShapesRaw] = useState<EditShape[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("move");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orbitOn, setOrbitOn] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const history = useRef<{ past: EditShape[][]; future: EditShape[][] }>({ past: [], future: [] });
  const [histLen, setHistLen] = useState({ past: 0, future: 0 });
  const clipboard = useRef<EditShape | null>(null);
  const groupRefs = useRef<Map<string, THREE.Object3D>>(new Map());
  const [selObj, setSelObj] = useState<THREE.Object3D | null>(null);
  const bridge = useRef<{ camera: THREE.Camera | null; el: HTMLElement | null }>({ camera: null, el: null });
  const drag = useRef<{ id: string; offset: THREE.Vector3; startZ: number; alt: boolean; startY: number } | null>(null);
  const shapesRef = useRef(shapes);
  useEffect(() => { shapesRef.current = shapes; }, [shapes]);

  const radius = useMemo(() => (size ? Math.max(Math.hypot(...size) * 0.9, 30) : 100), [size]);
  const sel = shapes.find((s) => s.id === selected) ?? null;

  /** All edits go through commit() so they land on the undo stack. */
  const commit = useCallback((next: EditShape[] | ((prev: EditShape[]) => EditShape[])) => {
    setShapesRaw((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      history.current.past.push(prev);
      if (history.current.past.length > 100) history.current.past.shift();
      history.current.future = [];
      setHistLen({ past: history.current.past.length, future: 0 });
      return value;
    });
  }, []);
  const undo = useCallback(() => {
    const prev = history.current.past.pop();
    if (!prev) return;
    setShapesRaw((cur) => { history.current.future.push(cur); return prev; });
    setHistLen({ past: history.current.past.length, future: history.current.future.length });
  }, []);
  const redo = useCallback(() => {
    const next = history.current.future.pop();
    if (!next) return;
    setShapesRaw((cur) => { history.current.past.push(cur); return next; });
    setHistLen({ past: history.current.past.length, future: history.current.future.length });
  }, []);

  const update = useCallback((id: string, patch: Partial<EditShape>) => commit((xs) => xs.map((s) => (s.id === id ? { ...s, ...patch } : s))), [commit]);
  const remove = useCallback((id: string) => { commit((xs) => xs.filter((s) => s.id !== id)); setSelected((cur) => (cur === id ? null : cur)); }, [commit]);
  const duplicate = useCallback((id: string) => {
    const s = shapesRef.current.find((x) => x.id === id); if (!s) return;
    const copy = { ...newShape(s.kind, [...s.size] as [number, number, number], [s.position[0] + s.size[0] + 5, s.position[1], s.position[2]]), mode: s.mode, rotation: [...s.rotation] as [number, number, number] };
    commit((xs) => [...xs, copy]); setSelected(copy.id);
  }, [commit]);

  /** Place a shape at model coordinates (x, y), resting on the bed. */
  const place = useCallback((kind: ShapeKind, x: number, y: number) => {
    const preset = SHAPE_PRESETS.find((p) => p.kind === kind)!;
    const s = newShape(kind, [...preset.size] as [number, number, number], [Math.round(x), Math.round(y), preset.size[2] / 2]);
    commit((xs) => [...xs, s]); setSelected(s.id); setTool("move");
  }, [commit]);

  /** Project a DOM pointer position onto the workplane (model z = 0). Returns model x,y. */
  const projectToPlane = useCallback((clientX: number, clientY: number): [number, number] | null => {
    const { camera, el } = bridge.current; if (!camera || !el) return null;
    const r = el.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, camera);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) return null;
    return [hit.x, -hit.z]; // world (x, 0, z) → model (x, -z)
  }, []);

  /* ---- palette drag & drop ---- */
  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false);
    const kind = e.dataTransfer.getData("shape") as ShapeKind; if (!kind) return;
    const p = projectToPlane(e.clientX, e.clientY);
    place(kind, p ? p[0] : 0, p ? p[1] : 0);
  }

  /* ---- direct drag of a shape on the workplane (Alt = change height) ---- */
  function startDrag(id: string, e: ThreeEvent<PointerEvent>) {
    e.stopPropagation();
    setSelected(id);
    if (tool !== "move") return;
    const s = shapesRef.current.find((x) => x.id === id); if (!s) return;
    const p = projectToPlane(e.nativeEvent.clientX, e.nativeEvent.clientY);
    history.current.past.push(shapesRef.current); history.current.future = []; setHistLen({ past: history.current.past.length, future: 0 });
    drag.current = { id, offset: new THREE.Vector3(p ? p[0] - s.position[0] : 0, p ? p[1] - s.position[1] : 0, 0), startZ: s.position[2], alt: e.nativeEvent.altKey, startY: e.nativeEvent.clientY };
    setOrbitOn(false);
    (e.target as Element).setPointerCapture?.(e.nativeEvent.pointerId);
  }
  function moveDrag(e: React.PointerEvent) {
    const d = drag.current; if (!d) return;
    if (d.alt || e.altKey) {
      const dz = (d.startY - e.clientY) * 0.3;
      setShapesRaw((xs) => xs.map((s) => (s.id === d.id ? { ...s, position: [s.position[0], s.position[1], Math.max(s.size[2] / 2, Math.round(d.startZ + dz))] } : s)));
      return;
    }
    const p = projectToPlane(e.clientX, e.clientY); if (!p) return;
    setShapesRaw((xs) => xs.map((s) => (s.id === d.id ? { ...s, position: [Math.round(p[0] - d.offset.x), Math.round(p[1] - d.offset.y), s.position[2]] } : s)));
  }
  function endDrag() { if (drag.current) { drag.current = null; setOrbitOn(true); } }

  /* ---- keyboard ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.matches("input, textarea, select")) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
      if (mod && e.key.toLowerCase() === "d" && selected) { e.preventDefault(); duplicate(selected); return; }
      if (mod && e.key.toLowerCase() === "c" && selected) { clipboard.current = shapesRef.current.find((s) => s.id === selected) ?? null; return; }
      if (mod && e.key.toLowerCase() === "v" && clipboard.current) { e.preventDefault(); const c = clipboard.current; const copy = { ...newShape(c.kind, [...c.size] as [number, number, number], [c.position[0] + 10, c.position[1] + 10, c.position[2]]), mode: c.mode, rotation: [...c.rotation] as [number, number, number] }; commit((xs) => [...xs, copy]); setSelected(copy.id); return; }
      if ((e.key === "Delete" || e.key === "Backspace") && selected) { e.preventDefault(); remove(selected); return; }
      if (e.key === "Escape") { setSelected(null); return; }
      if (e.key.toLowerCase() === "h" && selected) { const s = shapesRef.current.find((x) => x.id === selected); if (s) update(selected, { mode: s.mode === "hole" ? "solid" : "hole" }); return; }
      if (e.key.toLowerCase() === "m" || e.key.toLowerCase() === "g") setTool("move");
      if (e.key.toLowerCase() === "r") setTool("rotate");
      if (e.key.toLowerCase() === "s") setTool("scale");
      if (selected && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown"].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const s = shapesRef.current.find((x) => x.id === selected); if (!s) return;
        const p: [number, number, number] = [...s.position];
        if (e.key === "ArrowLeft") p[0] -= step; if (e.key === "ArrowRight") p[0] += step;
        if (e.key === "ArrowUp") p[1] += step; if (e.key === "ArrowDown") p[1] -= step;
        if (e.key === "PageUp") p[2] += step; if (e.key === "PageDown") p[2] = Math.max(s.size[2] / 2, p[2] - step);
        update(selected, { position: p });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, undo, redo, duplicate, remove, update, commit]);

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
    <input key={key} type="number" step={step} value={v} onChange={(e) => on(Number(e.target.value))} className="w-[4.2rem] rounded-md border border-line bg-elev px-1.5 py-1 text-xs text-fg" />
  );
  const iconBtn = "inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs hover:bg-fg/5 disabled:opacity-40";

  return (
    <div className="relative flex h-full flex-col" onPointerMove={moveDrag} onPointerUp={endDrag} onPointerLeave={endDrag}>
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-card/90 px-3 py-2 text-xs">
        <span className="font-medium">Edit shapes</span>
        <span className="mx-1 h-4 w-px bg-line" />
        <button onClick={undo} disabled={!histLen.past} className={iconBtn} title="Undo (⌘/Ctrl+Z)"><Undo2 className="h-3.5 w-3.5" /></button>
        <button onClick={redo} disabled={!histLen.future} className={iconBtn} title="Redo (⇧⌘/Ctrl+Z)"><Redo2 className="h-3.5 w-3.5" /></button>
        <span className="mx-1 h-4 w-px bg-line" />
        {([["move", Move3D, "Move — drag on the plane, Alt-drag for height (M)"], ["rotate", Rotate3D, "Rotate (R)"], ["scale", Scale3D, "Scale (S)"]] as const).map(([m, I, t]) => (
          <button key={m} onClick={() => setTool(m)} className={cn(iconBtn, tool === m && "border-accent bg-accent/15 text-accent")} title={t}><I className="h-3.5 w-3.5" />{m}</button>
        ))}
        <span className="ml-auto flex gap-2">
          <button onClick={onCancel} disabled={busy} className="btn-ghost !px-3 !py-1 text-xs"><X className="h-3.5 w-3.5" />Cancel</button>
          <button onClick={apply} disabled={busy || !shapes.length} className="btn-primary !px-3 !py-1 text-xs">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}{busy ? "Building…" : "Apply & exit"}</button>
        </span>
      </div>

      <div className="relative flex flex-1 min-h-0">
        {/* Palette */}
        <aside className="flex w-28 shrink-0 flex-col gap-2 overflow-y-auto border-r border-line bg-card/80 p-2">
          <div className="px-1 text-[10px] uppercase tracking-wide text-muted">Shapes</div>
          {SHAPE_PRESETS.map((p) => { const I = ICONS[p.kind]; return (
            <button key={p.kind} draggable onDragStart={(e) => { e.dataTransfer.setData("shape", p.kind); e.dataTransfer.effectAllowed = "copy"; }} onClick={() => place(p.kind, (size?.[0] ?? 40) / 2 + p.size[0], 0)}
              className="flex cursor-grab flex-col items-center gap-1 rounded-xl border border-line bg-elev px-2 py-3 text-xs hover:border-accent active:cursor-grabbing" title={`Drag onto the workplane, or click to add beside the model`}>
              <I className="h-6 w-6 text-accent" />{p.label}
            </button>
          ); })}
          <p className="px-1 pt-1 text-[10px] leading-snug text-muted">Drag a shape onto the grid. Click to add it beside the model.</p>
        </aside>

        {/* Canvas */}
        <div className={cn("relative flex-1", dragOver && "ring-2 ring-inset ring-accent")} onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={onDrop}>
          <Canvas shadows dpr={[1, 1.75]} camera={{ position: [radius * 1.1, radius * 0.8, radius * 1.1], fov: 40, near: 0.1, far: radius * 50 }} gl={{ antialias: true }} onPointerMissed={() => { if (!drag.current) setSelected(null); }}>
            <CameraBridge onReady={(camera, el) => { bridge.current.camera = camera; bridge.current.el = el; }} />
            <color attach="background" args={["#0b0d14"]} />
            <hemisphereLight args={["#cfd6ff", "#1a1530", 0.9]} />
            <ambientLight intensity={0.25} />
            <directionalLight position={[radius, radius * 1.5, radius]} intensity={1.4} />
            <group rotation={[-Math.PI / 2, 0, 0]}>
              <Suspense fallback={null}><BaseMesh url={stlUrl} color={colorFor(modelId)} /></Suspense>
              {shapes.map((s) => (
                <group key={s.id} ref={(el) => { if (el) groupRefs.current.set(s.id, el); else groupRefs.current.delete(s.id); if (s.id === selected) setSelObj(el); }} position={s.position} rotation={s.rotation.map((a) => (a * Math.PI) / 180) as [number, number, number]}>
                  <ShapeVisual s={{ ...s, position: [0, 0, 0], rotation: [0, 0, 0] }} selected={s.id === selected} onPointerDown={(e) => startDrag(s.id, e)} />
                </group>
              ))}
            </group>
            {sel && selObj && tool !== "move" && (
              <TransformControls object={selObj} mode={tool} space="local" rotationSnap={(15 * Math.PI) / 180} scaleSnap={0.1} onMouseDown={() => { setOrbitOn(false); history.current.past.push(shapesRef.current); history.current.future = []; setHistLen({ past: history.current.past.length, future: 0 }); }} onMouseUp={() => { setOrbitOn(true); if (sel) { const o = groupRefs.current.get(sel.id); const s = sel; if (o) { const r = (n: number) => Math.round(n * 10) / 10; setShapesRaw((xs) => xs.map((x) => x.id === s.id ? { ...x, position: [r(o.position.x), r(o.position.y), r(o.position.z)], rotation: [r((o.rotation.x * 180) / Math.PI), r((o.rotation.y * 180) / Math.PI), r((o.rotation.z * 180) / Math.PI)], size: [Math.max(0.5, r(s.size[0] * o.scale.x)), Math.max(0.5, r(s.size[1] * o.scale.y)), Math.max(0.5, r(s.size[2] * o.scale.z))] } : x)); o.scale.set(1, 1, 1); } } }} />
            )}
            <Grid position={[0, -0.02, 0]} args={[radius * 4, radius * 4]} cellSize={10} sectionSize={50} cellColor="#2a2f3f" sectionColor="#3a4160" fadeDistance={radius * 4} infiniteGrid />
            <OrbitControls makeDefault enabled={orbitOn} target={new THREE.Vector3(0, (size?.[2] ?? 30) / 2, 0)} />
            <GizmoHelper alignment="bottom-right" margin={[70, 70]}>
              <GizmoViewcube color="#2b3148" hoverColor="#7c6cff" textColor="#e5e7ff" strokeColor="#4a5278" faces={["Right", "Left", "Top", "Bottom", "Front", "Back"]} />
            </GizmoHelper>
          </Canvas>

          {/* Properties */}
          <div className="absolute right-3 top-3 w-64 rounded-xl border border-line bg-card/95 p-3 text-xs backdrop-blur">
            {sel ? (
              <>
                <div className="flex items-center justify-between">
                  <span className="font-medium capitalize">{sel.kind}</span>
                  <div className="flex gap-1">
                    <button onClick={() => duplicate(sel.id)} className={iconBtn} title="Duplicate (⌘/Ctrl+D)"><Copy className="h-3 w-3" /></button>
                    <button onClick={() => remove(sel.id)} className={cn(iconBtn, "text-accent-3")} title="Delete (Del)"><Trash2 className="h-3 w-3" /></button>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-elev p-1">
                  <button onClick={() => update(sel.id, { mode: "solid" })} className={cn("rounded-md px-2 py-1", sel.mode === "solid" ? "bg-accent-2/20 text-accent-2" : "text-muted hover:text-fg")}>Solid · adds</button>
                  <button onClick={() => update(sel.id, { mode: "hole" })} className={cn("rounded-md px-2 py-1", sel.mode === "hole" ? "bg-accent-3/20 text-accent-3" : "text-muted hover:text-fg")}>Hole · cuts (H)</button>
                </div>
                {([["Size W · D · H (mm)", "size", 1], ["Position X · Y · Z", "position", 1], ["Rotation X · Y · Z (°)", "rotation", 15]] as const).map(([label, key, step]) => (
                  <div key={key} className="mt-2">
                    <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
                    <div className="mt-1 flex gap-1">
                      {[0, 1, 2].map((i) => num(`${key}-${i}`, sel[key][i], (n) => { const arr = [...sel[key]] as [number, number, number]; arr[i] = key === "size" ? Math.max(0.5, n) : n; update(sel.id, { [key]: arr } as Partial<EditShape>); }, step))}
                    </div>
                  </div>
                ))}
                <div className="mt-2 flex flex-wrap gap-1">
                  <button onClick={() => update(sel.id, { position: [sel.position[0], sel.position[1], sel.size[2] / 2] })} className={iconBtn} title="Drop onto the bed"><ArrowDownToLine className="h-3 w-3" />On bed</button>
                  <button onClick={() => update(sel.id, { position: [0, 0, sel.position[2]] })} className={iconBtn} title="Centre on the model"><Crosshair className="h-3 w-3" />Centre</button>
                  <button onClick={() => update(sel.id, { rotation: [0, 0, 0] })} className={iconBtn} title="Reset rotation"><Eraser className="h-3 w-3" />Reset rot.</button>
                </div>
              </>
            ) : (
              <p className="text-muted">Drag a shape from the palette onto the grid, or click one to add it. Then drag it around; use <b className="text-fg">Alt-drag</b> for height. Mark it as a <b className="text-accent-3">hole</b> to cut it out.</p>
            )}
            {shapes.length > 0 && (
              <ul className="mt-3 max-h-28 space-y-1 overflow-y-auto border-t border-line pt-2">
                {shapes.map((s) => (
                  <li key={s.id}><button onClick={() => setSelected(s.id)} className={cn("flex w-full items-center justify-between rounded-md px-2 py-1 text-left hover:bg-fg/5", selected === s.id && "bg-accent/15 text-accent")}><span className="capitalize">{s.kind}</span><span className={s.mode === "hole" ? "text-accent-3" : "text-muted"}>{s.mode}</span></button></li>
                ))}
              </ul>
            )}
            {error && <p className="mt-2 text-accent-3">{error}</p>}
          </div>

          {/* Shortcut bar */}
          <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-line bg-card/90 px-3 py-1 text-[11px] text-muted backdrop-blur">
            Drag to move · Alt-drag height · ↑↓←→ nudge (⇧ ×10) · H hole · ⌘/Ctrl+Z undo · ⌘/Ctrl+D duplicate · Del delete · Esc deselect · click the cube to turn the view
          </div>
        </div>
      </div>
    </div>
  );
}
