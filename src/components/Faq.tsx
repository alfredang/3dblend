import { COST, PLANS } from "@/lib/plans";

const FAQ: { q: string; a: string }[] = [
  {
    q: "How many credits does one model cost?",
    a: `One generation costs ${COST.generate} credit and each refinement (“make the walls thicker”, “add a lid”) costs ${COST.refine} credit, no matter how many internal repair or optimisation passes the agent runs. A typical model takes 2–4 credits: one generation plus a couple of tweaks. Replies where the agent only answers a question also cost 1 credit, and a failed generation is refunded automatically.`,
  },
  {
    q: "What do the plans include?",
    a: `Free gives ${PLANS.FREE.credits} credits once. Starter gives ${PLANS.STARTER.credits} credits a month and Pro ${PLANS.PRO.credits} credits a month, resetting each billing cycle. Unused monthly credits do not roll over.`,
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
    q: "Can I design from a photo or a drawing?",
    a: "Yes. Use the + button in the studio to attach a JPEG/PNG image or a PDF. The agent reads the silhouette, proportions and any labelled dimensions and turns them into a printable solid.",
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
    <section id="faq" className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <h2 className="text-center text-2xl font-semibold">Frequently asked questions</h2>
      <div className="mx-auto mt-6 grid max-w-5xl gap-3 md:grid-cols-2">
        {FAQ.map(({ q, a }) => (
          <details key={q} className="card group p-5">
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
