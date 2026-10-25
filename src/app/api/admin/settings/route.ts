import { NextResponse } from "next/server";
import { currentAdmin } from "@/lib/auth";
import { describeSettings, saveSettings } from "@/lib/settings";

export async function GET() {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ settings: await describeSettings() });
}

/** Body: { entries: [{ key, value }] } — empty/null value clears the DB override (falls back to env). Secrets left as "" are untouched. */
export async function PUT(req: Request) {
  const admin = await currentAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (!body || !Array.isArray(body.entries)) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const entries = (body.entries as { key: string; value: string | null; clear?: boolean }[])
    .filter((e) => typeof e.key === "string")
    .map((e) => ({ key: e.key, value: e.clear ? null : typeof e.value === "string" ? e.value.trim() : null }))
    .filter((e) => e.value !== "" || e.value === null); // "" means "no change" for secrets; handled below
  await saveSettings(entries.filter((e) => e.value !== null || body.entries.find((x: { key: string; clear?: boolean }) => x.key === e.key)?.clear), admin.email);
  return NextResponse.json({ settings: await describeSettings() });
}
