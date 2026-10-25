"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RefreshCw, XCircle, CheckCircle2, Clock } from "lucide-react";
import { PLANS } from "@/lib/plans";

export interface SubView { id: string; plan: "FREE" | "STARTER" | "PRO"; status: string; amount: number; currency: string; startDate: string | null; currentPeriodEnd: string | null; endsAt: string | null; timesCharged: number }

export function SubscriptionCard({ plan, subscription }: { plan: "FREE" | "STARTER" | "PRO"; subscription: SubView | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const d = (iso: string | null) => (iso ? iso.slice(0, 10) : "—");

  async function cancel() {
    if (!subscription) return;
    if (!confirm(`Cancel your ${PLANS[subscription.plan].name} subscription? You keep access until ${d(subscription.currentPeriodEnd)}, then your account returns to the Free plan. No further charges will be made.`)) return;
    setBusy(true);
    const res = await fetch("/api/billing/cancel", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscriptionId: subscription.id }) });
    const j = await res.json();
    setBusy(false);
    setMsg(res.ok ? `Cancelled. Access continues until ${d(j.endsAt)}.` : j.error || "Could not cancel");
    router.refresh();
  }
  async function check() {
    setBusy(true);
    await fetch("/api/billing/sync", { method: "POST" });
    setBusy(false);
    router.refresh();
  }

  if (!subscription) {
    return (
      <div className="card flex flex-wrap items-center justify-between gap-4 p-6">
        <div>
          <div className="font-medium">{PLANS[plan].name} plan{plan === "FREE" ? "" : " (granted)"}</div>
          <p className="text-sm text-muted">{plan === "FREE" ? "No active subscription. Upgrade for monthly credits, private models and image/PDF references." : "This plan was granted manually; there is no HitPay subscription to manage."}</p>
        </div>
        <Link href="/pricing" className="btn-primary">See plans</Link>
      </div>
    );
  }

  const s = subscription;
  const active = s.status === "ACTIVE";
  return (
    <div className="card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold">{PLANS[s.plan].name}</span>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide ${active ? "bg-accent-2/15 text-accent-2" : s.status === "PENDING" ? "bg-accent-3/15 text-accent-3" : "bg-fg/10 text-muted"}`}>
              {active ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}{s.status.toLowerCase().replace("_", " ")}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">{s.currency} {s.amount.toFixed(2)} / month · billed via HitPay · {s.timesCharged} payment{s.timesCharged === 1 ? "" : "s"} so far</p>
          <p className="mt-1 text-sm text-muted">
            {s.status === "CANCELLED" ? `Cancelled — access until ${d(s.endsAt)}` : s.status === "PENDING" ? "Waiting for payment confirmation" : `Next renewal ${d(s.currentPeriodEnd)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(s.status === "PENDING" || s.status === "PAST_DUE") && <button onClick={check} disabled={busy} className="btn-ghost"><RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> Check status</button>}
          {(active || s.status === "PENDING" || s.status === "PAST_DUE") && <button onClick={cancel} disabled={busy} className="btn-ghost text-accent-3"><XCircle className="h-4 w-4" /> Cancel subscription</button>}
          {s.status === "CANCELLED" && <Link href="/pricing" className="btn-primary">Resubscribe</Link>}
          {active && s.plan === "STARTER" && <Link href="/pricing" className="btn-ghost">Upgrade to Pro</Link>}
        </div>
      </div>
      {msg && <p className="mt-3 text-sm text-muted">{msg}</p>}
    </div>
  );
}
