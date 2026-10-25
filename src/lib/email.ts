/** Transactional email via SMTP (nodemailer) with admin-editable templates. Best effort: never throws into business flows. */
import nodemailer from "nodemailer";
import { prisma } from "./prisma";
import { getConfig } from "./settings";
import { appUrl } from "./utils";

export interface TemplateDef { key: string; name: string; description: string; variables: string[]; subject: string; body: string }

const LAYOUT = (inner: string, supportEmail: string) => `<!doctype html><html><body style="margin:0;background:#f5f6fa;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#11142a">
<div style="max-width:560px;margin:24px auto;background:#fff;border:1px solid #e3e6ef;border-radius:16px;overflow:hidden">
<div style="padding:20px 28px;border-bottom:1px solid #e3e6ef;font-weight:700;font-size:18px"><span style="color:#6b4cff">3D</span>Blend</div>
<div style="padding:24px 28px;font-size:15px;line-height:1.55">${inner}</div>
<div style="padding:16px 28px;border-top:1px solid #e3e6ef;font-size:12px;color:#5e6578">Questions? Email <a href="mailto:${supportEmail}" style="color:#6b4cff">${supportEmail}</a>. Tertiary Infotech Academy Pte Ltd · UEN 201200696W</div>
</div></body></html>`;

export const TEMPLATE_DEFS: TemplateDef[] = [
  { key: "welcome", name: "Welcome", description: "Sent after sign-up.", variables: ["name", "email", "credits", "app_url", "studio_url"],
    subject: "Welcome to 3DBlend — {{credits}} credits are waiting",
    body: `<p>Hi {{name}},</p><p>Your 3DBlend account is ready with <b>{{credits}} free credits</b>: that's one model plus five edits.</p><p><a href="{{studio_url}}" style="display:inline-block;background:#6b4cff;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none">Open the studio</a></p><p>Describe what you want to print, preview it in 3D, and download the STL, 3MF or Blender script.</p>` },
  { key: "subscription_activated", name: "Subscription activated", description: "Sent when a HitPay subscription becomes active.", variables: ["name", "plan", "credits", "amount", "currency", "next_renewal", "account_url"],
    subject: "Your 3DBlend {{plan}} plan is active",
    body: `<p>Hi {{name}},</p><p>Thanks for subscribing to <b>3DBlend {{plan}}</b>. {{credits}} credits have been added to your account and will renew every month.</p><p>Amount: <b>{{currency}} {{amount}}</b> / month · Next renewal: {{next_renewal}}</p><p><a href="{{account_url}}" style="color:#6b4cff">Manage your subscription and invoices</a></p>` },
  { key: "invoice", name: "Invoice / payment receipt", description: "Sent for every successful charge; the PDF invoice is attached.", variables: ["name", "plan", "invoice_number", "amount", "currency", "period_start", "period_end", "paid_at", "account_url"],
    subject: "3DBlend invoice {{invoice_number}} — {{currency}} {{amount}} paid",
    body: `<p>Hi {{name}},</p><p>We received your payment of <b>{{currency}} {{amount}}</b> for the 3DBlend {{plan}} plan ({{period_start}} to {{period_end}}).</p><p>Invoice <b>{{invoice_number}}</b> is attached as a PDF and is always available in <a href="{{account_url}}" style="color:#6b4cff">your account</a>.</p>` },
  { key: "subscription_cancelled", name: "Subscription cancelled", description: "Sent when a user cancels.", variables: ["name", "plan", "ends_at", "pricing_url"],
    subject: "Your 3DBlend {{plan}} subscription has been cancelled",
    body: `<p>Hi {{name}},</p><p>Your {{plan}} subscription is cancelled. You keep full access until <b>{{ends_at}}</b>; after that your account returns to the Free plan and no further charges will be made.</p><p>Changed your mind? <a href="{{pricing_url}}" style="color:#6b4cff">Resubscribe any time</a>.</p>` },
  { key: "test", name: "Test email", description: "Used by the “Send test email” button.", variables: ["name", "app_url"],
    subject: "3DBlend SMTP test",
    body: `<p>Hi {{name}},</p><p>This is a test email from <a href="{{app_url}}">3DBlend</a>. If you can read this, SMTP is configured correctly.</p>` },
];

export async function getTemplate(key: string) {
  const def = TEMPLATE_DEFS.find((t) => t.key === key);
  if (!def) throw new Error(`Unknown template ${key}`);
  const row = await prisma.emailTemplate.findUnique({ where: { key } }).catch(() => null);
  return { ...def, subject: row?.subject ?? def.subject, body: row?.body ?? def.body, enabled: row?.enabled ?? true, customised: Boolean(row) };
}

export function render(tpl: string, vars: Record<string, string | number | undefined>) {
  return tpl.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, k: string) => String(vars[k] ?? ""));
}

export async function smtpConfigured() {
  const { smtp } = await getConfig();
  return Boolean(smtp.host && smtp.fromEmail);
}

export async function sendTemplate(key: string, to: string, vars: Record<string, string | number | undefined>, attachments?: { filename: string; content: Buffer; contentType?: string }[]) {
  const cfg = await getConfig();
  if (!cfg.smtp.host || !cfg.smtp.fromEmail) return { sent: false, reason: "SMTP not configured" };
  const t = await getTemplate(key);
  if (!t.enabled) return { sent: false, reason: "template disabled" };
  const base = { app_url: appUrl(), studio_url: `${appUrl()}/studio`, account_url: `${appUrl()}/account`, pricing_url: `${appUrl()}/pricing`, support_email: cfg.general.supportEmail, ...vars };
  const transporter = nodemailer.createTransport({ host: cfg.smtp.host, port: cfg.smtp.port, secure: cfg.smtp.secure, auth: cfg.smtp.user ? { user: cfg.smtp.user, pass: cfg.smtp.pass } : undefined });
  const info = await transporter.sendMail({
    from: `"${cfg.smtp.fromName || "3DBlend"}" <${cfg.smtp.fromEmail}>`,
    to,
    replyTo: cfg.smtp.replyTo || undefined,
    subject: render(t.subject, base),
    html: LAYOUT(render(t.body, base), cfg.general.supportEmail),
    attachments,
  });
  return { sent: true, id: info.messageId };
}

/** Fire-and-forget wrapper used from business flows. */
export function notify(key: string, to: string, vars: Record<string, string | number | undefined>, attachments?: { filename: string; content: Buffer; contentType?: string }[]) {
  sendTemplate(key, to, vars, attachments).then((r) => { if (!r.sent) console.info(`[email] ${key} not sent: ${r.reason}`); }).catch((e) => console.warn(`[email] ${key} failed:`, (e as Error).message));
}

export async function verifySmtp() {
  const cfg = await getConfig();
  if (!cfg.smtp.host) throw new Error("SMTP host is not set");
  const transporter = nodemailer.createTransport({ host: cfg.smtp.host, port: cfg.smtp.port, secure: cfg.smtp.secure, auth: cfg.smtp.user ? { user: cfg.smtp.user, pass: cfg.smtp.pass } : undefined });
  await transporter.verify();
  return true;
}
