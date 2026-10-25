import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["manifold-3d", "@prisma/client", "bcryptjs", "pdfjs-dist", "@napi-rs/canvas"],
  outputFileTracingIncludes: { "/**": ["./node_modules/manifold-3d/**", "./node_modules/pdfjs-dist/**", "./node_modules/@napi-rs/**"] },
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
};

export default nextConfig;
