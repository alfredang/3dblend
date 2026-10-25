"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Logo } from "./Logo";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/studio";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "register") {
        const res = await fetch("/api/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name, email, password }),
        });
        if (!res.ok) throw new Error((await res.json()).error || "Registration failed");
      }
      const r = await signIn("credentials", { email, password, redirect: false });
      if (r?.error) throw new Error("Invalid email or password");
      router.push(next);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function demo() {
    setEmail("demo@3dblend.app");
    setPassword("demo1234");
    setBusy(true);
    const r = await signIn("credentials", { email: "demo@3dblend.app", password: "demo1234", redirect: false });
    setBusy(false);
    if (r?.error) setError("Demo account not available (run the seed).");
    else {
      router.push(next);
      router.refresh();
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center px-4 py-16">
      <Logo className="mb-8" />
      <div className="card w-full p-8">
        <h1 className="text-2xl font-semibold">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
        <p className="mt-1 text-sm text-muted">
          {mode === "login" ? "Log in to continue designing." : "Start with 10 free credits. No card required."}
        </p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          {mode === "register" && (
            <input className="input" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} required />
          )}
          <input className="input" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input className="input" type="password" placeholder="Password (min 8 chars)" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error && <p className="text-sm text-accent-3">{error}</p>}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>
        <button onClick={demo} disabled={busy} className="btn-ghost mt-3 w-full">Try the demo account</button>
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
