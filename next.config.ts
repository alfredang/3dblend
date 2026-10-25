import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["manifold-3d", "@prisma/client", "bcryptjs"],
  outputFileTracingIncludes: { "/**": ["./node_modules/manifold-3d/**"] },
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
};

export default nextConfig;
