import { redirect } from "next/navigation";
import Link from "next/link";
import { currentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AdminTables } from "@/components/AdminTables";

export const metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const admin = await currentAdmin();
  if (!admin) redirect("/login?next=/admin");

  const [users, models, totals] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: "desc" }, take: 200, select: { id: true, email: true, name: true, plan: true, credits: true, isAdmin: true, createdAt: true, _count: { select: { models: true, projects: true } } } }),
    prisma.model.findMany({ orderBy: { createdAt: "desc" }, take: 200, select: { id: true, title: true, isPublic: true, featured: true, likesCount: true, downloads: true, views: true, createdAt: true, user: { select: { email: true } } } }),
    Promise.all([prisma.user.count(), prisma.model.count(), prisma.model.count({ where: { isPublic: true } }), prisma.creditTransaction.aggregate({ _sum: { delta: true }, where: { delta: { lt: 0 } } })]),
  ]);
  const [userCount, modelCount, publicCount, spent] = totals;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Admin</h1>
          <p className="text-sm text-muted">Signed in as {admin.email}. <Link href="/account" className="text-accent">Account →</Link></p>
        </div>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        {[["Users", userCount], ["Models", modelCount], ["Public models", publicCount], ["Credits spent", -(spent._sum.delta ?? 0)]].map(([k, v]) => (
          <div key={String(k)} className="card p-5"><div className="text-xs uppercase tracking-wide text-muted">{k}</div><div className="mt-1 text-3xl font-semibold">{v as number}</div></div>
        ))}
      </div>
      <AdminTables
        users={users.map((u) => ({ ...u, createdAt: u.createdAt.toISOString(), models: u._count.models, projects: u._count.projects }))}
        models={models.map((m) => ({ ...m, createdAt: m.createdAt.toISOString(), owner: m.user.email }))}
      />
    </div>
  );
}
