/** Anti-spam helpers: Cloudflare Turnstile verification, honeypot, and a small in-memory rate limiter. */
import { getConfig } from "./settings";

const buckets = new Map<string, { count: number; reset: number }>();
/** Allow `limit` hits per `windowMs` per key (IP + action). Memory-only: fine for a single container. */
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) { buckets.set(key, { count: 1, reset: now + windowMs }); return true; }
  b.count++;
  return b.count <= limit;
}

export function clientIp(req: Request) {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0] : req.headers.get("x-real-ip") || "unknown").trim();
}

export async function turnstileEnabled() {
  const { security } = await getConfig();
  return Boolean(security.turnstileSiteKey && security.turnstileSecret);
}

/** Returns true when the token is valid, or when Turnstile is not configured. */
export async function verifyTurnstile(token: string | undefined, ip: string) {
  const { security } = await getConfig();
  if (!security.turnstileSecret) return true;
  if (!token) return false;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: security.turnstileSecret, response: token, remoteip: ip }),
    });
    const j = (await res.json()) as { success?: boolean };
    return Boolean(j.success);
  } catch {
    return false;
  }
}
