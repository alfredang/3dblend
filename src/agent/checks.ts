/**
 * Printability analysis on the built mesh. Produces hard errors (the agent
 * must fix) and soft warnings (surfaced to the user as print advice).
 */
import type { BuiltMesh } from "./kernel";

export interface PrinterProfile {
  bed: [number, number, number]; // mm
  minWall: number; // mm
  overhangDeg: number; // degrees from vertical beyond which supports are needed
}

export const DEFAULT_PRINTER: PrinterProfile = { bed: [220, 220, 250], minWall: 1.2, overhangDeg: 50 };

export interface PrintReport {
  ok: boolean;
  errors: string[];
  warnings: string[];
  metrics: {
    size: [number, number, number];
    volumeCm3: number;
    surfaceAreaCm2: number;
    triangles: number;
    shells: number;
    genus: number;
    baseContactPct: number; // % of XY footprint touching the bed
    overhangPct: number; // % of surface area facing down steeper than threshold
    meanThicknessMm: number; // 2V/A heuristic
    estGramsPLA: number;
    estPrintMinutes: number;
  };
}

export function analysePrintability(mesh: BuiltMesh, printer: PrinterProfile = DEFAULT_PRINTER): PrintReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { positions, indices, numTri, size, volume, surfaceArea } = mesh;

  if (numTri === 0 || volume <= 0) errors.push("mesh is empty");

  // --- Size vs bed ---
  const [sx, sy, sz] = size;
  const [bx, by, bz] = printer.bed;
  const fitsFlat = (sx <= bx && sy <= by) || (sx <= by && sy <= bx);
  if (!fitsFlat || sz > bz) errors.push(`model ${fmt(sx)}×${fmt(sy)}×${fmt(sz)} mm exceeds the ${bx}×${by}×${bz} mm build volume — scale it down`);
  if (Math.max(sx, sy, sz) < 5) errors.push(`model is only ${fmt(Math.max(sx, sy, sz))} mm across — far too small to print; sizes are in millimetres`);

  // --- Surface classification ---
  let baseArea = 0;
  let overhangArea = 0;
  let totalArea = 0;
  const cosLimit = Math.cos(((90 - printer.overhangDeg) * Math.PI) / 180); // nz below -cosLimit means steep downward face
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
    else if (dz < -cosLimit && !onBed) overhangArea += area;
  }
  const footprint = Math.max(sx * sy, 1e-6);
  const baseContactPct = (baseArea / footprint) * 100;
  const overhangPct = totalArea ? (overhangArea / totalArea) * 100 : 0;

  if (baseContactPct < 2) errors.push(`almost nothing touches the bed (${fmt(baseContactPct)}% of footprint) — give the model a flat base or re-orient it so a flat face sits at z = 0`);
  else if (baseContactPct < 15) warnings.push(`small bed contact (${fmt(baseContactPct)}% of footprint); consider a brim or a wider flat base`);

  if (overhangPct > 35) warnings.push(`${fmt(overhangPct)}% of the surface overhangs beyond ${printer.overhangDeg}° — this will need supports; chamfers or a different orientation would reduce that`);
  else if (overhangPct > 15) warnings.push(`some overhangs (${fmt(overhangPct)}% of surface) — light supports may be needed`);

  // --- Thickness heuristic: mean thickness ≈ 2V / A for shell-like parts ---
  const meanThickness = surfaceArea > 0 ? (2 * volume) / surfaceArea : 0;
  if (meanThickness > 0 && meanThickness < printer.minWall * 0.6) errors.push(`walls average ~${fmt(meanThickness)} mm, thinner than the ${printer.minWall} mm minimum — thicken walls and features`);
  else if (meanThickness < printer.minWall) warnings.push(`thin features (~${fmt(meanThickness)} mm average); keep every wall ≥ ${printer.minWall} mm`);

  if (mesh.shells > 1) warnings.push(`model has ${mesh.shells} disconnected pieces; they will print as separate objects — join them if that is not intended`);

  const volumeCm3 = volume / 1000;
  const estGramsPLA = volumeCm3 * 1.24 * 0.35 + (surfaceArea / 100) * 0.08; // 35% effective infill + walls
  const estPrintMinutes = Math.round(estGramsPLA * 2.8 + sz * 0.6);

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    metrics: {
      size: [round(sx), round(sy), round(sz)],
      volumeCm3: round(volumeCm3),
      surfaceAreaCm2: round(surfaceArea / 100),
      triangles: numTri,
      shells: mesh.shells,
      genus: mesh.genus,
      baseContactPct: round(baseContactPct),
      overhangPct: round(overhangPct),
      meanThicknessMm: round(meanThickness),
      estGramsPLA: round(estGramsPLA),
      estPrintMinutes,
    },
  };
}

const fmt = (n: number) => (Math.round(n * 10) / 10).toString();
const round = (n: number) => Math.round(n * 100) / 100;
