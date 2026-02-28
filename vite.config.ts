// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// IMPORTANT: set this to your repo name if deploying to https://username.github.io/<repo>/
const repo = "lockin"; // <-- change if your repo name is different
const isGhPagesProjectSite = true;

export default defineConfig({
  base: isGhPagesProjectSite ? `/${repo}/` : "/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",

      // Helps you test PWA locally (dev server)
      devOptions: {
        enabled: true,
      },

      includeAssets: ["favicon.ico", "robots.txt"],
      manifest: {
        name: "LockIn",
        short_name: "LockIn",
        description: "Offline-first urge tracking + Life Ops",
        start_url: isGhPagesProjectSite ? `/${repo}/` : "/",
        scope: isGhPagesProjectSite ? `/${repo}/` : "/",
        display: "standalone",
        background_color: "#0B090A",
        theme_color: "#0B090A",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "pwa-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: isGhPagesProjectSite ? `/${repo}/index.html` : "/index.html",
      },
    }),
  ],
});