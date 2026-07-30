import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// During local dev (`npm run dev`) the frontend runs on :5173 and proxies
// /api calls to the Express backend on :3000. In production the backend
// serves the built files directly, so the proxy is dev-only.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
