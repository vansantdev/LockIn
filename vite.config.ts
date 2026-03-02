// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// If deploying to https://username.github.io/<repo>/ set isGhPagesProjectSite = true
const repo = "lockin";
const isGhPagesProjectSite = false; // ✅ custom domain root (https://imlockin.app)

export default defineConfig({
  base: isGhPagesProjectSite ? `/${repo}/` : "/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",

      // Anything in /public can be referenced directly here
      includeAssets: [
        "favicon.ico",
        "apple-touch-icon.png",
        "og-image.png",
        "og-image-v3.png",
        "robots.txt",
        "sitemap.xml",
        "pwa-192.png",
        "pwa-512.png",
        "pwa-512-maskable.png",
      ],

      manifest: {
        name: "LockIn",
        short_name: "LockIn",
        description: "Tactical impulse control and discipline tracking web app.",
        theme_color: "#0B090A",
        background_color: "#0B090A",
        display: "standalone",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "/pwa-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/pwa-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/pwa-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },

      workbox: {
        // For SPA routing
        navigateFallback: isGhPagesProjectSite
          ? `/${repo}/index.html`
          : "/index.html",
      },
    }),
  ],
});