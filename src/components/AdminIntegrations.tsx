"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Loader2, RotateCcw, Send, Save } from "lucide-react";
import { cn } from "@/lib/utils";

interface SettingRow { key: string; label: string; help?: string; group: string; type?: string; options?: string[]; secret?: boolean; source: string; isSet: boolean; value: string; env?: string }
interface Template { key: string; name: string; description: string; variables: string[]; subject: string; body: string; enabled: boolean; customised: boolean }

const GROUPS: { id: string; title: string; blurb: string; test?: { service: string; label: string }[] }[] = [
  { id: "ai", title: "AI model (DeepSeek)", blurb: "The agent that designs models. Keys saved here override the server environment and are encrypted at rest.", test: [{ service: "ai", label: "Test connection" }] },
  { id: "hitpay", title: "HitPay payments", blurb: "Recurring billing for Starter and Pro. Register the webhook URL below in HitPay (Developers → Webhooks) and paste its salt here.", test: [{ service: "hitpay", label: "Test connection" }] },
  { id: "smtp", title: "Email (SMTP)", blurb: "Used for welcome, invoice and subscription emails. Any SMTP provider works (Google Workspace, Microsoft 365, Mailgun, Resend, SES).", test: [{ service: "smtp", label: "Verify login" }, { service: "smtp-send", label: "Send test email" }] },
  { id: "general", title: "General", blurb: "Details shown inside emails." },
];

