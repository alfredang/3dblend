import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { Download, FileCode2, Printer, Ruler, Weight, Clock, Layers, Sparkles } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ModelViewer } from "@/components/ModelViewer";
import { LikeButton } from "@/components/LikeButton";
import { ShareButtons } from "@/components/ShareButtons";
import { RemixButton } from "@/components/RemixButton";
import { appUrl, colorFor } from "@/lib/utils";
import { Markdown } from "@/components/Markdown";

export const dynamic = "force-dynamic";

type Stats = { size?: [number, number, number]; volumeCm3?: number; estGramsPLA?: number; estPrintMinutes?: number; triangles?: number; warnings?: string[]; printNotes?: string | null; overhangPct?: number; baseContactPct?: number };

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const m = await prisma.model.findUnique({ where: { id }, select: { title: true, description: true, isPublic: true } });
  if (!m || !m.isPublic) return { title: "Model" };
  return { title: m.title, description: m.description, openGraph: { title: m.title, description: m.description } };
}

export default async function ModelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const model = await prisma.model.findUnique({
    where: { id },
    include: { user: { select: { name: true, id: true } }, likes: session?.user?.id ? { where: { userId: session.user.id } } : false, project: { select: { id: true } } },
  });
  if (!model) notFound();
  const isOwner = session?.user?.id === model.userId;
  if (!model.isPublic && !isOwner) notFound();
  await prisma.model.update({ where: { id }, data: { views: { increment: 1 } } }).catch(() => {});

  const stats = model.stats as Stats;
  const url = `${appUrl()}/m/${model.id}`;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div>
          <ModelViewer url={`/api/models/${model.id}/stl`} size={stats.size} color={colorFor(model.id)} className="card aspect-[4/3] overflow-hidden lg:aspect-[16/10]" />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <ShareButtons url={url} title={model.title} />
            <LikeButton modelId={model.id} initialCount={model.likesCount} initialLiked={Array.isArray(model.likes) && model.likes.length > 0} />
          </div>
        </div>

        <aside className="space-y-5">
          <div>
            <div className="flex items-center gap-2 text-xs text-muted">
              {model.featured && <span className="rounded-full bg-gradient-to-r from-accent to-accent-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">Featured</span>}
              <span>{model.isPublic ? "Public" : "Private"} · v{model.version}</span>
            </div>
            <h1 className="mt-2 text-3xl font-semibold">{model.title}</h1>
            <p className="mt-2 text-muted">{model.description}</p>
            <p className="mt-3 text-sm text-muted">by <span className="text-fg">{model.user.name ?? "anonymous"}</span> · {model.createdAt.toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}</p>
          </div>

          <div className="card grid grid-cols-2 gap-3 p-4 text-sm">
            <Stat Icon={Ruler} label="Size" value={stats.size ? `${stats.size.map((n) => Math.round(n)).join(" × ")} mm` : "—"} />
            <Stat Icon={Weight} label="Filament" value={stats.estGramsPLA ? `~${Math.round(stats.estGramsPLA)} g PLA` : "—"} />
            <Stat Icon={Clock} label="Print time" value={stats.estPrintMinutes ? `~${Math.floor(stats.estPrintMinutes / 60)}h ${stats.estPrintMinutes % 60}m` : "—"} />
            <Stat Icon={Layers} label="Mesh" value={stats.triangles ? `${stats.triangles.toLocaleString()} tris · watertight` : "—"} />
          </div>

          {(stats.printNotes || stats.warnings?.length) && (
            <div className="card p-4 text-sm">
              <div className="flex items-center gap-2 font-medium"><Printer className="h-4 w-4 text-accent-2" /> Print notes</div>
              {stats.printNotes && <p className="mt-2 text-muted">{stats.printNotes}</p>}
              {stats.warnings?.map((w) => <p key={w} className="mt-2 text-xs text-accent-3">⚠ {w}</p>)}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <a href={`/api/models/${model.id}/stl?download=1`} className="btn-primary !py-3"><Download className="h-4 w-4" /> Download STL</a>
            <a href={`/api/models/${model.id}/blender`} className="btn-ghost !py-3"><FileCode2 className="h-4 w-4" /> Blender script (.py)</a>
            <RemixButton modelId={model.id} />
            {isOwner && model.project && <Link href={`/studio/${model.project.id}`} className="btn-ghost !py-3"><Sparkles className="h-4 w-4" /> Continue in studio</Link>}
          </div>

          <details className="card p-4 text-sm">
            <summary className="cursor-pointer font-medium">Original prompt</summary>
            <div className="prose-chat mt-2 text-muted"><Markdown text={model.prompt} /></div>
          </details>
        </aside>
      </div>
    </div>
  );
}

function Stat({ Icon, label, value }: { Icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 text-accent" />
      <div>
        <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
        <div className="font-medium">{value}</div>
      </div>
    </div>
  );
}
