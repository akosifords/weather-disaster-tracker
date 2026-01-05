import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      // Dev-only proxy to avoid CORS when pulling official PAGASA JSON endpoints.
      // In production you’ll need a reverse-proxy (or CORS-enabled endpoints) for this to work.
      '/pagasa': {
        target: 'https://bagong.pagasa.dost.gov.ph',
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p.replace(/^\/pagasa/, ''),
        configure: (proxy) => {
          // PAGASA endpoints sometimes return empty responses when an unexpected Origin/Referer is forwarded.
          // Since this is a dev proxy, strip those headers to mimic direct, same-site requests.
          proxy.on('proxyReq', (proxyReq) => {
            // Some upstream middleware behaves differently based on Origin/Referer.
            // Force them to match the target host rather than localhost.
            proxyReq.removeHeader('origin');
            proxyReq.removeHeader('referer');
            proxyReq.setHeader('origin', 'https://bagong.pagasa.dost.gov.ph');
            proxyReq.setHeader('referer', 'https://bagong.pagasa.dost.gov.ph/');
          });
        },
      },
    },
  },
})
