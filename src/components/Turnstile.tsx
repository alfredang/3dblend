"use client";
import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => string; reset: (id?: string) => void; remove: (id: string) => void };
    __turnstileLoading?: Promise<void>;
  }
}

function loadScript() {
  if (window.turnstile) return Promise.resolve();
  if (!window.__turnstileLoading) {
    window.__turnstileLoading = new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Turnstile failed to load"));
      document.head.appendChild(s);
    });
  }
  return window.__turnstileLoading;
}

/** Invisible-first Turnstile widget: only shows a challenge when Cloudflare needs one. */
export function Turnstile({ siteKey, onToken, onError }: { siteKey: string; onToken: (t: string) => void; onError?: (m: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const idRef = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadScript().then(() => {
      if (cancelled || !ref.current || !window.turnstile) return;
      idRef.current = window.turnstile.render(ref.current, {
        sitekey: siteKey,
        appearance: "interaction-only",
        theme: document.documentElement.dataset.theme === "light" ? "light" : "dark",
        callback: (token: string) => onToken(token),
        "expired-callback": () => onToken(""),
        "error-callback": () => onError?.("Bot check could not run. Please reload."),
      });
    }).catch((e) => onError?.((e as Error).message));
    return () => { cancelled = true; if (idRef.current && window.turnstile) window.turnstile.remove(idRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey]);
  return <div ref={ref} className="min-h-[1px]" />;
}
