import { NextResponse } from "next/server";
import { consumeVerificationToken } from "@/lib/verification";
import { prisma } from "@/lib/prisma";
import { notify } from "@/lib/email";
import { PLANS } from "@/lib/plans";
import { appUrl } from "@/lib/utils";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") || "";
  const r = await consumeVerificationToken(token);
  if (!r.ok) return NextResponse.redirect(`${appUrl()}/login?verify=${r.reason}`);
  const u = await prisma.user.findUnique({ where: { id: r.userId }, select: { email: true, name: true } });
  if (u) notify("welcome", u.email, { name: u.name ?? "there", email: u.email, credits: PLANS.FREE.credits });
  return NextResponse.redirect(`${appUrl()}/login?verified=1`);
}
