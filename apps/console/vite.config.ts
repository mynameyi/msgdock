import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules') && /\/(react|react-dom|scheduler)(@|\/)/.test(id))
            return 'react-runtime';
          if (
            id.includes('node_modules') &&
            (id.includes('@tanstack') ||
              id.includes('react-router') ||
              id.includes('openapi-fetch'))
          )
            return 'data-routing';
        },
      },
    },
  },
  server: { proxy: { '/api': 'http://127.0.0.1:3302', '/openapi.json': 'http://127.0.0.1:3302' } },
});
