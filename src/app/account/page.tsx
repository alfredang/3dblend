import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PLANS } from "@/lib/plans";
import { ModelCard } from "@/components/ModelCard";
import { toCard } from "@/lib/models";

export const metadata = { title: "Account" };
export const dynamic = "force-dynamic";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ upgraded?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?next=/account");
  const { upgraded } = await searchParams;
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    include: { transactions: { orderBy: { createdAt: "desc" }, take: 15 }, models: { orderBy: { createdAt: "desc" }, take: 12, include: { user: { select: { name: true } }, likes: { where: { userId: session.user.id } } } } },
  });
  const plan = PLANS[user.plan];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      {upgraded && <div className="mb-6 rounded-xl border border-accent-2/40 bg-accent-2/10 px-4 py-3 text-sm text-accent-2">Thanks! Your plan will update as soon as Stripe confirms the payment.</div>}
      <h1 className="text-3xl font-semibold">Account</h1>
      <div className="mt-6 grid gap-5 md:grid-cols-3">
        <div className="card p-6">
          <div className="text-xs uppercase tracking-wide text-muted">Signed in as</div>
          <div className="mt-1 font-medium">{user.name}</div>
          <div className="text-sm text-muted">{user.email}</div>
        </div>
        <div className="card p-6">
          <div className="text-xs uppercase tracking-wide text-muted">Plan</div>
          <div className="mt-1 text-xl font-semibold">{plan.name}</div>
          <div className="text-sm text-muted">{plan.credits} credits{user.plan === "FREE" ? " one-time" : " / month"}</div>
          <Link href="/pricing" className="mt-3 inline-block text-sm text-accent hover:underline">{user.plan === "FREE" ? "Upgrade →" : "Manage plan →"}</Link>
        </div>
        <div className="card p-6">
          <div className="text-xs uppercase tracking-wide text-muted">Credits remaining</div>
          <div className="mt-1 text-4xl font-semibold text-accent-2">{user.credits}</div>
          {user.plan !== "FREE" && <div className="text-xs text-muted">Resets {new Date(user.creditsResetAt.getTime() + 30 * 864e5).toLocaleDateString()}</div>}
        </div>
      </div>

      <h2 className="mt-12 text-xl font-semibold">Your models</h2>
      {user.models.length ? (
        <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{user.models.map((m) => <ModelCard key={m.id} model={toCard(m)} />)}</div>
      ) : (
        <p className="mt-3 text-sm text-muted">Nothing yet. <Link href="/studio" className="text-accent">Make your first model →</Link></p>
      )}

      <h2 className="mt-12 text-xl font-semibold">Credit history</h2>
      <div className="card mt-4 divide-y divide-line text-sm">
        {user.transactions.map((t) => (
          <div key={t.id} className="flex items-center justify-between px-4 py-2.5">
            <span className="text-muted">{t.reason}</span>
            <span className="flex items-center gap-4"><span className="text-xs text-muted">{t.createdAt.toLocaleString()}</span><b className={t.delta > 0 ? "text-accent-2" : "text-fg"}>{t.delta > 0 ? "+" : ""}{t.delta}</b></span>
          </div>
        ))}
        {!user.transactions.length && <div className="px-4 py-6 text-center text-muted">No transactions yet.</div>}
      </div>
    </div>
  );
}
