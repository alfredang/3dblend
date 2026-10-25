import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Logo } from "./Logo";
import { Coins } from "lucide-react";
import { SignOutButton } from "./SignOutButton";
import { ThemeToggle } from "./ThemeToggle";

export async function Navbar() {
  const session = await auth();
  const user = session?.user?.id
    ? await prisma.user.findUnique({ where: { id: session.user.id }, select: { credits: true, plan: true, name: true, email: true, isAdmin: true } })
    : null;

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-8">
          <Logo />
          <nav className="hidden items-center gap-6 text-sm text-muted md:flex">
            <Link href="/gallery" className="hover:text-fg">Gallery</Link>
            <Link href="/pricing" className="hover:text-fg">Pricing</Link>
            <Link href="/studio" className="hover:text-fg">Studio</Link>
            {user?.isAdmin && <Link href="/admin" className="text-accent-2 hover:text-fg">Admin</Link>}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          {user ? (
            <>
              <Link href="/account" className="glass hidden items-center gap-2 rounded-full px-3 py-1.5 text-xs sm:flex">
                <Coins className="h-3.5 w-3.5 text-accent-2" />
                <span className="font-semibold">{user.credits}</span>
                <span className="text-muted">credits</span>
                <span className="ml-1 rounded-full bg-accent/20 px-2 py-0.5 text-[10px] uppercase tracking-wide text-accent">{user.plan}</span>
              </Link>
              <Link href="/studio" className="btn-primary">New model</Link>
              <SignOutButton />
            </>
          ) : (
            <>
              <Link href="/login" className="btn-ghost">Log in</Link>
              <Link href="/register" className="btn-primary">Start free</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
