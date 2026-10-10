/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  ...(process.env.CAPACITOR_BUILD === "1"
    ? {
        // Capacitor serves packaged files from its local HTTPS origin. Directory
        // indexes keep direct navigation and Android back/forward history working.
        output: "export",
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {}),
};

export default nextConfig;
