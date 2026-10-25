"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Star, Globe, Lock, Trash2, Plus, Shield, EyeOff, Download, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AdminUser { id: string; email: string; name: string | null; plan: "FREE" | "STARTER" | "PRO"; credits: number; isAdmin: boolean; emailVerified: boolean; createdAt: string; models: number; projects: number; subscription: string | null }
export interface AdminModel { id: string; title: string; isPublic: boolean; featured: boolean; likesCount: number; downloads: number; views: number; createdAt: string; owner: string; attribution?: string }
export interface AdminSub { id: string; email: string; name: string | null; plan: string; status: string; amount: number; currency: string; startDate: string | null; currentPeriodEnd: string | null; endsAt: string | null; timesCharged: number; invoices: number; providerBillingId: string | null; createdAt: string }
export interface AdminInvoice { id: string; number: string; email: string; plan: string; amount: number; currency: string; status: string; paidAt: string; periodStart: string; periodEnd: string }

const fmtDate = (iso: string | null) => (iso ? iso.slice(0, 10) : "—");
const td = "px-3 py-2 text-sm align-top";
const th = "px-3 py-2 text-left text-[11px] uppercase tracking-wide text-muted";

function useAdminCall() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function call(url: string, method: string, body?: object) {
    setBusy(true);
    const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    setBusy(false);
    if (!res.ok) alert((await res.json().catch(() => ({}))).error || "Request failed");
    router.refresh();
  }
  return { call, busy };
}

