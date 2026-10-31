import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        chunkFileNames: (chunkInfo) => {
          const name = chunkInfo.name.replace(
            /turndown-plugin-gfm/g,
            'gfm-plugin'
          )
          return `assets/${name}-[hash].js`
        }
      }
    }
  }
})
