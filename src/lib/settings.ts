/**
 * Integration settings: stored in the Setting table (admin-editable), falling
 * back to environment variables. Secrets are encrypted at rest with a key
 * derived from AUTH_SECRET. A short in-process cache keeps reads cheap.
 */
import crypto from "node:crypto";
import { prisma } from "./prisma";

export interface SettingDef { key: string; env?: string; secret?: boolean; label: string; help?: string; group: "ai" | "hitpay" | "smtp" | "general"; type?: "text" | "password" | "number" | "boolean" | "select"; options?: string[]; default?: string }

export const SETTING_DEFS: SettingDef[] = [
  { key: "ai.apiKey", env: "DEEPSEEK_API_KEY", secret: true, label: "DeepSeek API key", group: "ai", type: "password" },
  { key: "ai.baseUrl", env: "DEEPSEEK_BASE_URL", label: "API base URL", group: "ai", default: "https://api.deepseek.com" },
  { key: "ai.model", env: "DEEPSEEK_MODEL", label: "Model id", group: "ai", default: "deepseek-flash", help: "deepseek-flash = DeepSeek V4.1 Flash" },
  { key: "ai.thinking", env: "DEEPSEEK_THINKING", label: "Thinking mode", group: "ai", type: "boolean", default: "0", help: "Keep off: thinking mode returns empty output for geometry prompts" },
  { key: "hitpay.apiKey", env: "HITPAY_API_KEY", secret: true, label: "HitPay API key", group: "hitpay", type: "password" },
  { key: "hitpay.salt", env: "HITPAY_SALT", secret: true, label: "API-key salt", group: "hitpay", type: "password", help: "Developers page salt; verifies legacy callbacks" },
  { key: "hitpay.webhookSalt", env: "HITPAY_WEBHOOK_SALT", secret: true, label: "Webhook salt", group: "hitpay", type: "password", help: "Per-webhook salt from Developers → Webhooks" },
  { key: "hitpay.sandbox", env: "HITPAY_SANDBOX", label: "Sandbox mode", group: "hitpay", type: "boolean", default: "1" },
  { key: "hitpay.currency", env: "HITPAY_CURRENCY", label: "Currency", group: "hitpay", default: "SGD", options: ["SGD", "USD", "MYR"], type: "select" },
  { key: "smtp.host", env: "SMTP_HOST", label: "SMTP host", group: "smtp" },
  { key: "smtp.port", env: "SMTP_PORT", label: "SMTP port", group: "smtp", type: "number", default: "587" },
  { key: "smtp.secure", env: "SMTP_SECURE", label: "Use TLS (port 465)", group: "smtp", type: "boolean", default: "0" },
  { key: "smtp.user", env: "SMTP_USER", label: "SMTP username", group: "smtp" },
  { key: "smtp.pass", env: "SMTP_PASS", secret: true, label: "SMTP password", group: "smtp", type: "password" },
  { key: "smtp.fromName", env: "SMTP_FROM_NAME", label: "From name", group: "smtp", default: "3DBlend" },
  { key: "smtp.fromEmail", env: "SMTP_FROM_EMAIL", label: "From email", group: "smtp" },
  { key: "smtp.replyTo", env: "SMTP_REPLY_TO", label: "Reply-to", group: "smtp" },
  { key: "general.supportEmail", label: "Support email (shown in emails)", group: "general", default: "enquiry@tertiaryinfotech.com" },
];

const ENC_PREFIX = "enc:v1:";
function encKey() {
  const secret = process.env.AUTH_SECRET || "dev-secret";
  return crypto.createHash("sha256").update(`3dblend-settings:${secret}`).digest();
}
export function encrypt(plain: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ENC_PREFIX + Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64");
}
export function decrypt(stored: string) {
  if (!stored.startsWith(ENC_PREFIX)) return stored;
  const buf = Buffer.from(stored.slice(ENC_PREFIX.length), "base64");
  const iv = buf.subarray(0, 12), tag = buf.subarray(12, 28), data = buf.subarray(28);
  const d = crypto.createDecipheriv("aes-256-gcm", encKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString("utf8");
}

let cache: { at: number; values: Map<string, string> } | null = null;
const TTL = 15_000;

async function loadAll(): Promise<Map<string, string>> {
  if (cache && Date.now() - cache.at < TTL) return cache.values;
  const rows = await prisma.setting.findMany().catch(() => []);
  const values = new Map<string, string>();
  for (const r of rows) values.set(r.key, r.secret ? safeDecrypt(r.value) : r.value);
  cache = { at: Date.now(), values };
  return values;
}
function safeDecrypt(v: string) { try { return decrypt(v); } catch { return ""; } }
export function invalidateSettingsCache() { cache = null; }

/** Effective value: DB override → env → default. Empty strings count as unset. */
export async function getSetting(key: string): Promise<string> {
  const def = SETTING_DEFS.find((d) => d.key === key);
  const db = (await loadAll()).get(key);
  if (db !== undefined && db !== "") return db;
  if (def?.env && process.env[def.env]) return process.env[def.env] as string;
  return def?.default ?? "";
}

export async function getConfig() {
  const g = getSetting;
  return {
    ai: { apiKey: await g("ai.apiKey"), baseUrl: await g("ai.baseUrl"), model: await g("ai.model"), thinking: (await g("ai.thinking")) === "1" },
    hitpay: { apiKey: await g("hitpay.apiKey"), salt: await g("hitpay.salt"), webhookSalt: await g("hitpay.webhookSalt"), sandbox: (await g("hitpay.sandbox")) !== "0", currency: await g("hitpay.currency") },
    smtp: { host: await g("smtp.host"), port: Number(await g("smtp.port")) || 587, secure: (await g("smtp.secure")) === "1", user: await g("smtp.user"), pass: await g("smtp.pass"), fromName: await g("smtp.fromName"), fromEmail: await g("smtp.fromEmail"), replyTo: await g("smtp.replyTo") },
    general: { supportEmail: await g("general.supportEmail") },
  };
}
export type AppConfig = Awaited<ReturnType<typeof getConfig>>;

/** Admin view: values with secrets masked, plus where each value comes from. */
export async function describeSettings() {
  const db = await prisma.setting.findMany();
  const byKey = new Map(db.map((r) => [r.key, r]));
  return SETTING_DEFS.map((d) => {
    const row = byKey.get(d.key);
    const dbVal = row ? (row.secret ? safeDecrypt(row.value) : row.value) : "";
    const envVal = d.env ? process.env[d.env] ?? "" : "";
    const effective = dbVal || envVal || d.default || "";
    const source = dbVal ? "database" : envVal ? "environment" : d.default ? "default" : "unset";
    return { ...d, source, isSet: Boolean(effective), value: d.secret ? mask(effective) : effective, updatedAt: row?.updatedAt?.toISOString() ?? null, updatedBy: row?.updatedBy ?? null };
  });
}
export function mask(v: string) { return v ? (v.length > 8 ? `••••••••${v.slice(-4)}` : "••••••••") : ""; }

export async function saveSettings(entries: { key: string; value: string | null }[], by: string) {
  for (const { key, value } of entries) {
    const def = SETTING_DEFS.find((d) => d.key === key);
    if (!def) continue;
    if (value === null || value === "") { await prisma.setting.deleteMany({ where: { key } }); continue; }
    const stored = def.secret ? encrypt(value) : value;
    await prisma.setting.upsert({ where: { key }, update: { value: stored, secret: Boolean(def.secret), updatedBy: by }, create: { key, value: stored, secret: Boolean(def.secret), updatedBy: by } });
  }
  invalidateSettingsCache();
}
