import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ChatStudio, type StudioMessage, type StudioModel } from "@/components/ChatStudio";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { title: true } });
  return { title: p?.title ?? "Studio" };
}

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ prompt?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?next=/studio");
  const { projectId } = await params;
  const { prompt } = await searchParams;
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: session.user.id },
    include: { messages: { orderBy: { createdAt: "asc" } }, models: { orderBy: { createdAt: "asc" } } },
  });
  if (!project) notFound();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id }, select: { credits: true, plan: true } });

  const messages: StudioMessage[] = project.messages.map((m) => ({
    id: m.id, role: m.role === "user" ? "user" : "assistant", content: m.content, modelId: m.modelId,
    imageUrl: m.imagePath ? `/api/messages/${m.id}/image` : undefined, attachmentName: m.attachmentName ?? undefined,
  }));
  const models: StudioModel[] = project.models.map((m) => ({
    id: m.id, title: m.title, description: m.description, version: m.version, isPublic: m.isPublic, likesCount: m.likesCount, stats: m.stats as StudioModel["stats"], createdAt: m.createdAt.toISOString(), attribution: m.attribution ?? undefined,
  }));

  return (
    <ChatStudio
      project={{ id: project.id, title: project.title }}
      initialMessages={messages}
      initialModels={models}
      initialCredits={user.credits}
      plan={user.plan}
      initialPrompt={prompt}
    />
  );
}
