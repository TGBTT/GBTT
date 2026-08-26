import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** GitHub Pages project site: set VITE_BASE=/GBTT/ — custom domain uses `/`. */
const base = process.env.VITE_BASE || '/'

export default defineConfig({
  plugins: [react()],
  base,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
