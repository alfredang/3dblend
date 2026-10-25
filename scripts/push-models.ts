/**
 * Push local models to another 3DBlend instance (e.g. production) through the admin import API.
 *   TARGET_URL=https://3dblend.tertiaryinfotech.com ADMIN_EMAIL=admin@3dblend.app ADMIN_PASSWORD=... npm run push-models
 * Seeded samples are skipped (they exist on every instance); everything else is rebuilt from its spec on the target.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import path from "node:path";

const prisma = new PrismaClient();
const TARGET = (process.env.TARGET_URL || "").replace(/\/$/, "");
const EMAIL = process.env.ADMIN_EMAIL || "admin@3dblend.app";
const PASSWORD = process.env.ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD || "";
const STORAGE = path.resolve(process.env.STORAGE_DIR || "./storage");

async function login() {
  const jar: string[] = [];
  const grab = (res: Response) => { for (const c of res.headers.getSetCookie?.() ?? []) jar.push(c.split(";")[0]); };
  const csrfRes = await fetch(`${TARGET}/api/auth/csrf`); grab(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const res = await fetch(`${TARGET}/api/auth/callback/credentials`, {
    method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: jar.join("; ") },
    body: new URLSearchParams({ csrfToken, email: EMAIL, password: PASSWORD, redirect: "false", json: "true" }),
  });
  grab(res);
  const cookie = jar.join("; ");
  const session = await fetch(`${TARGET}/api/auth/session`, { headers: { cookie } }).then((r) => r.json()) as { user?: { email?: string } };
  if (!session?.user?.email) throw new Error("Login failed — check ADMIN_EMAIL / ADMIN_PASSWORD");
  return cookie;
}

async function main() {
  if (!TARGET || !PASSWORD) throw new Error("Set TARGET_URL and ADMIN_PASSWORD");
  const cookie = await login();
  const models = await prisma.model.findMany({ orderBy: { createdAt: "asc" }, include: { user: { select: { email: true } }, project: { select: { title: true } } } });
  const toPush = models.filter((m) => (m.stats as { llm?: string } | null)?.llm !== "seed" && !(m.stats as { imported?: boolean } | null)?.imported);
  console.log(`local models: ${models.length}, pushing ${toPush.length} (non-seed) to ${TARGET}`);
  for (let i = 0; i < toPush.length; i += 5) {
    const batch = await Promise.all(toPush.slice(i, i + 5).map(async (m) => {
      const st = (m.stats ?? {}) as Record<string, unknown>;
      const setup = st.setup as { printerId?: string; nozzle?: number; material?: "PLA" | "PETG" | "ABS" | "TPU" } | undefined;
      let baseMeshStlBase64: string | undefined;
      if (m.baseMeshPath) { try { baseMeshStlBase64 = (await readFile(path.join(STORAGE, m.baseMeshPath))).toString("base64"); } catch { /* missing */ } }
      return {
        ownerEmail: m.user.email, title: m.title, description: m.description, prompt: m.prompt, spec: m.spec, version: m.version,
        isPublic: m.isPublic, featured: m.featured, likesCount: m.likesCount, downloads: m.downloads, views: m.views, attribution: m.attribution,
        projectTitle: m.project?.title ?? m.title, setup, baseMeshStlBase64,
        extraStats: { brief: st.brief ?? null, assumptions: st.assumptions ?? null, llm: st.llm ?? null },
        createdAt: m.createdAt.toISOString(),
      };
    }));
    const res = await fetch(`${TARGET}/api/admin/models/import`, { method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ models: batch }) });
    const j = (await res.json()) as { results?: { title: string; status: string; error?: string }[]; error?: string };
    if (!res.ok) { console.error("batch failed:", j.error); continue; }
    for (const r of j.results ?? []) console.log(`  ${r.status.padEnd(9)} ${r.title}${r.error ? " — " + r.error : ""}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
