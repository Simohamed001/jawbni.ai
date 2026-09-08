import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  compress: true,
  // Replit's preview loads the dev resources through its proxied hostname.
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    ...(process.env.REPLIT_DEV_DOMAIN
      ? [process.env.REPLIT_DEV_DOMAIN]
      : []),
  ],
};

export default nextConfig;
