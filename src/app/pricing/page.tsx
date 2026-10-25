import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PLANS } from "@/lib/plans";
import { UpgradeButton } from "@/components/UpgradeButton";

export const metadata = { title: "Pricing" };
export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const session = await auth();
  const user = session?.user?.id ? await prisma.user.findUnique({ where: { id: session.user.id }, select: { plan: true } }) : null;
  const billingReady = Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_STARTER && process.env.STRIPE_PRICE_PRO);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
      <h1 className="text-center text-4xl font-semibold">Pricing</h1>
      <p className="mt-3 text-center text-muted">One credit = one generation or one refinement. Unused monthly credits reset each cycle.</p>
      <div className="mt-12 grid gap-6 md:grid-cols-3">
        {(["FREE", "STARTER", "PRO"] as const).map((k) => {
          const p = PLANS[k];
          const isCurrent = user?.plan === k;
          return (
            <div key={k} className={`card relative p-7 ${k === "STARTER" ? "border-accent/60 shadow-2xl shadow-accent/10" : ""}`}>
              {k === "STARTER" && <span className="absolute -top-3 left-6 rounded-full bg-gradient-to-r from-accent to-accent-2 px-3 py-1 text-xs font-semibold text-white">Most popular</span>}
              <h2 className="text-lg font-medium">{p.name}</h2>
              <div className="mt-3 text-4xl font-semibold">${p.price}<span className="text-base font-normal text-muted">/{p.period}</span></div>
              <div className="mt-1 text-sm text-accent-2">{p.credits} credits{k === "FREE" ? "" : " / month"}</div>
              <p className="mt-3 text-sm text-muted">{p.blurb}</p>
              <ul className="mt-5 space-y-2 text-sm">{p.perks.map((x) => <li key={x} className="flex gap-2 text-muted"><span className="text-accent-2">✓</span>{x}</li>)}</ul>
              <div className="mt-7">
                {isCurrent ? (
                  <div className="btn-ghost w-full cursor-default">Current plan</div>
                ) : k === "FREE" ? (
                  <a href={session ? "/studio" : "/register"} className="btn-ghost w-full">{session ? "Included" : "Start free"}</a>
                ) : (
                  <UpgradeButton plan={k} signedIn={Boolean(session)} ready={billingReady} />
                )}
              </div>
            </div>
          );
        })}
      </div>
      {!billingReady && <p className="mt-8 text-center text-xs text-muted">Payments go live once Stripe keys are configured in the environment.</p>}
      <div className="card mt-14 grid gap-6 p-8 md:grid-cols-3">
        {[
          ["What is a credit?", "Each time the agent designs or modifies a model you spend one credit — regardless of how many repair iterations the harness needs internally."],
          ["Who owns the models, and are they private?", "You own them. Free-plan models are shared publicly in the gallery; Starter and Pro models stay private unless you publish them. Pro adds a commercial licence. Gallery models are shared under CC BY 4.0."],
          ["Can I cancel?", "Any time. You keep your remaining credits until the end of the billing cycle, then drop back to the free tier."],
        ].map(([q, a]) => (
          <div key={q}><h3 className="font-medium">{q}</h3><p className="mt-2 text-sm text-muted">{a}</p></div>
        ))}
      </div>
    </div>
  );
}
