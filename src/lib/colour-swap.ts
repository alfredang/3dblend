/**
 * Two-colour printing on a single-extruder printer (no AMS/MMU): pause at a
 * layer, swap filament, resume. The change is a horizontal line, so the best
 * heights are flat up-facing plateaus with more model above them — the top of
 * a base plate under raised text, a lid rim, a step in a tiered shape.
 */

export interface SwapSuggestion {
  /** Height of the plateau, snapped to the layer grid (mm). Everything above prints in colour 2. */
  z: number;
  /** Plateau area as a share of the largest flat area found, 0–100. */
  areaPct: number;
}

export interface SwapPlan {
  height: number;
  layer: number;
  suggestions: SwapSuggestion[];
}

/** Scan a binary STL for horizontal up-facing plateaus (no vertex welding needed). */
export function planColourSwap(stl: Buffer, layer = 0.2): SwapPlan {
  const n = stl.readUInt32LE(80);
  const byZ = new Map<number, number>();
  let minZ = Infinity, maxZ = -Infinity;
  for (let t = 0, off = 84; t < n; t++, off += 50) {
    const v = (k: number, c: number) => stl.readFloatLE(off + 12 + k * 12 + c * 4);
    const z0 = v(0, 2), z1 = v(1, 2), z2 = v(2, 2);
    minZ = Math.min(minZ, z0, z1, z2); maxZ = Math.max(maxZ, z0, z1, z2);
    if (Math.abs(z0 - z1) > 0.01 || Math.abs(z0 - z2) > 0.01) continue;
    // Recompute the normal rather than trusting the stored one; keep only faces pointing up.
    const ux = v(1, 0) - v(0, 0), uy = v(1, 1) - v(0, 1), wx = v(2, 0) - v(0, 0), wy = v(2, 1) - v(0, 1);
    const cross = ux * wy - uy * wx; // z-component of (b-a)×(c-a) = 2 × signed area
    if (cross <= 0) continue;
    const key = Math.round(((z0 + z1 + z2) / 3) * 20) / 20;
    byZ.set(key, (byZ.get(key) ?? 0) + cross / 2);
  }
  const height = Math.max(0, maxZ - minZ);
  const snap = (z: number) => Math.round(z / layer) * layer;
  const candidates = [...byZ.entries()]
    .map(([z, area]) => ({ z: snap(z - minZ), area }))
    // Not the bed, and not the very top (nothing above it to colour).
    .filter((c) => c.z >= layer * 2 && c.z <= height - layer * 2)
    .sort((a, b) => b.area - a.area);
  const maxArea = candidates[0]?.area ?? 1;
  const suggestions: SwapSuggestion[] = [];
  for (const c of candidates) {
    if (c.area < maxArea * 0.08 || suggestions.length >= 3) break;
    if (suggestions.some((s) => Math.abs(s.z - c.z) < 1)) continue;
    suggestions.push({ z: +c.z.toFixed(2), areaPct: Math.round((c.area / maxArea) * 100) });
  }
  return { height: +height.toFixed(2), layer, suggestions: suggestions.sort((a, b) => a.z - b.z) };
}
