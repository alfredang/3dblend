import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { PLANS } from "@/lib/plans";
import { notify } from "@/lib/email";
import { clientIp, rateLimit, verifyTurnstile } from "@/lib/security";
import { sendVerificationEmail, verificationRequired } from "@/lib/verification";

const schema = z.object({
  name: z.string().min(1).max(60),
  email: z.string().email(),
  password: z.string().min(8).max(100),
  turnstileToken: z.string().optional(),
  website: z.string().optional(), // honeypot — must stay empty
});

export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!rateLimit(`register:${ip}`, 5, 15 * 60 * 1000)) return NextResponse.json({ error: "Too many sign-ups from this network. Try again later." }, { status: 429 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { name, email, password, turnstileToken, website } = parsed.data;
  if (website) return NextResponse.json({ error: "Sign-up rejected" }, { status: 400 }); // bot filled the honeypot
  if (!(await verifyTurnstile(turnstileToken, ip))) return NextResponse.json({ error: "Bot check failed. Please reload the page and try again." }, { status: 400 });

  const lower = email.toLowerCase();
  const exists = await prisma.user.findUnique({ where: { email: lower } });
  if (exists) return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  const requireVerify = await verificationRequired();
  const user = await prisma.user.create({
    data: {
      name,
      email: lower,
      passwordHash: await bcrypt.hash(password, 10),
      credits: PLANS.FREE.credits,
      emailVerified: requireVerify ? null : new Date(),
      transactions: { create: { delta: PLANS.FREE.credits, reason: "signup-bonus" } },
    },
    select: { id: true },
  });
  if (requireVerify) {
    try {
      const r = await sendVerificationEmail(user.id);
      if (!r.sent) throw new Error(r.reason || "not sent");
      return NextResponse.json({ id: user.id, needsVerification: true });
    } catch (e) {
      console.error("[register] verification email failed:", (e as Error).message);
      // Do not strand the user if mail is down: verify now and let the admin know via logs.
      await prisma.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } });
    }
  }
  notify("welcome", lower, { name, email: lower, credits: PLANS.FREE.credits });
  return NextResponse.json({ id: user.id, needsVerification: false });
}
