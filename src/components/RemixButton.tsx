"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { GitFork } from "lucide-react";

export function RemixButton({ modelId }: { modelId: string }) {
  const router = useRouter();
  const { status } = useSession();
  const [busy, setBusy] = useState(false);
  async function remix() {
    if (status !== "authenticated") return router.push(`/login?next=/m/${modelId}`);
    setBusy(true);
    const res = await fetch(`/api/models/${modelId}/remix`, { method: "POST" });
    setBusy(false);
    if (res.ok) {
      const { projectId } = await res.json();
      router.push(`/studio/${projectId}`);
    }
  }
  return (
    <button onClick={remix} disabled={busy} className="btn-ghost !py-3"><GitFork className="h-4 w-4" /> {busy ? "Creating…" : "Remix in studio"}</button>
  );
}
