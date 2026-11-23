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
  build: {
    // O MapLibre GL (~1,07 MB minificado) já carrega em lazy só ao abrir o mapa.
    chunkSizeWarningLimit: 1150,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (/[/\\]node_modules[/\\](react|react-dom|scheduler)[/\\]/.test(id)) return 'react'
          if (/[/\\]node_modules[/\\]maplibre-gl[/\\]/.test(id)) return 'maplibre-gl'
          if (/[/\\]node_modules[/\\]leaflet[/\\]/.test(id)) return 'leaflet'
          return undefined
        },
      },
    },
  },
})
