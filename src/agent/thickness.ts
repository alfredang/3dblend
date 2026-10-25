/**
 * Local wall-thickness map: for a sample of faces, cast a ray from the face
 * centroid into the solid and measure the distance to the opposite wall. Only
 * hits on faces that oppose the ray are accepted, which filters out inside
 * corners that would otherwise read as "thin".
 */
import * as THREE from "three";
import { MeshBVH } from "three-mesh-bvh";
import type { BuiltMesh } from "./kernel";

export interface ThicknessReport {
  samples: number;
  /** Area-weighted percentiles of local thickness in mm. */
  p5: number;
  p25: number;
  median: number;
  /** % of surface area thinner than the given thresholds (mm). */
  pctBelow: (mm: number) => number;
}

export function measureThickness(mesh: BuiltMesh, maxSamples = 4000): ThicknessReport {
  const { positions, indices, numTri } = mesh;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  g.setIndex(new THREE.BufferAttribute(indices, 1));
  const bvh = new MeshBVH(g);

  const ray = new THREE.Ray();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), n = new THREE.Vector3(), cen = new THREE.Vector3();
  const step = Math.max(1, Math.floor(numTri / maxSamples));
  const rows: { d: number; area: number }[] = [];

  for (let t = 0; t < numTri; t += step) {
    a.fromArray(positions, indices[t * 3] * 3);
    b.fromArray(positions, indices[t * 3 + 1] * 3);
    c.fromArray(positions, indices[t * 3 + 2] * 3);
    n.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
    const area = n.length() / 2;
    if (area < 1e-6) continue;
    n.normalize();
    cen.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    ray.origin.copy(cen).addScaledVector(n, -1e-3);
    ray.direction.copy(n).negate();
    const hit = bvh.raycastFirst(ray, THREE.DoubleSide);
    if (!hit || !hit.face) continue;
    // Opposite wall faces the same way as the ray; adjacent walls are ~perpendicular.
    if (hit.face.normal.dot(ray.direction) < 0.6) continue;
    rows.push({ d: hit.distance + 1e-3, area });
  }

  rows.sort((x, y) => x.d - y.d);
  const total = rows.reduce((s, r) => s + r.area, 0) || 1;
  const pct = (p: number) => {
    let acc = 0;
    for (const r of rows) {
      acc += r.area;
      if (acc / total >= p) return r.d;
    }
    return rows.length ? rows[rows.length - 1].d : 0;
  };
  const pctBelow = (mm: number) => (100 * rows.filter((r) => r.d < mm).reduce((s, r) => s + r.area, 0)) / total;
  return { samples: rows.length, p5: round(pct(0.05)), p25: round(pct(0.25)), median: round(pct(0.5)), pctBelow };
}

const round = (n: number) => Math.round(n * 100) / 100;
