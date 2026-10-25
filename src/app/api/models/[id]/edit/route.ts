import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveFile, readFile } from "@/lib/storage";
import { validateSpec, type Spec } from "@/agent/spec";
import { buildSpec, type BuildOptions } from "@/agent/kernel";
import { analysePrintability, type PrinterProfile } from "@/agent/checks";
import { toBinarySTL } from "@/agent/stl";
import { toBlenderScript } from "@/agent/blender";
import { parseSTL } from "@/agent/meshio";
import { resolveSetup } from "@/lib/printers";
import { applyShapes, type EditShape } from "@/lib/editor";
import { defaultVisibility } from "@/lib/plans";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Manual shape edits: merge shapes into the model's spec, rebuild, save as a new version. No credits charged. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const shapes = Array.isArray(body?.shapes) ? (body.shapes as EditShape[]) : [];
  if (!shapes.length || shapes.length > 64) return NextResponse.json({ error: "Add at least one shape (max 64)" }, { status: 400 });
  const source = await prisma.model.findFirst({ where: { id, userId: session.user.id }, include: { user: { select: { plan: true } } } });
  if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const merged = applyShapes(source.spec as unknown as Spec, shapes);
  const v = validateSpec(merged);
  if (!v.ok) return NextResponse.json({ error: v.errors.join("; ") }, { status: 400 });
  const setup = resolveSetup(body.setup);
  const printer: PrinterProfile = { bed: setup.printer.bed, nozzle: setup.nozzle, material: setup.material, overhangDeg: 50, name: setup.printer.name };
  let meshes: BuildOptions["meshes"];
  if (source.baseMeshPath) { try { const m = parseSTL(await readFile(source.baseMeshPath)); meshes = { base: { positions: m.positions, indices: m.indices } }; } catch { /* ignore */ } }
  try {
    const mesh = await buildSpec(v.spec, { meshes });
    const report = analysePrintability(mesh, printer);
    const version = (await prisma.model.count({ where: { projectId: source.projectId ?? undefined } })) + 1;
    const summary = `Manual edit: ${shapes.filter((s) => s.mode === "solid").length} shape(s) added, ${shapes.filter((s) => s.mode === "hole").length} hole(s) cut.`;
    const model = await prisma.model.create({
      data: {
        userId: session.user.id, projectId: source.projectId, title: source.title, description: source.description, prompt: summary,
        spec: v.spec as object,
        stats: { ...report.metrics, ok: report.ok, warnings: report.warnings, errors: report.errors, tips: report.tips, recommendedLayerHeight: report.recommendedLayerHeight, printer: report.printer, setup: { printerId: setup.printerId, nozzle: setup.nozzle, material: setup.material }, printNotes: v.spec.printNotes ?? null, attempts: 1, llm: "manual-edit" } as object,
        stlPath: "pending", blenderPath: "pending", version, isPublic: defaultVisibility(source.user.plan),
        remixOfId: source.remixOfId, attribution: source.attribution, baseMeshPath: source.baseMeshPath,
      },
    });
    const stlPath = await saveFile(`models/${model.id}.stl`, toBinarySTL(mesh, v.spec.name));
    const blenderPath = await saveFile(`models/${model.id}.blender.py`, toBlenderScript(v.spec));
    const saved = await prisma.model.update({ where: { id: model.id }, data: { stlPath, blenderPath } });
    if (source.projectId) {
      await prisma.message.create({ data: { projectId: source.projectId, role: "user", content: summary } });
      await prisma.message.create({ data: { projectId: source.projectId, role: "assistant", content: `Applied your manual edit as version ${version}. ${report.ok ? "It is watertight and passes the printability checks." : "Note: " + report.errors.join("; ")} You can keep editing by hand or ask me for changes.`, modelId: saved.id } });
      await prisma.project.update({ where: { id: source.projectId }, data: { updatedAt: new Date() } });
    }
    return NextResponse.json({ model: saved });
  } catch (e) {
    return NextResponse.json({ error: `Could not build the edited model: ${(e as Error).message}` }, { status: 400 });
  }
}
