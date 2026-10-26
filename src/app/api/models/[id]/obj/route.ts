import { prisma } from "@/lib/prisma";
import { readFile, saveFile, fileExists } from "@/lib/storage";
import { auth } from "@/lib/auth";
import { slugify } from "@/lib/utils";
import { parseBinarySTL } from "@/agent/stl";
import { toOBJ } from "@/agent/obj";

export const runtime = "nodejs";

/** OBJ is derived from the stored STL on first request and cached next to it. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const model = await prisma.model.findUnique({ where: { id }, include: { user: { select: { name: true } } } });
  if (!model) return new Response("Not found", { status: 404 });
  if (!model.isPublic) {
    const session = await auth();
    if (session?.user?.id !== model.userId) return new Response("Forbidden", { status: 403 });
  }
  const rel = `models/${model.id}.obj`;
  let data: Buffer;
  if (await fileExists(rel)) data = await readFile(rel);
  else {
    data = toOBJ(parseBinarySTL(await readFile(model.stlPath)), model.title, { author: model.user.name ?? "3DBlend" });
    await saveFile(rel, data);
  }
  const download = new URL(req.url).searchParams.get("download") === "1";
  if (download) await prisma.model.update({ where: { id }, data: { downloads: { increment: 1 } } });
  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": "model/obj",
      "content-length": String(data.length),
      "cache-control": "private, max-age=3600",
      "content-disposition": `attachment; filename="${slugify(model.title) || "model"}.obj"`,
    },
  });
}
