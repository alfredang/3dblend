"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Send, Download, FileCode2, Globe, Lock, Loader2, Coins, Sparkles, ChevronDown, Share2, AlertTriangle, CheckCircle2, Plus, X, FileText } from "lucide-react";
import { ModelViewer } from "./ModelViewer";
import { Markdown } from "./Markdown";
import { cn, colorFor } from "@/lib/utils";
import { COST } from "@/lib/plans";
import { PrintSetupBar, usePrintSetup } from "./PrintSetup";

export interface StudioMessage { id: string; role: "user" | "assistant"; content: string; modelId?: string | null; imageUrl?: string; attachmentName?: string; meshStats?: { size: number[]; triangles: number } }

interface Attachment { name: string; type: string; data: string; preview?: string }

/** Downscale images in the browser (max 1280 px, JPEG) so uploads stay small; PDFs are sent as-is. */
async function prepareAttachment(file: File): Promise<Attachment> {
  const isModel = /\.(stl|3mf|py)$/i.test(file.name);
  if (file.type === "application/pdf" || isModel) {
    if (file.size > 8 * 1024 * 1024) throw new Error("File must be under 8 MB");
    const data = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file); });
    const type = file.type || (file.name.toLowerCase().endsWith(".stl") ? "model/stl" : file.name.toLowerCase().endsWith(".3mf") ? "model/3mf" : "text/x-python");
    return { name: file.name, type, data };
  }
  if (!file.type.startsWith("image/")) throw new Error("Attach an image (JPEG/PNG), a PDF, an STL, a 3MF or a Blender .py script");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL("image/jpeg", 0.86);
    return { name: file.name, type: "image/jpeg", data, preview: data };
  } finally {
    URL.revokeObjectURL(url);
  }
}
export interface StudioModel {
  id: string; title: string; description: string; version: number; isPublic: boolean; likesCount: number; createdAt: string; attribution?: string;
  stats: { size?: [number, number, number]; volumeCm3?: number; estGramsPLA?: number; estPrintMinutes?: number; triangles?: number; warnings?: string[]; errors?: string[]; tips?: string[]; ok?: boolean; printNotes?: string | null; overhangPct?: number; baseContactPct?: number; meanThicknessMm?: number; minWallMm?: number; recommendedLayerHeight?: number; printer?: { name: string; nozzle: number; material: string }; attempts?: number };
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
  const [setup, setSetup] = usePrintSetup();
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const canAttachFiles = plan !== "FREE";

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try { setAttachment(await prepareAttachment(f)); setError(null); } catch (err) { setError((err as Error).message); }
  }

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
    const content = (text ?? input).trim() || (attachment ? (/\.(stl|3mf|py)$/i.test(attachment.name) ? "Load the attached model so I can modify it." : "Make a printable 3D model of what is shown in the attached reference.") : "");
    if (!content || busy) return;
    const att = attachment;
    setBusy(true);
    setError(null);
    setInput("");
    setAttachment(null);
    setStatus("Thinking…");
    const tempId = `tmp-${Date.now()}`;
    setMessages((m) => [...m, { id: tempId, role: "user", content, imageUrl: att?.preview, attachmentName: att?.name }]);

    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId: project.id, message: content, setup, attachment: att ? { name: att.name, type: att.type, data: att.data } : undefined }) });
      if (!res.ok || !res.body) {
        const text = await res.text();
        let msg = text;
        try { msg = JSON.parse(text).error || text; } catch { /* plain text */ }
        throw new Error(msg || `Request failed (${res.status})`);
      }
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
            if (j.role === "user") setMessages((m) => m.map((x) => (x.id === tempId ? { ...x, id: j.id, imageUrl: j.imageUrl ?? x.imageUrl, attachmentName: j.attachmentName ?? x.attachmentName, meshStats: j.meshStats } : x)));
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

  const freePlan = plan === "FREE";

  async function togglePublic() {
    if (!current) return;
    if (freePlan && current.isPublic) { setError("Models on the Free plan are shared publicly in the gallery. Upgrade to Starter or Pro to keep models private."); return; }
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
    <div className="mx-auto grid w-full max-w-[1800px] flex-1 gap-4 px-4 py-4 lg:grid-cols-[minmax(460px,38%)_1fr] lg:px-6" style={{ minHeight: "calc(100vh - 4rem)" }}>
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
                <p className="mt-1 text-muted">Describe the object, its purpose and rough size. I&apos;ll turn it into a precise brief, design a printable solid, and you can refine it here.</p>
                <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-muted">
                  <li><b className="text-fg">Size & fit:</b> overall mm, what it must hold (a 75 mm phone, M3 bolts, a 20 mm pipe)</li>
                  <li><b className="text-fg">Features:</b> holes, slots, lips, chamfers, counts and spacing</li>
                  <li><b className="text-fg">Printing:</b> which face sits on the bed, wall thickness, no supports</li>
                </ul>
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
              <div className={cn("prose-chat max-w-[92%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed", m.role === "user" ? "bg-accent text-white" : "bg-elev")}>
                {m.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.imageUrl} alt={m.attachmentName ?? "reference"} className="mb-2 max-h-56 rounded-xl border border-white/20 object-contain" />
                )}
                {m.attachmentName && (
                  <a href={m.id.startsWith("tmp-") ? undefined : `/api/messages/${m.id}/attachment`} target="_blank" rel="noreferrer" className="mb-2 inline-flex items-center gap-1.5 rounded-lg bg-black/20 px-2 py-1 text-xs">
                    <FileText className="h-3.5 w-3.5" /> {m.attachmentName}{m.meshStats ? ` · ${m.meshStats.size.map((v) => Math.round(v)).join("×")} mm · ${m.meshStats.triangles.toLocaleString()} tris` : ""}
                  </a>
                )}
                <Markdown text={m.content} />
                {m.modelId && (
                  <button onClick={() => setCurrent(models.find((x) => x.id === m.modelId) ?? null)} className="mt-2 inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs text-accent-2 hover:bg-fg/5">
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
          <div className="relative rounded-2xl border border-line bg-elev focus-within:border-accent">
            {attachment && (
              <div className="flex items-center gap-2 px-3 pt-3">
                {attachment.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={attachment.preview} alt="" className="h-14 w-14 rounded-lg border border-line object-cover" />
                ) : (
                  <span className="inline-grid h-14 w-14 place-items-center rounded-lg border border-line bg-card"><FileText className="h-6 w-6 text-accent-3" /></span>
                )}
                <span className="truncate text-xs text-muted">{attachment.name}</span>
                <button type="button" onClick={() => setAttachment(null)} className="ml-auto rounded-full p-1 text-muted hover:bg-fg/10 hover:text-fg" aria-label="Remove attachment"><X className="h-4 w-4" /></button>
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,application/pdf,.stl,.3mf,.py,model/stl,model/3mf,text/x-python" className="hidden" onChange={onPickFile} />
            <textarea
              value={input}
              onChange={(e) => { setInput(e.target.value); e.target.style.height = "auto"; e.target.style.height = `${Math.min(e.target.scrollHeight, 260)}px`; }}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } }}
              rows={3}
              placeholder={models.length ? "Suggest a change… e.g. make the walls 3 mm, add a lip, round the corners" : "Describe what you want to print — the object, its purpose and rough size…"}
              className="min-h-[96px] w-full resize-none bg-transparent px-4 pb-12 pt-3 text-[15px] leading-relaxed text-fg outline-none placeholder:text-muted"
              disabled={busy}
            />
            <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => (canAttachFiles ? fileRef.current?.click() : setError("Attachments (images, PDFs, STL/3MF models, Blender scripts) are available on Starter and Pro. Upgrade to attach files."))} disabled={busy} className={cn("inline-grid h-9 w-9 place-items-center rounded-full border border-line text-muted hover:border-accent hover:text-fg", !canAttachFiles && "opacity-60")} title={canAttachFiles ? "Attach a reference image, PDF, or a model to modify (STL, 3MF, Blender .py)" : "Attachments are a Starter/Pro feature"} aria-label="Attach a reference image or PDF">
                  <Plus className="h-4 w-4" />
                </button>
                <span className="hidden text-[11px] text-muted sm:inline">Enter for a new line · ⌘/Ctrl+Enter to send · {models.length ? `${COST.refine} credit per edit` : `${COST.generate} credits per new model`} · {plan}</span>
              </div>
              <button className="btn-primary h-9 w-9 !rounded-full !p-0" disabled={busy || (!input.trim() && !attachment)} aria-label="Send">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </div>
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
                  <span className="rounded-full bg-fg/10 px-2 py-0.5 text-xs text-muted">v{current.version}</span>
                  {models.length > 1 && <ChevronDown className="h-4 w-4 text-muted" />}
                </button>
                {showVersions && models.length > 1 && (
                  <ul className="glass mt-2 w-72 overflow-hidden rounded-xl text-sm">
                    {[...models].reverse().map((m) => (
                      <li key={m.id}>
                        <button onClick={() => { setCurrent(m); setShowVersions(false); }} className={cn("flex w-full items-center justify-between px-3 py-2 text-left hover:bg-fg/5", m.id === current.id && "text-accent")}>
                          <span className="truncate">{m.title}</span><span className="text-xs text-muted">v{m.version}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="pointer-events-auto flex items-center gap-2">
                <button onClick={togglePublic} className={cn("glass inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs", current.isPublic ? "text-accent-2" : "text-muted")} title={freePlan ? "Free plan: models are public in the gallery (upgrade to keep them private)" : current.isPublic ? "Public in gallery — click to make private" : "Private — click to publish to the gallery"}>
                  {current.isPublic ? <Globe className="h-4 w-4" /> : <Lock className="h-4 w-4" />}{current.isPublic ? (freePlan ? "Public (Free plan)" : "Public") : "Publish"}
                </button>
                <Link href={`/m/${current.id}`} className="glass inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs"><Share2 className="h-4 w-4" />Share page</Link>
              </div>
            </div>

            <div className="border-t border-line bg-card/90 p-4 backdrop-blur">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <PrintSetupBar setup={setup} onChange={setSetup} compact />
                <span className="text-[11px] text-muted">Next generation designs for this printer, nozzle and material</span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
                  {s.size && <span><b className="text-fg">{s.size.map((n) => Math.round(n)).join(" × ")}</b> mm</span>}
                  {s.estGramsPLA !== undefined && <span><b className="text-fg">~{s.estGramsPLA < 1 ? s.estGramsPLA.toFixed(1) : Math.round(s.estGramsPLA)} g</b> PLA</span>}
                  {s.estPrintMinutes !== undefined && <span><b className="text-fg">~{Math.floor(s.estPrintMinutes / 60)}h {s.estPrintMinutes % 60}m</b></span>}
                  {s.triangles !== undefined && <span><b className="text-fg">{s.triangles.toLocaleString()}</b> tris</span>}
                  {s.minWallMm !== undefined && <span>min wall <b className="text-fg">{s.minWallMm} mm</b></span>}
                  {s.recommendedLayerHeight !== undefined && <span>layer <b className="text-fg">{s.recommendedLayerHeight} mm</b></span>}
                  {s.printer && <span className="text-muted">{s.printer.name} · {s.printer.nozzle} mm · {s.printer.material}</span>}
                  {current.attribution && <span className="text-accent-2">↻ remix of {current.attribution} (CC BY 4.0)</span>}
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
                  <a href={`/api/models/${current.id}/3mf?download=1`} className="btn-ghost !py-2 text-xs" title="3MF for Bambu Studio, PrusaSlicer, Cura"><Download className="h-4 w-4" />3MF</a>
                  <a href={`/api/models/${current.id}/blender`} className="btn-ghost !py-2 text-xs"><FileCode2 className="h-4 w-4" />Blender .py</a>
                </div>
              </div>
              {(s.printNotes || s.warnings?.length || s.errors?.length || s.tips?.length) && (
                <div className="mt-3 space-y-1 text-xs">
                  {s.printNotes && <p className="text-muted">🖨 {s.printNotes}</p>}
                  {s.tips?.map((w) => <p key={w} className="text-muted">💡 {w}</p>)}
                  {s.errors?.map((w) => <p key={w} className="text-accent-3">✖ {w}</p>)}
                  {s.warnings?.map((w) => <p key={w} className="text-accent-3/80">⚠ {w}</p>)}
                  {s.ok === false && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => send(`Fix these printability problems and keep everything else the same:\n${[...(s.errors ?? []), ...(s.warnings ?? [])].map((e) => `- ${e}`).join("\n")}\nMake sure every part overlaps its neighbour by at least 1 mm so the model is one connected solid, and that the largest flat face sits at the lowest point.`)}
                      className="btn-ghost mt-1 !px-3 !py-1.5 text-xs text-accent-3 border-accent-3/40"
                    >
                      <AlertTriangle className="h-3.5 w-3.5" /> Ask the agent to fix these ({COST.refine} credit)
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
            <div className="mt-6"><PrintSetupBar setup={setup} onChange={setSetup} /></div>
            <p className="mt-2 text-xs text-muted">The agent designs for this printer, nozzle and material.</p>
          </div>
        )}
      </section>
    </div>
  );
}
