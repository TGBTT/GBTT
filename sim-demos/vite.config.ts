import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: process.env.VITE_SIM_BASE || (command === 'build' ? '/sim/' : '/'),
  resolve: {
    // Shared studio components import `react` — force one copy or hooks crash after login.
    dedupe: ['react', 'react-dom'],
    alias: {
      '@gbtt/shared': path.resolve(root, '../shared'),
      react: path.resolve(root, 'node_modules/react'),
      'react-dom': path.resolve(root, 'node_modules/react-dom'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
}))
