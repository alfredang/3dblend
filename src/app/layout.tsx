import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { Providers } from "@/components/Providers";
import Script from "next/script";
import { THEME_INIT_SCRIPT } from "@/components/ThemeToggle";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "3DBlend — AI 3D models you can print", template: "%s · 3DBlend" },
  description:
    "Describe an object, get a watertight, printable STL and a Blender script in seconds. Powered by DeepSeek V4.1 Flash and an exact geometry kernel.",
  // Fallback is the production origin, not localhost: if the build ever runs
  // without NEXT_PUBLIC_APP_URL, canonicals must still point at the live site.
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://3dblend.tertiaryinfotech.com"),
  // "./" resolves to each route's own path with the query string dropped, so
  // /gallery?sort=trending canonicalises to /gallery (GSC flagged these as
  // "Duplicate without user-selected canonical").
  alternates: { canonical: "./" },
  openGraph: { siteName: "3DBlend", type: "website" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <Script id="theme-init" strategy="beforeInteractive">{THEME_INIT_SCRIPT}</Script>
        <Providers>
          <Navbar />
          <main className="flex-1 flex flex-col">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
