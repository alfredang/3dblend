import { redirect } from "next/navigation";
import Link from "next/link";
import { currentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AdminUsers, AdminModels, AdminSubscriptions } from "@/components/AdminTables";
import { AdminIntegrations } from "@/components/AdminIntegrations";
import { appUrl } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { Prisma } from "@prisma/client";

export const metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

const TABS = [
  ["overview", "Overview"],
  ["users", "Users"],
  ["subscriptions", "Subscriptions & invoices"],
  ["models", "Models"],
  ["integrations", "Integrations"],
] as const;
type Tab = (typeof TABS)[number][0];
const PAGE = 50;
const daysAgo = (n: number) => new Date(new Date().getTime() - n * 864e5);

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string; q?: string; page?: string; status?: string; visibility?: string }> }) {
  const admin = await currentAdmin();
  if (!admin) redirect("/login?next=/admin");
  const sp = await searchParams;
  const tab = (TABS.some(([t]) => t === sp.tab) ? sp.tab : "overview") as Tab;
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number(sp.page) || 1);
  const skip = (page - 1) * PAGE;

  const [userCount, modelCount, publicCount, activeSubs, revenue, spent, recentUsers, recentModels] = await Promise.all([
    prisma.user.count(),
    prisma.model.count(),
    prisma.model.count({ where: { isPublic: true } }),
    prisma.subscription.count({ where: { status: "ACTIVE" } }),
    prisma.invoice.aggregate({ _sum: { amount: true }, where: { status: "paid" } }),
    prisma.creditTransaction.aggregate({ _sum: { delta: true }, where: { delta: { lt: 0 } } }),
    prisma.user.count({ where: { createdAt: { gte: daysAgo(7) } } }),
    prisma.model.count({ where: { createdAt: { gte: daysAgo(7) } } }),
  ]);

  const href = (t: Tab, extra: Record<string, string | number | undefined> = {}) => {
    const p = new URLSearchParams({ tab: t });
    if (q) p.set("q", q);
    for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== "") p.set(k, String(v));
    return `/admin?${p.toString()}`;
  };

  let body: React.ReactNode = null;
  let total = 0;

  if (tab === "users") {
    const where: Prisma.UserWhereInput = q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : {};
    const [rows, count] = await Promise.all([
      prisma.user.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: PAGE, select: { id: true, email: true, name: true, plan: true, credits: true, isAdmin: true, createdAt: true, _count: { select: { models: true, projects: true } }, subscriptions: { where: { status: { in: ["ACTIVE", "PAST_DUE", "CANCELLED"] } }, orderBy: { createdAt: "desc" }, take: 1, select: { status: true, plan: true } } } }),
      prisma.user.count({ where }),
    ]);
    total = count;
    body = <AdminUsers users={rows.map((u) => ({ ...u, createdAt: u.createdAt.toISOString(), models: u._count.models, projects: u._count.projects, subscription: u.subscriptions[0] ? `${u.subscriptions[0].plan} · ${u.subscriptions[0].status.toLowerCase()}` : null }))} selfId={admin.id} />;
  } else if (tab === "models") {
    const where: Prisma.ModelWhereInput = {
      ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { user: { email: { contains: q, mode: "insensitive" } } }] } : {}),
      ...(sp.visibility === "public" ? { isPublic: true } : sp.visibility === "private" ? { isPublic: false } : sp.visibility === "featured" ? { featured: true } : {}),
    };
    const [rows, count] = await Promise.all([
      prisma.model.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: PAGE, select: { id: true, title: true, isPublic: true, featured: true, likesCount: true, downloads: true, views: true, createdAt: true, attribution: true, user: { select: { email: true } } } }),
      prisma.model.count({ where }),
    ]);
    total = count;
    body = (
      <>
        <div className="mb-3 flex gap-2 text-xs">
          {[["", "All"], ["public", "In gallery"], ["private", "Private"], ["featured", "Featured"]].map(([v, label]) => (
            <Link key={v} href={href("models", { visibility: v })} className={cn("rounded-full border px-3 py-1", (sp.visibility ?? "") === v ? "border-accent bg-accent/15 text-accent" : "border-line text-muted hover:text-fg")}>{label}</Link>
          ))}
        </div>
        <AdminModels models={rows.map((m) => ({ ...m, createdAt: m.createdAt.toISOString(), owner: m.user.email, attribution: m.attribution ?? undefined }))} />
      </>
    );
  } else if (tab === "subscriptions") {
    const where: Prisma.SubscriptionWhereInput = {
      ...(q ? { user: { email: { contains: q, mode: "insensitive" } } } : {}),
      ...(sp.status && ["ACTIVE", "PENDING", "CANCELLED", "EXPIRED", "PAST_DUE"].includes(sp.status) ? { status: sp.status as Prisma.SubscriptionWhereInput["status"] } : {}),
    };
    const [subs, count, invoices] = await Promise.all([
      prisma.subscription.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: PAGE, include: { user: { select: { email: true, name: true } }, _count: { select: { invoices: true } } } }),
      prisma.subscription.count({ where }),
      prisma.invoice.findMany({ where: q ? { user: { email: { contains: q, mode: "insensitive" } } } : {}, orderBy: { paidAt: "desc" }, take: 100, include: { user: { select: { email: true } } } }),
    ]);
    total = count;
    body = (
      <>
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          {[["", "All"], ["ACTIVE", "Active"], ["PENDING", "Pending"], ["PAST_DUE", "Past due"], ["CANCELLED", "Cancelled"], ["EXPIRED", "Expired"]].map(([v, label]) => (
            <Link key={v} href={href("subscriptions", { status: v })} className={cn("rounded-full border px-3 py-1", (sp.status ?? "") === v ? "border-accent bg-accent/15 text-accent" : "border-line text-muted hover:text-fg")}>{label}</Link>
          ))}
        </div>
        <AdminSubscriptions
          subscriptions={subs.map((s) => ({ id: s.id, email: s.user.email, name: s.user.name, plan: s.plan, status: s.status, amount: s.amount, currency: s.currency, startDate: s.startDate?.toISOString() ?? null, currentPeriodEnd: s.currentPeriodEnd?.toISOString() ?? null, endsAt: s.endsAt?.toISOString() ?? null, timesCharged: s.timesCharged, invoices: s._count.invoices, providerBillingId: s.providerBillingId, createdAt: s.createdAt.toISOString() }))}
          invoices={invoices.map((i) => ({ id: i.id, number: i.number, email: i.user.email, plan: i.plan, amount: i.amount, currency: i.currency, status: i.status, paidAt: i.paidAt.toISOString(), periodStart: i.periodStart.toISOString(), periodEnd: i.periodEnd.toISOString() }))}
        />
      </>
    );
  }

  if (tab === "integrations") body = <AdminIntegrations appUrl={appUrl()} />;

  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Admin</h1>
          <p className="text-sm text-muted">Signed in as {admin.email}</p>
        </div>
        {tab !== "overview" && tab !== "integrations" && (
          <form className="flex items-center gap-2">
            <input type="hidden" name="tab" value={tab} />
            <input name="q" defaultValue={q} placeholder={tab === "models" ? "Search title or owner email…" : "Search email or name…"} className="input md:w-80" />
            <button className="btn-ghost">Search</button>
            {q && <Link href={href(tab)} className="text-xs text-muted hover:text-fg">Clear</Link>}
          </form>
        )}
      </div>

      <nav className="mt-6 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map(([t, label]) => (
          <Link key={t} href={href(t)} className={cn("whitespace-nowrap border-b-2 px-4 py-2 text-sm", tab === t ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg")}>{label}</Link>
        ))}
      </nav>

      {tab === "overview" && (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {[["Users", userCount, `+${recentUsers} this week`], ["Models", modelCount, `+${recentModels} this week`], ["In gallery", publicCount, ""], ["Active subscriptions", activeSubs, ""], ["Revenue (paid)", `SGD ${(revenue._sum.amount ?? 0).toFixed(0)}`, ""], ["Credits spent", -(spent._sum.delta ?? 0), ""]].map(([k, v, sub]) => (
              <div key={String(k)} className="card p-5"><div className="text-xs uppercase tracking-wide text-muted">{k}</div><div className="mt-1 text-2xl font-semibold">{v as string}</div>{sub ? <div className="text-xs text-accent-2">{sub}</div> : null}</div>
            ))}
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-4">
            {[["users", "Manage users", "Change plans, top up credits, grant admin."], ["subscriptions", "Subscriptions & invoices", "See every HitPay subscription, cancellations and all invoices."], ["models", "Moderate the gallery", "Feature, hide or delete any model."], ["integrations", "Integrations", "DeepSeek API, HitPay keys, SMTP and email templates."]].map(([t, title, desc]) => (
              <Link key={t} href={href(t as Tab)} className="card p-5 transition hover:border-accent/50"><div className="font-medium">{title}</div><p className="mt-1 text-sm text-muted">{desc}</p></Link>
            ))}
          </div>
        </>
      )}

      {tab === "integrations" && <div className="mt-6">{body}</div>}

      {tab !== "overview" && tab !== "integrations" && (
        <div className="mt-6">
          <div className="mb-3 text-sm text-muted">{total} result{total === 1 ? "" : "s"}{pages > 1 ? ` · page ${page} of ${pages}` : ""}</div>
          {body}
          {pages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm">
              <Link aria-disabled={page <= 1} href={href(tab, { page: page - 1, status: sp.status, visibility: sp.visibility })} className={cn("btn-ghost", page <= 1 && "pointer-events-none opacity-40")}>← Previous</Link>
              <Link aria-disabled={page >= pages} href={href(tab, { page: page + 1, status: sp.status, visibility: sp.visibility })} className={cn("btn-ghost", page >= pages && "pointer-events-none opacity-40")}>Next →</Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
