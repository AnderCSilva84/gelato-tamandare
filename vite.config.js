import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')

  return {
    resolve: {
      dedupe: ['react', 'react-dom'],
    },
    plugins: [
      react(),
      {
        name: 'store-branding',
        transformIndexHtml(html) {
          if (mode !== 'cafe-guajara') return html
          return html
            .replaceAll('/icon-192.png', '/guajara-192.png')
            .replace('/manifest.json?v=2', '/manifest-guajara.json?v=1')
            .replace('content="#111827"', 'content="#4a2c1b"')
        },
      },
    ],
    build: {
      outDir: env.VITE_BUILD_OUT_DIR || 'dist',
      emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('jspdf') || id.includes('html2canvas') || id.includes('dompurify')) {
            return 'pdf-tools'
          }
          if (id.includes('firebase')) {
            return 'firebase'
          }
          if (id.includes('react-router-dom')) {
            return 'router'
          }
          if (id.includes('node_modules')) {
            return 'vendor'
          }
        },
      },
    },
    },
  }
})
