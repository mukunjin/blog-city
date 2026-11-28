import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        // Everything from node_modules becomes one vendor chunk. It changes only
        // when a dependency is bumped, while the app chunk carries the city
        // snapshot and therefore changes on every data sync — splitting them
        // keeps returning visitors from re-downloading three.js each morning.
        manualChunks(id) {
          if (id.includes("node_modules")) return "vendor";
        },
      },
    },
  },
  server: {
    host: true,
  },
});
