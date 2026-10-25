import { NextResponse } from "next/server";
import { z } from "zod";
import { currentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({ id: z.string(), featured: z.boolean().optional(), isPublic: z.boolean().optional() });

export async function PATCH(req: Request) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { id, featured, isPublic } = parsed.data;
  const data: { featured?: boolean; isPublic?: boolean } = {};
  if (featured !== undefined) { data.featured = featured; if (featured) data.isPublic = true; }
  if (isPublic !== undefined) { data.isPublic = isPublic; if (!isPublic) data.featured = false; }
  const model = await prisma.model.update({ where: { id }, data, select: { id: true, featured: true, isPublic: true } });
  return NextResponse.json(model);
}

export async function DELETE(req: Request) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await req.json().catch(() => ({}));
  if (typeof id !== "string") return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  await prisma.model.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
