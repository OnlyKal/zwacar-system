import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// Le proxy permet au cookie httpOnly du refresh token de rester « same-origin » en développement.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_API_PROXY || 'http://localhost:4100'
  return {
    plugins: [react()],
    server: {
      port: 5180,
      proxy: {
        '/api': { target, changeOrigin: true },
        '/uploads': { target, changeOrigin: true },
      },
    },
    build: {
      chunkSizeWarningLimit: 1200,
    },
  }
})
