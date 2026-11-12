import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_DEV_PROXY_TARGET || "http://localhost:5000",
        changeOrigin: true,
      },
      "/health": {
        target: process.env.VITE_DEV_PROXY_TARGET || "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
});
