import { NextResponse } from "next/server";
import { currentAdmin } from "@/lib/auth";
import { getConfig } from "@/lib/settings";
import { createDeepSeekClient } from "@/agent/llm";
import { hitpay } from "@/lib/billing/hitpay";
import { verifySmtp, sendTemplate } from "@/lib/email";

/** Body: { service: "ai" | "hitpay" | "smtp" | "smtp-send" } */
export async function POST(req: Request) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { service } = await req.json().catch(() => ({}));
  const t0 = Date.now();
  try {
    if (service === "ai") {
      const llm = createDeepSeekClient((await getConfig()).ai);
      const out = await llm.complete([{ role: "user", content: 'Reply with the single word "ok".' }], { maxTokens: 20 });
      return NextResponse.json({ ok: true, detail: `${llm.model} answered "${out.trim().slice(0, 40)}" in ${Date.now() - t0} ms` });
    }
    if (service === "hitpay") {
      await hitpay.ping();
      const { hitpay: cfg } = await getConfig();
      return NextResponse.json({ ok: true, detail: `Authenticated with HitPay ${cfg.sandbox ? "sandbox" : "production"} in ${Date.now() - t0} ms` });
    }
    if (service === "smtp") {
      await verifySmtp();
      return NextResponse.json({ ok: true, detail: `SMTP login verified in ${Date.now() - t0} ms` });
    }
    if (service === "smtp-send") {
      const r = await sendTemplate("test", admin.email, { name: "Admin" });
      return r.sent ? NextResponse.json({ ok: true, detail: `Test email sent to ${admin.email}` }) : NextResponse.json({ ok: false, error: r.reason }, { status: 400 });
    }
    return NextResponse.json({ error: "Unknown service" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
