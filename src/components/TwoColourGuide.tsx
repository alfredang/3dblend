"use client";
import { useState } from "react";
import { Palette } from "lucide-react";
import type { SwapPlan } from "@/lib/colour-swap";
import { cn } from "@/lib/utils";

type Slicer = "bambu" | "prusa" | "cura";

const SLICERS: Record<Slicer, { label: string; gcode: string; steps: (z: string, layer: number) => string[] }> = {
  bambu: {
    label: "Bambu Studio",
    gcode: "M400 U1",
    steps: (z, layer) => [
      "Import the 3MF or STL and slice it as usual.",
      `In Preview, drag the vertical layer slider up to Z = ${z} mm (layer ${layer}).`,
      "Right-click the + next to the slider and choose Add Pause (this inserts M400 U1). Do not use Add Color Change, which needs an AMS.",
      "Print. When the printer pauses, open Filament on the screen (or in Bambu Handy), Unload, then load the second spool and extrude until the colour runs clean.",
      "Pull the purged strand off the nozzle with tweezers, then press Resume.",
    ],
  },
  prusa: {
    label: "PrusaSlicer",
    gcode: "M600",
    steps: (z, layer) => [
      "Import the 3MF or STL and slice it as usual.",
      `In Preview, drag the vertical layer slider up to Z = ${z} mm (layer ${layer}).`,
      "Click the orange + icon next to the slider to add a colour change (M600).",
      "Print. At that layer the printer parks the head and unloads the filament. Insert the second spool, let it purge until the colour is clean, and confirm on the printer.",
      "If your firmware lacks M600 (some Marlin builds), right-click the + instead and choose Add pause print (M601), then swap the filament by hand.",
    ],
  },
  cura: {
    label: "Cura (Ender, Marlin)",
    gcode: "M600 / M0",
    steps: (z) => [
      "Import the 3MF or STL and slice it as usual.",
      "Go to Extensions → Post Processing → Modify G-Code → Add a script → Pause at height.",
      `Set Pause at: Height, Pause height: ${z} mm, and Park print head to X 0 / Y 0.`,
      "Set Method to Marlin (M0) for stock Ender firmware. If your firmware supports filament change, use the Filament Change script instead (M600).",
      "Print. When it pauses, heat stays on: cut and pull out the old filament, feed the second colour until it extrudes clean, wipe the nozzle, then click the knob (or Resume) to continue.",
    ],
  },
};

function defaultSlicer(printerId?: string): Slicer {
  if (printerId?.startsWith("bambu")) return "bambu";
  if (printerId?.startsWith("prusa")) return "prusa";
  return "cura";
}

/** Pause-at-height guide for printing two colours/materials without an AMS or MMU. */
export function TwoColourGuide({ plan, printerId }: { plan: SwapPlan; printerId?: string }) {
  const { layer, height, suggestions } = plan;
  const minZ = layer * 2, maxZ = Math.max(minZ, height - layer * 2);
  const [swapZ, setSwapZ] = useState(suggestions[0]?.z ?? +(Math.round(height / 2 / layer) * layer).toFixed(2));
  const [slicer, setSlicer] = useState<Slicer>(defaultSlicer(printerId));
  if (height < layer * 5) return null;

  // Colour 2 starts on the first layer printed above the swap height.
  const firstLayer = Math.round(swapZ / layer) + 1;
  const firstZ = (firstLayer * layer).toFixed(2);
  const s = SLICERS[slicer];

  return (
    <div id="two-colour" className="card scroll-mt-24 p-4 text-sm">
      <div className="flex items-center gap-2 font-medium"><Palette className="h-4 w-4 text-accent" /> Two-colour print (no AMS needed)</div>
      <p className="mt-1 text-xs text-muted">Pause at one layer and swap filament. Everything below the line prints in colour 1, everything above in colour 2.</p>

      {suggestions.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-muted">Suggested:</span>
          {suggestions.map((sg) => (
            <button key={sg.z} onClick={() => setSwapZ(sg.z)} className={cn("rounded-full border px-2 py-0.5", Math.abs(swapZ - sg.z) < 1e-6 ? "border-accent text-accent" : "border-line text-muted hover:text-fg")} title={`Flat plateau at ${sg.z} mm — a crisp colour line, with ${sg.areaPct}% of the largest flat area`}>
              {sg.z} mm
            </button>
          ))}
        </div>
      )}

      <label className="mt-3 block text-xs text-muted">
        Swap height: <b className="text-fg">{swapZ.toFixed(2)} mm</b> of {height} mm
        <input type="range" min={minZ} max={maxZ} step={layer} value={swapZ} onChange={(e) => setSwapZ(+(+e.target.value).toFixed(2))} className="mt-1 w-full accent-accent" />
      </label>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-fg/5 px-2.5 py-2"><div className="text-muted">Colour 1</div><b>layers 1–{firstLayer - 1}</b> · 0–{swapZ.toFixed(2)} mm</div>
        <div className="rounded-lg bg-fg/5 px-2.5 py-2"><div className="text-muted">Colour 2 from</div><b>layer {firstLayer}</b> · Z = {firstZ} mm</div>
      </div>

      <div className="mt-4 inline-flex rounded-lg border border-line p-0.5 text-xs">
        {(Object.keys(SLICERS) as Slicer[]).map((k) => (
          <button key={k} onClick={() => setSlicer(k)} className={cn("rounded-md px-2 py-1", slicer === k ? "bg-fg/10 text-fg" : "text-muted")}>{SLICERS[k].label}</button>
        ))}
      </div>
      <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-xs leading-relaxed">
        {s.steps(firstZ, firstLayer).map((step) => <li key={step}>{step}</li>)}
      </ol>
      <p className="mt-2 text-xs text-muted">G-code inserted at the layer: <code className="rounded bg-fg/10 px-1">{s.gcode}</code>. Layer numbers assume a {layer} mm first layer. If yours differs, pick the slider position closest to Z = {firstZ} mm.</p>

      <div className="mt-3 space-y-1 text-xs text-muted">
        <p>💡 A swap at a flat plateau gives a crisp line. Raised text or a logo on a base plate is the classic case.</p>
        <p>💡 Two materials: pair ones that bond and print at similar temperatures (PLA + silk PLA, PLA + PLA-CF). PLA on PETG barely bonds, which is useful for removable supports but not for a solid part.</p>
        <p>💡 Purge until the new colour runs clean, about 50–100 mm, especially when going from dark to light.</p>
      </div>
    </div>
  );
}
