import process from "node:process";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

// The GitHub Pages base path is injected by the `pages.yml` workflow via
// VITE_BASE so the same bundle works at `/`, `/checklist/`, or any subpath.
const base = process.env.VITE_BASE ?? "/";

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "checklist",
        short_name: "checklist",
        description:
          "A local-first PWA checklist app with template and sharing support.",
        theme_color: "#1f2933",
        background_color: "#ffffff",
        display: "standalone",
        start_url: ".",
      },
      workbox: {
        // App shell is precached; cloud-storage hosts use networkFirst.
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.hostname === "www.googleapis.com" ||
              url.hostname === "api.dropboxapi.com" ||
              url.hostname === "content.dropboxapi.com",
            handler: "NetworkFirst",
            options: { cacheName: "cloud-storage" },
          },
        ],
      },
    }),
  ],
  test: {
    // Domain/storage/share tests run in node. UI tests opt into jsdom with a
    // `// @vitest-environment jsdom` docblock at the top of the file.
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
