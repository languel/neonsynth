import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_ACTIONS ? "/neonsynth/" : "/",
  worker: { format: "es" },
  build: { target: "es2022", sourcemap: true },
  server: { host: "0.0.0.0", port: 5317, strictPort: true, allowedHosts: true },
  preview: { host: "0.0.0.0", port: 5318, strictPort: true, allowedHosts: true },
});
