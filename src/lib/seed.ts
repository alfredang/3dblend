import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { saveFile } from "./storage";
import { materialise } from "@/agent/harness";
import { validateSpec, type Spec } from "@/agent/spec";
import { SAMPLE_SPECS } from "../../prisma/samples";

/**
 * Idempotently create the demo accounts and the six featured sample models.
 * Safe to call on every boot / first page view: it exits early once seeded.
 */
/** Admin / test accounts come from env so no real password lives in the repo. */
export async function ensureAccounts(log: (s: string) => void = () => {}) {
  const specs = [
    { email: "admin@3dblend.app", name: "3DBlend Admin", password: process.env.SEED_ADMIN_PASSWORD, isAdmin: true, plan: "PRO" as const, credits: 1000 },
    { email: "test@3dblend.app", name: "Test User", password: process.env.SEED_TEST_PASSWORD, isAdmin: false, plan: "FREE" as const, credits: 10 },
  ];
  for (const a of specs) {
    if (!a.password) continue;
    const passwordHash = await bcrypt.hash(a.password, 10);
    await prisma.user.upsert({
      where: { email: a.email },
      update: { passwordHash, isAdmin: a.isAdmin },
      create: { email: a.email, name: a.name, passwordHash, isAdmin: a.isAdmin, plan: a.plan, credits: a.credits },
    });
    log(`✓ account ${a.email}${a.isAdmin ? " (admin)" : ""}`);
  }
}

export async function seedSamples(log: (s: string) => void = () => {}) {
  await ensureAccounts(log);
  const pw = await bcrypt.hash("demo1234", 10);
  const demo = await prisma.user.upsert({
    where: { email: "demo@3dblend.app" },
    update: {},
    create: { email: "demo@3dblend.app", name: "Demo Maker", passwordHash: pw, plan: "PRO", credits: 1000 },
  });
  const makers = [];
  for (const [email, name] of [["ava@3dblend.app", "Ava Prints"], ["kenji@3dblend.app", "Kenji Lab"], ["sam@3dblend.app", "Sam Builds"]]) {
    makers.push(await prisma.user.upsert({ where: { email }, update: {}, create: { email, name, passwordHash: pw, plan: "STARTER", credits: 100 } }));
  }
  const authors = [demo, ...makers];
  let created = 0;

  for (let i = 0; i < SAMPLE_SPECS.length; i++) {
    const { prompt, likes, downloads, spec: raw } = SAMPLE_SPECS[i];
    const v = validateSpec(raw);
    if (!v.ok) throw new Error(`sample ${i} invalid: ${v.errors.join("; ")}`);
    const spec: Spec = v.spec;
    if (await prisma.model.findFirst({ where: { title: spec.name, featured: true } })) continue;
    const { report, stl, blender } = await materialise(spec);
    const author = authors[i % authors.length];
    const model = await prisma.model.create({
      data: {
        userId: author.id,
        title: spec.name,
        description: spec.description,
        prompt,
        spec: spec as object,
        stats: { ...report.metrics, ok: report.ok, warnings: report.warnings, errors: report.errors, tips: report.tips, recommendedLayerHeight: report.recommendedLayerHeight, printer: report.printer, printNotes: spec.printNotes ?? null, attempts: 1, llm: "seed" } as object,
        stlPath: "pending",
        blenderPath: "pending",
        isPublic: true,
        featured: true,
        likesCount: likes,
        downloads,
        views: downloads * 7 + likes * 3,
      },
    });
    await prisma.model.update({
      where: { id: model.id },
      data: { stlPath: await saveFile(`models/${model.id}.stl`, stl), blenderPath: await saveFile(`models/${model.id}.blender.py`, blender) },
    });
    created++;
    log(`✓ ${spec.name}: ${report.metrics.triangles} tris, ${report.metrics.size.map(Math.round).join("×")} mm${report.ok ? "" : " ✖ " + report.errors.join(" | ")}${report.warnings.length ? " ⚠ " + report.warnings.join(" | ") : ""}`);
  }
  return created;
}

let seeding: Promise<number> | null = null;
/** Called from the home page; runs once per process (SEED_ON_BOOT != "0"). Idempotent. */
export function ensureSeeded() {
  if (process.env.SEED_ON_BOOT === "0") return Promise.resolve(0);
  if (!seeding) seeding = seedSamples(console.log).catch((e) => { console.error("[seed]", e); seeding = null; return 0; });
  return seeding;
}
