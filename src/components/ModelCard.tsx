"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Download, Eye } from "lucide-react";
import { ModelViewer } from "./ModelViewer";
import { LikeButton } from "./LikeButton";
import { formatNumber, colorFor } from "@/lib/utils";

export interface ModelCardData {
  id: string;
  title: string;
  description: string;
  likesCount: number;
  downloads: number;
  views: number;
  liked: boolean;
  featured?: boolean;
  size?: [number, number, number];
  author?: string | null;
  createdAt?: string;
}

export function ModelCard({ model }: { model: ModelCardData }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <Link
      href={`/m/${model.id}`}
      className="card group block overflow-hidden transition hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-xl hover:shadow-accent/10"
    >
      <div ref={ref} className="relative aspect-[4/3] bg-[var(--viewer-bg)]">
        {visible ? (
          <ModelViewer url={`/api/models/${model.id}/stl`} size={model.size} color={colorFor(model.id)} autoRotate interactive={false} frameloop="always" className="h-full w-full" />
        ) : (
          <div className="h-full w-full animate-pulse bg-elev" />
        )}
        {model.featured && (
          <span className="absolute left-3 top-3 rounded-full bg-gradient-to-r from-accent to-accent-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">Featured</span>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-medium">{model.title}</h3>
            <p className="mt-0.5 line-clamp-2 text-xs text-muted">{model.description}</p>
          </div>
          <LikeButton modelId={model.id} initialCount={model.likesCount} initialLiked={model.liked} compact />
        </div>
        <div className="mt-3 flex items-center justify-between text-[11px] text-muted">
          <span className="truncate">{model.author ? `by ${model.author}` : ""}</span>
          <span className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" />{formatNumber(model.views)}</span>
            <span className="inline-flex items-center gap-1"><Download className="h-3 w-3" />{formatNumber(model.downloads)}</span>
          </span>
        </div>
      </div>
    </Link>
  );
}
