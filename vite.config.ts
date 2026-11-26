import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'node:path';
import pkg from './package.json' with { type: 'json' };

// base './' keeps asset paths relative, so the same build works on
// GitHub Pages (sub-path), on itch.io (iframe) and inside the Android app without changes.
export default defineConfig({
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
    // Two pages: the game, and the Map (map.html, src/map/main.ts).
    rollupOptions: { input: { main: resolve(__dirname, 'index.html'), map: resolve(__dirname, 'map.html') } },
  },
  plugins: [
    // Offline: a service worker keeps the whole game (code, art, music, fonts, Sprite Studio and every
    // starter design) on the device after the first visit, and the manifest makes it installable
    // ("Add to Home Screen" on iPad, "Install app" on Android). A new version waits until the player
    // taps "Update" on the home screen, so a run is never reloaded in the middle.
    VitePWA({
      registerType: 'prompt',
      injectRegister: null,
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'Creature Evolution',
        short_name: 'Creature Evo',
        description: 'Start small. Eat. Grow. Rule the reef.',
        start_url: './',
        scope: './',
        display: 'fullscreen',
        orientation: 'any',
        background_color: '#0b1a2e',
        theme_color: '#124e89',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,json,png,jpg,mp3,ogg,woff2,txt}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // Links carry options (?project=, ?newskin=, ?try=): the cached page serves them all.
        ignoreURLParametersMatching: [/.*/],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/\/studio\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
