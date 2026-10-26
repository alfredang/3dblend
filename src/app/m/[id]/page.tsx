import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { Download, FileCode2, Printer, Ruler, Weight, Clock, Layers, Sparkles, GitFork } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ModelStage } from "@/components/ModelStage";
import { TwoColourGuide } from "@/components/TwoColourGuide";
import { planColourSwap, type SwapPlan } from "@/lib/colour-swap";
import { readFile } from "@/lib/storage";
import { LikeButton } from "@/components/LikeButton";
import { ShareButtons } from "@/components/ShareButtons";
import { RemixButton } from "@/components/RemixButton";
import { appUrl, colorFor } from "@/lib/utils";
import { Markdown } from "@/components/Markdown";

export const dynamic = "force-dynamic";

type Stats = { brief?: string | null; assumptions?: string[] | null; size?: [number, number, number]; volumeCm3?: number; estGramsPLA?: number; estPrintMinutes?: number; triangles?: number; warnings?: string[]; tips?: string[]; printNotes?: string | null; overhangPct?: number; baseContactPct?: number; minWallMm?: number; recommendedLayerHeight?: number; printer?: { name: string; nozzle: number; material: string }; setup?: { printerId?: string } };

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
    include: { user: { select: { name: true, id: true } }, likes: session?.user?.id ? { where: { userId: session.user.id } } : false, project: { select: { id: true } }, remixOf: { select: { id: true, title: true, isPublic: true, user: { select: { name: true } } } } },
  });
  if (!model) notFound();
  const isOwner = session?.user?.id === model.userId;
  if (!model.isPublic && !isOwner) notFound();
  await prisma.model.update({ where: { id }, data: { views: { increment: 1 } } }).catch(() => {});

  const stats = model.stats as Stats;
  const url = `${appUrl()}/m/${model.id}`;
  const reply = await prisma.message.findFirst({ where: { modelId: model.id, role: "assistant" }, select: { content: true } });
  // Full conversation that produced this version: the original brief plus every refinement up to it.
  const history = model.projectId
    ? await prisma.message.findMany({ where: { projectId: model.projectId, role: "user", createdAt: { lte: model.createdAt } }, orderBy: { createdAt: "asc" }, select: { content: true, attachmentName: true } })
    : [];
  const original = history[0]?.content ?? model.prompt;
  const layerHeight = stats.recommendedLayerHeight ?? 0.2;
  let swapPlan: SwapPlan | null = null;
  try { swapPlan = planColourSwap(await readFile(model.stlPath), layerHeight); } catch { /* guide is optional */ }
  const refinements = history.slice(1);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
        <div>
          <ModelStage url={`/api/models/${model.id}/stl`} size={stats.size} color={colorFor(model.id)} title={model.title} layerHeight={layerHeight} className="card aspect-[4/3] overflow-hidden lg:aspect-[16/10]" />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <ShareButtons url={url} title={model.title} />
            <LikeButton modelId={model.id} initialCount={model.likesCount} initialLiked={Array.isArray(model.likes) && model.likes.length > 0} />
          </div>
          <div className="card mt-4 p-5">
            <div className="flex items-center gap-2 text-sm font-medium"><Sparkles className="h-4 w-4 text-accent" /> Prompt</div>
            <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed">{original}{history[0]?.attachmentName ? <span className="ml-2 rounded-full bg-fg/10 px-2 py-0.5 text-xs text-muted">📎 {history[0].attachmentName}</span> : null}</p>
            {stats.brief && (
              <>
                <div className="mt-4 text-sm font-medium text-muted">Design brief the agent worked from</div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{stats.brief}</p>
                {stats.assumptions?.length ? <p className="mt-1 text-xs text-muted">Assumed: {stats.assumptions.join(" · ")}</p> : null}
              </>
            )}
            {refinements.length > 0 && (
              <>
                <div className="mt-4 text-sm font-medium text-muted">Refinements ({refinements.length})</div>
                <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm">
                  {refinements.map((r, i) => <li key={i} className="whitespace-pre-wrap">{r.content}{r.attachmentName ? <span className="ml-2 rounded-full bg-fg/10 px-2 py-0.5 text-xs text-muted">📎 {r.attachmentName}</span> : null}</li>)}
                </ol>
              </>
            )}
            {reply?.content && (
              <>
                <div className="mt-4 text-sm font-medium text-muted">Agent response for this version</div>
                <div className="prose-chat mt-1 text-sm text-muted"><Markdown text={reply.content} /></div>
              </>
            )}
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
            {model.attribution && (
              <p className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-line bg-elev px-3 py-1 text-xs text-muted">
                <GitFork className="h-3.5 w-3.5 text-accent-2" />
                Remix of {model.remixOf?.isPublic ? <Link href={`/m/${model.remixOf.id}`} className="text-accent hover:underline">{model.remixOf.title}</Link> : <span className="text-fg">{model.attribution.split(" by ")[0]}</span>} by <span className="text-fg">{model.remixOf?.user.name ?? model.attribution.split(" by ").slice(1).join(" by ")}</span> · CC BY 4.0
              </p>
            )}
          </div>

          <div className="card grid grid-cols-2 gap-3 p-4 text-sm">
            <Stat Icon={Ruler} label="Size" value={stats.size ? `${stats.size.map((n) => Math.round(n)).join(" × ")} mm` : "—"} />
            <Stat Icon={Weight} label="Filament" value={stats.estGramsPLA ? `~${Math.round(stats.estGramsPLA)} g PLA` : "—"} />
            <Stat Icon={Clock} label="Print time" value={stats.estPrintMinutes ? `~${Math.floor(stats.estPrintMinutes / 60)}h ${stats.estPrintMinutes % 60}m` : "—"} />
            <Stat Icon={Layers} label="Mesh" value={stats.triangles ? `${stats.triangles.toLocaleString()} tris · watertight` : "—"} />
            <Stat Icon={Printer} label="Designed for" value={stats.printer ? `${stats.printer.name} · ${stats.printer.nozzle} mm · ${stats.printer.material}` : "Generic FDM"} />
            <Stat Icon={Ruler} label="Walls / layer" value={`${stats.minWallMm !== undefined ? `min ${stats.minWallMm} mm` : "—"} · ${stats.recommendedLayerHeight ?? 0.2} mm layers`} />
          </div>

          {(stats.printNotes || stats.warnings?.length || stats.tips?.length) && (
            <div className="card p-4 text-sm">
              <div className="flex items-center gap-2 font-medium"><Printer className="h-4 w-4 text-accent-2" /> Print notes</div>
              {stats.printNotes && <p className="mt-2 text-muted">{stats.printNotes}</p>}
              {stats.tips?.map((t) => <p key={t} className="mt-2 text-xs text-muted">💡 {t}</p>)}
              {stats.warnings?.map((w) => <p key={w} className="mt-2 text-xs text-accent-3">⚠ {w}</p>)}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <a href={`/api/models/${model.id}/stl?download=1`} className="btn-primary !py-3"><Download className="h-4 w-4" /> Download STL</a>
            <a href={`/api/models/${model.id}/3mf?download=1`} className="btn-ghost !py-3" title="3MF for Bambu Studio, PrusaSlicer, Cura"><Download className="h-4 w-4" /> Download 3MF</a>
            <a href={`/api/models/${model.id}/obj?download=1`} className="btn-ghost !py-3" title="OBJ for Blender, Fusion, game engines and slicers"><Download className="h-4 w-4" /> Download OBJ</a>
            <a href={`/api/models/${model.id}/blender`} className="btn-ghost !py-3"><FileCode2 className="h-4 w-4" /> Blender script (.py)</a>
            <RemixButton modelId={model.id} />
            {isOwner && model.project && <Link href={`/studio/${model.project.id}`} className="btn-ghost !py-3"><Sparkles className="h-4 w-4" /> Continue in studio</Link>}
          </div>

          {swapPlan && <TwoColourGuide plan={swapPlan} printerId={stats.setup?.printerId} />}
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
