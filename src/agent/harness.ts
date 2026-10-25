/**
 * The agent harness.
 *
 *   user idea ─► LLM (DeepSeek V4.1 Flash) ─► JSON spec ─► validate ─► build (Manifold)
 *                      ▲                                          │
 *                      └──────── repair prompt with errors ◄──────┴─► printability checks
 *
 * The loop is tool-free on purpose: the model emits a declarative spec and the
 * harness owns every side effect (geometry, files, credits). That makes the
 * agent deterministic to replay, cheap to run, and safe to expose publicly.
 */
import { validateSpec, type Spec } from "./spec";
import { buildSpec, type BuiltMesh, type MeshInput } from "./kernel";
import { analysePrintability, type PrintReport, type PrinterProfile, DEFAULT_PRINTER } from "./checks";
import { toBinarySTL } from "./stl";
import { toBlenderScript } from "./blender";
import { SYSTEM_PROMPT, REPAIR_PROMPT, OPTIMIZE_PROMPT, BRIEF_PROMPT } from "./prompts";
import type { ChatMessage, LLMClient } from "./llm";

export type HarnessEvent =
  | { type: "status"; text: string }
  | { type: "brief"; brief: string; assumptions: string[] }
  | { type: "optimize"; before: number; after: number; kept: "optimized" | "original" }
  | { type: "attempt"; n: number; max: number }
  | { type: "llm"; chars: number }
  | { type: "validation"; ok: boolean; errors: string[] }
  | { type: "build"; ok: boolean; error?: string; triangles?: number }
  | { type: "print"; report: PrintReport }
  | { type: "done"; result: HarnessResult };

export interface HarnessResult {
  message: string;
  /** Expanded design brief the model was generated from (new generations only). */
  brief?: string;
  assumptions?: string[];
  spec: Spec | null;
  mesh?: BuiltMesh;
  stl?: Buffer;
  blender?: string;
  report?: PrintReport;
  attempts: number;
  model: string;
}

export interface HistoryItem {
  role: "user" | "assistant";
  content: string;
  /** For assistant turns that produced a model, the spec they produced. */
  spec?: Spec | null;
  /** Reference image (data URL) attached to a user turn. */
  image?: string;
  /** Text extracted from an attached document. */
  attachmentText?: string;
}

/** Lower is better: hard errors dominate, then warnings, then overhang/thin-wall/bridge percentages. */
export function printScore(r: PrintReport): number {
  const m = r.metrics;
  return r.errors.length * 100 + r.warnings.length * 10 + m.overhangPct * 0.5 + m.bridgePct * 0.3 + m.thinAreaPct * 1.0 + Math.max(0, 15 - m.baseContactPct) * 0.5;
}

export interface HarnessOptions {
  llm: LLMClient;
  maxAttempts?: number;
  /** Run one extra "make it print better" pass when the build passes with warnings (default true). */
  optimize?: boolean;
  /** Reference image for this turn (data URL, JPEG/PNG). */
  image?: string;
  /** Text extracted from an attached PDF for this turn. */
  attachmentText?: string;
  /** Uploaded meshes the spec may reference with {op:"mesh",name}. */
  meshes?: Record<string, MeshInput & { size: [number, number, number]; numTri: number }>;
  /** Expand short requests into a precise brief before generating (default true for new models). */
  enrich?: boolean;
  printer?: PrinterProfile;
  onEvent?: (e: HarnessEvent) => void;
}

interface LLMReply {
  message: string;
  spec: unknown;
}

function parseReply(raw: string): LLMReply {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("reply contained no JSON object");
  const obj = JSON.parse(balanceBrackets(text.slice(start, end + 1)));
  if (typeof obj !== "object" || obj === null) throw new Error("reply is not an object");
  return { message: typeof obj.message === "string" ? obj.message : "", spec: obj.spec ?? null };
}

/**
 * Small models occasionally drop one or two closing brackets at the end of a
 * long minified object. Append whatever is missing (outside string literals)
 * instead of burning an LLM round-trip on it.
 */
export function balanceBrackets(src: string): string {
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  for (const ch of src) {
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") {
      if (stack[stack.length - 1] === ch) stack.pop();
    }
  }
  if (inStr) src += '"';
  return src + stack.reverse().join("");
}

/** Convert project history into chat messages; specs are inlined compactly so the model can edit them. */
function userContent(text: string, image?: string, attachmentText?: string): ChatMessage["content"] {
  let t = text;
  if (attachmentText) t += `\n\n[Attached document text]\n${attachmentText}`;
  if (!image) return t;
  return [
    { type: "text", text: `${t}\n\n[A reference image is attached. Reproduce the object's silhouette, proportions and key features with the CSG primitives; infer real-world dimensions from context if none are given, and keep it printable.]` },
    { type: "image_url", image_url: { url: image } },
  ];
}

