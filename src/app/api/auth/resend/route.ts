import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clientIp, rateLimit } from "@/lib/security";
import { sendVerificationEmail } from "@/lib/verification";

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!rateLimit(`resend:${ip}`, 5, 15 * 60 * 1000)) return NextResponse.json({ error: "Too many requests. Try again later." }, { status: 429 });
  const { email } = await req.json().catch(() => ({}));
  if (typeof email !== "string") return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() }, select: { id: true, emailVerified: true } });
  // Always answer the same way so the endpoint cannot be used to probe accounts.
  if (user && !user.emailVerified) { try { await sendVerificationEmail(user.id); } catch (e) { console.warn("[resend]", (e as Error).message); } }
  return NextResponse.json({ ok: true, message: "If that address needs verification, a new link is on its way." });
}
