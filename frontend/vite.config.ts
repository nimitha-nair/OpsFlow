import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Backend origin for the dev proxy. Override with BACKEND_URL if the backend
// runs elsewhere.
const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:5000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Requests to /api/* are forwarded to the backend with the /api prefix
      // stripped, so the frontend avoids CORS in development.
      '/api': {
        target: backendUrl,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
