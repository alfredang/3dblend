import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncSubscription } from "@/lib/billing/subscriptions";
import { appUrl } from "@/lib/utils";

/** HitPay redirects here after the hosted page (query: reference, status). We verify with HitPay's API, never the query string. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const sid = url.searchParams.get("sid") || url.searchParams.get("reference");
  const session = await auth();
  if (!sid || !session?.user?.id) return NextResponse.redirect(`${appUrl()}/account?checkout=unknown`);
  const sub = await prisma.subscription.findFirst({ where: { id: sid, userId: session.user.id } });
  if (!sub) return NextResponse.redirect(`${appUrl()}/account?checkout=unknown`);
  try {
    const updated = await syncSubscription(sub);
    return NextResponse.redirect(`${appUrl()}/account?checkout=${updated.status === "ACTIVE" ? "success" : "pending"}`);
  } catch (e) {
    console.error("[billing] return sync", e);
    return NextResponse.redirect(`${appUrl()}/account?checkout=pending`);
  }
}
