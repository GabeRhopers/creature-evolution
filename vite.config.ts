import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };

// base './' keeps asset paths relative, so the same build works on
// GitHub Pages (sub-path) and on itch.io (iframe) without changes.
export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
  },
});
