import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    target: "es2022",
    // The app chunk is not a fixed quantity: it carries the city snapshot at
    // ~227 bytes per blog, so a longer list makes it bigger without anything
    // being wrong. 405 kB today, ~2.3 MB at ten thousand blogs. The limit is
    // therefore set from that budget rather than from the current size, which
    // is what made 1600 a number that would nag for the wrong reason. What it
    // still catches is a chunk growing for no reason — vendor is the 1.2 MB
    // floor, and anything not explained by data shows up here.
    chunkSizeWarningLimit: 2400,
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
