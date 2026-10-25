/**
 * 3DBlend build specification (the "DSL") that the LLM emits.
 *
 * It is a small constructive-solid-geometry language: primitives, booleans,
 * transforms and arrays. Every number is in millimetres. Z is "up" and the
 * printer bed is the plane z = 0 (the harness re-seats the result on the bed).
 *
 * The DSL is deliberately tiny so that a model can validate it strictly, a
 * deterministic kernel (Manifold) can build it, and a Blender script can
 * reproduce it 1:1 with native modifiers.
 */
import { z } from "zod";

const num = z.number().finite();
const vec3 = z.tuple([num, num, num]);
const vec2 = z.tuple([num, num]);

export type Node =
  | { op: "cube"; size: [number, number, number]; center?: boolean }
  | {
      op: "cylinder";
      height: number;
      radius: number;
      radiusTop?: number;
      segments?: number;
      center?: boolean;
    }
  | { op: "sphere"; radius: number; segments?: number }
  | { op: "cone"; height: number; radius: number; segments?: number; center?: boolean }
  | { op: "torus"; radius: number; tube: number; segments?: number }
  | {
      op: "extrude";
      polygon: [number, number][];
      height: number;
      twist?: number;
      scaleTop?: number | [number, number];
      center?: boolean;
    }
  | { op: "revolve"; polygon: [number, number][]; degrees?: number; segments?: number }
  | { op: "roundedBox"; size: [number, number, number]; radius: number; center?: boolean }
  | { op: "union"; children: Node[] }
  | { op: "difference"; children: Node[] }
  | { op: "intersection"; children: Node[] }
  | { op: "hull"; children: Node[] }
  | { op: "translate"; by: [number, number, number]; children: Node[] }
  | { op: "rotate"; degrees: [number, number, number]; children: Node[] }
  | { op: "scale"; by: number | [number, number, number]; children: Node[] }
  | { op: "mirror"; normal: [number, number, number]; children: Node[] }
  | { op: "repeat"; count: number; step: [number, number, number]; children: Node[] }
  | { op: "radial"; count: number; radius?: number; degrees?: number; children: Node[] }
  | { op: "ref"; name: string }
  /** A mesh supplied by the harness (an uploaded STL/3MF), seated on z=0 and centred. */
  | { op: "mesh"; name: string };

const lazyNode: z.ZodType<Node> = z.lazy(() =>
  z.discriminatedUnion("op", [
    z.object({ op: z.literal("cube"), size: vec3, center: z.boolean().optional() }),
    z.object({
      op: z.literal("cylinder"),
      height: num.positive(),
      radius: num.positive(),
      radiusTop: num.nonnegative().optional(),
      segments: z.number().int().min(3).max(256).optional(),
      center: z.boolean().optional(),
    }),
    z.object({ op: z.literal("sphere"), radius: num.positive(), segments: z.number().int().min(4).max(256).optional() }),
    z.object({
      op: z.literal("cone"),
      height: num.positive(),
      radius: num.positive(),
      segments: z.number().int().min(3).max(256).optional(),
      center: z.boolean().optional(),
    }),
    z.object({
      op: z.literal("torus"),
      radius: num.positive(),
      tube: num.positive(),
      segments: z.number().int().min(6).max(256).optional(),
    }),
    z.object({
      op: z.literal("extrude"),
      polygon: z.array(vec2).min(3).max(400),
      height: num.positive(),
      twist: num.optional(),
      scaleTop: z.union([num.nonnegative(), vec2]).optional(),
      center: z.boolean().optional(),
    }),
    z.object({
      op: z.literal("revolve"),
      polygon: z.array(vec2).min(3).max(400),
      degrees: num.positive().max(360).optional(),
      segments: z.number().int().min(6).max(256).optional(),
    }),
    z.object({ op: z.literal("roundedBox"), size: vec3, radius: num.positive(), center: z.boolean().optional() }),
    z.object({ op: z.literal("union"), children: z.array(lazyNode).min(1).max(64) }),
    z.object({ op: z.literal("difference"), children: z.array(lazyNode).min(1).max(64) }),
    z.object({ op: z.literal("intersection"), children: z.array(lazyNode).min(1).max(64) }),
    z.object({ op: z.literal("hull"), children: z.array(lazyNode).min(1).max(64) }),
    z.object({ op: z.literal("translate"), by: vec3, children: z.array(lazyNode).min(1).max(64) }),
    z.object({ op: z.literal("rotate"), degrees: vec3, children: z.array(lazyNode).min(1).max(64) }),
    z.object({ op: z.literal("scale"), by: z.union([num.positive(), vec3]), children: z.array(lazyNode).min(1).max(64) }),
    z.object({ op: z.literal("mirror"), normal: vec3, children: z.array(lazyNode).min(1).max(64) }),
    z.object({
      op: z.literal("repeat"),
      count: z.number().int().min(1).max(64),
      step: vec3,
      children: z.array(lazyNode).min(1).max(64),
    }),
    z.object({
      op: z.literal("radial"),
      count: z.number().int().min(1).max(128),
      radius: num.nonnegative().optional(),
      degrees: num.positive().max(360).optional(),
      children: z.array(lazyNode).min(1).max(64),
    }),
    z.object({ op: z.literal("ref"), name: z.string().min(1).max(64) }),
    z.object({ op: z.literal("mesh"), name: z.string().min(1).max(64) }),
  ]),
);

export const NodeSchema = lazyNode;

export const SpecSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(600).default(""),
  units: z.literal("mm").default("mm"),
  /** Printing advice for the user: orientation, supports, infill… */
  printNotes: z.string().max(600).optional(),
  /** Named reusable sub-assemblies referenced with { op: "ref" }. */
  parts: z.record(z.string().min(1).max(64), lazyNode).optional(),
  root: lazyNode,
});

export type Spec = z.infer<typeof SpecSchema>;

/** Walk the tree and count nodes; used to bound build cost. */
export function countNodes(n: Node, parts: Record<string, Node> = {}, seen = new Set<string>()): number {
  if (n.op === "ref") {
    if (seen.has(n.name)) return 1;
    const target = parts[n.name];
    if (!target) return 1;
    const next = new Set(seen);
    next.add(n.name);
    return 1 + countNodes(target, parts, next);
  }
  if ("children" in n) {
    let total = 1;
    for (const c of n.children) total += countNodes(c, parts, seen);
    return total;
  }
  return 1;
}

/** Validate structure and semantic constraints (dangling refs, cycles). */
export function validateSpec(input: unknown): { ok: true; spec: Spec } | { ok: false; errors: string[] } {
  const parsed = SpecSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.slice(0, 12).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    };
  }
  const spec = parsed.data;
  const errors: string[] = [];
  const parts = spec.parts ?? {};

  const visit = (n: Node, stack: string[]) => {
    if (n.op === "ref") {
      if (!parts[n.name]) errors.push(`ref "${n.name}" is not defined in parts`);
      else if (stack.includes(n.name)) errors.push(`ref "${n.name}" is cyclic (${[...stack, n.name].join(" -> ")})`);
      else visit(parts[n.name], [...stack, n.name]);
      return;
    }
    if ("children" in n) n.children.forEach((c) => visit(c, stack));
  };
  visit(spec.root, []);
  for (const [name, node] of Object.entries(parts)) visit(node, [name]);

  const total = countNodes(spec.root, parts);
  if (total > 1200) errors.push(`spec is too large (${total} nodes, max 1200)`);

  return errors.length ? { ok: false, errors } : { ok: true, spec };
}
