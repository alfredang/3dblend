import Link from "next/link";
import { ArrowRight, Box, Cpu, Printer, Sparkles, Wand2, FileCode2 } from "lucide-react";
import { auth } from "@/lib/auth";
import { listPublicModels } from "@/lib/models";
import { ModelCard } from "@/components/ModelCard";
import { PLANS } from "@/lib/plans";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth();
  let featured = await listPublicModels({ featured: true, take: 6, viewerId: session?.user?.id });
  if (featured.length === 0 && (await ensureSeeded()) > 0) {
    featured = await listPublicModels({ featured: true, take: 6, viewerId: session?.user?.id });
  }

  return (
    <div>
      {/* Hero */}
      <section className="relative mx-auto max-w-7xl px-4 pb-16 pt-20 sm:px-6 sm:pt-28">
        <div className="mx-auto max-w-3xl text-center">
          <span className="glass inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs text-muted">
            <Sparkles className="h-3.5 w-3.5 text-accent-2" /> Powered by DeepSeek V4.1 Flash + an exact geometry kernel
          </span>
          <h1 className="mt-6 text-5xl font-semibold tracking-tight sm:text-6xl">
            Describe it. <span className="gradient-text">Print it.</span>
          </h1>
          <p className="mt-5 text-lg text-muted">
            Chat your idea into a watertight, 3D-printable STL in seconds. Preview it in 3D, refine it in conversation,
            open it in Blender, and share it with the world.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href={session ? "/studio" : "/register"} className="btn-primary !px-6 !py-3 text-base">
              {session ? "Open the studio" : "Start free — 10 credits"} <ArrowRight className="h-4 w-4" />
            </Link>
            <Link href="/gallery" className="btn-ghost !px-6 !py-3 text-base">Browse the gallery</Link>
          </div>
        </div>

        {/* Prompt teaser */}
        <div className="mx-auto mt-14 max-w-3xl">
          <div className="card glass p-3 shadow-2xl shadow-accent/10">
            <div className="flex items-center gap-3 rounded-xl bg-elev px-4 py-3 text-sm text-muted">
              <Wand2 className="h-4 w-4 text-accent" />
              <span className="truncate">“A desk phone stand for a 75 mm phone, angled 65°, with a cable slot in the base”</span>
              <Link href={session ? "/studio?prompt=A desk phone stand for a 75 mm phone, angled 65°, with a cable slot in the base" : "/register"} className="ml-auto shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-white">
                Generate
              </Link>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 px-1 text-xs text-muted">
              {["hex pencil cup with honeycomb cutouts", "self-watering planter, 100 mm", "cable clip for a desk edge", "raspberry pi 4 case with vents"].map((p) => (
                <Link key={p} href={session ? `/studio?prompt=${encodeURIComponent(p)}` : "/register"} className="rounded-full border border-line px-2.5 py-1 hover:border-accent hover:text-fg">
                  {p}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Featured */}
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Featured models</h2>
            <p className="text-sm text-muted">Community favourites, all generated here and ready to slice.</p>
          </div>
          <Link href="/gallery" className="text-sm text-accent hover:underline">View all →</Link>
        </div>
        {featured.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((m) => <ModelCard key={m.id} model={m} />)}
          </div>
        ) : (
          <div className="card p-10 text-center text-muted">No featured models yet — run <code>npm run db:seed</code> to add samples.</div>
        )}
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <h2 className="text-center text-2xl font-semibold">From words to filament</h2>
        <div className="mt-10 grid gap-5 md:grid-cols-4">
          {[
            { Icon: Wand2, t: "1 · Describe", d: "Tell the agent what you need, including size and purpose. Iterate in plain English." },
            { Icon: Cpu, t: "2 · Agent designs", d: "DeepSeek V4.1 Flash writes a parametric CSG spec; the harness validates and repairs it." },
            { Icon: Box, t: "3 · Exact geometry", d: "The Manifold kernel builds a guaranteed watertight mesh and runs printability checks." },
            { Icon: Printer, t: "4 · Print & share", d: "Download STL, open the Blender script, publish to the gallery, collect thumbs-ups." },
          ].map(({ Icon, t, d }) => (
            <div key={t} className="card p-6">
              <Icon className="h-6 w-6 text-accent-2" />
              <h3 className="mt-4 font-medium">{t}</h3>
              <p className="mt-2 text-sm text-muted">{d}</p>
            </div>
          ))}
        </div>
        <div className="card mt-6 flex flex-col items-start gap-4 p-6 md:flex-row md:items-center">
          <FileCode2 className="h-8 w-8 shrink-0 text-accent" />
          <div className="text-sm text-muted">
            <span className="font-medium text-fg">Blender-native output.</span> Every model ships with a Python script that rebuilds it in Blender with real primitives, booleans and arrays — fully editable, not a frozen mesh. The harness is open source and runs from the CLI too.
          </div>
        </div>
      </section>

      {/* Pricing teaser */}
      <section className="mx-auto max-w-7xl px-4 pb-24 pt-8 sm:px-6">
        <h2 className="text-center text-2xl font-semibold">Simple, credit-based pricing</h2>
        <p className="mt-2 text-center text-sm text-muted">One credit = one generation or refinement.</p>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {(["FREE", "STARTER", "PRO"] as const).map((k) => {
            const p = PLANS[k];
            return (
              <div key={k} className={`card p-6 ${k === "STARTER" ? "border-accent/60 shadow-xl shadow-accent/10" : ""}`}>
                <h3 className="font-medium">{p.name}</h3>
                <div className="mt-2 text-3xl font-semibold">${p.price}<span className="text-sm font-normal text-muted">/{p.period}</span></div>
                <p className="mt-2 text-sm text-muted">{p.blurb}</p>
                <ul className="mt-4 space-y-1.5 text-sm">{p.perks.map((x) => <li key={x} className="text-muted">✓ {x}</li>)}</ul>
                <Link href="/pricing" className={`${k === "STARTER" ? "btn-primary" : "btn-ghost"} mt-6 w-full`}>Choose {p.name}</Link>
              </div>
            );
          })}
        </div>
      </section>

      <footer className="border-t border-line/60 py-8 text-center text-xs text-muted">
        <p>© {new Date().getFullYear()} 3DBlend · Inspired by Meshy, Tripo and Blender · Models are released by their authors under CC BY 4.0 unless stated otherwise.</p>
        <p className="powered-by mt-2">
          Powered by <a href="https://www.tertiaryinfotech.com/" target="_blank" rel="noopener" className="text-accent hover:underline">Tertiary Infotech Academy Pte Ltd</a>
        </p>
      </footer>
    </div>
  );
}
