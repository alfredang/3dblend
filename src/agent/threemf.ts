/**
 * 3MF export (3D Manufacturing Format): a ZIP package with an XML mesh in
 * millimetres. Preferred by Bambu Studio, PrusaSlicer, Cura and Windows 3D
 * Builder because it carries units and a single indexed mesh.
 */
import { zipSync, strToU8 } from "fflate";

export interface IndexedMesh {
  positions: Float32Array;
  indices: Uint32Array;
  numTri: number;
}

const esc = (s: string) => s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!);
const num = (n: number) => (Math.round(n * 10000) / 10000).toString();

export function toThreeMF(mesh: IndexedMesh, name: string, opts: { author?: string; description?: string } = {}): Buffer {
  const { positions, indices, numTri } = mesh;
  const parts: string[] = [];
  parts.push('<?xml version="1.0" encoding="UTF-8"?>\n');
  parts.push('<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">\n');
  parts.push(`  <metadata name="Title">${esc(name)}</metadata>\n`);
  parts.push(`  <metadata name="Designer">${esc(opts.author ?? "3DBlend")}</metadata>\n`);
  parts.push(`  <metadata name="Description">${esc(opts.description ?? "")}</metadata>\n`);
  parts.push('  <metadata name="Application">3DBlend</metadata>\n');
  parts.push('  <resources>\n');
  parts.push(`    <object id="1" name="${esc(name)}" type="model">\n      <mesh>\n        <vertices>\n`);
  for (let i = 0; i < positions.length; i += 3) {
    parts.push(`          <vertex x="${num(positions[i])}" y="${num(positions[i + 1])}" z="${num(positions[i + 2])}"/>\n`);
  }
  parts.push("        </vertices>\n        <triangles>\n");
  for (let t = 0; t < numTri; t++) {
    parts.push(`          <triangle v1="${indices[t * 3]}" v2="${indices[t * 3 + 1]}" v3="${indices[t * 3 + 2]}"/>\n`);
  }
  parts.push("        </triangles>\n      </mesh>\n    </object>\n  </resources>\n");
  parts.push('  <build>\n    <item objectid="1"/>\n  </build>\n</model>\n');

  const contentTypes =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n' +
    '  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n' +
    '  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n' +
    "</Types>\n";
  const rels =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
    '  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n' +
    "</Relationships>\n";

  const zip = zipSync(
    {
      "[Content_Types].xml": strToU8(contentTypes),
      "_rels/.rels": strToU8(rels),
      "3D/3dmodel.model": strToU8(parts.join("")),
    },
    { level: 6 },
  );
  return Buffer.from(zip);
}
