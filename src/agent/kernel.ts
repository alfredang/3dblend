/**
 * Geometry kernel: turns a Spec into a guaranteed-manifold triangle mesh with
 * the Manifold library (WASM). Manifold's booleans are exact and always yield
 * watertight 2-manifolds, which is what slicers need.
 */
import type { Node, Spec } from "./spec";

// manifold-3d ships ESM + WASM; typed loosely here to stay independent of
// minor API typing changes across versions.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type M = any;

let wasmPromise: Promise<M> | null = null;
async function getWasm(): Promise<M> {
  if (!wasmPromise) {
    wasmPromise = (async () => {
      const mod = await import("manifold-3d");
      const wasm = await mod.default();
      wasm.setup();
      return wasm;
    })();
  }
  return wasmPromise;
}

export interface BuiltMesh {
  /** Flat xyz positions (float32). */
  positions: Float32Array;
  /** Triangle indices (uint32). */
  indices: Uint32Array;
  numTri: number;
  numVert: number;
  volume: number; // mm^3
  surfaceArea: number; // mm^2
  bbox: { min: [number, number, number]; max: [number, number, number] };
  size: [number, number, number];
  genus: number;
  shells: number;
}

const DEFAULT_SEGMENTS = 64;

export async function buildSpec(spec: Spec): Promise<BuiltMesh> {
  const wasm = await getWasm();
  const { Manifold, CrossSection } = wasm;
  wasm.setCircularSegments(DEFAULT_SEGMENTS);

  const parts = spec.parts ?? {};
  const live: M[] = [];
  const track = (m: M) => {
    live.push(m);
    return m;
  };

  const unionAll = (ms: M[]): M => {
    if (ms.length === 1) return ms[0];
    return track(Manifold.union(ms));
  };

  const build = (n: Node, depth: number): M => {
    if (depth > 64) throw new Error("spec nesting too deep");
    switch (n.op) {
      case "cube":
        return track(Manifold.cube(n.size, n.center ?? false));
      case "cylinder":
        return track(
          Manifold.cylinder(n.height, n.radius, n.radiusTop ?? n.radius, n.segments ?? 0, n.center ?? false),
        );
      case "cone":
        return track(Manifold.cylinder(n.height, n.radius, 0, n.segments ?? 0, n.center ?? false));
      case "sphere":
        return track(Manifold.sphere(n.radius, n.segments ?? 0));
      case "torus": {
        const seg = n.segments ?? 48;
        const circle = track(CrossSection.circle(n.tube, seg).translate([n.radius, 0]));
        return track(Manifold.revolve(circle, seg, 360));
      }
      case "roundedBox": {
        const [x, y, z] = n.size;
        const r = Math.min(n.radius, x / 2 - 1e-3, y / 2 - 1e-3, z / 2 - 1e-3);
        if (r <= 0) return track(Manifold.cube(n.size, n.center ?? false));
        // Hull of 8 spheres = rounded box, simple and robust.
        const spheres: M[] = [];
        for (const sx of [r, x - r])
          for (const sy of [r, y - r])
            for (const sz of [r, z - r]) spheres.push(track(Manifold.sphere(r, 24).translate([sx, sy, sz])));
        let box = track(Manifold.hull(spheres));
        if (n.center) box = track(box.translate([-x / 2, -y / 2, -z / 2]));
        return box;
      }
      case "extrude": {
        const cs = track(new CrossSection([n.polygon], "EvenOdd"));
        if (cs.isEmpty()) throw new Error("extrude polygon is degenerate (self-intersecting or zero area)");
        const scaleTop = n.scaleTop === undefined ? [1, 1] : typeof n.scaleTop === "number" ? [n.scaleTop, n.scaleTop] : n.scaleTop;
        const divisions = n.twist ? Math.max(1, Math.ceil(Math.abs(n.twist) / 10)) : 0;
        return track(Manifold.extrude(cs, n.height, divisions, n.twist ?? 0, scaleTop, n.center ?? false));
      }
      case "revolve": {
        // Profile must be in the +X half plane; clamp negative X to 0.
        const poly = n.polygon.map(([x, y]) => [Math.max(0, x), y]);
        const cs = track(new CrossSection([poly], "EvenOdd"));
        if (cs.isEmpty()) throw new Error("revolve profile is degenerate");
        return track(Manifold.revolve(cs, n.segments ?? 0, n.degrees ?? 360));
      }
      case "union":
        return unionAll(n.children.map((c) => build(c, depth + 1)));
      case "difference": {
        const [first, ...rest] = n.children.map((c) => build(c, depth + 1));
        if (!rest.length) return first;
        return track(Manifold.difference(first, unionAll(rest)));
      }
      case "intersection": {
        const ms = n.children.map((c) => build(c, depth + 1));
        return ms.length === 1 ? ms[0] : track(Manifold.intersection(ms));
      }
      case "hull":
        return track(Manifold.hull(n.children.map((c) => build(c, depth + 1))));
      case "translate":
        return track(unionAll(n.children.map((c) => build(c, depth + 1))).translate(n.by));
      case "rotate":
        return track(unionAll(n.children.map((c) => build(c, depth + 1))).rotate(n.degrees));
      case "scale": {
        const by = typeof n.by === "number" ? [n.by, n.by, n.by] : n.by;
        return track(unionAll(n.children.map((c) => build(c, depth + 1))).scale(by));
      }
      case "mirror":
        return track(unionAll(n.children.map((c) => build(c, depth + 1))).mirror(n.normal));
      case "repeat": {
        const base = unionAll(n.children.map((c) => build(c, depth + 1)));
        const copies: M[] = [];
        for (let i = 0; i < n.count; i++)
          copies.push(track(base.translate([n.step[0] * i, n.step[1] * i, n.step[2] * i])));
        return unionAll(copies);
      }
      case "radial": {
        const base = unionAll(n.children.map((c) => build(c, depth + 1)));
        const sweep = n.degrees ?? 360;
        const stepDeg = sweep >= 360 ? 360 / n.count : n.count > 1 ? sweep / (n.count - 1) : 0;
        const copies: M[] = [];
        for (let i = 0; i < n.count; i++) {
          let c = base;
          if (n.radius) c = track(c.translate([n.radius, 0, 0]));
          copies.push(track(c.rotate([0, 0, stepDeg * i])));
        }
        return unionAll(copies);
      }
      case "ref": {
        const target = parts[n.name];
        if (!target) throw new Error(`unknown part "${n.name}"`);
        return build(target, depth + 1);
      }
    }
  };

  try {
    let result: M = build(spec.root, 0);
    if (result.isEmpty()) throw new Error("the model is empty after booleans (a difference probably removed everything)");
    const status = result.status?.();
    if (status && status.value !== 0 && status !== "NoError" && status.value !== undefined) {
      throw new Error(`geometry kernel error: ${JSON.stringify(status)}`);
    }

    // Seat on the bed: centre XY on origin, min Z = 0.
    const bb0 = result.boundingBox();
    const cx = (bb0.min[0] + bb0.max[0]) / 2;
    const cy = (bb0.min[1] + bb0.max[1]) / 2;
    result = track(result.translate([-cx, -cy, -bb0.min[2]]));

    const mesh = result.getMesh();
    const numProp: number = mesh.numProp;
    const vp: Float32Array = mesh.vertProperties;
    const numVert = vp.length / numProp;
    const positions = new Float32Array(numVert * 3);
    for (let i = 0; i < numVert; i++) {
      positions[i * 3] = vp[i * numProp];
      positions[i * 3 + 1] = vp[i * numProp + 1];
      positions[i * 3 + 2] = vp[i * numProp + 2];
    }
    const indices = new Uint32Array(mesh.triVerts);
    const bb = result.boundingBox();
    const min: [number, number, number] = [bb.min[0], bb.min[1], bb.min[2]];
    const max: [number, number, number] = [bb.max[0], bb.max[1], bb.max[2]];
    const shells = result.decompose();
    const shellCount = shells.length;
    shells.forEach((s: M) => s.delete());

    return {
      positions,
      indices,
      numTri: indices.length / 3,
      numVert,
      volume: result.volume(),
      surfaceArea: result.surfaceArea(),
      bbox: { min, max },
      size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
      genus: result.genus(),
      shells: shellCount,
    };
  } finally {
    for (const m of live) {
      try {
        m.delete();
      } catch {
        /* already freed */
      }
    }
  }
}
