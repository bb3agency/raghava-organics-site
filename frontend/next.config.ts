import type { NextConfig } from "next";

/** Upstream Fastify API for `/api/v1/*` rewrites (cookie auth requires same-site browser calls). */
const backendProxyOrigin = (
  process.env.BACKEND_PROXY_URL ??
  process.env.INTERNAL_API_BASE_URL?.replace(/\/api\/v1\/?$/, "") ??
  "http://127.0.0.1:3000"
).replace(/\/$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${backendProxyOrigin}/api/v1/:path*`,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
      {
        protocol: "http",
        hostname: "localhost",
      },
    ],
  },
};

export default nextConfig;
