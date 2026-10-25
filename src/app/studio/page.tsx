import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, Clock } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NewProjectButton } from "@/components/NewProjectButton";

export const metadata = { title: "Studio" };
export const dynamic = "force-dynamic";

export default async function StudioPage({ searchParams }: { searchParams: Promise<{ prompt?: string }> }) {
  const session = await auth();
  const { prompt } = await searchParams;
  if (!session?.user?.id) redirect(`/login?next=${encodeURIComponent(prompt ? `/studio?prompt=${prompt}` : "/studio")}`);

  // Deep link from the landing page: create a project and jump straight in.
  if (prompt) {
    const p = await prisma.project.create({ data: { userId: session.user.id, title: "Untitled project" } });
    redirect(`/studio/${p.id}?prompt=${encodeURIComponent(prompt)}`);
  }

  const projects = await prisma.project.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    include: { models: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, title: true } }, _count: { select: { messages: true } } },
  });

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Your projects</h1>
          <p className="text-sm text-muted">Each project is a conversation with the design agent.</p>
        </div>
        <NewProjectButton />
      </div>
      {projects.length === 0 ? (
        <div className="card mt-8 p-12 text-center">
          <Plus className="mx-auto h-8 w-8 text-accent" />
          <p className="mt-3 text-muted">No projects yet. Start one and describe what you want to print.</p>
          <div className="mt-4"><NewProjectButton /></div>
        </div>
      ) : (
        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {projects.map((p) => (
            <li key={p.id}>
              <Link href={`/studio/${p.id}`} className="card flex items-center justify-between gap-4 p-4 transition hover:border-accent/50">
                <div className="min-w-0">
                  <div className="truncate font-medium">{p.title}</div>
                  <div className="mt-0.5 text-xs text-muted">{p._count.messages} messages{p.models[0] ? ` · latest: ${p.models[0].title}` : ""}</div>
                </div>
                <div className="flex shrink-0 items-center gap-1 text-xs text-muted"><Clock className="h-3 w-3" />{p.updatedAt.toLocaleDateString()}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
