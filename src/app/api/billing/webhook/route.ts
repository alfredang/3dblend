import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { PLANS } from "@/lib/plans";
import type { Plan } from "@prisma/client";

export async function POST(req: Request) {
  const key = process.env.STRIPE_SECRET_KEY;
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!key || !secret) return new Response("Billing not configured", { status: 503 });
  const stripe = new Stripe(key);
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("Missing signature", { status: 400 });
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await req.text(), sig, secret);
  } catch {
    return new Response("Bad signature", { status: 400 });
  }

  const grant = async (userId: string, plan: Plan, subId?: string) => {
    const credits = PLANS[plan].credits;
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { plan, credits, creditsResetAt: new Date(), stripeSubId: subId } }),
      prisma.creditTransaction.create({ data: { userId, delta: credits, reason: `plan-${plan.toLowerCase()}` } }),
    ]);
  };

  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object;
      const userId = s.metadata?.userId;
      const plan = s.metadata?.plan as Plan | undefined;
      if (userId && (plan === "STARTER" || plan === "PRO")) await grant(userId, plan, typeof s.subscription === "string" ? s.subscription : undefined);
      break;
    }
    case "invoice.paid": {
      const inv = event.data.object as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null };
      const subId = typeof inv.subscription === "string" ? inv.subscription : inv.subscription?.id;
      if (subId && inv.billing_reason === "subscription_cycle") {
        const user = await prisma.user.findUnique({ where: { stripeSubId: subId } });
        if (user && user.plan !== "FREE") await grant(user.id, user.plan, subId);
      }
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object;
      await prisma.user.updateMany({ where: { stripeSubId: sub.id }, data: { plan: "FREE", stripeSubId: null } });
      break;
    }
  }
  return new Response("ok");
}
