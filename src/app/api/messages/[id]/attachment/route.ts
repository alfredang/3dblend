import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readFile } from "@/lib/storage";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const msg = await prisma.message.findFirst({ where: { id, project: { userId: session.user.id } }, select: { attachmentPath: true, attachmentName: true } });
  if (!msg?.attachmentPath) return new Response("Not found", { status: 404 });
  const data = await readFile(msg.attachmentPath);
  const type = msg.attachmentPath.endsWith(".pdf") ? "application/pdf" : msg.attachmentPath.endsWith(".png") ? "image/png" : "image/jpeg";
  return new Response(new Uint8Array(data), { headers: { "content-type": type, "content-disposition": `inline; filename="${(msg.attachmentName ?? "attachment").replace(/"/g, "")}"` } });
}