function toMessages(history: HistoryItem[], userPrompt: string, printer: PrinterProfile, image?: string, attachmentText?: string, meshes?: HarnessOptions["meshes"]): ChatMessage[] {
  const target = `Target printer: ${printer.name ?? "generic FDM"}, build volume ${printer.bed.join("×")} mm, ${printer.nozzle} mm nozzle, ${printer.material}. Minimum wall ${(2 * printer.nozzle * 1.05).toFixed(1)} mm${printer.material === "TPU" ? "; flexible material — avoid overhangs and thin walls" : ""}.`;
  const meshNote = meshes && Object.keys(meshes).length
    ? "\n\n## Uploaded model\n" + Object.entries(meshes).map(([k, m]) => `{"op":"mesh","name":"${k}"} is the user's uploaded solid: ${m.size.map((v) => v.toFixed(1)).join(" × ")} mm, ${m.numTri} triangles, seated on z=0 and centred on the origin (so it spans ±${(m.size[0] / 2).toFixed(1)} in X, ±${(m.size[1] / 2).toFixed(1)} in Y, 0..${m.size[2].toFixed(1)} in Z). Use it as the base and add, cut, scale or move features relative to it; do not rebuild it from primitives unless asked.`).join("\n")
    : "";
  const msgs: ChatMessage[] = [{ role: "system", content: `${SYSTEM_PROMPT}\n\n## Current target\n${target}${meshNote}` }];
  for (const h of history.slice(-12)) {
    if (h.role === "assistant") {
      msgs.push({ role: "assistant", content: JSON.stringify({ message: h.content, spec: h.spec ?? null }) });
    } else {
      msgs.push({ role: "user", content: userContent(h.content, h.image, h.attachmentText) });
    }
  }
  msgs.push({ role: "user", content: userContent(userPrompt, image, attachmentText) });
  return msgs;
}

