import type { NextConfig } from "next";

// BYC HRM is a separate Next.js app/deployment with its own basePath
// ('/hrm'), reachable at HRM_ORIGIN. This rewrite proxies it under this
// app's own domain so the whole solution has one public URL. Override
// HRM_ORIGIN to point at a local HRM dev server (e.g. http://localhost:3010)
// when developing this proxy locally.
const HRM_ORIGIN = process.env.HRM_ORIGIN ?? "https://byc-hrm.vercel.app";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/hrm", destination: `${HRM_ORIGIN}/hrm` },
      { source: "/hrm/:path*", destination: `${HRM_ORIGIN}/hrm/:path*` },
    ];
  },
};

export default nextConfig;
