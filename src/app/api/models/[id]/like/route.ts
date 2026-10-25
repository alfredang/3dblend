import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Login to like models" }, { status: 401 });
  const { id } = await params;
  const userId = session.user.id;
  const model = await prisma.model.findUnique({ where: { id }, select: { id: true, isPublic: true, userId: true } });
  if (!model || (!model.isPublic && model.userId !== userId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const existing = await prisma.like.findUnique({ where: { userId_modelId: { userId, modelId: id } } });
  let liked: boolean;
  if (existing) {
    await prisma.$transaction([
      prisma.like.delete({ where: { userId_modelId: { userId, modelId: id } } }),
      prisma.model.update({ where: { id }, data: { likesCount: { decrement: 1 } } }),
    ]);
    liked = false;
  } else {
    await prisma.$transaction([
      prisma.like.create({ data: { userId, modelId: id } }),
      prisma.model.update({ where: { id }, data: { likesCount: { increment: 1 } } }),
    ]);
    liked = true;
  }
  const updated = await prisma.model.findUnique({ where: { id }, select: { likesCount: true } });
  return NextResponse.json({ liked, likesCount: updated?.likesCount ?? 0 });
}
