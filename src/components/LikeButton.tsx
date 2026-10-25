"use client";
import { useState } from "react";
import { ThumbsUp } from "lucide-react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

export function LikeButton({ modelId, initialCount, initialLiked, compact }: { modelId: string; initialCount: number; initialLiked: boolean; compact?: boolean }) {
  const { status } = useSession();
  const router = useRouter();
  const [count, setCount] = useState(initialCount);
  const [liked, setLiked] = useState(initialLiked);
  const [busy, setBusy] = useState(false);

  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (status !== "authenticated") return router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
    if (busy) return;
    setBusy(true);
    setLiked(!liked);
    setCount((c) => c + (liked ? -1 : 1));
    const res = await fetch(`/api/models/${modelId}/like`, { method: "POST" });
    if (res.ok) {
      const j = await res.json();
      setLiked(j.liked);
      setCount(j.likesCount);
    } else {
      setLiked(liked);
      setCount(count);
    }
    setBusy(false);
  }

  return (
    <button
      onClick={toggle}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition",
        liked ? "border-accent bg-accent/20 text-accent" : "border-line bg-elev text-muted hover:text-fg",
        compact && "px-2 py-1",
      )}
      aria-pressed={liked}
      title={liked ? "Unlike" : "Thumbs up"}
    >
      <ThumbsUp className={cn("h-3.5 w-3.5", liked && "fill-current")} />
      {count}
    </button>
  );
}
