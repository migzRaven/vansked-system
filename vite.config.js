import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'VanSked Terminal Board',
        short_name: 'VanSked',
        description: 'Real-time van schedules for St. Bernard Terminal',
        theme_color: '#0B1B2B',
        background_color: '#F3F6FA',
        display: 'standalone',
        icons: [
          {
            src: '/pwa-192x192.png', // Added leading slash
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/pwa-512x512.png', // Added leading slash
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable' // Helps with Android icon shape
          }
        ]
      }
    })
  ],
  server: {
    host: true,
    port: 5173
  }
})