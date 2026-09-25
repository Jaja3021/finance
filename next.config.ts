import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // libSQL loads a native binary for local database files; keep it out of the bundle.
  serverExternalPackages: ["@libsql/client", "libsql"],
  // The install-icon route reads the logo from disk at runtime.
  outputFileTracingIncludes: { "/app-icon/[size]": ["./public/brand/logo-mark-square.png"] },
};

export default nextConfig;