export async function runHarness(
  userPrompt: string,
  history: HistoryItem[],
  opts: HarnessOptions,
): Promise<HarnessResult> {
  const { llm, onEvent = () => {}, printer = DEFAULT_PRINTER } = opts;
  const maxAttempts = opts.maxAttempts ?? 4;

  // --- Brief enrichment: turn a short request into a precise specification. ---
  let brief: string | undefined;
  let assumptions: string[] | undefined;
  const isNewModel = !history.some((h) => h.spec);
  const shouldEnrich = (opts.enrich ?? true) && isNewModel && userPrompt.trim().length < 600 && !opts.meshes;
  if (shouldEnrich) {
    onEvent({ type: "status", text: "Writing a precise design brief…" });
    try {
      const target = `Target printer: ${printer.name ?? "generic FDM"}, bed ${printer.bed.join("×")} mm, ${printer.nozzle} mm nozzle, ${printer.material}.`;
      const raw = await llm.complete([
        { role: "system", content: BRIEF_PROMPT },
        { role: "user", content: userContent(`${target}\n\nUser request: ${userPrompt}`, opts.image, opts.attachmentText) },
      ], { json: true, maxTokens: 1200 });
      const obj = JSON.parse(balanceBrackets(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)));
      if (typeof obj.brief === "string" && obj.brief.length > 40) {
        const b: string = obj.brief.trim();
        const a: string[] = Array.isArray(obj.assumptions) ? obj.assumptions.filter((x: unknown): x is string => typeof x === "string").slice(0, 6) : [];
        brief = b;
        assumptions = a;
        onEvent({ type: "brief", brief: b, assumptions: a });
      }
    } catch (e) {
      onEvent({ type: "status", text: `Brief step skipped (${(e as Error).message})` });
    }
  }
  const effectivePrompt = brief ? `${userPrompt}\n\n## Design brief (use these exact values)\n${brief}` : userPrompt;
  const messages = toMessages(history, effectivePrompt, printer, opts.image, opts.attachmentText, opts.meshes);
  const buildOpts = { meshes: opts.meshes };

  let lastMessage = "";
  let lastSpec: Spec | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    onEvent({ type: "attempt", n: attempt, max: maxAttempts });
    onEvent({ type: "status", text: attempt === 1 ? "Designing your model…" : `Repairing geometry (attempt ${attempt})…` });

    const raw = await llm.complete(messages, { json: true });
    onEvent({ type: "llm", chars: raw.length });

    let reply: LLMReply;
    try {
      reply = parseReply(raw);
    } catch (e) {
      messages.push({ role: "assistant", content: raw });
      messages.push({ role: "user", content: `Your reply was not valid JSON (${(e as Error).message}). Return exactly one JSON object with "message" and "spec".` });
      continue;
    }
    lastMessage = reply.message;

    // Chat-only turn.
    if (reply.spec === null || reply.spec === undefined) {
      return { message: reply.message || "How would you like to change the model?", spec: null, attempts: attempt, model: llm.model, brief, assumptions };
    }

    const validation = validateSpec(reply.spec);
    onEvent({ type: "validation", ok: validation.ok, errors: validation.ok ? [] : validation.errors });
    if (!validation.ok) {
      messages.push({ role: "assistant", content: raw });
      messages.push({ role: "user", content: REPAIR_PROMPT(validation.errors.map((e) => `spec.${e}`), []) });
      continue;
    }
    lastSpec = validation.spec;

    onEvent({ type: "status", text: "Building solid geometry…" });
    let mesh: BuiltMesh;
    try {
      mesh = await buildSpec(validation.spec, buildOpts);
      onEvent({ type: "build", ok: true, triangles: mesh.numTri });
    } catch (e) {
      const msg = (e as Error).message;
      onEvent({ type: "build", ok: false, error: msg });
      messages.push({ role: "assistant", content: raw });
      messages.push({ role: "user", content: REPAIR_PROMPT([`geometry build failed: ${msg}`], []) });
      continue;
    }

    onEvent({ type: "status", text: "Checking printability…" });
    const report = analysePrintability(mesh, printer);
    onEvent({ type: "print", report });
    if (!report.ok && attempt < maxAttempts) {
      messages.push({ role: "assistant", content: raw });
      messages.push({ role: "user", content: REPAIR_PROMPT(report.errors, report.warnings) });
      continue;
    }

    // --- Optimisation pass: printable, but with warnings and budget left. ---
    let best = { spec: validation.spec, mesh, report, message: reply.message };
    let attemptsUsed = attempt;
    if ((opts.optimize ?? true) && report.ok && report.warnings.length > 0 && attempt < maxAttempts) {
      onEvent({ type: "status", text: "Optimising for printing…" });
      const m = report.metrics;
      const metrics = `overhang ${m.overhangPct}%, flat ceilings ${m.bridgePct}%, thin area ${m.thinAreaPct}%, min wall ${m.minWallMm} mm, bed contact ${m.baseContactPct}%, ${m.shells} piece(s)`;
      messages.push({ role: "assistant", content: raw });
      messages.push({ role: "user", content: OPTIMIZE_PROMPT(report.warnings, metrics) });
      attemptsUsed++;
      try {
        const raw2 = await llm.complete(messages, { json: true });
        const reply2 = parseReply(raw2);
        const v2 = reply2.spec ? validateSpec(reply2.spec) : null;
        if (v2 && v2.ok) {
          const mesh2 = await buildSpec(v2.spec, buildOpts);
          const report2 = analysePrintability(mesh2, printer);
          const before = printScore(report), after = printScore(report2);
          const kept = report2.ok && after < before ? "optimized" : "original";
          onEvent({ type: "optimize", before, after, kept });
          if (kept === "optimized") best = { spec: v2.spec, mesh: mesh2, report: report2, message: reply2.message || reply.message };
        }
      } catch (e) {
        onEvent({ type: "status", text: `Optimisation skipped (${(e as Error).message})` });
      }
    }

    const assumptionNote = assumptions && assumptions.length ? `\n\n**Assumed (tell me if any should change):** ${assumptions.join(" · ")}` : "";
    const result: HarnessResult = {
      message: best.message + assumptionNote,
      brief,
      assumptions,
      spec: best.spec,
      mesh: best.mesh,
      stl: toBinarySTL(best.mesh, best.spec.name),
      blender: toBlenderScript(best.spec),
      report: best.report,
      attempts: attemptsUsed,
      model: llm.model,
    };
    onEvent({ type: "done", result });
    return result;
  }

  // Exhausted attempts: return whatever we have so the user is never left empty-handed.
  if (lastSpec) {
    try {
      const mesh = await buildSpec(lastSpec, buildOpts);
      const report = analysePrintability(mesh, printer);
      return {
        message: `${lastMessage}\n\n> ⚠️ I could not fully satisfy the printability checks: ${report.errors.join("; ")}. The model is still exported so you can inspect it.`,
        spec: lastSpec,
        mesh,
        stl: toBinarySTL(mesh, lastSpec.name),
        blender: toBlenderScript(lastSpec),
        report,
        attempts: maxAttempts,
        model: llm.model,
      };
    } catch {
      /* fall through */
    }
  }
  return {
    message: lastMessage || "I couldn't produce a valid model from that description. Could you describe the object, its rough size and its purpose?",
    spec: null,
    attempts: maxAttempts,
    model: llm.model,
  };
}

/** Build an already-validated spec without the LLM (used for seeding and re-exports). */
export async function materialise(spec: Spec, printer: PrinterProfile = DEFAULT_PRINTER) {
  const mesh = await buildSpec(spec);
  return { mesh, report: analysePrintability(mesh, printer), stl: toBinarySTL(mesh, spec.name), blender: toBlenderScript(spec) };
}
