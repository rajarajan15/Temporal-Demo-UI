import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// The backend sends no CORS headers, so the dev server proxies API calls.
// See frontend-context.md section 3.
export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
  server: {
    port: 5173,
    proxy: {
      '/v1': 'http://localhost:8080',
      '/mock-admin': 'http://127.0.0.1:8091',
    },
  },
  preview: {
    proxy: {
      '/v1': 'http://localhost:8080',
      '/mock-admin': 'http://127.0.0.1:8091',
    },
  },
});
