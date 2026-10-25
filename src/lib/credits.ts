import { prisma } from "./prisma";
import { PLANS } from "./plans";

export class InsufficientCreditsError extends Error {
  constructor() {
    super("Not enough credits");
    this.name = "InsufficientCreditsError";
  }
}

/** Atomically deduct credits; throws if the balance is too low. */
export async function spendCredits(userId: string, amount: number, reason: string) {
  const res = await prisma.user.updateMany({
    where: { id: userId, credits: { gte: amount } },
    data: { credits: { decrement: amount } },
  });
  if (res.count === 0) throw new InsufficientCreditsError();
  await prisma.creditTransaction.create({ data: { userId, delta: -amount, reason } });
}

export async function refundCredits(userId: string, amount: number, reason: string) {
  await prisma.user.update({ where: { id: userId }, data: { credits: { increment: amount } } });
  await prisma.creditTransaction.create({ data: { userId, delta: amount, reason } });
}

/** Monthly top-up for paid plans. Called by the cron endpoint. */
export async function resetMonthlyCredits() {
  const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const due = await prisma.user.findMany({
    where: { plan: { in: ["STARTER", "PRO"] }, creditsResetAt: { lte: cutoff } },
    select: { id: true, plan: true },
  });
  for (const u of due) {
    const credits = PLANS[u.plan].credits;
    await prisma.$transaction([
      prisma.user.update({ where: { id: u.id }, data: { credits, creditsResetAt: new Date() } }),
      prisma.creditTransaction.create({ data: { userId: u.id, delta: credits, reason: "monthly-reset" } }),
    ]);
  }
  return due.length;
}
