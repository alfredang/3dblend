import { prisma } from "./prisma";
import type { ModelCardData } from "@/components/ModelCard";
import type { Prisma } from "@prisma/client";

type Stats = { size?: [number, number, number] };

export async function listPublicModels(opts: { sort?: "trending" | "new" | "top"; q?: string; take?: number; featured?: boolean; viewerId?: string | null }) {
  const { sort = "trending", q, take = 24, featured, viewerId } = opts;
  const where: Prisma.ModelWhereInput = { isPublic: true };
  if (featured) where.featured = true;
  if (q) where.OR = [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }, { prompt: { contains: q, mode: "insensitive" } }];
  const orderBy: Prisma.ModelOrderByWithRelationInput[] =
    sort === "new" ? [{ createdAt: "desc" }] : sort === "top" ? [{ likesCount: "desc" }, { createdAt: "desc" }] : [{ featured: "desc" }, { likesCount: "desc" }, { downloads: "desc" }, { createdAt: "desc" }];
  const models = await prisma.model.findMany({
    where,
    orderBy,
    take,
    include: { user: { select: { name: true } }, likes: viewerId ? { where: { userId: viewerId }, select: { userId: true } } : false },
  });
  return models.map(toCard);
}

export function toCard(m: {
  id: string; title: string; description: string; likesCount: number; downloads: number; views: number; featured: boolean; stats: unknown; createdAt: Date;
  user?: { name: string | null } | null; likes?: { userId: string }[] | false;
}): ModelCardData {
  const stats = (m.stats ?? {}) as Stats;
  return {
    id: m.id,
    title: m.title,
    description: m.description,
    likesCount: m.likesCount,
    downloads: m.downloads,
    views: m.views,
    featured: m.featured,
    size: stats.size,
    author: m.user?.name ?? null,
    liked: Array.isArray(m.likes) ? m.likes.length > 0 : false,
    createdAt: m.createdAt.toISOString(),
  };
}
