/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ["lucide-react"]
  },
  // SECURITY: API keys must NEVER be exposed to the client-side.
  // Do NOT add sensitive keys (GOOGLE_API_KEY, GEMINI_API_KEY, etc.) to the env object.
  // These keys should only be accessed server-side (API routes, server components).
  // Next.js automatically makes environment variables available server-side without this config.

  // Optimize for production
  swcMinify: true,
  // Ensure static files are served correctly
  trailingSlash: false,
  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
        ],
      },
    ];
  },
};

export default nextConfig;


