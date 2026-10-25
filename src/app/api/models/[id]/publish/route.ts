import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canMakePrivate } from "@/lib/plans";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const model = await prisma.model.findFirst({ where: { id, userId: session.user.id }, include: { user: { select: { plan: true } } } });
  if (!model) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const isPublic = typeof body.isPublic === "boolean" ? body.isPublic : !model.isPublic;
  if (!isPublic && !canMakePrivate(model.user.plan)) {
    return NextResponse.json({ error: "Models on the Free plan are shared publicly. Upgrade to Starter or Pro to keep models private." }, { status: 403 });
  }
  const data: { isPublic: boolean; title?: string; description?: string } = { isPublic };
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim().slice(0, 80);
  if (typeof body.description === "string") data.description = body.description.slice(0, 600);
  const updated = await prisma.model.update({ where: { id }, data });
  return NextResponse.json({ isPublic: updated.isPublic, title: updated.title, description: updated.description });
}
