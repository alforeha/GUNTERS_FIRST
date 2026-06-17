import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Test config lives in vitest.config.ts.
export default defineConfig({
  plugins: [react()],
  worker: {
    format: 'es',
  },
  server: {
    host: 'localhost',
    port: 5173,
    strictPort: true,
  },
});
