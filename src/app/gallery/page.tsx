import Link from "next/link";
import { Search } from "lucide-react";
import { auth } from "@/lib/auth";
import { listPublicModels } from "@/lib/models";
import { ModelCard } from "@/components/ModelCard";

export const metadata = { title: "Gallery" };
export const dynamic = "force-dynamic";

export default async function GalleryPage({ searchParams }: { searchParams: Promise<{ sort?: string; q?: string }> }) {
  const { sort = "trending", q = "" } = await searchParams;
  const session = await auth();
  const s = (["trending", "new", "top"].includes(sort) ? sort : "trending") as "trending" | "new" | "top";
  const models = await listPublicModels({ sort: s, q: q || undefined, take: 60, viewerId: session?.user?.id });

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Gallery</h1>
          <p className="text-sm text-muted">Printable models shared by the community. Like, download, remix.</p>
        </div>
        <form className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
            <input name="q" defaultValue={q} placeholder="Search models…" className="input !pl-9 md:w-72" />
          </div>
          <input type="hidden" name="sort" value={s} />
          <button className="btn-ghost">Search</button>
        </form>
      </div>
      <div className="mt-6 flex gap-2 text-sm">
        {(["trending", "new", "top"] as const).map((k) => (
          <Link key={k} href={`/gallery?sort=${k}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={`rounded-full border px-3 py-1.5 capitalize ${s === k ? "border-accent bg-accent/15 text-accent" : "border-line text-muted hover:text-fg"}`}>
            {k === "top" ? "Most liked" : k}
          </Link>
        ))}
      </div>
      {models.length ? (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {models.map((m) => <ModelCard key={m.id} model={m} />)}
        </div>
      ) : (
        <div className="card mt-8 p-12 text-center text-muted">No models match. Be the first — <Link href="/studio" className="text-accent">create one</Link>.</div>
      )}
    </div>
  );
}
