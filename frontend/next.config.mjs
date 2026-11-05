import path from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load unified root .env so a single file configures both backend and frontend
const rootDir = path.resolve(__dirname, "..");
if (typeof nextEnv?.loadEnvConfig === "function") {
  nextEnv.loadEnvConfig(rootDir);
} else if (typeof nextEnv?.default?.loadEnvConfig === "function") {
  nextEnv.default.loadEnvConfig(rootDir);
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: {
    root: __dirname,
  },
  httpAgentOptions: {
    keepAlive: true,
  },
  devIndicators: false,
  experimental: {
    proxyTimeout: 120000,
  },
  async redirects() {
    return [
      {
        source: "/login",
        destination: "/auth",
        permanent: true,
      },
      {
        source: "/signup",
        destination: "/auth?mode=signup",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    const backendUrl =
      process.env.INTERNAL_API_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      "http://127.0.0.1:8000";
    return [
      {
        source: "/workspaces/:folderId",
        destination: "/folders/:folderId",
      },
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
