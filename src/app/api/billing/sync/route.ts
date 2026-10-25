import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncSubscription } from "@/lib/billing/subscriptions";

/** Lets the account page re-check a pending subscription with HitPay. */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const subs = await prisma.subscription.findMany({ where: { userId: session.user.id, status: { in: ["PENDING", "ACTIVE", "PAST_DUE"] }, providerBillingId: { not: null } } });
  const out = [];
  for (const s of subs) { try { out.push((await syncSubscription(s)).status); } catch (e) { out.push(`error: ${(e as Error).message}`); } }
  return NextResponse.json({ results: out });
}
