"use client";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

export function SignOutButton() {
  return (
    <button onClick={() => signOut({ callbackUrl: "/" })} className="btn-ghost !px-2" title="Sign out" aria-label="Sign out">
      <LogOut className="h-4 w-4" />
    </button>
  );
}
