import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { SITE } from "@/lib/site";
import type { Invoice, User } from "@prisma/client";

export async function renderInvoicePdf(inv: Invoice, user: Pick<User, "name" | "email">): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]); // A4
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.07, 0.08, 0.16), muted = rgb(0.42, 0.45, 0.55), accent = rgb(0.42, 0.3, 1);
  const { width } = page.getSize();
  let y = 790;
  const text = (s: string, x: number, size = 10, f = font, color = ink) => page.drawText(s, { x, y, size, font: f, color });
  const fmtMoney = (n: number) => `${inv.currency} ${n.toFixed(2)}`;
  const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

  text("3DBlend", 50, 24, bold, accent); y -= 16;
  text(SITE.company, 50, 9, font, muted); y -= 12;
  text(`UEN ${SITE.uen} · ${SITE.email} · ${SITE.phone}`, 50, 9, font, muted); y -= 12;
  text(SITE.address, 50, 9, font, muted);

  y = 790;
  page.drawText("INVOICE", { x: width - 170, y, size: 20, font: bold, color: ink }); y -= 20;
  page.drawText(inv.number, { x: width - 170, y, size: 11, font: bold, color: ink }); y -= 14;
  page.drawText(`Date: ${fmtDate(inv.paidAt)}`, { x: width - 170, y, size: 9, font, color: muted }); y -= 12;
  page.drawText(`Status: ${inv.status.toUpperCase()}`, { x: width - 170, y, size: 9, font, color: muted });

  y = 690;
  text("Billed to", 50, 9, bold, muted); y -= 14;
  text(user.name ?? "", 50, 11, bold); y -= 14;
  text(user.email, 50, 10, font, muted);

  y = 620;
  page.drawRectangle({ x: 50, y: y - 6, width: width - 100, height: 22, color: rgb(0.95, 0.95, 0.98) });
  text("Description", 58, 9, bold, muted); text("Period", 320, 9, bold, muted); text("Amount", width - 120, 9, bold, muted);
  y -= 28;
  text(inv.description, 58, 10); text(`${fmtDate(inv.periodStart)} – ${fmtDate(inv.periodEnd)}`, 320, 10); text(fmtMoney(inv.amount), width - 120, 10);
  y -= 30;
  page.drawLine({ start: { x: 50, y }, end: { x: width - 50, y }, thickness: 0.5, color: rgb(0.85, 0.86, 0.9) });
  y -= 22;
  text("Total paid", 320, 11, bold); text(fmtMoney(inv.amount), width - 120, 12, bold);
  y -= 50;
  text("Payment received via HitPay. This invoice is generated automatically for your subscription charge.", 50, 9, font, muted); y -= 12;
  text("Thank you for using 3DBlend.", 50, 9, font, muted);

  page.drawText(`${SITE.company} · ${SITE.website}`, { x: 50, y: 40, size: 8, font, color: muted });
  return Buffer.from(await pdf.save());
}
