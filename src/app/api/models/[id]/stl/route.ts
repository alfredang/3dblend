import { prisma } from "@/lib/prisma";
import { readFile } from "@/lib/storage";
import { auth } from "@/lib/auth";
import { slugify } from "@/lib/utils";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const model = await prisma.model.findUnique({ where: { id } });
  if (!model) return new Response("Not found", { status: 404 });
  if (!model.isPublic) {
    const session = await auth();
    if (session?.user?.id !== model.userId) return new Response("Forbidden", { status: 403 });
  }
  const url = new URL(req.url);
  const download = url.searchParams.get("download") === "1";
  if (download) await prisma.model.update({ where: { id }, data: { downloads: { increment: 1 } } });
  const data = await readFile(model.stlPath);
  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": "model/stl",
      "content-length": String(data.length),
      "cache-control": "private, max-age=3600",
      ...(download ? { "content-disposition": `attachment; filename="${slugify(model.title) || "model"}.stl"` } : {}),
    },
  });
}
