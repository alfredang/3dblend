"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wand2, Loader2, ArrowUp, Plus } from "lucide-react";

const CHIPS = [
  "hex pencil cup with honeycomb cutouts",
  "self-watering planter, 100 mm",
  "cable clip for a desk edge",
  "raspberry pi 4 case with vents",
  "wall hook for headphones",
];

export function HeroPrompt({ signedIn }: { signedIn: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  function go(text: string) {
    const prompt = text.trim();
    if (!prompt) return;
    setBusy(true);
    const target = `/studio?prompt=${encodeURIComponent(prompt)}`;
    router.push(signedIn ? target : `/register?next=${encodeURIComponent(target)}`);
  }

  return (
    <div className="card glass p-3 shadow-2xl shadow-accent/10">
      <form onSubmit={(e) => { e.preventDefault(); go(value); }} className="relative rounded-2xl border border-line bg-elev focus-within:border-accent">
        <div className="flex items-start gap-3 px-4 pt-4">
          <Wand2 className="mt-1 h-5 w-5 shrink-0 text-accent" />
          <textarea
            value={value}
            onChange={(e) => { setValue(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${Math.min(e.target.scrollHeight, 320)}px`; }}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); go(value); } }}
            rows={4}
            placeholder={"Describe what you want to print — the object, what it's for and its rough size.\ne.g. a desk phone stand for a 75 mm phone, angled 65°, with a cable slot in the base"}
            className="min-h-[120px] w-full resize-none bg-transparent pb-14 text-base leading-relaxed text-fg outline-none placeholder:text-muted"
            aria-label="Describe the object you want to print"
            autoComplete="off"
          />
        </div>
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-3">
          <button type="button" onClick={() => router.push(signedIn ? "/studio" : "/register?next=/studio")} className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs text-muted hover:border-accent hover:text-fg" title="Attach a reference image or PDF in the studio (Starter and Pro)">
            <Plus className="h-4 w-4" /> Image / PDF reference
          </button>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-muted sm:inline">Enter for a new line · ⌘/Ctrl+Enter to generate</span>
            <button type="submit" disabled={busy || !value.trim()} className="btn-primary !rounded-full !px-5 !py-2.5">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Generate <ArrowUp className="h-4 w-4" /></>}
            </button>
          </div>
        </div>
      </form>
      <div className="mt-3 flex flex-wrap gap-2 px-1 text-xs text-muted">
        {CHIPS.map((p) => (
          <button key={p} type="button" onClick={() => setValue(p)} className="rounded-full border border-line px-3 py-1.5 hover:border-accent hover:text-fg">
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
