"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Send, Download, FileCode2, Globe, Lock, Loader2, Coins, Sparkles, ChevronDown, Share2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { ModelViewer } from "./ModelViewer";
import { Markdown } from "./Markdown";
import { cn, colorFor } from "@/lib/utils";

export interface StudioMessage { id: string; role: "user" | "assistant"; content: string; modelId?: string | null }
export interface StudioModel {
  id: string; title: string; description: string; version: number; isPublic: boolean; likesCount: number; createdAt: string;
  stats: { size?: [number, number, number]; volumeCm3?: number; estGramsPLA?: number; estPrintMinutes?: number; triangles?: number; warnings?: string[]; errors?: string[]; ok?: boolean; printNotes?: string | null; overhangPct?: number; baseContactPct?: number; meanThicknessMm?: number; attempts?: number };
}

const SUGGESTIONS = [
  "A desk phone stand for a 75 mm phone, angled 65°, with a cable slot",
  "A hexagonal pencil cup with honeycomb cutouts, 80 mm tall",
  "A wall hook for headphones with two screw holes",
  "A small planter with drainage holes and a matching saucer lip",
  "A cable clip that grips a 20 mm desk edge",
  "A chamfered keychain tag with a 5 mm hole",
];

export function ChatStudio({ project, initialMessages, initialModels, initialCredits, plan, initialPrompt }: {
  project: { id: string; title: string };
  initialMessages: StudioMessage[];
  initialModels: StudioModel[];
  initialCredits: number;
  plan: string;
  initialPrompt?: string;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [models, setModels] = useState(initialModels);
  const [current, setCurrent] = useState<StudioModel | null>(initialModels.at(-1) ?? null);
  const [credits, setCredits] = useState(initialCredits);
  const [input, setInput] = useState(initialPrompt ?? "");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const autoSent = useRef(false);
  const router = useRouter();

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  useEffect(() => {
    if (initialPrompt && !autoSent.current && initialMessages.length === 0) {
      autoSent.current = true;
      void send(initialPrompt);
      window.history.replaceState(null, "", `/studio/${project.id}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    setBusy(true);
    setError(null);
    setInput("");
    setStatus("Thinking…");
    const tempId = `tmp-${Date.now()}`;
    setMessages((m) => [...m, { id: tempId, role: "user", content }]);

    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId: project.id, message: content }) });
      if (!res.ok || !res.body) throw new Error(await res.text());
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const ev = /^event: (.+)$/m.exec(chunk)?.[1];
          const data = /^data: (.+)$/m.exec(chunk)?.[1];
          if (!ev || !data) continue;
          const j = JSON.parse(data);
          if (ev === "status") setStatus(j.text);
          else if (ev === "message") {
            if (j.role === "user") setMessages((m) => m.map((x) => (x.id === tempId ? { ...x, id: j.id } : x)));
            else setMessages((m) => [...m, { id: j.id, role: "assistant", content: j.content, modelId: j.modelId }]);
          } else if (ev === "model") {
            const mm = j.model as StudioModel;
            setModels((ms) => [...ms, mm]);
            setCurrent(mm);
          } else if (ev === "credits") {
            setCredits(j.credits);
            router.refresh(); // keeps the navbar credit badge in sync
          }
          else if (ev === "error") {
            setError(j.error);
            setMessages((m) => m.filter((x) => x.id !== tempId));
          }
        }
      }
    } catch (e) {
      setError((e as Error).message || "Something went wrong");
      setMessages((m) => m.filter((x) => x.id !== tempId));
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }

  async function togglePublic() {
    if (!current) return;
    const res = await fetch(`/api/models/${current.id}/publish`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ isPublic: !current.isPublic }) });
    if (res.ok) {
      const j = await res.json();
      const upd = { ...current, isPublic: j.isPublic };
      setCurrent(upd);
      setModels((ms) => ms.map((m) => (m.id === upd.id ? upd : m)));
    }
  }

  const s = current?.stats ?? {};

  return (
    <div className="mx-auto grid w-full max-w-[1600px] flex-1 gap-4 px-4 py-4 lg:grid-cols-[420px_1fr] lg:px-6" style={{ minHeight: "calc(100vh - 4rem)" }}>
      {/* Chat column */}
      <section className="card flex max-h-[calc(100vh-6rem)] flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="min-w-0">
            <Link href="/studio" className="text-xs text-muted hover:text-fg">← Projects</Link>
            <h1 className="truncate font-medium">{project.title}</h1>
          </div>
          <div className="glass flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs"><Coins className="h-3.5 w-3.5 text-accent-2" /><b>{credits}</b><span className="text-muted">left</span></div>
        </header>

        <div ref={listRef} className="scrollbar-thin flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {messages.length === 0 && (
            <div className="space-y-3">
              <div className="rounded-2xl bg-elev p-4 text-sm">
                <div className="flex items-center gap-2 font-medium"><Sparkles className="h-4 w-4 text-accent" /> What should we print today?</div>
                <p className="mt-1 text-muted">Describe the object, its purpose and rough size. I&apos;ll design a printable solid and you can refine it here.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((sg) => (
                  <button key={sg} onClick={() => send(sg)} className="rounded-full border border-line px-3 py-1.5 text-left text-xs text-muted hover:border-accent hover:text-fg">{sg}</button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn("prose-chat max-w-[90%] rounded-2xl px-4 py-2.5 text-sm", m.role === "user" ? "bg-accent text-white" : "bg-elev")}>
                <Markdown text={m.content} />
                {m.modelId && (
                  <button onClick={() => setCurrent(models.find((x) => x.id === m.modelId) ?? null)} className="mt-2 inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs text-accent-2 hover:bg-white/5">
                    <Sparkles className="h-3 w-3" /> View this version
                  </button>
                )}
              </div>
            </div>
          ))}
          {status && (
            <div className="flex items-center gap-2 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin text-accent" />{status}</div>
          )}
          {error && (
            <div className="rounded-xl border border-accent-3/40 bg-accent-3/10 px-3 py-2 text-sm text-accent-3">
              {error} {/credits/i.test(error) && <Link href="/pricing" className="underline">See plans</Link>}
            </div>
          )}
        </div>

        <form onSubmit={(e) => { e.preventDefault(); send(); }} className="border-t border-line p-3">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              rows={2}
              placeholder={models.length ? "Suggest a change… e.g. make the walls 3 mm and add a lip" : "Describe what you want to print…"}
              className="input resize-none"
              disabled={busy}
            />
            <button className="btn-primary h-10 w-10 shrink-0 !p-0" disabled={busy || !input.trim()} aria-label="Send">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-1.5 px-1 text-[11px] text-muted">1 credit per generation or refinement · {plan} plan</p>
        </form>
      </section>

      {/* Viewer column */}
      <section className="card relative flex min-h-[520px] flex-col overflow-hidden">
        {current ? (
          <>
            <ModelViewer key={current.id} url={`/api/models/${current.id}/stl`} size={s.size} color={colorFor(current.id)} className="flex-1" />
            <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4">
              <div className="pointer-events-auto">
                <button onClick={() => setShowVersions((v) => !v)} className="glass inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm">
                  <span className="font-medium">{current.title}</span>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-muted">v{current.version}</span>
                  {models.length > 1 && <ChevronDown className="h-4 w-4 text-muted" />}
                </button>
                {showVersions && models.length > 1 && (
                  <ul className="glass mt-2 w-72 overflow-hidden rounded-xl text-sm">
                    {[...models].reverse().map((m) => (
                      <li key={m.id}>
                        <button onClick={() => { setCurrent(m); setShowVersions(false); }} className={cn("flex w-full items-center justify-between px-3 py-2 text-left hover:bg-white/5", m.id === current.id && "text-accent")}>
                          <span className="truncate">{m.title}</span><span className="text-xs text-muted">v{m.version}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="pointer-events-auto flex items-center gap-2">
                <button onClick={togglePublic} className={cn("glass inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs", current.isPublic ? "text-accent-2" : "text-muted")} title={current.isPublic ? "Public in gallery — click to make private" : "Private — click to publish to the gallery"}>
                  {current.isPublic ? <Globe className="h-4 w-4" /> : <Lock className="h-4 w-4" />}{current.isPublic ? "Public" : "Publish"}
                </button>
                <Link href={`/m/${current.id}`} className="glass inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs"><Share2 className="h-4 w-4" />Share page</Link>
              </div>
            </div>

            <div className="border-t border-line bg-card/90 p-4 backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
                  {s.size && <span><b className="text-fg">{s.size.map((n) => Math.round(n)).join(" × ")}</b> mm</span>}
                  {s.estGramsPLA !== undefined && <span><b className="text-fg">~{s.estGramsPLA < 1 ? s.estGramsPLA.toFixed(1) : Math.round(s.estGramsPLA)} g</b> PLA</span>}
                  {s.estPrintMinutes !== undefined && <span><b className="text-fg">~{Math.floor(s.estPrintMinutes / 60)}h {s.estPrintMinutes % 60}m</b></span>}
                  {s.triangles !== undefined && <span><b className="text-fg">{s.triangles.toLocaleString()}</b> tris</span>}
                  <span
                    className={cn("inline-flex items-center gap-1", s.ok === false ? "text-accent-3" : "text-accent-2")}
                    title={s.ok === false ? `Printability checks failed:\n${(s.errors ?? []).join("\n")}` : "Watertight mesh, passed all printability checks"}
                  >
                    {s.ok === false ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    {s.ok === false ? "needs attention — see below" : "watertight · printable"}
                  </span>
                </div>
                <div className="flex gap-2">
                  <a href={`/api/models/${current.id}/stl?download=1`} className="btn-primary !py-2 text-xs"><Download className="h-4 w-4" />STL</a>
                  <a href={`/api/models/${current.id}/blender`} className="btn-ghost !py-2 text-xs"><FileCode2 className="h-4 w-4" />Blender .py</a>
                </div>
              </div>
              {(s.printNotes || s.warnings?.length || s.errors?.length) && (
                <div className="mt-3 space-y-1 text-xs">
                  {s.printNotes && <p className="text-muted">🖨 {s.printNotes}</p>}
                  {s.errors?.map((w) => <p key={w} className="text-accent-3">✖ {w}</p>)}
                  {s.warnings?.map((w) => <p key={w} className="text-accent-3/80">⚠ {w}</p>)}
                  {s.ok === false && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => send(`Fix these printability problems and keep everything else the same:\n${[...(s.errors ?? []), ...(s.warnings ?? [])].map((e) => `- ${e}`).join("\n")}\nMake sure every part overlaps its neighbour by at least 1 mm so the model is one connected solid, and that the largest flat face sits at the lowest point.`)}
                      className="btn-ghost mt-1 !px-3 !py-1.5 text-xs text-accent-3 border-accent-3/40"
                    >
                      <AlertTriangle className="h-3.5 w-3.5" /> Ask the agent to fix these (1 credit)
                    </button>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-accent/30 to-accent-2/30">
              <Sparkles className="h-7 w-7 text-accent" />
            </div>
            <h2 className="mt-4 text-lg font-medium">Your model will appear here</h2>
            <p className="mt-1 max-w-sm text-sm text-muted">Orbit, zoom and inspect it in 3D. Every version is kept so you can compare refinements.</p>
          </div>
        )}
      </section>
    </div>
  );
}
