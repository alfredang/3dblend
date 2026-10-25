import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 80) : "Untitled project";
  const project = await prisma.project.create({ data: { userId: session.user.id, title } });
  return NextResponse.json(project);
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const projects = await prisma.project.findMany({ where: { userId: session.user.id }, orderBy: { updatedAt: "desc" }, take: 50 });
  return NextResponse.json(projects);
}
