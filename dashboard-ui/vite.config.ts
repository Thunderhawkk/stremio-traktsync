import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        dashboard: resolve(__dirname, 'index.html'),
        landing: resolve(__dirname, 'landing.html'),
        analytics: resolve(__dirname, 'analytics.html'),
        health: resolve(__dirname, 'health.html'),
        audit: resolve(__dirname, 'audit.html')
      }
    }
  }
});
