import Link from "next/link";
import { Mail, Phone, MapPin, Code2, MessageCircle } from "lucide-react";
import { Logo } from "./Logo";
import { SITE } from "@/lib/site";

export function SiteFooter() {
  const wa = SITE.whatsapp ? `https://wa.me/${SITE.whatsapp.replace(/[^0-9]/g, "")}` : null;
  return (
    <footer id="contact" className="mt-6 border-t border-line/60 bg-elev/40">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-3 max-w-md text-sm text-muted">
            Describe an object, attach a sketch or a drawing, and get a watertight, printer-ready STL, 3MF and Blender script in seconds. Built on DeepSeek V4.1 Flash and an exact geometry kernel.
          </p>
          <p className="mt-3 text-xs text-muted">
            Powered by <a href={SITE.website} target="_blank" rel="noopener" className="text-accent hover:underline">{SITE.company}</a> · UEN {SITE.uen}
          </p>
        </div>
        <div>
          <h3 className="text-sm font-semibold">Contact</h3>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            {SITE.email && <li><a href={`mailto:${SITE.email}`} className="inline-flex items-center gap-2 hover:text-fg"><Mail className="h-4 w-4 text-accent-2" />{SITE.email}</a></li>}
            {SITE.phone && <li><a href={`tel:${SITE.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-2 hover:text-fg"><Phone className="h-4 w-4 text-accent-2" />{SITE.phone}</a></li>}
            {wa && <li><a href={wa} target="_blank" rel="noopener" className="inline-flex items-center gap-2 hover:text-fg"><MessageCircle className="h-4 w-4 text-accent-2" />WhatsApp {SITE.whatsapp}</a></li>}
            {SITE.address && <li className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-accent-2" /><span>{SITE.address}</span></li>}
            <li><a href={SITE.github} target="_blank" rel="noopener" className="inline-flex items-center gap-2 hover:text-fg"><Code2 className="h-4 w-4 text-accent-2" />Source on GitHub</a></li>
          </ul>
        </div>
        <div>
          <h3 className="text-sm font-semibold">Product</h3>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li><Link href="/studio" className="hover:text-fg">Studio</Link></li>
            <li><Link href="/gallery" className="hover:text-fg">Gallery</Link></li>
            <li><Link href="/pricing" className="hover:text-fg">Pricing</Link></li>
            <li><a href="#faq" className="hover:text-fg">FAQ</a></li>
            <li><Link href="/register" className="hover:text-fg">Start free</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line/60 py-4 text-center text-xs text-muted">
        © {new Date().getFullYear()} 3DBlend · Inspired by Meshy, Tripo and Blender · Gallery models are shared by their authors under CC BY 4.0.
      </div>
    </footer>
  );
}
