import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    target: "es2022",
    // No size budget. The app chunk carries the blog data, so it grows with the
    // list; a number here would only ever say "the list got longer".
    chunkSizeWarningLimit: Infinity,
    rollupOptions: {
      output: {
        // Dependencies in their own chunk: they change when a package is bumped,
        // the app chunk changes on every data sync. Splitting keeps returning
        // visitors from re-downloading three.js each morning.
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
