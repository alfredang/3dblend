import Link from "next/link";
import { cn } from "@/lib/utils";

export function Logo({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn("flex items-center gap-2 font-semibold tracking-tight", className)}>
      <span className="relative inline-grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent-2 text-white shadow-lg shadow-accent/30">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M12 2 3 7v10l9 5 9-5V7l-9-5Z" />
          <path d="M3 7l9 5 9-5M12 12v10" />
        </svg>
      </span>
      <span className="text-lg">
        3D<span className="gradient-text">Blend</span>
      </span>
    </Link>
  );
}
