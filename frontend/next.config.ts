import type { NextConfig } from "next";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Keep Turbopack scoped to `frontend/` (avoids watching the whole monorepo). */
const frontendRoot = path.dirname(fileURLToPath(import.meta.url));

function readEnvLocalValue(key: string): string | undefined {
  const envPath = path.join(frontendRoot, ".env.local");
  if (!fs.existsSync(envPath)) {
    return undefined;
  }
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const match = trimmed.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match?.[1] === key && match[2]) {
      return match[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  return undefined;
}

function parseDevOriginHost(entry: string): string | null {
  const trimmed = entry.trim();
  if (!trimmed) {
    return null;
  }
  try {
    if (trimmed.includes("://")) {
      return new URL(trimmed).hostname;
    }
  } catch {
    // fall through — treat as bare hostname / IP
  }
  return trimmed.split(":")[0] ?? null;
}

/** Upstream Fastify API for `/api/v1/*` rewrites (cookie auth requires same-site browser calls). */
const backendProxyOrigin = (
  process.env.BACKEND_PROXY_URL ??
  process.env.INTERNAL_API_BASE_URL?.replace(/\/api\/v1\/?$/, "") ??
  "http://127.0.0.1:3000"
).replace(/\/$/, "");

/**
 * LAN/mobile dev hosts for `next dev` (HMR + `/_next/*`).
 * Must include every IP/hostname you open on phone — e.g. both 192.168.1.4 and .38
 * if DHCP changes. Comma-separate in ALLOWED_DEV_ORIGINS (.env.local).
 */
function getAllowedDevOrigins(): string[] {
  const origins = new Set<string>(["localhost", "127.0.0.1"]);

  const raw =
    process.env.ALLOWED_DEV_ORIGINS?.trim() ??
    readEnvLocalValue("ALLOWED_DEV_ORIGINS")?.trim() ??
    "";

  for (const entry of raw.split(",")) {
    const host = parseDevOriginHost(entry);
    if (host) {
      origins.add(host);
    }
  }

  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const iface of interfaces ?? []) {
      if (iface.family === "IPv4" && !iface.internal) {
        origins.add(iface.address);
      }
    }
  }

  return [...origins];
}

const allowedDevOrigins = getAllowedDevOrigins();

const nextConfig: NextConfig = {
  allowedDevOrigins,
  turbopack: {
    root: frontendRoot,
  },
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
      {
        protocol: "http",
        hostname: "127.0.0.1",
      },
      ...allowedDevOrigins
        .filter((host) => host !== "localhost" && host !== "127.0.0.1")
        .map((hostname) => ({
          protocol: "http" as const,
          hostname,
        })),
    ],
  },
};

export default nextConfig;
