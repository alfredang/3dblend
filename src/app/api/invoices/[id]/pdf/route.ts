import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { renderInvoicePdf } from "@/lib/billing/invoice-pdf";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const me = await prisma.user.findUnique({ where: { id: session.user.id }, select: { isAdmin: true } });
  const inv = await prisma.invoice.findFirst({ where: me?.isAdmin ? { id } : { id, userId: session.user.id }, include: { user: { select: { name: true, email: true } } } });
  if (!inv) return new Response("Not found", { status: 404 });
  const pdf = await renderInvoicePdf(inv, inv.user);
  return new Response(new Uint8Array(pdf), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${inv.number}.pdf"` } });
}
