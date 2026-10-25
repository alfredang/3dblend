/** Generic FDM printer presets. Only bed size and nozzle matter to the pipeline. */
export interface PrinterPreset {
  id: string;
  name: string;
  bed: [number, number, number];
  nozzles: number[]; // supported nozzle diameters, first = default
}

export const PRINTERS: PrinterPreset[] = [
  { id: "generic-220", name: "Generic 220 × 220 × 250", bed: [220, 220, 250], nozzles: [0.4, 0.2, 0.6] },
  { id: "bambu-a1-mini", name: "Bambu Lab A1 mini", bed: [180, 180, 180], nozzles: [0.4, 0.2, 0.6, 0.8] },
  { id: "bambu-a1", name: "Bambu Lab A1", bed: [256, 256, 256], nozzles: [0.4, 0.2, 0.6, 0.8] },
  { id: "bambu-p1s", name: "Bambu Lab P1S / P1P", bed: [256, 256, 256], nozzles: [0.4, 0.2, 0.6, 0.8] },
  { id: "bambu-x1c", name: "Bambu Lab X1 Carbon", bed: [256, 256, 256], nozzles: [0.4, 0.2, 0.6, 0.8] },
  { id: "prusa-mk4", name: "Prusa MK4 / MK3S", bed: [250, 210, 220], nozzles: [0.4, 0.25, 0.6] },
  { id: "ender-3", name: "Creality Ender 3 / V3", bed: [220, 220, 250], nozzles: [0.4, 0.2, 0.6] },
  { id: "large-300", name: "Large format 300 × 300 × 350", bed: [300, 300, 350], nozzles: [0.4, 0.6, 0.8] },
];

export const MATERIALS = ["PLA", "PETG", "ABS", "TPU"] as const;
export type Material = (typeof MATERIALS)[number];

export interface PrintSetup {
  printerId: string;
  nozzle: number;
  material: Material;
}

export const DEFAULT_SETUP: PrintSetup = { printerId: "generic-220", nozzle: 0.4, material: "PLA" };

export function resolveSetup(input: Partial<PrintSetup> | null | undefined): PrintSetup & { printer: PrinterPreset } {
  const printer = PRINTERS.find((p) => p.id === input?.printerId) ?? PRINTERS[0];
  const nozzle = input?.nozzle && printer.nozzles.includes(input.nozzle) ? input.nozzle : printer.nozzles[0];
  const material = (MATERIALS as readonly string[]).includes(input?.material ?? "") ? (input!.material as Material) : "PLA";
  return { printerId: printer.id, nozzle, material, printer };
}
