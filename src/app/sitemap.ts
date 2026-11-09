import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/utils";

// Reads the DB, so it must not be frozen at build time.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = appUrl().startsWith("http://localhost") ? "https://3dblend.tertiaryinfotech.com" : appUrl();
  const pages: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/gallery`, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/pricing`, changeFrequency: "monthly", priority: 0.6 },
  ];
  try {
    const models = await prisma.model.findMany({
      where: { isPublic: true },
      select: { id: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });
    for (const m of models) pages.push({ url: `${base}/m/${m.id}`, lastModified: m.createdAt, changeFrequency: "monthly", priority: 0.5 });
  } catch {
    // DB unreachable (e.g. during `next build`): ship the static pages only.
  }
  return pages;
}
