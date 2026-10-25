"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function UpgradeButton({ plan, signedIn, ready }: { plan: "STARTER" | "PRO"; signedIn: boolean; ready: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function go() {
    if (!signedIn) return router.push("/login?next=/pricing");
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/billing/checkout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plan }) });
    const j = await res.json();
    setBusy(false);
    if (res.ok && j.url) window.location.href = j.url;
    else setMsg(j.error || "Checkout unavailable");
  }
  return (
    <div>
      <button onClick={go} disabled={busy || (signedIn && !ready)} className={`${plan === "STARTER" ? "btn-primary" : "btn-ghost"} w-full`}>
        {busy ? "Redirecting to HitPay…" : signedIn && !ready ? "Coming soon" : `Upgrade to ${plan === "STARTER" ? "Starter" : "Pro"}`}
      </button>
      {msg && <p className="mt-2 text-xs text-accent-3">{msg}</p>}
    </div>
  );
}
