import { COST, PLANS } from "@/lib/plans";

const FAQ: { q: string; a: string }[] = [
  {
    q: "How many credits does one model cost?",
    a: `Generating a new model costs ${COST.generate} credits. Each edit of that model (“make the walls thicker”, “add a lid”) costs ${COST.refine} credit, no matter how many internal repair or optimisation passes the agent runs. A typical finished model takes ${COST.generate + 2}–${COST.generate + 4} credits: one generation plus a few tweaks. A reply where the agent only answers a question costs ${COST.chat} credit, and a failed generation is refunded automatically.`,
  },
  {
    q: "What do the plans include?",
    a: `Free gives ${PLANS.FREE.credits} credits once: one model plus five edits, text prompts only. Starter gives ${PLANS.STARTER.credits} credits a month and Pro ${PLANS.PRO.credits} credits a month, resetting each billing cycle. Unused monthly credits do not roll over.`,
  },
  {
    q: "Are my models private?",
    a: "On the Free plan every model you generate is shared publicly in the gallery. On Starter and Pro, models are private by default and only appear in the gallery when you publish them.",
  },
  {
    q: "What files do I get?",
    a: "A binary STL, a 3MF (millimetre units, opens directly in Bambu Studio, PrusaSlicer, Cura and OrcaSlicer) and a Blender Python script that rebuilds the model with native primitives and booleans so you can keep editing it.",
  },
  {
    q: "Is every model really printable?",
    a: "Every mesh is built by an exact geometry kernel, so it is always watertight. On top of that the harness checks build-volume fit, bed contact, overhangs, bridges and wall thickness for the printer, nozzle and material you select, repairs hard failures automatically and flags anything that still needs supports or a brim.",
  },
  {
    q: "Can I design from a photo, a drawing, or modify an existing model?",
    a: "Yes, on Starter and Pro. Use the + button in the studio to attach a JPEG/PNG image or a PDF (the agent reads the silhouette, proportions and labelled dimensions), or upload an STL, 3MF or a 3DBlend Blender script. Uploaded models become the base solid the agent adds to, cuts, scales or moves — add holes, mounts, lips, text-free features — and every result is re-checked for printability. The Free plan is text prompts only.",
  },
  {
    q: "Which printers are supported?",
    a: "Any FDM printer. Presets cover a generic 220 mm bed, Bambu Lab A1 mini / A1 / P1S / X1C, Prusa MK4/MK3S, Creality Ender 3 and 300 mm large-format machines, with 0.2–0.8 mm nozzles and PLA, PETG, ABS or TPU.",
  },
  {
    q: "Who owns the models, and can I sell prints?",
    a: "You own what you generate. Pro includes a commercial licence. Models you publish to the gallery are shared under CC BY 4.0 so others can download and remix them with attribution.",
  },
];

export function Faq() {
  return (
    <section id="faq" className="mx-auto w-full max-w-7xl px-4 pb-6 pt-5 sm:px-6">
      <h2 className="text-center text-2xl font-semibold">Frequently asked questions</h2>
      <div className="mx-auto mt-4 grid max-w-5xl gap-2.5 md:grid-cols-2">
        {FAQ.map(({ q, a }) => (
          <details key={q} className="card group px-5 py-3.5">
            <summary className="cursor-pointer list-none font-medium marker:hidden">
              <span className="mr-2 inline-block text-accent transition group-open:rotate-90">▸</span>{q}
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-muted">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
