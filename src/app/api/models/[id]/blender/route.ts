import { prisma } from "@/lib/prisma";
import { readFile } from "@/lib/storage";
import { auth } from "@/lib/auth";
import { slugify } from "@/lib/utils";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const model = await prisma.model.findUnique({ where: { id } });
  if (!model) return new Response("Not found", { status: 404 });
  if (!model.isPublic) {
    const session = await auth();
    if (session?.user?.id !== model.userId) return new Response("Forbidden", { status: 403 });
  }
  const data = await readFile(model.blenderPath);
  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": "text/x-python; charset=utf-8",
      "content-disposition": `attachment; filename="${slugify(model.title) || "model"}.blender.py"`,
    },
  });
}
