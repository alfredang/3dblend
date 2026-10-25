/**
 * Subscription lifecycle on top of HitPay recurring billing.
 *
 *  checkout  → Subscription(PENDING) + HitPay billing → hosted page
 *  activate  → user.plan + credits, invoice #1              (return URL / webhook / sync)
 *  renewal   → invoice #n + credits reset                   (webhook / daily sync)
 *  cancel    → HitPay DELETE, stays ACTIVE until endsAt, then EXPIRED → Free
 */
import { prisma } from "@/lib/prisma";
import { PLANS } from "@/lib/plans";
import type { Plan, Prisma, Subscription } from "@prisma/client";
import { hitpay, todaySGT, type HitpayBilling } from "./hitpay";
import { appUrl } from "@/lib/utils";

export const CURRENCY = process.env.HITPAY_CURRENCY || "SGD";

export function planPrice(plan: Plan) {
  return PLANS[plan].price;
}

/** Create (once) and cache the HitPay subscription plan for a given plan/price. */
export async function ensureProviderPlan(plan: Plan) {
  const amount = planPrice(plan);
  const existing = await prisma.providerPlan.findUnique({ where: { provider_plan_amount_currency: { provider: "hitpay", plan, amount, currency: CURRENCY } } });
  if (existing) return existing.providerPlanId;
  const created = await hitpay.createPlan({
    name: `3DBlend ${PLANS[plan].name}`,
    description: `${PLANS[plan].credits} credits per month`,
    amount,
    currency: CURRENCY,
    reference: `3dblend-${plan.toLowerCase()}`,
  });
  await prisma.providerPlan.create({ data: { provider: "hitpay", plan, amount, currency: CURRENCY, providerPlanId: created.id } });
  return created.id;
}

/** Start a checkout: returns the HitPay hosted page URL. */
export async function startCheckout(userId: string, plan: Plan) {
  if (plan === "FREE") throw new Error("Cannot subscribe to the free plan");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const active = await prisma.subscription.findFirst({ where: { userId, status: "ACTIVE" } });
  if (active && active.plan === plan) throw new Error(`You already have an active ${PLANS[plan].name} subscription`);

  const providerPlanId = await ensureProviderPlan(plan);
  const sub = await prisma.subscription.create({
    data: { userId, plan, amount: planPrice(plan), currency: CURRENCY, providerPlanId, status: "PENDING" },
  });
  const billing = await hitpay.createBilling({
    plan_id: providerPlanId,
    customer_email: user.email,
    customer_name: user.name ?? undefined,
    start_date: todaySGT(),
    redirect_url: `${appUrl()}/api/billing/return?sid=${sub.id}`,
    reference: sub.id,
    webhook: `${appUrl()}/api/billing/webhook`,
    send_email: true,
  });
  await prisma.subscription.update({ where: { id: sub.id }, data: { providerBillingId: billing.id, raw: billing as object } });
  if (!billing.url) throw new Error("HitPay did not return a checkout URL");
  return { url: billing.url, subscriptionId: sub.id };
}

function addMonths(d: Date, n: number) {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
}

async function nextInvoiceNumber() {
  const ym = new Date().toISOString().slice(0, 7).replace("-", "");
  const count = await prisma.invoice.count({ where: { number: { startsWith: `INV-${ym}-` } } });
  return `INV-${ym}-${String(count + 1).padStart(4, "0")}`;
}

/**
 * Reconcile a subscription with HitPay's view of it. Idempotent: creates one
 * invoice per charge HitPay reports, activates/expires the plan accordingly.
 */
