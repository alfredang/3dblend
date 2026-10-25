import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PLANS } from "@/lib/plans";
import { ModelCard } from "@/components/ModelCard";
import { toCard } from "@/lib/models";
import { SubscriptionCard } from "@/components/SubscriptionCard";
import { Download } from "lucide-react";

export const metadata = { title: "Account" };
export const dynamic = "force-dynamic";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?next=/account");
  const { checkout } = await searchParams;
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    include: {
      transactions: { orderBy: { createdAt: "desc" }, take: 15 },
      models: { orderBy: { createdAt: "desc" }, take: 12, include: { user: { select: { name: true } }, likes: { where: { userId: session.user.id } } } },
      subscriptions: { orderBy: { createdAt: "desc" }, take: 5 },
      invoices: { orderBy: { paidAt: "desc" }, take: 36 },
    },
  });
  const plan = PLANS[user.plan];
  const current = user.subscriptions.find((s) => s.status === "ACTIVE" || s.status === "PAST_DUE") ?? user.subscriptions.find((s) => s.status === "PENDING") ?? user.subscriptions.find((s) => s.status === "CANCELLED" && s.endsAt && s.endsAt > new Date()) ?? null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      {checkout === "success" && <div className="mb-6 rounded-xl border border-accent-2/40 bg-accent-2/10 px-4 py-3 text-sm text-accent-2">Payment confirmed — your {plan.name} plan is active and your credits have been added. Your invoice is below.</div>}
      {checkout === "pending" && <div className="mb-6 rounded-xl border border-accent-3/40 bg-accent-3/10 px-4 py-3 text-sm text-accent-3">We are waiting for HitPay to confirm your payment. This usually takes a few seconds — use “Check status” below.</div>}
      {checkout === "unknown" && <div className="mb-6 rounded-xl border border-line bg-elev px-4 py-3 text-sm text-muted">We could not match that checkout to your account. If you were charged, contact support with your email.</div>}
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

      <h2 className="mt-12 text-xl font-semibold">Subscription</h2>
      <div className="mt-4">
        <SubscriptionCard
          plan={user.plan}
          subscription={current ? { id: current.id, plan: current.plan, status: current.status, amount: current.amount, currency: current.currency, startDate: current.startDate?.toISOString() ?? null, currentPeriodEnd: current.currentPeriodEnd?.toISOString() ?? null, endsAt: current.endsAt?.toISOString() ?? null, timesCharged: current.timesCharged } : null}
        />
      </div>

      <h2 className="mt-12 text-xl font-semibold">Invoices</h2>
      <div className="card mt-4 divide-y divide-line text-sm">
        {user.invoices.map((inv) => (
          <div key={inv.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div>
              <div className="font-medium">{inv.number} <span className="ml-2 rounded-full bg-accent-2/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-accent-2">{inv.status}</span></div>
              <div className="text-xs text-muted">{inv.description} · {inv.periodStart.toISOString().slice(0, 10)} to {inv.periodEnd.toISOString().slice(0, 10)}</div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs text-muted">{inv.paidAt.toISOString().slice(0, 10)}</span>
              <b>{inv.currency} {inv.amount.toFixed(2)}</b>
              <a href={`/api/invoices/${inv.id}/pdf`} className="btn-ghost !px-3 !py-1.5 text-xs"><Download className="h-3.5 w-3.5" /> PDF</a>
            </div>
          </div>
        ))}
        {!user.invoices.length && <div className="px-4 py-6 text-center text-muted">No invoices yet. Invoices are generated automatically for every subscription payment.</div>}
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
