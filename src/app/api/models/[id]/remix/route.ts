import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Start a new project of your own seeded with a public model so you can refine it with the agent. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const source = await prisma.model.findUnique({ where: { id } });
  if (!source || (!source.isPublic && source.userId !== session.user.id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const project = await prisma.project.create({ data: { userId: session.user.id, title: `Remix of ${source.title}` } });
  const copy = await prisma.model.create({
    data: {
      userId: session.user.id,
      projectId: project.id,
      title: source.title,
      description: source.description,
      prompt: source.prompt,
      spec: source.spec as object,
      stats: source.stats as object,
      stlPath: source.stlPath,
      blenderPath: source.blenderPath,
      version: 1,
    },
  });
  await prisma.message.createMany({
    data: [
      { projectId: project.id, role: "user", content: source.prompt },
      { projectId: project.id, role: "assistant", content: `Remixed **${source.title}** from the gallery. Tell me what you'd like to change.`, modelId: copy.id },
    ],
  });
  return NextResponse.json({ projectId: project.id });
}