export async function syncSubscription(sub: Subscription, remote?: HitpayBilling) {
  if (!sub.providerBillingId) return sub;
  const r = remote ?? (await hitpay.getBilling(sub.providerBillingId));
  const status = String(r.status || "").toLowerCase();
  const timesCharged = Number(r.times_charged ?? 0);
  const invoices = await prisma.invoice.count({ where: { subscriptionId: sub.id } });

  // New successful charges → invoices + credits reset.
  for (let n = invoices; n < timesCharged; n++) {
    const periodStart = addMonths(sub.startDate ?? new Date(), n);
    const periodEnd = addMonths(periodStart, 1);
    await prisma.$transaction(async (tx) => {
      await tx.invoice.create({
        data: {
          number: await nextInvoiceNumber(),
          userId: sub.userId,
          subscriptionId: sub.id,
          plan: sub.plan,
          amount: sub.amount,
          currency: sub.currency,
          description: `3DBlend ${PLANS[sub.plan].name} plan — monthly subscription`,
          periodStart,
          periodEnd,
          paidAt: n === timesCharged - 1 ? new Date() : periodStart,
        },
      });
      await tx.user.update({ where: { id: sub.userId }, data: { plan: sub.plan, credits: PLANS[sub.plan].credits, creditsResetAt: new Date() } });
      await tx.creditTransaction.create({ data: { userId: sub.userId, delta: PLANS[sub.plan].credits, reason: `subscription-${sub.plan.toLowerCase()}-charge-${n + 1}` } });
    });
  }

  const isActive = status === "active" || (status === "scheduled" && timesCharged > 0) || status === "completed";
  const periodEnd = addMonths(sub.startDate ?? new Date(), Math.max(timesCharged, 1));
  const data: Prisma.SubscriptionUncheckedUpdateInput = { timesCharged, lastSyncedAt: new Date(), raw: r as object, currentPeriodEnd: periodEnd };
  if (sub.status === "PENDING" && isActive) {
    data.status = "ACTIVE";
    data.startDate = sub.startDate ?? new Date();
    // Cancel any other active subscription of this user (plan switch).
    await prisma.subscription.updateMany({ where: { userId: sub.userId, status: "ACTIVE", id: { not: sub.id } }, data: { status: "CANCELLED", cancelledAt: new Date(), endsAt: new Date() } });
    await prisma.user.update({ where: { id: sub.userId }, data: { plan: sub.plan } });
  } else if (sub.status === "ACTIVE" && (status === "cancelled" || status === "canceled")) {
    data.status = "CANCELLED";
    data.cancelledAt = sub.cancelledAt ?? new Date();
    data.endsAt = sub.endsAt ?? periodEnd;
  } else if (sub.status === "ACTIVE" && (status === "failed" || status === "inactive" || status === "past_due")) {
    data.status = "PAST_DUE";
  }
  return prisma.subscription.update({ where: { id: sub.id }, data });
}

/** Cancel at HitPay; access continues until the end of the paid period. */
export async function cancelSubscription(userId: string, subscriptionId: string) {
  const sub = await prisma.subscription.findFirst({ where: { id: subscriptionId, userId } });
  if (!sub) throw new Error("Subscription not found");
  if (sub.status !== "ACTIVE" && sub.status !== "PENDING" && sub.status !== "PAST_DUE") return sub;
  if (sub.providerBillingId) {
    try { await hitpay.cancelBilling(sub.providerBillingId); } catch (e) { console.warn("[billing] HitPay cancel:", (e as Error).message); }
  }
  const endsAt = sub.status === "PENDING" ? new Date() : sub.currentPeriodEnd ?? addMonths(sub.startDate ?? new Date(), Math.max(sub.timesCharged, 1));
  const updated = await prisma.subscription.update({ where: { id: sub.id }, data: { status: "CANCELLED", cancelledAt: new Date(), endsAt } });
  if (sub.status === "PENDING") await prisma.user.update({ where: { id: userId }, data: { plan: "FREE" } }).catch(() => {});
  return updated;
}

/** Daily: expire cancelled subscriptions whose paid period ended; sync active ones with HitPay. */
export async function reconcileSubscriptions() {
  const now = new Date();
  const ended = await prisma.subscription.findMany({ where: { status: "CANCELLED", endsAt: { lte: now } } });
  for (const s of ended) {
    await prisma.$transaction([
      prisma.subscription.update({ where: { id: s.id }, data: { status: "EXPIRED" } }),
      prisma.user.update({ where: { id: s.userId }, data: { plan: "FREE", credits: { set: 0 } } }),
    ]);
  }
  const live = await prisma.subscription.findMany({ where: { status: { in: ["ACTIVE", "PENDING", "PAST_DUE"] }, providerBillingId: { not: null } } });
  let synced = 0;
  for (const s of live) {
    try { await syncSubscription(s); synced++; } catch (e) { console.warn("[billing] sync failed", s.id, (e as Error).message); }
  }
  return { expired: ended.length, synced };
}
