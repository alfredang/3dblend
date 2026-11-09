import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";
import { getConfig } from "@/lib/settings";
export const dynamic = "force-dynamic";
// Auth screen: never a search landing page (/login?next=… was flagged by GSC).
export const metadata = { title: "Sign up", robots: { index: false, follow: true } };
export default async function RegisterPage() {
  const { security } = await getConfig();
  return <Suspense><AuthForm mode="register" turnstileSiteKey={security.turnstileSiteKey || undefined} /></Suspense>;
}
