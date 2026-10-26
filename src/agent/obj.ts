/**
 * Wavefront OBJ export: plain-text indexed mesh. OBJ has no unit field, so the
 * header states millimetres and Z-up (same frame as our STL/3MF) for slicers,
 * Blender, Fusion and game engines that prefer OBJ.
 */
import type { IndexedMesh } from "./threemf";

const num = (n: number) => (Math.round(n * 10000) / 10000).toString();

export function toOBJ(mesh: IndexedMesh, name: string, opts: { author?: string } = {}): Buffer {
  const { positions, indices, numTri } = mesh;
  const safe = name.replace(/\s+/g, "_").replace(/[^\w.-]/g, "") || "model";
  const lines: string[] = [
    `# ${name.replace(/[\r\n]+/g, " ")}`,
    `# Designer: ${(opts.author ?? "3DBlend").replace(/[\r\n]+/g, " ")}`,
    "# Exported by 3DBlend — units: millimetres, Z-up (same orientation as the STL/3MF)",
    `# ${positions.length / 3} vertices, ${numTri} triangles`,
    `o ${safe}`,
  ];
  for (let i = 0; i < positions.length; i += 3) lines.push(`v ${num(positions[i])} ${num(positions[i + 1])} ${num(positions[i + 2])}`);
  for (let t = 0; t < numTri; t++) lines.push(`f ${indices[t * 3] + 1} ${indices[t * 3 + 1] + 1} ${indices[t * 3 + 2] + 1}`);
  return Buffer.from(lines.join("\n") + "\n", "utf8");
}
