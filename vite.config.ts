import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'assets/logo-mark.png'],
      manifest: {
        name: '하늘 웰니스 랩',
        short_name: '하늘 웰니스',
        description: '인바디 체성분을 추적하고 코치·커뮤니티와 함께하는 웰니스 포털',
        lang: 'ko',
        theme_color: '#0A1326',
        background_color: '#060B17',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,png,jpg,svg,woff2}'],
        // don't cache cross-origin Supabase/API calls
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === self.location.origin && /\.(png|jpg|jpeg|svg|woff2)$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'assets', expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 } },
          },
        ],
      },
    }),
  ],
})
