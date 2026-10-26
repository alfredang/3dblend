"use client";
import { useRef, useState } from "react";
import { Box, Camera, ImageDown } from "lucide-react";
import { ModelViewer, FINISHES, type Finish } from "./ModelViewer";
import { cn, slugify } from "@/lib/utils";

/** Common filament colours for the render preview; the model's own colour is offered first. */
const FILAMENTS = [
  { name: "White", hex: "#f2f1ec" },
  { name: "Black", hex: "#26262a" },
  { name: "Grey", hex: "#8d9096" },
  { name: "Red", hex: "#c8312c" },
  { name: "Orange", hex: "#ee7a26" },
  { name: "Yellow", hex: "#f2c230" },
  { name: "Green", hex: "#3a9a57" },
  { name: "Blue", hex: "#2f63c4" },
];

/** The model viewer with a 3D ⇄ Render toggle; Render shows a photo-studio preview of the printed part and can be saved as PNG. */
export function ModelStage({ url, size, color, title, layerHeight, className }: { url: string; size?: [number, number, number]; color: string; title: string; layerHeight?: number; className?: string }) {
  const [look, setLook] = useState<"standard" | "render">("standard");
  const [finish, setFinish] = useState<Finish>("matte");
  const [tint, setTint] = useState(color);
  const canvas = useRef<HTMLCanvasElement | null>(null);

  const savePng = () => {
    canvas.current?.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${slugify(title) || "model"}-render.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, "image/png");
  };

  return (
    <div className={cn("relative", className)}>
      <ModelViewer
        key={look}
        url={url}
        size={size}
        color={look === "render" ? tint : color}
        look={look}
        finish={finish}
        layerHeight={layerHeight}
        onCanvas={(c) => { canvas.current = c; }}
        className="h-full w-full"
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-2 p-3">
        <div className="glass pointer-events-auto inline-flex rounded-xl p-1 text-xs">
          <button onClick={() => setLook("standard")} className={cn("inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5", look === "standard" ? "bg-fg/10 text-fg" : "text-muted")}><Box className="h-3.5 w-3.5" />3D view</button>
          <button onClick={() => setLook("render")} className={cn("inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5", look === "render" ? "bg-fg/10 text-fg" : "text-muted")} title="Photo-style preview of the printed part"><Camera className="h-3.5 w-3.5" />Render</button>
        </div>
        {look === "render" && (
          <div className="glass pointer-events-auto flex flex-wrap items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs">
            <select value={finish} onChange={(e) => setFinish(e.target.value as Finish)} className="rounded-md border border-line bg-transparent px-1.5 py-1 text-xs" aria-label="Filament finish">
              {(Object.keys(FINISHES) as Finish[]).map((f) => <option key={f} value={f}>{FINISHES[f].label}</option>)}
            </select>
            <div className="flex items-center gap-1" role="radiogroup" aria-label="Filament colour">
              {[{ name: "Model colour", hex: color }, ...FILAMENTS].map((f) => (
                <button key={f.name} role="radio" aria-checked={tint === f.hex} title={f.name} onClick={() => setTint(f.hex)} className={cn("h-5 w-5 rounded-full border border-fg/30", tint === f.hex && "ring-2 ring-accent ring-offset-1 ring-offset-transparent")} style={{ background: f.hex }} />
              ))}
            </div>
            <button onClick={savePng} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-fg/10" title="Save this view as a PNG"><ImageDown className="h-3.5 w-3.5" />PNG</button>
          </div>
        )}
      </div>
    </div>
  );
}
