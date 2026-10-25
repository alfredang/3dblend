import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";
import { getConfig } from "@/lib/settings";
export const dynamic = "force-dynamic";
export const metadata = { title: "Sign up" };
export default async function RegisterPage() {
  const { security } = await getConfig();
  return <Suspense><AuthForm mode="register" turnstileSiteKey={security.turnstileSiteKey || undefined} /></Suspense>;
}