export function AdminIntegrations({ appUrl }: { appUrl: string }) {
  const [rows, setRows] = useState<SettingRow[] | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [clears, setClears] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [editing, setEditing] = useState<Template | null>(null);

  async function load() {
    const [a, b] = await Promise.all([fetch("/api/admin/settings").then((r) => r.json()), fetch("/api/admin/email-templates").then((r) => r.json())]);
    setRows(a.settings); setTemplates(b.templates); setEdits({}); setClears({});
  }
  useEffect(() => { const t = setTimeout(() => { void load(); }, 0); return () => clearTimeout(t); }, []);

  async function save(group: string) {
    const entries: { key: string; value?: string; clear?: boolean }[] = [];
    for (const r of (rows ?? []).filter((r) => r.group === group)) {
      if (clears[r.key]) { entries.push({ key: r.key, clear: true }); continue; }
      const v = edits[r.key];
      if (v === undefined || (v === "" && r.secret)) continue;
      entries.push({ key: r.key, value: v });
    }
    if (!entries.length) { setNotes((n) => ({ ...n, [group]: { ok: true, text: "Nothing to save" } })); return; }
    setBusy(group);
    const res = await fetch("/api/admin/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ entries }) });
    setBusy(null);
    if (res.ok) { setNotes((n) => ({ ...n, [group]: { ok: true, text: "Saved" } })); await load(); }
    else { const j = await res.json().catch(() => ({})); setNotes((n) => ({ ...n, [group]: { ok: false, text: j.error || "Save failed" } })); }
  }
  async function test(group: string, service: string) {
    setBusy(service);
    const res = await fetch("/api/admin/settings/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ service }) });
    const j = await res.json();
    setBusy(null);
    setNotes((n) => ({ ...n, [group]: { ok: Boolean(j.ok), text: j.detail || j.error || "Unknown result" } }));
  }
  async function saveTemplate(reset = false) {
    if (!editing) return;
    setBusy("tpl");
    const res = await fetch("/api/admin/email-templates", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(reset ? { key: editing.key, reset: true } : { key: editing.key, subject: editing.subject, body: editing.body, enabled: editing.enabled }) });
    setBusy(null);
    if (res.ok) { const { template } = await res.json(); setEditing(template); setTemplates((t) => (t ?? []).map((x) => (x.key === template.key ? template : x))); setNotes((n) => ({ ...n, tpl: { ok: true, text: reset ? "Reset to default" : "Template saved" } })); }
  }
  async function testTemplate(key: string) {
    setBusy("tpl-test");
    const res = await fetch("/api/admin/email-templates/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key }) });
    const j = await res.json(); setBusy(null);
    setNotes((n) => ({ ...n, tpl: { ok: Boolean(j.ok), text: j.detail || j.error } }));
  }

  if (!rows) return <div className="flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" /> Loading settings…</div>;
  const input = "input";

  return (
    <div className="space-y-8">
      {GROUPS.map((g) => (
        <section key={g.id} className="card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h2 className="text-lg font-semibold">{g.title}</h2><p className="text-sm text-muted">{g.blurb}</p></div>
            <div className="flex flex-wrap gap-2">
              {g.test?.map((t) => <button key={t.service} disabled={busy !== null} onClick={() => test(g.id, t.service)} className="btn-ghost !py-1.5 text-xs">{busy === t.service ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}{t.label}</button>)}
              <button disabled={busy !== null} onClick={() => save(g.id)} className="btn-primary !py-1.5 text-xs"><Save className="h-3.5 w-3.5" />{busy === g.id ? "Saving…" : "Save"}</button>
            </div>
          </div>
          {g.id === "hitpay" && <p className="mt-2 rounded-lg bg-elev px-3 py-2 text-xs text-muted">Webhook URL: <code className="text-fg">{appUrl}/api/billing/webhook</code> · events: <code>charge.created</code>, <code>recurring_billing.subscription_updated</code></p>}
          {notes[g.id] && <p className={cn("mt-2 inline-flex items-center gap-1.5 text-sm", notes[g.id].ok ? "text-accent-2" : "text-accent-3")}>{notes[g.id].ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}{notes[g.id].text}</p>}
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {rows.filter((r) => r.group === g.id).map((r) => (
              <label key={r.key} className="block text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{r.label}</span>
                  <span className={cn("text-[10px] uppercase tracking-wide", r.source === "database" ? "text-accent-2" : r.source === "environment" ? "text-accent" : "text-muted")}>{r.source === "unset" ? "not set" : r.source}</span>
                </div>
                {r.type === "boolean" ? (
                  <select className={cn(input, "mt-1")} value={edits[r.key] ?? r.value} onChange={(e) => setEdits({ ...edits, [r.key]: e.target.value })}><option value="1">On</option><option value="0">Off</option></select>
                ) : r.type === "select" ? (
                  <select className={cn(input, "mt-1")} value={edits[r.key] ?? r.value} onChange={(e) => setEdits({ ...edits, [r.key]: e.target.value })}>{r.options?.map((o) => <option key={o}>{o}</option>)}</select>
                ) : (
                  <input className={cn(input, "mt-1")} type={r.secret ? "password" : r.type === "number" ? "number" : "text"} placeholder={r.secret ? (r.isSet ? `${r.value} (leave blank to keep)` : "not set") : ""} value={edits[r.key] ?? (r.secret ? "" : r.value)} onChange={(e) => setEdits({ ...edits, [r.key]: e.target.value })} autoComplete="off" />
                )}
                <div className="mt-1 flex items-center justify-between text-[11px] text-muted">
                  <span>{r.help ?? (r.env ? `env: ${r.env}` : "")}</span>
                  {r.source === "database" && <label className="inline-flex items-center gap-1"><input type="checkbox" checked={Boolean(clears[r.key])} onChange={(e) => setClears({ ...clears, [r.key]: e.target.checked })} /> clear (use env)</label>}
                </div>
              </label>
            ))}
          </div>
        </section>
      ))}

      <section className="card p-5">
        <h2 className="text-lg font-semibold">Email templates</h2>
        <p className="text-sm text-muted">HTML with <code>{"{{variables}}"}</code>. The layout (header, footer, support email) is added automatically.</p>
        {notes.tpl && <p className={cn("mt-2 inline-flex items-center gap-1.5 text-sm", notes.tpl.ok ? "text-accent-2" : "text-accent-3")}>{notes.tpl.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}{notes.tpl.text}</p>}
        <div className="mt-4 grid gap-4 lg:grid-cols-[280px_1fr]">
          <ul className="space-y-1">
            {(templates ?? []).map((t) => (
              <li key={t.key}>
                <button onClick={() => setEditing(t)} className={cn("w-full rounded-xl border px-3 py-2 text-left text-sm", editing?.key === t.key ? "border-accent bg-accent/10" : "border-line hover:bg-fg/5")}>
                  <div className="flex items-center justify-between"><span className="font-medium">{t.name}</span><span className="text-[10px] uppercase text-muted">{!t.enabled ? "off" : t.customised ? "custom" : "default"}</span></div>
                  <div className="text-xs text-muted">{t.description}</div>
                </button>
              </li>
            ))}
          </ul>
          {editing ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm text-muted">Variables: {editing.variables.map((v) => <code key={v} className="mr-1 rounded bg-fg/10 px-1">{`{{${v}}}`}</code>)} <code className="rounded bg-fg/10 px-1">{"{{app_url}}"}</code> <code className="rounded bg-fg/10 px-1">{"{{account_url}}"}</code></div>
                <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.enabled} onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })} /> Enabled</label>
              </div>
              <input className={input} value={editing.subject} onChange={(e) => setEditing({ ...editing, subject: e.target.value })} placeholder="Subject" />
              <textarea className={cn(input, "min-h-[220px] font-mono text-xs")} value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} />
              <div className="card p-4 text-sm" dangerouslySetInnerHTML={{ __html: editing.body.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, k) => `<mark style="background:#ffe9a8;color:#111">${k}</mark>`) }} />
              <div className="flex flex-wrap gap-2">
                <button disabled={busy !== null} onClick={() => saveTemplate()} className="btn-primary !py-1.5 text-xs"><Save className="h-3.5 w-3.5" />Save template</button>
                <button disabled={busy !== null} onClick={() => testTemplate(editing.key)} className="btn-ghost !py-1.5 text-xs"><Send className="h-3.5 w-3.5" />Send test to me</button>
                {editing.customised && <button disabled={busy !== null} onClick={() => saveTemplate(true)} className="btn-ghost !py-1.5 text-xs text-accent-3"><RotateCcw className="h-3.5 w-3.5" />Reset to default</button>}
              </div>
            </div>
          ) : <div className="text-sm text-muted">Select a template to edit it.</div>}
        </div>
      </section>
    </div>
  );
}
