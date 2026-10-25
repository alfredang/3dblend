"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wand2, Loader2 } from "lucide-react";

const CHIPS = [
  "hex pencil cup with honeycomb cutouts",
  "self-watering planter, 100 mm",
  "cable clip for a desk edge",
  "raspberry pi 4 case with vents",
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
      <form
        onSubmit={(e) => { e.preventDefault(); go(value); }}
        className="flex items-center gap-3 rounded-xl bg-elev px-4 py-2 text-sm focus-within:ring-1 focus-within:ring-accent"
      >
        <Wand2 className="h-4 w-4 shrink-0 text-accent" />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Describe what you want to print… e.g. a desk phone stand for a 75 mm phone, angled 65°, with a cable slot"
          className="w-full bg-transparent py-1.5 text-fg outline-none placeholder:text-muted"
          aria-label="Describe the object you want to print"
          autoComplete="off"
        />
        <button type="submit" disabled={busy || !value.trim()} className="btn-primary shrink-0 !px-3 !py-1.5 text-xs">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Generate"}
        </button>
      </form>
      <div className="mt-2 flex flex-wrap gap-2 px-1 text-xs text-muted">
        {CHIPS.map((p) => (
          <button key={p} type="button" onClick={() => setValue(p)} className="rounded-full border border-line px-2.5 py-1 hover:border-accent hover:text-fg">
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
