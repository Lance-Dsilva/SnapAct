import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cursor SDK uses native/local executor pieces that shouldn't be bundled.
  serverExternalPackages: ["@cursor/sdk"],
};

export default nextConfig;
