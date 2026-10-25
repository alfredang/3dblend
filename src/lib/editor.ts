/** Manual shape editor model: primitives placed in model (Z-up, mm) coordinates, merged into the spec on apply. */
import type { Node, Spec } from "@/agent/spec";

export type ShapeKind = "box" | "cylinder" | "sphere" | "cone" | "torus" | "wedge";
export interface EditShape {
  id: string;
  kind: ShapeKind;
  mode: "solid" | "hole";
  /** Base dimensions in mm before scale: box [w,d,h]; cylinder/cone [d,d,h]; sphere [d,d,d]; torus [D,D,tube*2]; wedge [w,d,h]. */
  size: [number, number, number];
  position: [number, number, number]; // centre, Z-up
  rotation: [number, number, number]; // degrees
  color: string;
}

export const SHAPE_PRESETS: { kind: ShapeKind; label: string; size: [number, number, number] }[] = [
  { kind: "box", label: "Box", size: [20, 20, 10] },
  { kind: "cylinder", label: "Cylinder", size: [16, 16, 12] },
  { kind: "sphere", label: "Sphere", size: [16, 16, 16] },
  { kind: "cone", label: "Cone", size: [16, 16, 14] },
  { kind: "torus", label: "Ring", size: [24, 24, 6] },
  { kind: "wedge", label: "Wedge", size: [20, 20, 10] },
];

const COLORS = ["#8f7cff", "#19d3c5", "#ffc857", "#5b8cff", "#f472b6", "#ff7a59"];
let counter = 0;
export function newShape(kind: ShapeKind, size: [number, number, number], position: [number, number, number]): EditShape {
  counter++;
  return { id: `s${Date.now().toString(36)}${counter}`, kind, mode: "solid", size, position, rotation: [0, 0, 0], color: COLORS[counter % COLORS.length] };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** A shape as a DSL node (centred primitive → rotate → translate). */
export function shapeToNode(s: EditShape): Node {
  const [w, d, h] = s.size.map((v) => Math.max(0.2, v)) as [number, number, number];
  let prim: Node;
  switch (s.kind) {
    case "box": prim = { op: "cube", size: [r2(w), r2(d), r2(h)], center: true }; break;
    case "cylinder": prim = { op: "cylinder", height: r2(h), radius: r2(w / 2), center: true }; if (Math.abs(w - d) > 1e-6) prim = { op: "scale", by: [1, r2(d / w), 1], children: [prim] }; break;
    case "cone": prim = { op: "cone", height: r2(h), radius: r2(w / 2), center: true }; if (Math.abs(w - d) > 1e-6) prim = { op: "scale", by: [1, r2(d / w), 1], children: [prim] }; break;
    case "sphere": prim = { op: "sphere", radius: r2(w / 2) }; if (Math.abs(w - d) > 1e-6 || Math.abs(w - h) > 1e-6) prim = { op: "scale", by: [1, r2(d / w), r2(h / w)], children: [prim] }; break;
    case "torus": { const tube = Math.min(h / 2, w / 4); prim = { op: "torus", radius: r2(w / 2 - tube), tube: r2(tube) }; if (Math.abs(w - d) > 1e-6) prim = { op: "scale", by: [1, r2(d / w), 1], children: [prim] }; break; }
    case "wedge": prim = { op: "translate", by: [r2(-w / 2), r2(-d / 2), r2(-h / 2)], children: [{ op: "extrude", polygon: [[0, 0], [r2(w), 0], [0, r2(d)]], height: r2(h) }] }; break;
  }
  let node: Node = prim;
  if (s.rotation.some((a) => a !== 0)) node = { op: "rotate", degrees: s.rotation.map(r2) as [number, number, number], children: [node] };
  if (s.position.some((p) => p !== 0)) node = { op: "translate", by: s.position.map(r2) as [number, number, number], children: [node] };
  return node;
}

/** Rough half-extent in Z after rotation (over-estimates, which is safe for the trim test). */
function reachesBelowBed(s: EditShape) {
  const half = Math.hypot(s.size[0], s.size[1], s.size[2]) / 2;
  return s.position[2] - half < 0;
}

/** Merge shapes into a spec: solids are unioned with the base (trimmed at the bed plane z=0, like a workplane), holes subtracted afterwards. */
export function applyShapes(base: Spec, shapes: EditShape[]): Spec {
  const ABOVE_BED: Node = { op: "cube", size: [2000, 2000, 2000], center: false } as Node;
  const bedBox: Node = { op: "translate", by: [-1000, -1000, 0], children: [ABOVE_BED] };
  const solids = shapes.filter((s) => s.mode === "solid").map((s) => (reachesBelowBed(s) ? ({ op: "intersection", children: [shapeToNode(s), bedBox] } as Node) : shapeToNode(s)));
  const holes = shapes.filter((s) => s.mode === "hole").map(shapeToNode);
  let root: Node = base.root;
  if (solids.length) root = { op: "union", children: [root, ...solids] };
  if (holes.length) root = { op: "difference", children: [root, ...holes] };
  return { ...base, root };
}
