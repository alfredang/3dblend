"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Star, Globe, Lock, Trash2, Plus, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AdminUser { id: string; email: string; name: string | null; plan: "FREE" | "STARTER" | "PRO"; credits: number; isAdmin: boolean; createdAt: string; models: number; projects: number }
export interface AdminModel { id: string; title: string; isPublic: boolean; featured: boolean; likesCount: number; downloads: number; views: number; createdAt: string; owner: string }

const fmtDate = (iso: string) => iso.slice(0, 10); // deterministic on server and client

export function AdminTables({ users, models }: { users: AdminUser[]; models: AdminModel[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [q, setQ] = useState("");

  async function call(url: string, method: string, body?: object) {
    setBusy(url);
    const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    setBusy(null);
    if (!res.ok) alert((await res.json().catch(() => ({}))).error || "Request failed");
    router.refresh();
  }

  const fu = users.filter((u) => !q || u.email.includes(q) || (u.name ?? "").toLowerCase().includes(q.toLowerCase()));
  const fm = models.filter((m) => !q || m.title.toLowerCase().includes(q.toLowerCase()) || m.owner.includes(q));
  const td = "px-3 py-2 text-sm";
  const th = "px-3 py-2 text-left text-[11px] uppercase tracking-wide text-muted";

  return (
    <div className="mt-8 space-y-10">
      <input className="input md:w-80" placeholder="Filter by email, name or title…" value={q} onChange={(e) => setQ(e.target.value)} />

      <section>
        <h2 className="text-xl font-semibold">Users <span className="text-sm font-normal text-muted">({fu.length})</span></h2>
        <div className="card mt-3 overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead className="border-b border-line"><tr><th className={th}>User</th><th className={th}>Plan</th><th className={th}>Credits</th><th className={th}>Models</th><th className={th}>Joined</th><th className={th}>Actions</th></tr></thead>
            <tbody className="divide-y divide-line">
              {fu.map((u) => (
                <tr key={u.id}>
                  <td className={td}><div className="font-medium">{u.name ?? "—"} {u.isAdmin && <Shield className="inline h-3.5 w-3.5 text-accent-2" />}</div><div className="text-xs text-muted">{u.email}</div></td>
                  <td className={td}>
                    <select className="rounded-lg border border-line bg-elev px-2 py-1 text-xs" value={u.plan} onChange={(e) => call(`/api/admin/users`, "PATCH", { id: u.id, plan: e.target.value })}>
                      {["FREE", "STARTER", "PRO"].map((p) => <option key={p}>{p}</option>)}
                    </select>
                  </td>
                  <td className={td}><b>{u.credits}</b></td>
                  <td className={td}>{u.models} <span className="text-xs text-muted">/ {u.projects} projects</span></td>
                  <td className={cn(td, "text-xs text-muted")}>{fmtDate(u.createdAt)}</td>
                  <td className={td}>
                    <div className="flex flex-wrap gap-1">
                      {[10, 100].map((n) => <button key={n} disabled={busy !== null} onClick={() => call(`/api/admin/users`, "PATCH", { id: u.id, addCredits: n })} className="btn-ghost !px-2 !py-1 text-xs"><Plus className="h-3 w-3" />{n}</button>)}
                      <button disabled={busy !== null} onClick={() => call(`/api/admin/users`, "PATCH", { id: u.id, isAdmin: !u.isAdmin })} className="btn-ghost !px-2 !py-1 text-xs">{u.isAdmin ? "Revoke admin" : "Make admin"}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Models <span className="text-sm font-normal text-muted">({fm.length})</span></h2>
        <div className="card mt-3 overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead className="border-b border-line"><tr><th className={th}>Model</th><th className={th}>Owner</th><th className={th}>Stats</th><th className={th}>Created</th><th className={th}>Actions</th></tr></thead>
            <tbody className="divide-y divide-line">
              {fm.map((m) => (
                <tr key={m.id}>
                  <td className={td}><Link href={`/m/${m.id}`} className="font-medium hover:text-accent">{m.title}</Link> {m.featured && <Star className="inline h-3.5 w-3.5 fill-current text-accent-3" />}</td>
                  <td className={cn(td, "text-xs text-muted")}>{m.owner}</td>
                  <td className={cn(td, "text-xs text-muted")}>👍 {m.likesCount} · ⬇ {m.downloads} · 👁 {m.views}</td>
                  <td className={cn(td, "text-xs text-muted")}>{fmtDate(m.createdAt)}</td>
                  <td className={td}>
                    <div className="flex flex-wrap gap-1">
                      <button disabled={busy !== null} onClick={() => call(`/api/admin/models`, "PATCH", { id: m.id, featured: !m.featured })} className={cn("btn-ghost !px-2 !py-1 text-xs", m.featured && "text-accent-3")}><Star className="h-3 w-3" />{m.featured ? "Unfeature" : "Feature"}</button>
                      <button disabled={busy !== null} onClick={() => call(`/api/admin/models`, "PATCH", { id: m.id, isPublic: !m.isPublic })} className="btn-ghost !px-2 !py-1 text-xs">{m.isPublic ? <Globe className="h-3 w-3" /> : <Lock className="h-3 w-3" />}{m.isPublic ? "Public" : "Private"}</button>
                      <button disabled={busy !== null} onClick={() => { if (confirm(`Delete "${m.title}"? This cannot be undone.`)) call(`/api/admin/models`, "DELETE", { id: m.id }); }} className="btn-ghost !px-2 !py-1 text-xs text-accent-3"><Trash2 className="h-3 w-3" />Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
