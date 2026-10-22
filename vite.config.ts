import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
  },
  server: { port: 5173, host: true },
});
