/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true,
    // Keep native + heavy SDKs out of the server bundle so Next.js doesn't try
    // to inline binaries (ffmpeg) or polyfill Node-only paths (@google/genai).
    serverComponentsExternalPackages: [
      "ffmpeg-static",
      "@google/genai",
      "@supabase/supabase-js",
    ],
  },
};

export default nextConfig;
