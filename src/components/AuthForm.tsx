"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { Logo } from "./Logo";
import { Turnstile } from "./Turnstile";

export function AuthForm({ mode, turnstileSiteKey }: { mode: "login" | "register"; turnstileSiteKey?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/studio";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(
    params.get("verified") ? "Email verified — you can log in now." : params.get("verify") === "expired" ? "That verification link has expired. Log in to request a new one." : params.get("verify") === "invalid" ? "That verification link is not valid." : null,
  );
  const [busy, setBusy] = useState(false);
  const [awaitingVerification, setAwaitingVerification] = useState(false);
  const [unverified, setUnverified] = useState(false);

  async function login(e: string, p: string) {
    const r = await signIn("credentials", { email: e, password: p, redirect: false });
    if (r?.error) {
      if (r.code === "email_not_verified") { setUnverified(true); throw new Error("Please verify your email first — check your inbox for the link."); }
      throw new Error("Invalid email or password");
    }
    router.push(next);
    router.refresh();
  }

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setBusy(true);
    setError(null);
    setUnverified(false);
    try {
      if (turnstileSiteKey && !token) throw new Error("Bot check is still running — please wait a second and try again.");
      if (mode === "register") {
        const res = await fetch("/api/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name, email, password, turnstileToken: token, website }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || "Registration failed");
        if (j.needsVerification) { setAwaitingVerification(true); return; }
      }
      await login(email, password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    const res = await fetch("/api/auth/resend", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    setInfo(j.message || j.error || "Done");
  }

  async function demo() {
    setEmail("demo@3dblend.app");
    setPassword("demo1234");
    setBusy(true);
    try { await login("demo@3dblend.app", "demo1234"); } catch { setError("Demo account not available (run the seed)."); } finally { setBusy(false); }
  }

  if (awaitingVerification) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col items-center px-4 py-16">
        <Logo className="mb-8" />
        <div className="card w-full p-8 text-center">
          <MailCheck className="mx-auto h-10 w-10 text-accent-2" />
          <h1 className="mt-4 text-2xl font-semibold">Check your inbox</h1>
          <p className="mt-2 text-sm text-muted">We sent a verification link to <b className="text-fg">{email}</b>. Click it to activate your account, then log in. The link is valid for 24 hours.</p>
          {info && <p className="mt-3 text-sm text-accent-2">{info}</p>}
          <button onClick={resend} disabled={busy} className="btn-ghost mt-6 w-full">Resend the email</button>
          <Link href="/login" className="mt-3 inline-block text-sm text-accent hover:underline">Go to log in</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center px-4 py-16">
      <Logo className="mb-8" />
      <div className="card w-full p-8">
        <h1 className="text-2xl font-semibold">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
        <p className="mt-1 text-sm text-muted">
          {mode === "login" ? "Log in to continue designing." : "Start with 10 free credits. No card required."}
        </p>
        {info && <p className="mt-3 rounded-lg border border-accent-2/40 bg-accent-2/10 px-3 py-2 text-sm text-accent-2">{info}</p>}
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          {mode === "register" && (
            <input className="input" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} required />
          )}
          <input className="input" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input className="input" type="password" placeholder="Password (min 8 chars)" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
          {/* Honeypot: hidden from humans, bots tend to fill it. */}
          <input type="text" name="website" value={website} onChange={(e) => setWebsite(e.target.value)} tabIndex={-1} autoComplete="off" className="absolute -left-[9999px] h-px w-px opacity-0" aria-hidden="true" />
          {turnstileSiteKey && <Turnstile siteKey={turnstileSiteKey} onToken={setToken} onError={setError} />}
          {error && <p className="text-sm text-accent-3">{error}</p>}
          {unverified && <button type="button" onClick={resend} disabled={busy} className="text-sm text-accent hover:underline">Resend verification email</button>}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>
        {mode === "login" && <button onClick={demo} disabled={busy} className="btn-ghost mt-3 w-full">Try the demo account</button>}
        <p className="mt-6 text-center text-sm text-muted">
          {mode === "login" ? (
            <>No account? <Link href="/register" className="text-accent hover:underline">Sign up free</Link></>
          ) : (
            <>Already have an account? <Link href="/login" className="text-accent hover:underline">Log in</Link></>
          )}
        </p>
      </div>
    </div>
  );
}
