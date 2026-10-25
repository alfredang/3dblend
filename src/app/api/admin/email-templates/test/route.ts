import { NextResponse } from "next/server";
import { currentAdmin } from "@/lib/auth";
import { sendTemplate } from "@/lib/email";

const SAMPLE: Record<string, string | number> = { name: "Alex Maker", email: "alex@example.com", credits: 100, plan: "Starter", amount: "9.00", currency: "SGD", invoice_number: "INV-202610-0042", period_start: "2026-10-25", period_end: "2026-11-25", paid_at: "2026-10-25", next_renewal: "2026-11-25", ends_at: "2026-11-25" };

/** Body: { key } — sends the template with sample data to the admin's own address. */
export async function POST(req: Request) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { key } = await req.json().catch(() => ({}));
  try {
    const r = await sendTemplate(String(key), admin.email, SAMPLE);
    return r.sent ? NextResponse.json({ ok: true, detail: `Sent to ${admin.email}` }) : NextResponse.json({ ok: false, error: r.reason }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }
}
