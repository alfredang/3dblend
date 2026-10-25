import type { Plan } from "@prisma/client";

export const PLANS: Record<
  Plan,
  { name: string; credits: number; price: number; period: string; blurb: string; perks: string[] }
> = {
  FREE: {
    name: "Free",
    credits: 10,
    price: 0,
    period: "one-time",
    blurb: "One model plus five edits. Models are shared publicly in the gallery.",
    perks: ["10 credits: 1 generation + 5 edits", "STL / 3MF / Blender export", "Models are public in the gallery", "Text prompts only (no image/PDF references)"],
  },
  STARTER: {
    name: "Starter",
    credits: 100,
    price: 9,
    period: "month",
    blurb: "For hobbyists printing every week.",
    perks: ["100 credits / month", "Image, PDF, STL/3MF & Blender uploads", "Models stay private (publish when you choose)", "Priority generation", "Email support"],
  },
  PRO: {
    name: "Pro",
    credits: 1000,
    price: 49,
    period: "month",
    blurb: "For makers, studios and print farms.",
    perks: ["1000 credits / month", "Image, PDF, STL/3MF & Blender uploads", "Models stay private (publish when you choose)", "Highest priority queue", "Commercial licence", "Early access features"],
  },
};

/** Credits charged per operation: a new model costs 5, each edit of an existing model costs 1. */
export const COST = { generate: 5, refine: 1, chat: 1 } as const;

/** Free-plan models are always public in the gallery; paid plans default to private. */
export function defaultVisibility(plan: Plan): boolean {
  return plan === "FREE";
}
export function canMakePrivate(plan: Plan): boolean {
  return plan !== "FREE";
}

/** Reference image / PDF attachments are a paid-plan feature. */
export function canAttach(plan: Plan): boolean {
  return plan !== "FREE";
}
