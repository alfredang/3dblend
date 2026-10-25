import { prisma } from "@/lib/prisma";
import { readFile, saveFile, fileExists } from "@/lib/storage";
import { auth } from "@/lib/auth";
import { slugify } from "@/lib/utils";
import { parseBinarySTL } from "@/agent/stl";
import { toThreeMF } from "@/agent/threemf";

export const runtime = "nodejs";

/** 3MF is derived from the stored STL on first request and cached next to it. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const model = await prisma.model.findUnique({ where: { id }, include: { user: { select: { name: true } } } });
  if (!model) return new Response("Not found", { status: 404 });
  if (!model.isPublic) {
    const session = await auth();
    if (session?.user?.id !== model.userId) return new Response("Forbidden", { status: 403 });
  }
  const rel = `models/${model.id}.3mf`;
  let data: Buffer;
  if (await fileExists(rel)) data = await readFile(rel);
  else {
    const mesh = parseBinarySTL(await readFile(model.stlPath));
    data = toThreeMF(mesh, model.title, {
      author: model.user.name ?? "3DBlend",
      description: model.attribution ? `${model.description} Remix of ${model.attribution} (CC BY 4.0).` : model.description,
    });
    await saveFile(rel, data);
  }
  const download = new URL(req.url).searchParams.get("download") === "1";
  if (download) await prisma.model.update({ where: { id }, data: { downloads: { increment: 1 } } });
  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": "model/3mf",
      "content-length": String(data.length),
      "cache-control": "private, max-age=3600",
      "content-disposition": `attachment; filename="${slugify(model.title) || "model"}.3mf"`,
    },
  });
}
