import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { spendCredits, refundCredits, InsufficientCreditsError } from "@/lib/credits";
import { COST } from "@/lib/plans";
import { saveFile } from "@/lib/storage";
import { runHarness, type HistoryItem, type Spec } from "@/agent";
import { createDeepSeekClient } from "@/agent/llm";
import { z } from "zod";

export const runtime = "nodejs";
export const maxDuration = 300;

const schema = z.object({ projectId: z.string(), message: z.string().min(1).max(4000) });

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
  const { projectId, message } = parsed.data;

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    include: { messages: { orderBy: { createdAt: "asc" }, include: { model: { select: { spec: true } } } } },
  });
  if (!project) return new Response("Not found", { status: 404 });

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

      const userMsg = await prisma.message.create({ data: { projectId, role: "user", content: message } });
      send("message", { id: userMsg.id, role: "user", content: message });

      const history: HistoryItem[] = project.messages.map((m) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.content,
        spec: (m.model?.spec as Spec | undefined) ?? null,
      }));

      try {
        const llm = createDeepSeekClient();
        const result = await runHarness(message, history, {
          llm,
          onEvent: (e) => {
            if (e.type === "status") send("status", { text: e.text });
            if (e.type === "build" && e.ok) send("status", { text: `Built ${e.triangles} triangles · checking printability…` });
            if (e.type === "validation" && !e.ok) send("status", { text: "Fixing spec issues…" });
          },
        });

        let modelId: string | undefined;
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
              stats: { ...result.report.metrics, ok: result.report.ok, warnings: result.report.warnings, errors: result.report.errors, printNotes: result.spec.printNotes ?? null, attempts: result.attempts, llm: result.model } as object,
              stlPath: "pending",
              blenderPath: "pending",
              version,
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
