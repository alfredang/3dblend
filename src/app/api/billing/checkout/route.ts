import { NextResponse } from "next/server";
import Stripe from "stripe";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/utils";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { plan } = await req.json().catch(() => ({}));
  if (plan !== "STARTER" && plan !== "PRO") return NextResponse.json({ error: "Invalid plan" }, { status: 400 });

  const key = process.env.STRIPE_SECRET_KEY;
  const price = plan === "STARTER" ? process.env.STRIPE_PRICE_STARTER : process.env.STRIPE_PRICE_PRO;
  if (!key || !price) {
    return NextResponse.json({ error: "Billing is not configured yet. Set STRIPE_SECRET_KEY and price ids in the environment." }, { status: 503 });
  }
  const stripe = new Stripe(key);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.user.id } });
  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const c = await stripe.customers.create({ email: user.email, name: user.name ?? undefined, metadata: { userId: user.id } });
    customerId = c.id;
    await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } });
  }
  const checkout = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price, quantity: 1 }],
    success_url: `${appUrl()}/account?upgraded=1`,
    cancel_url: `${appUrl()}/pricing`,
    metadata: { userId: user.id, plan },
    subscription_data: { metadata: { userId: user.id, plan } },
  });
  return NextResponse.json({ url: checkout.url });
}
