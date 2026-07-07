/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
        port: "",
        // BreadTrans bucket
        pathname: "/v0/b/breadtrans-f6134.firebasestorage.app/o/**",
      },
      {
        protocol: "https",
        hostname: "firebasestorage.googleapis.com",
        port: "",
        // Handbook / legacy bucket (e.g. avatars từ user cũ)
        pathname: "/v0/b/handbook-65d51.appspot.com/o/**",
      },
      {
        protocol: "https",
        hostname: "images.pexels.com",
        port: "",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;