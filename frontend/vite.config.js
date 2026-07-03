import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Hard fallback so production never inlines the literal string "undefined"
// when the Vercel env var is missing. Update only if backend host changes.
const DEFAULT_BACKEND_URL = 'http://localhost:8001'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendUrl =
    env.VITE_BACKEND_URL ||
    env.REACT_APP_BACKEND_URL ||
    process.env.VITE_BACKEND_URL ||
    process.env.REACT_APP_BACKEND_URL ||
    DEFAULT_BACKEND_URL

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 3000,
      strictPort: true,
      allowedHosts: true,
      hmr: { clientPort: 443 },
    },
    define: {
      // Both names supported — code in lib/api.js and AddVoucherSheet.jsx use either.
      'process.env.REACT_APP_BACKEND_URL': JSON.stringify(backendUrl),
      'import.meta.env.VITE_BACKEND_URL': JSON.stringify(backendUrl),
    },
  }
})
