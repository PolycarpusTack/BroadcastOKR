import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'

// One source of truth for the version: package.json, which is also what
// electron-builder names the installer after.
const { version } = JSON.parse(readFileSync('./package.json', 'utf8'))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  optimizeDeps: {
    entries: ['index.html'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) return 'vendor-react';
          if (id.includes('node_modules/react-router')) return 'vendor-router';
          if (id.includes('node_modules/zustand')) return 'vendor-state';
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    // Bridge tests use node:test (run via `npm run test:bridge`), e2e uses Playwright
    exclude: [...configDefaults.exclude, 'bridge/**', 'e2e/**'],
  },
})
