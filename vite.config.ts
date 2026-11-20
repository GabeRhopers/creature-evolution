import { defineConfig } from 'vite';

// base './' keeps asset paths relative, so the same build works on
// GitHub Pages (sub-path) and on itch.io (iframe) without changes.
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
  },
});
