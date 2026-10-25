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
import { buildSpec, type BuiltMesh } from "./kernel";
import { analysePrintability, type PrintReport, type PrinterProfile, DEFAULT_PRINTER } from "./checks";
import { toBinarySTL } from "./stl";
import { toBlenderScript } from "./blender";
import { SYSTEM_PROMPT, REPAIR_PROMPT } from "./prompts";
import type { ChatMessage, LLMClient } from "./llm";

export type HarnessEvent =
  | { type: "status"; text: string }
  | { type: "attempt"; n: number; max: number }
  | { type: "llm"; chars: number }
  | { type: "validation"; ok: boolean; errors: string[] }
  | { type: "build"; ok: boolean; error?: string; triangles?: number }
  | { type: "print"; report: PrintReport }
  | { type: "done"; result: HarnessResult };

export interface HarnessResult {
  message: string;
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
}

export interface HarnessOptions {
  llm: LLMClient;
  maxAttempts?: number;
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
function toMessages(history: HistoryItem[], userPrompt: string): ChatMessage[] {
  const msgs: ChatMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];
  for (const h of history.slice(-12)) {
    if (h.role === "assistant") {
      msgs.push({ role: "assistant", content: JSON.stringify({ message: h.content, spec: h.spec ?? null }) });
    } else {
      msgs.push({ role: "user", content: h.content });
    }
  }
  msgs.push({ role: "user", content: userPrompt });
  return msgs;
}

export async function runHarness(
  userPrompt: string,
  history: HistoryItem[],
  opts: HarnessOptions,
): Promise<HarnessResult> {
  const { llm, onEvent = () => {}, printer = DEFAULT_PRINTER } = opts;
  const maxAttempts = opts.maxAttempts ?? 4;
  const messages = toMessages(history, userPrompt);

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
      return { message: reply.message || "How would you like to change the model?", spec: null, attempts: attempt, model: llm.model };
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
      mesh = await buildSpec(validation.spec);
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

    const stl = toBinarySTL(mesh, validation.spec.name);
    const blender = toBlenderScript(validation.spec);
    const result: HarnessResult = {
      message: reply.message,
      spec: validation.spec,
      mesh,
      stl,
      blender,
      report,
      attempts: attempt,
      model: llm.model,
    };
    onEvent({ type: "done", result });
    return result;
  }

  // Exhausted attempts: return whatever we have so the user is never left empty-handed.
  if (lastSpec) {
    try {
      const mesh = await buildSpec(lastSpec);
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
