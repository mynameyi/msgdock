import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'local-redoc-attribution',
      transform(code, id) {
        if (!id.replaceAll('\\', '/').includes('/redoc/bundles/')) return;
        // Keep Redocly's text credit without its optional CDN image, so docs work offline.
        return {
          code: code.replaceAll(
            'https://cdn.redoc.ly/redoc/logo-mini.svg',
            'data:image/svg+xml,%3Csvg%20xmlns%3D%22http://www.w3.org/2000/svg%22/%3E',
          ),
          map: null,
        };
      },
    },
  ],
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
