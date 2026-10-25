import { NextResponse } from "next/server";
import { resetMonthlyCredits } from "@/lib/credits";
import { reconcileSubscriptions } from "@/lib/billing/subscriptions";

/** Hit daily from Coolify's scheduled tasks: curl -H "x-cron-secret: $CRON_SECRET" https://host/api/cron/reset-credits */
export async function GET(req: Request) {
  const secret = req.headers.get("x-cron-secret") ?? new URL(req.url).searchParams.get("secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) return new Response("Forbidden", { status: 403 });
  const billing = await reconcileSubscriptions();
  const n = await resetMonthlyCredits();
  return NextResponse.json({ reset: n, ...billing });
}
