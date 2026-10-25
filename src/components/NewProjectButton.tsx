"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

export function NewProjectButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function create() {
    setBusy(true);
    const res = await fetch("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    setBusy(false);
    if (res.ok) {
      const p = await res.json();
      router.push(`/studio/${p.id}`);
    }
  }
  return <button onClick={create} disabled={busy} className="btn-primary"><Plus className="h-4 w-4" /> {busy ? "Creating…" : "New project"}</button>;
}
