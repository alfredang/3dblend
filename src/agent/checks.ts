/**
 * Printability analysis (DFM) on the built mesh. Produces hard errors (the
 * agent must fix), soft warnings (surfaced as print advice) and a recommended
 * layer height for the chosen printer, nozzle and material.
 */
import type { BuiltMesh } from "./kernel";
import { measureThickness } from "./thickness";

export interface PrinterProfile {
  bed: [number, number, number]; // mm
  nozzle: number; // mm
  material: "PLA" | "PETG" | "ABS" | "TPU";
  overhangDeg: number; // degrees from vertical beyond which supports are needed
  /** Human-readable name for messages. */
  name?: string;
}

export const DEFAULT_PRINTER: PrinterProfile = { bed: [220, 220, 250], nozzle: 0.4, material: "PLA", overhangDeg: 50, name: "Generic 220 × 220 × 250" };

export interface PrintReport {
  ok: boolean;
  errors: string[];
  warnings: string[];
  /** Short material / orientation tips (not problems). */
  tips: string[];
  recommendedLayerHeight: number;
  printer: { name: string; nozzle: number; material: string; bed: [number, number, number] };
  metrics: {
    size: [number, number, number];
    volumeCm3: number;
    surfaceAreaCm2: number;
    triangles: number;
    shells: number;
    genus: number;
    baseContactPct: number; // % of XY footprint touching the bed
    overhangPct: number; // % of surface area facing down steeper than threshold
    bridgePct: number; // % of surface area that is a flat ceiling above the bed
    meanThicknessMm: number; // 2V/A heuristic (whole-part average)
    minWallMm: number; // 5th percentile of local thickness
    thinAreaPct: number; // % of surface thinner than 2 extrusion widths
    estGramsPLA: number;
    estPrintMinutes: number;
  };
}

const DENSITY: Record<PrinterProfile["material"], number> = { PLA: 1.24, PETG: 1.27, ABS: 1.04, TPU: 1.21 };

