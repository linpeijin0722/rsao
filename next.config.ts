import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Avoid Next.js selecting a package-lock.json above this independent project.
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
