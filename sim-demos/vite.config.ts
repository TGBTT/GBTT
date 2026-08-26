import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: process.env.VITE_SIM_BASE || (command === 'build' ? '/sim/' : '/'),
  resolve: {
    alias: {
      '@gbtt/shared': path.resolve(root, '../shared'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
}))
