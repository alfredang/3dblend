"use client";
import { useState } from "react";
import { Link2, Check, Share2 } from "lucide-react";

const X = () => <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M18.9 2H22l-7.6 8.7L23.3 22h-7l-5.5-7.2L4.5 22H1.4l8.1-9.3L.7 2h7.2l5 6.6L18.9 2Zm-1.2 18h1.9L7.1 3.9H5.1L17.7 20Z" /></svg>;
const FB = () => <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.3v7A10 10 0 0 0 22 12Z" /></svg>;
const IN = () => <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M20.4 2H3.6A1.6 1.6 0 0 0 2 3.6v16.8A1.6 1.6 0 0 0 3.6 22h16.8a1.6 1.6 0 0 0 1.6-1.6V3.6A1.6 1.6 0 0 0 20.4 2ZM8 19H5V9.5h3V19ZM6.5 8.2a1.7 1.7 0 1 1 0-3.5 1.7 1.7 0 0 1 0 3.5ZM19 19h-3v-4.6c0-1.1 0-2.5-1.5-2.5s-1.8 1.2-1.8 2.4V19h-3V9.5h2.9v1.3a3.2 3.2 0 0 1 2.8-1.5c3 0 3.6 2 3.6 4.6V19Z" /></svg>;
const WA = () => <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M20 3.9A11 11 0 0 0 2.6 17.1L1 23l6-1.6A11 11 0 0 0 20 3.9Zm-8 17.3a9.1 9.1 0 0 1-4.7-1.3l-.3-.2-3.5.9.9-3.4-.2-.4a9.2 9.2 0 1 1 7.8 4.4Zm5-6.9c-.3-.1-1.6-.8-1.9-.9s-.4-.1-.6.1-.7.9-.9 1.1-.3.2-.6.1a7.5 7.5 0 0 1-3.7-3.2c-.3-.5.3-.4.8-1.5.1-.2 0-.3 0-.5l-.9-2c-.2-.5-.4-.5-.6-.5h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4 5.3 5.3 0 0 0 3.2.7 2.8 2.8 0 0 0 1.8-1.3 2.3 2.3 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3Z" /></svg>;
const RD = () => <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor"><path d="M22 12.1a2.2 2.2 0 0 0-3.7-1.6 10.8 10.8 0 0 0-5.8-1.8l1-4.6 3.2.7a1.6 1.6 0 1 0 .2-.8l-3.6-.8a.4.4 0 0 0-.5.3l-1.1 5.2a10.8 10.8 0 0 0-5.9 1.8 2.2 2.2 0 1 0-2.4 3.6 4.3 4.3 0 0 0 0 .7c0 3.4 3.9 6.1 8.7 6.1s8.7-2.7 8.7-6.1a4.3 4.3 0 0 0 0-.7 2.2 2.2 0 0 0 1.2-2ZM7 13.6a1.6 1.6 0 1 1 1.6 1.6A1.6 1.6 0 0 1 7 13.6Zm9 4.2a5.9 5.9 0 0 1-3.8 1.2 5.9 5.9 0 0 1-3.8-1.2.4.4 0 0 1 .6-.6 5.1 5.1 0 0 0 3.2 1 5.1 5.1 0 0 0 3.2-1 .4.4 0 0 1 .6.6Zm-.3-2.6a1.6 1.6 0 1 1 1.6-1.6 1.6 1.6 0 0 1-1.6 1.6Z" /></svg>;

export function ShareButtons({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const enc = encodeURIComponent;
  const text = `${title} — a 3D-printable model made with 3DBlend`;
  const links = [
    { name: "X", href: `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}`, Icon: X },
    { name: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}`, Icon: FB },
    { name: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(url)}`, Icon: IN },
    { name: "WhatsApp", href: `https://wa.me/?text=${enc(`${text} ${url}`)}`, Icon: WA },
    { name: "Reddit", href: `https://www.reddit.com/submit?url=${enc(url)}&title=${enc(title)}`, Icon: RD },
  ];

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  }
  async function native() {
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
      } catch {
        /* cancelled */
      }
    } else copy();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button onClick={native} className="btn-ghost !px-3 !py-1.5 text-xs"><Share2 className="h-4 w-4" />Share</button>
      <button onClick={copy} className="btn-ghost !px-3 !py-1.5 text-xs">{copied ? <Check className="h-4 w-4 text-accent-2" /> : <Link2 className="h-4 w-4" />}{copied ? "Copied" : "Copy link"}</button>
      {links.map(({ name, href, Icon }) => (
        <a key={name} href={href} target="_blank" rel="noopener noreferrer" title={`Share on ${name}`} className="inline-grid h-8 w-8 place-items-center rounded-full border border-line bg-elev text-muted hover:text-fg">
          <Icon />
        </a>
      ))}
    </div>
  );
}
