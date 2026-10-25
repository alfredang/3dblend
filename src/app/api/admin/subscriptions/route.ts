import { NextResponse } from "next/server";
import { currentAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { cancelSubscription, syncSubscription } from "@/lib/billing/subscriptions";

export async function PATCH(req: Request) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id, action } = await req.json().catch(() => ({}));
  const sub = await prisma.subscription.findUnique({ where: { id: String(id) } });
  if (!sub) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    if (action === "cancel") return NextResponse.json(await cancelSubscription(sub.userId, sub.id));
    if (action === "sync") return NextResponse.json(await syncSubscription(sub));
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
