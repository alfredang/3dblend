import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { spendCredits, refundCredits, InsufficientCreditsError } from "@/lib/credits";
import { COST, defaultVisibility, canAttach } from "@/lib/plans";
import { saveFile } from "@/lib/storage";
import { runHarness, type HistoryItem, type Spec } from "@/agent";
import { createDeepSeekClient } from "@/agent/llm";
import { z } from "zod";
import { resolveSetup } from "@/lib/printers";
import { processAttachment, toDataUrl, MAX_ATTACHMENT_BYTES } from "@/lib/attachments";
import { readFile } from "@/lib/storage";
import type { PrinterProfile } from "@/agent/checks";

export const runtime = "nodejs";
export const maxDuration = 300;

const schema = z.object({
  projectId: z.string(),
  message: z.string().min(1).max(4000),
  setup: z.object({ printerId: z.string(), nozzle: z.number(), material: z.enum(["PLA", "PETG", "ABS", "TPU"]) }).partial().optional(),
  attachment: z.object({ name: z.string().max(200), type: z.string().max(100), data: z.string().max(MAX_ATTACHMENT_BYTES * 1.4) }).optional(),
});

/**
 * POST /api/chat — Server-Sent Events stream.
 *  event: status  {text}
 *  event: message {id, content}
 *  event: model   {model}
 *  event: credits {credits}
 *  event: error   {error}
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const userId = session.user.id;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("Bad request", { status: 400 });
  const { projectId, message, attachment } = parsed.data;
  const setup = resolveSetup(parsed.data.setup);
  const printer: PrinterProfile = { bed: setup.printer.bed, nozzle: setup.nozzle, material: setup.material, overhangDeg: 50, name: setup.printer.name };

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    include: { messages: { orderBy: { createdAt: "asc" }, include: { model: { select: { spec: true } } } }, user: { select: { plan: true } } },
  });
  if (!project) return new Response("Not found", { status: 404 });
  const isPublicByPlan = defaultVisibility(project.user.plan);
  if (attachment && !canAttach(project.user.plan)) {
    return new Response(JSON.stringify({ error: "Reference images and PDFs are available on Starter and Pro. Upgrade to attach files." }), { status: 403, headers: { "content-type": "application/json" } });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));

      const hasModel = project.messages.some((m) => m.modelId);
      const cost = hasModel ? COST.refine : COST.generate;
      try {
        await spendCredits(userId, cost, hasModel ? "refine" : "generate");
      } catch (e) {
        send("error", { error: e instanceof InsufficientCreditsError ? "You're out of credits. Upgrade your plan to keep designing." : "Could not charge credits" });
        controller.close();
        return;
      }

      // --- Attachment (image or PDF) ---
      let image: string | undefined;
      let attachmentText: string | undefined;
      const msgData: { imagePath?: string; attachmentPath?: string; attachmentName?: string; attachmentText?: string } = {};
      const userMsg = await prisma.message.create({ data: { projectId, role: "user", content: message } });
      if (attachment) {
        try {
          const raw = Buffer.from(attachment.data.replace(/^data:[^;]+;base64,/, ""), "base64");
          if (raw.length > MAX_ATTACHMENT_BYTES) throw new Error("Attachment is larger than 8 MB");
          send("status", { text: attachment.type === "application/pdf" ? "Reading the PDF…" : "Looking at the reference image…" });
          const processed = await processAttachment(attachment.name, attachment.type, raw);
          const ext = attachment.type === "application/pdf" ? "pdf" : processed.imageMime === "image/png" ? "png" : "jpg";
          msgData.attachmentPath = await saveFile(`uploads/${userMsg.id}.${ext}`, raw);
          msgData.attachmentName = attachment.name;
          if (processed.image) {
            const imgExt = processed.imageMime === "image/png" ? "png" : "jpg";
            msgData.imagePath = processed.kind === "pdf" ? await saveFile(`uploads/${userMsg.id}.page1.png`, processed.image) : msgData.attachmentPath;
            image = toDataUrl(processed.image, processed.imageMime ?? `image/${imgExt}`);
          }
          if (processed.text) { msgData.attachmentText = processed.text; attachmentText = processed.text; }
          await prisma.message.update({ where: { id: userMsg.id }, data: msgData });
        } catch (e) {
          await refundCredits(userId, cost, "refund-bad-attachment");
          await prisma.message.delete({ where: { id: userMsg.id } }).catch(() => {});
          send("error", { error: (e as Error).message || "Could not read the attachment" });
          controller.close();
          return;
        }
      }
      send("message", { id: userMsg.id, role: "user", content: message, imageUrl: msgData.imagePath ? `/api/messages/${userMsg.id}/image` : undefined, attachmentName: msgData.attachmentName });

      // Carry the most recent earlier reference image into context so refinements still see it.
      const lastImageMsg = [...project.messages].reverse().find((m) => m.imagePath);
      const history: HistoryItem[] = await Promise.all(project.messages.map(async (m) => {
        const h: HistoryItem = { role: m.role === "user" ? "user" : "assistant", content: m.content, spec: (m.model?.spec as Spec | undefined) ?? null };
        if (m.attachmentText) h.attachmentText = m.attachmentText.slice(0, 3000);
        if (m.id === lastImageMsg?.id && m.imagePath && !image) {
          try { h.image = toDataUrl(await readFile(m.imagePath), m.imagePath.endsWith(".png") ? "image/png" : "image/jpeg"); } catch { /* ignore */ }
        }
        return h;
      }));

      try {
        const llm = createDeepSeekClient();
        const result = await runHarness(message, history, {
          llm,
          printer,
          image,
          attachmentText,
          onEvent: (e) => {
            if (e.type === "status") send("status", { text: e.text });
            if (e.type === "build" && e.ok) send("status", { text: `Built ${e.triangles} triangles · checking printability…` });
            if (e.type === "validation" && !e.ok) send("status", { text: "Fixing spec issues…" });
            if (e.type === "optimize") send("status", { text: e.kept === "optimized" ? `Optimised: print score ${e.before.toFixed(0)} → ${e.after.toFixed(0)}` : "Kept the original (optimisation did not improve it)" });
          },
        });

        let modelId: string | undefined;
        // A question-only reply (no new model) costs the chat rate, not the generation rate.
        if (!result.spec && cost > COST.chat) await refundCredits(userId, cost - COST.chat, "chat-only-adjust");
        if (result.spec && result.stl && result.blender && result.report && result.mesh) {
          const version = project.messages.filter((m) => m.modelId).length + 1;
          const model = await prisma.model.create({
            data: {
              userId,
              projectId,
              title: result.spec.name,
              description: result.spec.description,
              prompt: message,
              spec: result.spec as object,
              stats: { ...result.report.metrics, ok: result.report.ok, warnings: result.report.warnings, errors: result.report.errors, tips: result.report.tips, recommendedLayerHeight: result.report.recommendedLayerHeight, printer: result.report.printer, setup: { printerId: setup.printerId, nozzle: setup.nozzle, material: setup.material }, printNotes: result.spec.printNotes ?? null, attempts: result.attempts, llm: result.model } as object,
              stlPath: "pending",
              blenderPath: "pending",
              version,
              isPublic: isPublicByPlan,
            },
          });
          const stlPath = await saveFile(`models/${model.id}.stl`, result.stl);
          const blenderPath = await saveFile(`models/${model.id}.blender.py`, result.blender);
          await prisma.model.update({ where: { id: model.id }, data: { stlPath, blenderPath } });
          modelId = model.id;
          if (project.title === "Untitled project") {
            await prisma.project.update({ where: { id: projectId }, data: { title: result.spec.name } });
          }
        }

        const assistantMsg = await prisma.message.create({
          data: { projectId, role: "assistant", content: result.message, modelId },
        });
        await prisma.project.update({ where: { id: projectId }, data: { updatedAt: new Date() } });

        if (modelId) {
          const model = await prisma.model.findUnique({ where: { id: modelId } });
          send("model", { model });
        }
        send("message", { id: assistantMsg.id, role: "assistant", content: result.message, modelId });
        const u = await prisma.user.findUnique({ where: { id: userId }, select: { credits: true } });
        send("credits", { credits: u?.credits ?? 0 });
      } catch (e) {
        console.error("[chat] harness failed", e);
        await refundCredits(userId, cost, "refund-failed-generation");
        send("error", { error: "Generation failed, your credit was refunded. Please try again." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive" },
  });
}
