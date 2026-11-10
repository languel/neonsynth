import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves this repository at /neonsynth/. Dev and other hosts use /.
  base: process.env.GITHUB_ACTIONS ? '/neonsynth/' : '/',
  server: { host: '0.0.0.0', allowedHosts: true },
  preview: { host: '0.0.0.0', allowedHosts: true },
});
