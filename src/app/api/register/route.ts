import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { PLANS } from "@/lib/plans";

const schema = z.object({ name: z.string().min(1).max(60), email: z.string().email(), password: z.string().min(8).max(100) });

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { name, email, password } = parsed.data;
  const exists = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (exists) return NextResponse.json({ error: "Email already registered" }, { status: 409 });
  const user = await prisma.user.create({
    data: {
      name,
      email: email.toLowerCase(),
      passwordHash: await bcrypt.hash(password, 10),
      credits: PLANS.FREE.credits,
      transactions: { create: { delta: PLANS.FREE.credits, reason: "signup-bonus" } },
    },
    select: { id: true },
  });
  return NextResponse.json({ id: user.id });
}
