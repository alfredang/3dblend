import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";
import { getConfig } from "@/lib/settings";
export const dynamic = "force-dynamic";
export const metadata = { title: "Log in" };
export default async function LoginPage() {
  const { security } = await getConfig();
  return <Suspense><AuthForm mode="login" turnstileSiteKey={security.turnstileSiteKey || undefined} /></Suspense>;
}
