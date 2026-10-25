import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { cancelSubscription } from "@/lib/billing/subscriptions";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { subscriptionId } = await req.json().catch(() => ({}));
  if (typeof subscriptionId !== "string") return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  try {
    const sub = await cancelSubscription(session.user.id, subscriptionId);
    return NextResponse.json({ status: sub.status, endsAt: sub.endsAt });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
