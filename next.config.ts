import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  outputFileTracingIncludes: {
    "/api/ghl/commission-tracker": ["./config/commission-clients.json"],
  },
};

export default nextConfig;