export function AdminUsers({ users, selfId }: { users: AdminUser[]; selfId: string }) {
  const { call, busy } = useAdminCall();
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[900px]">
        <thead className="border-b border-line"><tr><th className={th}>User</th><th className={th}>Plan</th><th className={th}>Subscription</th><th className={th}>Credits</th><th className={th}>Models</th><th className={th}>Joined</th><th className={th}>Actions</th></tr></thead>
        <tbody className="divide-y divide-line">
          {users.map((u) => (
            <tr key={u.id}>
              <td className={td}><div className="font-medium">{u.name ?? "—"} {u.isAdmin && <Shield className="inline h-3.5 w-3.5 text-accent-2" />}</div><div className="text-xs text-muted">{u.email} {u.emailVerified ? <span className="text-accent-2">· verified</span> : <span className="text-accent-3">· unverified</span>}</div></td>
              <td className={td}>
                <select className="rounded-lg border border-line bg-elev px-2 py-1 text-xs" value={u.plan} disabled={busy} onChange={(e) => { if (confirm(`Set ${u.email} to ${e.target.value}? Credits reset to the plan allowance.`)) call(`/api/admin/users`, "PATCH", { id: u.id, plan: e.target.value }); }}>
                  {["FREE", "STARTER", "PRO"].map((p) => <option key={p}>{p}</option>)}
                </select>
              </td>
              <td className={cn(td, "text-xs text-muted")}>{u.subscription ?? "—"}</td>
              <td className={td}><b>{u.credits}</b></td>
              <td className={td}>{u.models} <span className="text-xs text-muted">/ {u.projects} projects</span></td>
              <td className={cn(td, "text-xs text-muted")}>{fmtDate(u.createdAt)}</td>
              <td className={td}>
                <div className="flex flex-wrap gap-1">
                  {[10, 100].map((n) => <button key={n} disabled={busy} onClick={() => call(`/api/admin/users`, "PATCH", { id: u.id, addCredits: n })} className="btn-ghost !px-2 !py-1 text-xs" title={`Add ${n} credits`}><Plus className="h-3 w-3" />{n}</button>)}
                  {!u.emailVerified && <button disabled={busy} onClick={() => call(`/api/admin/users`, "PATCH", { id: u.id, verify: true })} className="btn-ghost !px-2 !py-1 text-xs text-accent-2">Mark verified</button>}
                  {u.id !== selfId && <button disabled={busy} onClick={() => { if (confirm(`${u.isAdmin ? "Revoke" : "Grant"} admin for ${u.email}?`)) call(`/api/admin/users`, "PATCH", { id: u.id, isAdmin: !u.isAdmin }); }} className="btn-ghost !px-2 !py-1 text-xs">{u.isAdmin ? "Revoke admin" : "Make admin"}</button>}
                </div>
              </td>
            </tr>
          ))}
          {!users.length && <tr><td className={cn(td, "text-center text-muted")} colSpan={7}>No users match.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export function AdminModels({ models }: { models: AdminModel[] }) {
  const { call, busy } = useAdminCall();
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[900px]">
        <thead className="border-b border-line"><tr><th className={th}>Model</th><th className={th}>Owner</th><th className={th}>Visibility</th><th className={th}>Stats</th><th className={th}>Created</th><th className={th}>Actions</th></tr></thead>
        <tbody className="divide-y divide-line">
          {models.map((m) => (
            <tr key={m.id}>
              <td className={td}><Link href={`/m/${m.id}`} className="font-medium hover:text-accent">{m.title}</Link> {m.featured && <Star className="inline h-3.5 w-3.5 fill-current text-accent-3" />}{m.attribution && <div className="text-[11px] text-muted">remix of {m.attribution}</div>}</td>
              <td className={cn(td, "text-xs text-muted")}>{m.owner}</td>
              <td className={td}><span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]", m.isPublic ? "bg-accent-2/15 text-accent-2" : "bg-fg/10 text-muted")}>{m.isPublic ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}{m.isPublic ? "In gallery" : "Private"}</span></td>
              <td className={cn(td, "text-xs text-muted")}>👍 {m.likesCount} · ⬇ {m.downloads} · 👁 {m.views}</td>
              <td className={cn(td, "text-xs text-muted")}>{fmtDate(m.createdAt)}</td>
              <td className={td}>
                <div className="flex flex-wrap gap-1">
                  <button disabled={busy} onClick={() => call(`/api/admin/models`, "PATCH", { id: m.id, featured: !m.featured })} className={cn("btn-ghost !px-2 !py-1 text-xs", m.featured && "text-accent-3")}><Star className="h-3 w-3" />{m.featured ? "Unfeature" : "Feature"}</button>
                  <button disabled={busy} onClick={() => call(`/api/admin/models`, "PATCH", { id: m.id, isPublic: !m.isPublic })} className="btn-ghost !px-2 !py-1 text-xs">{m.isPublic ? <><EyeOff className="h-3 w-3" />Hide from gallery</> : <><Globe className="h-3 w-3" />Show in gallery</>}</button>
                  <button disabled={busy} onClick={() => { if (confirm(`Delete "${m.title}" by ${m.owner}? This removes the files and cannot be undone.`)) call(`/api/admin/models`, "DELETE", { id: m.id }); }} className="btn-ghost !px-2 !py-1 text-xs text-accent-3"><Trash2 className="h-3 w-3" />Delete</button>
                </div>
              </td>
            </tr>
          ))}
          {!models.length && <tr><td className={cn(td, "text-center text-muted")} colSpan={6}>No models match.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export function AdminSubscriptions({ subscriptions, invoices }: { subscriptions: AdminSub[]; invoices: AdminInvoice[] }) {
  const { call, busy } = useAdminCall();
  const badge = (s: string) => cn("rounded-full px-2 py-0.5 text-[11px] uppercase tracking-wide", s === "ACTIVE" ? "bg-accent-2/15 text-accent-2" : s === "PENDING" || s === "PAST_DUE" ? "bg-accent-3/15 text-accent-3" : "bg-fg/10 text-muted");
  return (
    <div className="space-y-8">
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[1000px]">
          <thead className="border-b border-line"><tr><th className={th}>Customer</th><th className={th}>Plan</th><th className={th}>Status</th><th className={th}>Amount</th><th className={th}>Started</th><th className={th}>Renews / ends</th><th className={th}>Payments</th><th className={th}>HitPay id</th><th className={th}>Actions</th></tr></thead>
          <tbody className="divide-y divide-line">
            {subscriptions.map((s) => (
              <tr key={s.id}>
                <td className={td}><div className="font-medium">{s.name ?? "—"}</div><div className="text-xs text-muted">{s.email}</div></td>
                <td className={td}>{s.plan}</td>
                <td className={td}><span className={badge(s.status)}>{s.status.toLowerCase().replace("_", " ")}</span></td>
                <td className={td}>{s.currency} {s.amount.toFixed(2)}/mo</td>
                <td className={cn(td, "text-xs text-muted")}>{fmtDate(s.startDate ?? s.createdAt)}</td>
                <td className={cn(td, "text-xs text-muted")}>{s.status === "CANCELLED" || s.status === "EXPIRED" ? `ends ${fmtDate(s.endsAt)}` : fmtDate(s.currentPeriodEnd)}</td>
                <td className={td}>{s.timesCharged} <span className="text-xs text-muted">/ {s.invoices} inv.</span></td>
                <td className={cn(td, "font-mono text-[11px] text-muted")}>{s.providerBillingId ? s.providerBillingId.slice(0, 8) + "…" : "—"}</td>
                <td className={td}>
                  <div className="flex flex-wrap gap-1">
                    {(s.status === "ACTIVE" || s.status === "PENDING" || s.status === "PAST_DUE") && (
                      <>
                        <button disabled={busy} onClick={() => call(`/api/admin/subscriptions`, "PATCH", { id: s.id, action: "sync" })} className="btn-ghost !px-2 !py-1 text-xs">Sync with HitPay</button>
                        <button disabled={busy} onClick={() => { if (confirm(`Cancel ${s.email}'s ${s.plan} subscription at HitPay? Access continues until the paid period ends.`)) call(`/api/admin/subscriptions`, "PATCH", { id: s.id, action: "cancel" }); }} className="btn-ghost !px-2 !py-1 text-xs text-accent-3"><XCircle className="h-3 w-3" />Cancel</button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!subscriptions.length && <tr><td className={cn(td, "text-center text-muted")} colSpan={9}>No subscriptions yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <div>
        <h3 className="mb-2 text-lg font-semibold">Invoices <span className="text-sm font-normal text-muted">(latest {invoices.length})</span></h3>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead className="border-b border-line"><tr><th className={th}>Number</th><th className={th}>Customer</th><th className={th}>Plan</th><th className={th}>Period</th><th className={th}>Paid</th><th className={th}>Amount</th><th className={th}></th></tr></thead>
            <tbody className="divide-y divide-line">
              {invoices.map((i) => (
                <tr key={i.id}>
                  <td className={cn(td, "font-medium")}>{i.number}</td>
                  <td className={cn(td, "text-xs text-muted")}>{i.email}</td>
                  <td className={td}>{i.plan}</td>
                  <td className={cn(td, "text-xs text-muted")}>{fmtDate(i.periodStart)} → {fmtDate(i.periodEnd)}</td>
                  <td className={cn(td, "text-xs text-muted")}>{fmtDate(i.paidAt)}</td>
                  <td className={td}><b>{i.currency} {i.amount.toFixed(2)}</b></td>
                  <td className={td}><a href={`/api/invoices/${i.id}/pdf`} className="btn-ghost !px-2 !py-1 text-xs"><Download className="h-3 w-3" />PDF</a></td>
                </tr>
              ))}
              {!invoices.length && <tr><td className={cn(td, "text-center text-muted")} colSpan={7}>No invoices yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
