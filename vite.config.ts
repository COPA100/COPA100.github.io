import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
  server: { port: 5210, strictPort: true },
  preview: { port: 5210, strictPort: true },
  build: { chunkSizeWarningLimit: 1400 },
  worker: { format: 'es' },
})
