import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** GitHub Pages project site: set VITE_BASE=/GBTT/ — custom domain uses `/`. */
const base = process.env.VITE_BASE || '/'
const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  base,
  resolve: {
    alias: {
      '@gbtt/shared': path.resolve(root, 'shared'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
