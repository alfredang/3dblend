import { NextResponse } from "next/server";
import { z } from "zod";
import { currentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PLANS } from "@/lib/plans";

const schema = z.object({ id: z.string(), plan: z.enum(["FREE", "STARTER", "PRO"]).optional(), addCredits: z.number().int().min(-10000).max(10000).optional(), isAdmin: z.boolean().optional() });

export async function PATCH(req: Request) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { id, plan, addCredits, isAdmin } = parsed.data;
  if (isAdmin === false && id === admin.id) return NextResponse.json({ error: "You cannot revoke your own admin role" }, { status: 400 });
  const data: { plan?: typeof plan; isAdmin?: boolean; credits?: { increment: number } | number; creditsResetAt?: Date } = {};
  if (plan) { data.plan = plan; data.credits = PLANS[plan].credits; data.creditsResetAt = new Date(); }
  if (isAdmin !== undefined) data.isAdmin = isAdmin;
  if (addCredits) data.credits = { increment: addCredits };
  const user = await prisma.user.update({ where: { id }, data, select: { id: true, plan: true, credits: true, isAdmin: true } });
  if (addCredits) await prisma.creditTransaction.create({ data: { userId: id, delta: addCredits, reason: `admin-adjust:${admin.email}` } });
  if (plan) await prisma.creditTransaction.create({ data: { userId: id, delta: PLANS[plan].credits, reason: `admin-plan-${plan.toLowerCase()}` } });
  return NextResponse.json(user);
}
