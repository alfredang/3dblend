import crypto from "node:crypto";
import { prisma } from "./prisma";
import { getConfig } from "./settings";
import { sendTemplate, smtpConfigured } from "./email";
import { appUrl } from "./utils";

const TTL_MS = 24 * 3600 * 1000;

/** Issue a fresh verification token and email it. Returns whether the email was sent. */
export async function sendVerificationEmail(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, email: true, name: true, emailVerified: true } });
  if (user.emailVerified) return { sent: false, reason: "already verified" };
  await prisma.verificationToken.deleteMany({ where: { userId, type: "verify" } });
  const token = crypto.randomBytes(32).toString("base64url");
  await prisma.verificationToken.create({ data: { token, userId, type: "verify", expires: new Date(Date.now() + TTL_MS) } });
  const verify_url = `${appUrl()}/api/auth/verify?token=${token}`;
  return sendTemplate("verify_email", user.email, { name: user.name ?? "there", email: user.email, verify_url });
}

/** Whether sign-ups must verify email right now (setting on AND SMTP available to actually send the link). */
export async function verificationRequired() {
  const { security } = await getConfig();
  return security.requireEmailVerification && (await smtpConfigured());
}

export async function consumeVerificationToken(token: string) {
  const row = await prisma.verificationToken.findUnique({ where: { token } });
  if (!row || row.type !== "verify") return { ok: false as const, reason: "invalid" };
  if (row.expires < new Date()) { await prisma.verificationToken.delete({ where: { token } }).catch(() => {}); return { ok: false as const, reason: "expired" }; }
  await prisma.$transaction([
    prisma.user.update({ where: { id: row.userId }, data: { emailVerified: new Date() } }),
    prisma.verificationToken.deleteMany({ where: { userId: row.userId, type: "verify" } }),
  ]);
  return { ok: true as const, userId: row.userId };
}
