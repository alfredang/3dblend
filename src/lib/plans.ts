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
    blurb: "Try the studio with 10 generation credits.",
    perks: ["10 credits (one-time)", "STL + Blender script export", "Publish to gallery"],
  },
  STARTER: {
    name: "Starter",
    credits: 100,
    price: 9,
    period: "month",
    blurb: "For hobbyists printing every week.",
    perks: ["100 credits / month", "Priority generation", "Private projects", "Email support"],
  },
  PRO: {
    name: "Pro",
    credits: 1000,
    price: 49,
    period: "month",
    blurb: "For makers, studios and print farms.",
    perks: ["1000 credits / month", "Highest priority queue", "Commercial licence", "Early access features"],
  },
};

/** Credits charged per operation. */
export const COST = { generate: 1, refine: 1 } as const;
