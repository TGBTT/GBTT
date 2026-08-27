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
    dedupe: ['react', 'react-dom'],
    alias: {
      '@gbtt/shared': path.resolve(root, 'shared'),
      react: path.resolve(root, 'node_modules/react'),
      'react-dom': path.resolve(root, 'node_modules/react-dom'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
