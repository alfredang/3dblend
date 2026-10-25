import { prisma } from "@/lib/prisma";
import { verifyEventSignature, verifyLegacyHmac } from "@/lib/billing/hitpay";
import { syncSubscription } from "@/lib/billing/subscriptions";

export const runtime = "nodejs";

/**
 * Accepts both HitPay callback styles:
 *  1. Event webhooks (JSON + Hitpay-Signature, per-webhook salt HITPAY_WEBHOOK_SALT)
 *  2. Legacy recurring callbacks (form-encoded + hmac field, API-key salt HITPAY_SALT)
 * Either way we only use the payload to find the subscription, then re-sync from HitPay's API.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const ct = req.headers.get("content-type") || "";
  let billingId: string | undefined;
  let reference: string | undefined;
  let email: string | undefined;

  if (ct.includes("application/json")) {
    const salt = process.env.HITPAY_WEBHOOK_SALT;
    if (!salt || !verifyEventSignature(raw, req.headers.get("hitpay-signature"), salt)) return new Response("Invalid signature", { status: 401 });
    const body = JSON.parse(raw) as Record<string, unknown>;
    billingId = (body.recurring_billing_id as string) || ((body.recurring_billing as { id?: string } | undefined)?.id) || ((body.subscription as { id?: string } | undefined)?.id) || (req.headers.get("hitpay-event-object") === "recurring_billing" ? (body.id as string) : undefined);
    reference = (body.reference as string) || undefined;
    email = ((body.customer as { email?: string } | undefined)?.email) || undefined;
  } else {
    const params = Object.fromEntries(new URLSearchParams(raw)) as Record<string, string>;
    const salt = process.env.HITPAY_SALT;
    if (!salt || !verifyLegacyHmac(params, salt)) return new Response("Invalid hmac", { status: 401 });
    billingId = params.recurring_billing_id;
    reference = params.reference;
  }

  const sub =
    (billingId && (await prisma.subscription.findUnique({ where: { providerBillingId: billingId } }))) ||
    (reference && (await prisma.subscription.findUnique({ where: { id: reference } }))) ||
    (email && (await prisma.subscription.findFirst({ where: { user: { email }, status: { in: ["PENDING", "ACTIVE", "PAST_DUE"] } }, orderBy: { createdAt: "desc" } }))) ||
    null;
  if (!sub) return new Response("No matching subscription", { status: 200 });
  try {
    await syncSubscription(sub);
  } catch (e) {
    console.error("[billing] webhook sync", e);
    return new Response("Sync failed", { status: 500 });
  }
  return new Response("OK");
}
