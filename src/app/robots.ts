import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/utils";

// /login and /register stay crawlable on purpose: they carry `noindex`, and
// Google can only honour that if it can fetch them. The signed-in app areas
// below only ever redirect a crawler to /login?next=…, so stop discovery there.
export default function robots(): MetadataRoute.Robots {
  const base = appUrl().startsWith("http://localhost") ? "https://3dblend.tertiaryinfotech.com" : appUrl();
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/admin", "/account", "/studio"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
