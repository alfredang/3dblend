import type { BuiltMesh } from "./kernel";

/** Encode a mesh as binary STL (little-endian, 80-byte header). */
export function toBinarySTL(mesh: BuiltMesh, name = "3dblend"): Buffer {
  const { positions, indices, numTri } = mesh;
  const buf = Buffer.alloc(84 + numTri * 50);
  buf.write(`3DBlend ${name}`.slice(0, 79), 0, "ascii");
  buf.writeUInt32LE(numTri, 80);
  let off = 84;
  for (let t = 0; t < numTri; t++) {
    const a = indices[t * 3] * 3;
    const b = indices[t * 3 + 1] * 3;
    const c = indices[t * 3 + 2] * 3;
    const ax = positions[a], ay = positions[a + 1], az = positions[a + 2];
    const bx = positions[b], by = positions[b + 1], bz = positions[b + 2];
    const cx = positions[c], cy = positions[c + 1], cz = positions[c + 2];
    // normal = (b-a) x (c-a)
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    buf.writeFloatLE(nx, off); buf.writeFloatLE(ny, off + 4); buf.writeFloatLE(nz, off + 8);
    buf.writeFloatLE(ax, off + 12); buf.writeFloatLE(ay, off + 16); buf.writeFloatLE(az, off + 20);
    buf.writeFloatLE(bx, off + 24); buf.writeFloatLE(by, off + 28); buf.writeFloatLE(bz, off + 32);
    buf.writeFloatLE(cx, off + 36); buf.writeFloatLE(cy, off + 40); buf.writeFloatLE(cz, off + 44);
    buf.writeUInt16LE(0, off + 48);
    off += 50;
  }
  return buf;
}

/** Decode a binary STL back into an indexed mesh (vertices are welded exactly). */
export function parseBinarySTL(buf: Buffer): { positions: Float32Array; indices: Uint32Array; numTri: number } {
  const numTri = buf.readUInt32LE(80);
  const map = new Map<string, number>();
  const pos: number[] = [];
  const idx = new Uint32Array(numTri * 3);
  let off = 84;
  for (let t = 0; t < numTri; t++) {
    off += 12; // skip normal
    for (let v = 0; v < 3; v++) {
      const x = buf.readFloatLE(off), y = buf.readFloatLE(off + 4), z = buf.readFloatLE(off + 8);
      off += 12;
      const key = `${x},${y},${z}`;
      let i = map.get(key);
      if (i === undefined) {
        i = pos.length / 3;
        map.set(key, i);
        pos.push(x, y, z);
      }
      idx[t * 3 + v] = i;
    }
    off += 2;
  }
  return { positions: Float32Array.from(pos), indices: idx, numTri };
}
