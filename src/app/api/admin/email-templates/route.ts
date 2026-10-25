import { NextResponse } from "next/server";
import { currentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TEMPLATE_DEFS, getTemplate } from "@/lib/email";

export async function GET() {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const templates = await Promise.all(TEMPLATE_DEFS.map((t) => getTemplate(t.key)));
  return NextResponse.json({ templates });
}

/** Body: { key, subject, body, enabled } or { key, reset: true } */
export async function PUT(req: Request) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const b = await req.json().catch(() => null);
  if (!b || !TEMPLATE_DEFS.some((t) => t.key === b.key)) return NextResponse.json({ error: "Unknown template" }, { status: 400 });
  if (b.reset) await prisma.emailTemplate.deleteMany({ where: { key: b.key } });
  else {
    if (typeof b.subject !== "string" || typeof b.body !== "string") return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    await prisma.emailTemplate.upsert({ where: { key: b.key }, update: { subject: b.subject, body: b.body, enabled: b.enabled !== false }, create: { key: b.key, subject: b.subject, body: b.body, enabled: b.enabled !== false } });
  }
  return NextResponse.json({ template: await getTemplate(b.key) });
}
