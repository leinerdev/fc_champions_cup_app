import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.svg', 'icon.svg', 'apple-touch-icon.png', 'favicon-48.png'],
      manifest: {
        name: 'FC CHAMPIONS CUP',
        short_name: 'FC Champions',
        description: 'Organiza torneos de FC27 con tus amigos: ligas, liguillas y copas.',
        lang: 'es',
        theme_color: '#050B1F',
        background_color: '#050B1F',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['**/*latin-ext*', '**/*vietnamese*'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: '/index.html',
        // Nunca cachear llamadas a Supabase: siempre datos frescos.
        navigateFallbackDenylist: [/^\/rest\//, /^\/auth\//, /^\/storage\//],
        cleanupOutdatedCaches: true,
        // Manejadores de notificaciones push (public/push-sw.js)
        importScripts: ['push-sw.js'],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'supabase/tests/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
})
