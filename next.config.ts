import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() { return [{ source: "/:path*", headers: [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "no-referrer" },
  ] }]; },
  outputFileTracingIncludes: { "/*": ["./assets/fonts/*.ttf", "./public/logo-inkor.png"] },
  experimental: { serverActions: { bodySizeLimit: "22mb" }, proxyClientMaxBodySize: "22mb" },
};
export default nextConfig;
