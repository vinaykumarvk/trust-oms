import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      "@/": path.resolve(__dirname, "src") + "/",
      "@ui": path.resolve(__dirname, "../../packages/ui/src"),
      "@shared": path.resolve(__dirname, "../../packages/shared/src"),
    },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "@radix-ui/react-slot",
      "class-variance-authority",
    ],
  },
  build: {
    outDir: `../../dist/front-office`,
    emptyOutDir: true,
  },
});