export function analysePrintability(mesh: BuiltMesh, printer: PrinterProfile = DEFAULT_PRINTER): PrintReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const tips: string[] = [];
  const { positions, indices, numTri, size, volume, surfaceArea } = mesh;
  const lineWidth = printer.nozzle * 1.05; // typical extrusion width
  const minWall = 2 * lineWidth; // two perimeters

  if (numTri === 0 || volume <= 0) errors.push("mesh is empty");

  // --- Size vs bed ---
  const [sx, sy, sz] = size;
  const [bx, by, bz] = printer.bed;
  const fitsFlat = (sx <= bx && sy <= by) || (sx <= by && sy <= bx);
  if (!fitsFlat || sz > bz) errors.push(`model ${fmt(sx)}×${fmt(sy)}×${fmt(sz)} mm exceeds the ${bx}×${by}×${bz} mm build volume of ${printer.name ?? "the printer"} — scale it down`);
  if (Math.max(sx, sy, sz) < 5) errors.push(`model is only ${fmt(Math.max(sx, sy, sz))} mm across — far too small to print; sizes are in millimetres`);

  // --- Surface classification ---
  let baseArea = 0, overhangArea = 0, bridgeArea = 0, totalArea = 0;
  const cosLimit = Math.cos(((90 - printer.overhangDeg) * Math.PI) / 180);
  const zEps = 0.05;
  for (let t = 0; t < numTri; t++) {
    const a = indices[t * 3] * 3, b = indices[t * 3 + 1] * 3, c = indices[t * 3 + 2] * 3;
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len === 0) continue;
    const area = len / 2;
    totalArea += area;
    const dz = nz / len;
    const onBed = positions[a + 2] < zEps && positions[b + 2] < zEps && positions[c + 2] < zEps;
    if (onBed && dz < -0.9) baseArea += area;
    else if (!onBed && dz < -0.95) bridgeArea += area;
    else if (!onBed && dz < -cosLimit) overhangArea += area;
  }
  const footprint = Math.max(sx * sy, 1e-6);
  const baseContactPct = (baseArea / footprint) * 100;
  const overhangPct = totalArea ? (overhangArea / totalArea) * 100 : 0;
  const bridgePct = totalArea ? (bridgeArea / totalArea) * 100 : 0;

  if (baseContactPct < 2) errors.push(`almost nothing touches the bed (${fmt(baseContactPct)}% of footprint) — give the model a flat base or re-orient it so a flat face sits at z = 0`);
  else if (baseContactPct < 15) warnings.push(`small bed contact (${fmt(baseContactPct)}% of footprint); use a brim or widen the flat base`);

  if (overhangPct > 35) warnings.push(`${fmt(overhangPct)}% of the surface overhangs beyond ${printer.overhangDeg}° — enable supports in the slicer or re-orient; chamfers (45° slopes) would remove most of it`);
  else if (overhangPct > 15) warnings.push(`some overhangs (${fmt(overhangPct)}% of surface) — light supports may be needed`);
  if (bridgePct > 8) warnings.push(`${fmt(bridgePct)}% of the surface is flat ceilings above the bed — bridges longer than ~${printer.material === "PETG" ? 15 : 25} mm will sag; add supports or a 45° roof`);

  // --- Local wall thickness ---
  const th = measureThickness(mesh);
  const unprintablePct = th.pctBelow(lineWidth);
  const thinAreaPct = th.pctBelow(minWall);
  if (unprintablePct > 3) errors.push(`${fmt(unprintablePct)}% of the surface is thinner than one ${printer.nozzle} mm extrusion line (≤ ${fmt(lineWidth)} mm) — those features will not print; thicken them to ≥ ${fmt(minWall)} mm`);
  else if (thinAreaPct > 4) warnings.push(`thin features: ${fmt(thinAreaPct)}% of the surface is under ${fmt(minWall)} mm (two perimeters at ${printer.nozzle} mm) — thicken, or print with a 0.2 mm nozzle`);
  else if (th.p5 < minWall && th.samples) warnings.push(`thinnest walls ≈ ${fmt(th.p5)} mm; keep everything ≥ ${fmt(minWall)} mm for a ${printer.nozzle} mm nozzle`);

  if (mesh.shells > 3) errors.push(`model is ${mesh.shells} disconnected pieces — parts are floating instead of fused; overlap every part with its neighbour by ≥ 1 mm`);
  else if (mesh.shells > 1) warnings.push(`model has ${mesh.shells} disconnected pieces; they will print as separate objects — join them if that is not intended`);

  // --- Layer height recommendation ---
  const fineDetail = th.p5 < 1.0 || Math.max(sx, sy, sz) < 30;
  let layer = printer.nozzle >= 0.6 ? 0.3 : 0.2;
  if (printer.nozzle <= 0.25) layer = 0.1;
  else if (fineDetail) layer = 0.12;
  else if (overhangPct > 15) layer = 0.16; // thinner layers print overhangs cleaner
  if (printer.material === "TPU" && layer > 0.2) layer = 0.2;

  // --- Material tips ---
  switch (printer.material) {
    case "PLA":
      if (sz > 150) tips.push("Tall PLA print: slow the outer wall slightly to avoid wobble near the top.");
      break;
    case "PETG":
      tips.push("PETG: print 10–15 °C hotter than PLA, keep cooling at 30–50%, and expect slightly weaker bridges.");
      if (baseContactPct > 60) tips.push("PETG bonds hard to textured plates — use a release agent or a smooth PEI sheet.");
      break;
    case "ABS":
      tips.push("ABS: use an enclosure and a 100 °C bed; disable the part cooling fan for the first layers.");
      if (Math.max(sx, sy) > 100) warnings.push(`large flat footprint (${fmt(Math.max(sx, sy))} mm) in ABS is prone to warping — add a brim and keep the chamber warm`);
      break;
    case "TPU":
      tips.push("TPU: direct-drive extruder, 20–30 mm/s, retraction almost off, no supports (they are hard to remove).");
      if (overhangPct > 15) warnings.push("TPU overhangs are hard to support — re-orient the part or add 45° chamfers");
      if (th.p5 < 1.6) warnings.push("flexible parts need walls ≥ 1.6 mm to hold their shape in TPU");
      break;
  }
  tips.push(`Suggested layer height ${layer} mm on a ${printer.nozzle} mm nozzle.`);

  const volumeCm3 = volume / 1000;
  const density = DENSITY[printer.material];
  const estGrams = volumeCm3 * density * 0.35 + (surfaceArea / 100) * 0.08;
  const speedFactor = printer.material === "TPU" ? 2.2 : 1;
  const estPrintMinutes = Math.round((estGrams * 2.8 + sz * 0.6) * (0.2 / layer) * speedFactor);

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    tips,
    recommendedLayerHeight: layer,
    printer: { name: printer.name ?? "printer", nozzle: printer.nozzle, material: printer.material, bed: printer.bed },
    metrics: {
      size: [round(sx), round(sy), round(sz)],
      volumeCm3: round(volumeCm3),
      surfaceAreaCm2: round(surfaceArea / 100),
      triangles: numTri,
      shells: mesh.shells,
      genus: mesh.genus,
      baseContactPct: round(baseContactPct),
      overhangPct: round(overhangPct),
      bridgePct: round(bridgePct),
      meanThicknessMm: round(surfaceArea > 0 ? (2 * volume) / surfaceArea : 0),
      minWallMm: th.p5,
      thinAreaPct: round(thinAreaPct),
      estGramsPLA: round(estGrams),
      estPrintMinutes,
    },
  };
}

const fmt = (n: number) => (Math.round(n * 10) / 10).toString();
const round = (n: number) => Math.round(n * 100) / 100;
