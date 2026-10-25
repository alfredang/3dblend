/**
 * Minimal HitPay client (recurring billing). Docs: https://docs.hitpayapp.com/apis/guide/recurring-billing
 * Sandbox: https://api.sandbox.hit-pay.com — set HITPAY_SANDBOX=1.
 */
import crypto from "node:crypto";
import { getConfig } from "@/lib/settings";

export async function hitpayConfigured() {
  return Boolean((await getConfig()).hitpay.apiKey);
}

export function hitpayBase(sandbox: boolean) {
  return sandbox ? "https://api.sandbox.hit-pay.com" : "https://api.hit-pay.com";
}

async function call<T>(method: string, path: string, body?: Record<string, unknown>): Promise<T> {
  const { hitpay: cfg } = await getConfig();
  const key = cfg.apiKey;
  if (!key) throw new Error("HitPay API key is not set (Admin → Integrations)");
  const res = await fetch(`${hitpayBase(cfg.sandbox)}/v1${path}`, {
    method,
    headers: { "X-BUSINESS-API-KEY": key, "X-Requested-With": "XMLHttpRequest", "Content-Type": "application/json", Accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  if (!res.ok) {
    const msg = (json as { message?: string } | null)?.message || text || res.statusText;
    throw new Error(`HitPay ${method} ${path} failed (${res.status}): ${msg}`);
  }
  return json as T;
}

export interface HitpayPlan { id: string; name: string; cycle: string; currency: string; amount: number; reference?: string }
export interface HitpayBilling {
  id: string;
  business_recurring_plans_id?: string;
  customer_email?: string;
  customer_name?: string;
  reference?: string;
  cycle?: string;
  currency?: string;
  amount?: number;
  price?: number;
  times_to_be_charged?: number | null;
  times_charged?: number;
  status: string; // scheduled | active | cancelled | completed | failed ...
  url?: string;
  start_date?: string;
  next_charge_date?: string;
  [k: string]: unknown;
}

export const hitpay = {
  createPlan: (p: { name: string; description?: string; amount: number; currency: string; reference?: string }) =>
    call<HitpayPlan>("POST", "/subscription-plan", { ...p, cycle: "monthly" }),
  createBilling: (p: {
    plan_id: string; customer_email: string; customer_name?: string; start_date: string; redirect_url: string; reference: string; webhook?: string; send_email?: boolean;
  }) => call<HitpayBilling>("POST", "/recurring-billing", { ...p, send_email: p.send_email ?? true }),
  getBilling: (id: string) => call<HitpayBilling>("GET", `/recurring-billing/${id}`),
  cancelBilling: (id: string) => call<HitpayBilling>("DELETE", `/recurring-billing/${id}`),
  /** Connectivity check used by the admin "Test" button. */
  ping: () => call<unknown>("GET", "/subscription-plan?per_page=1"),
};

/** Today's date in Singapore time as YYYY-MM-DD (HitPay start_date is in SGT). */
export function todaySGT() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** Legacy callback signature: HMAC-SHA256 over sorted `key+value` pairs (all fields except hmac), with the API-key salt. */
export function verifyLegacyHmac(params: Record<string, string>, salt: string) {
  const { hmac, ...rest } = params;
  if (!hmac) return false;
  const src = Object.keys(rest).sort().map((k) => `${k}${rest[k]}`).join("");
  const computed = crypto.createHmac("sha256", salt).update(src).digest("hex");
  return safeEqual(computed, hmac);
}

/** Event-webhook signature: HMAC-SHA256 over the raw JSON body with the per-webhook salt (Hitpay-Signature header). */
export function verifyEventSignature(rawBody: string, signature: string | null, salt: string) {
  if (!signature) return false;
  const computed = crypto.createHmac("sha256", salt).update(rawBody).digest("hex");
  return safeEqual(computed, signature);
}

function safeEqual(a: string, b: string) {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}
