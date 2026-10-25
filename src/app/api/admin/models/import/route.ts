import { NextResponse } from "next/server";
import { z } from "zod";
import { currentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { saveFile } from "@/lib/storage";
import { validateSpec } from "@/agent/spec";
import { buildSpec, type BuildOptions } from "@/agent/kernel";
import { analysePrintability, type PrinterProfile } from "@/agent/checks";
import { toBinarySTL } from "@/agent/stl";
import { toBlenderScript } from "@/agent/blender";
import { parseSTL } from "@/agent/meshio";
import { resolveSetup } from "@/lib/printers";

export const runtime = "nodejs";
export const maxDuration = 300;

const item = z.object({
  ownerEmail: z.string().email(),
  title: z.string().min(1).max(120),
  description: z.string().max(600).default(""),
  prompt: z.string().max(8000),
  spec: z.unknown(),
  version: z.number().int().min(1).default(1),
  isPublic: z.boolean().default(false),
  featured: z.boolean().default(false),
  likesCount: z.number().int().min(0).default(0),
  downloads: z.number().int().min(0).default(0),
  views: z.number().int().min(0).default(0),
  attribution: z.string().nullable().optional(),
  projectTitle: z.string().max(120).optional(),
  setup: z.object({ printerId: z.string(), nozzle: z.number(), material: z.enum(["PLA", "PETG", "ABS", "TPU"]) }).partial().optional(),
  baseMeshStlBase64: z.string().optional(),
  extraStats: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string().datetime().optional(),
});

/** Admin-only bulk import: rebuilds each model from its spec on this server. Skips rows that already exist (owner + title + version + prompt). */
export async function POST(req: Request) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const parsed = z.object({ models: z.array(item).max(50) }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues.slice(0, 5) }, { status: 400 });

  const results: { title: string; status: string; id?: string; error?: string }[] = [];
  for (const m of parsed.data.models) {
    try {
      const owner = await prisma.user.findUnique({ where: { email: m.ownerEmail.toLowerCase() } });
      if (!owner) { results.push({ title: m.title, status: "skipped", error: `owner ${m.ownerEmail} not found` }); continue; }
      const dup = await prisma.model.findFirst({ where: { userId: owner.id, title: m.title, version: m.version, prompt: m.prompt } });
      if (dup) { results.push({ title: m.title, status: "exists", id: dup.id }); continue; }
      const v = validateSpec(m.spec);
      if (!v.ok) { results.push({ title: m.title, status: "failed", error: v.errors.join("; ") }); continue; }

      let baseMeshPath: string | null = null;
      let meshes: BuildOptions["meshes"] = undefined;
      if (m.baseMeshStlBase64) {
        const buf = Buffer.from(m.baseMeshStlBase64, "base64");
        const pm = parseSTL(buf);
        meshes = { base: { positions: pm.positions, indices: pm.indices } };
        baseMeshPath = await saveFile(`uploads/import-${owner.id}-${Date.now()}.base.stl`, buf);
      }
      const setup = resolveSetup(m.setup);
      const printer: PrinterProfile = { bed: setup.printer.bed, nozzle: setup.nozzle, material: setup.material, overhangDeg: 50, name: setup.printer.name };
      const mesh = await buildSpec(v.spec, { meshes });
      const report = analysePrintability(mesh, printer);

      // One project per imported title so the owner can keep editing in the studio.
      const projectTitle = m.projectTitle ?? m.title;
      const project = (await prisma.project.findFirst({ where: { userId: owner.id, title: projectTitle } })) ?? (await prisma.project.create({ data: { userId: owner.id, title: projectTitle } }));
      const model = await prisma.model.create({
        data: {
          userId: owner.id, projectId: project.id, title: m.title, description: m.description, prompt: m.prompt,
          spec: v.spec as object,
          stats: { ...(m.extraStats ?? {}), ...report.metrics, ok: report.ok, warnings: report.warnings, errors: report.errors, tips: report.tips, recommendedLayerHeight: report.recommendedLayerHeight, printer: report.printer, setup: { printerId: setup.printerId, nozzle: setup.nozzle, material: setup.material }, printNotes: v.spec.printNotes ?? null, imported: true } as object,
          stlPath: "pending", blenderPath: "pending", version: m.version, isPublic: m.isPublic, featured: m.featured,
          likesCount: m.likesCount, downloads: m.downloads, views: m.views, attribution: m.attribution ?? null, baseMeshPath,
          createdAt: m.createdAt ? new Date(m.createdAt) : undefined,
        },
      });
      await prisma.model.update({ where: { id: model.id }, data: { stlPath: await saveFile(`models/${model.id}.stl`, toBinarySTL(mesh, v.spec.name)), blenderPath: await saveFile(`models/${model.id}.blender.py`, toBlenderScript(v.spec)) } });
      await prisma.message.createMany({ data: [
        { projectId: project.id, role: "user", content: m.prompt, createdAt: m.createdAt ? new Date(m.createdAt) : undefined },
        { projectId: project.id, role: "assistant", content: `Imported **${m.title}** (v${m.version}). Tell me what you'd like to change.`, modelId: model.id, createdAt: m.createdAt ? new Date(new Date(m.createdAt).getTime() + 1000) : undefined },
      ] });
      results.push({ title: m.title, status: "imported", id: model.id });
    } catch (e) {
      results.push({ title: m.title, status: "failed", error: (e as Error).message });
    }
  }
  return NextResponse.json({ results });
}
