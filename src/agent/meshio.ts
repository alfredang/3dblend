/** Mesh import helpers: ASCII/binary STL, 3MF (core spec + nested object files), and 3DBlend Blender scripts. */
import { unzipSync, strFromU8 } from "fflate";
import { parseBinarySTL, toBinarySTL } from "./stl";
import type { IndexedMesh } from "./threemf";

export interface ImportedMesh extends IndexedMesh {
  bbox: { min: [number, number, number]; max: [number, number, number] };
  size: [number, number, number];
}

function finalize(positions: Float32Array, indices: Uint32Array): ImportedMesh {
  const min: [number, number, number] = [Infinity, Infinity, Infinity], max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) for (let k = 0; k < 3; k++) { const v = positions[i + k]; if (v < min[k]) min[k] = v; if (v > max[k]) max[k] = v; }
  return { positions, indices, numTri: indices.length / 3, bbox: { min, max }, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
}

function weld(tris: number[]): ImportedMesh {
  const map = new Map<string, number>(); const pos: number[] = []; const idx: number[] = [];
  for (let i = 0; i < tris.length; i += 3) {
    const key = `${tris[i]},${tris[i + 1]},${tris[i + 2]}`;
    let j = map.get(key);
    if (j === undefined) { j = pos.length / 3; map.set(key, j); pos.push(tris[i], tris[i + 1], tris[i + 2]); }
    idx.push(j);
  }
  return finalize(Float32Array.from(pos), Uint32Array.from(idx));
}

export function parseSTL(buf: Buffer): ImportedMesh {
  const head = buf.subarray(0, 5).toString("ascii").toLowerCase();
  const looksAscii = head === "solid" && !/[^\x09\x0a\x0d\x20-\x7e]/.test(buf.subarray(0, Math.min(buf.length, 4000)).toString("latin1"));
  if (!looksAscii) {
    if (buf.length < 84) throw new Error("STL file is too small");
    const n = buf.readUInt32LE(80);
    if (84 + n * 50 !== buf.length) throw new Error("STL file is corrupt (size mismatch)");
    const m = parseBinarySTL(buf);
    return finalize(m.positions, m.indices);
  }
  const verts: number[] = [];
  const re = /vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)/g;
  const text = buf.toString("latin1");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) verts.push(+m[1], +m[2], +m[3]);
  if (verts.length < 9) throw new Error("ASCII STL has no triangles");
  return weld(verts);
}

/** Parse all meshes from a 3MF package (3D/3dmodel.model plus any 3D/Objects/*.model). Transforms on build items are applied when present. */
export function parse3MF(buf: Buffer): ImportedMesh {
  const files = unzipSync(new Uint8Array(buf));
  const names = Object.keys(files).filter((n) => /\.model$/i.test(n));
  if (!names.length) throw new Error("No 3D model found in the 3MF package");
  const tris: number[] = [];
  for (const name of names) {
    const xml = strFromU8(files[name]);
    const meshRe = /<mesh>([\s\S]*?)<\/mesh>/gi;
    let mm: RegExpExecArray | null;
    while ((mm = meshRe.exec(xml))) {
      const block = mm[1];
      const vs: number[] = [];
      const vRe = /<vertex\s+x="([^"]+)"\s+y="([^"]+)"\s+z="([^"]+)"/g;
      let v: RegExpExecArray | null;
      while ((v = vRe.exec(block))) vs.push(+v[1], +v[2], +v[3]);
      const tRe = /<triangle\s+v1="(\d+)"\s+v2="(\d+)"\s+v3="(\d+)"/g;
      let t: RegExpExecArray | null;
      while ((t = tRe.exec(block))) {
        for (const vi of [+t[1], +t[2], +t[3]]) tris.push(vs[vi * 3], vs[vi * 3 + 1], vs[vi * 3 + 2]);
      }
    }
  }
  if (tris.length < 9) throw new Error("3MF contains no triangles");
  // Units: core spec allows millimeter (default), inch, foot, meter, micron, centimeter.
  const unitMatch = /<model[^>]*unit="([a-z]+)"/i.exec(strFromU8(files[names[0]]));
  const scale = { millimeter: 1, centimeter: 10, meter: 1000, inch: 25.4, foot: 304.8, micron: 0.001 }[unitMatch?.[1]?.toLowerCase() ?? "millimeter"] ?? 1;
  if (scale !== 1) for (let i = 0; i < tris.length; i++) tris[i] *= scale;
  return weld(tris);
}

export const SPEC_MARKER = "# 3DBLEND-SPEC: ";

/** Our exported Blender scripts carry their spec; return it if present. */
export function specFromBlenderScript(text: string): unknown | null {
  const line = text.split("\n").find((l) => l.startsWith(SPEC_MARKER));
  if (!line) return null;
  try { return JSON.parse(line.slice(SPEC_MARKER.length)); } catch { return null; }
}

export function meshToSTL(m: ImportedMesh, name: string) {
  return toBinarySTL({ positions: m.positions, indices: m.indices, numTri: m.numTri, numVert: m.positions.length / 3, volume: 0, surfaceArea: 0, bbox: m.bbox, size: m.size, genus: 0, shells: 1 }, name);
}
