import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { hitpayConfigured } from "@/lib/billing/hitpay";
import { startCheckout } from "@/lib/billing/subscriptions";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { plan } = await req.json().catch(() => ({}));
  if (plan !== "STARTER" && plan !== "PRO") return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  if (!hitpayConfigured()) return NextResponse.json({ error: "Payments are not configured yet (HITPAY_API_KEY missing)." }, { status: 503 });
  try {
    const { url } = await startCheckout(session.user.id, plan);
    return NextResponse.json({ url });
  } catch (e) {
    console.error("[billing] checkout", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
