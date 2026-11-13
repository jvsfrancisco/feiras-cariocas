import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  // O MapLibre acha o worker pelo caminho do próprio arquivo; o pré-empacotamento do dev quebra isso.
  optimizeDeps: { exclude: ['maplibre-gl'] },
})
