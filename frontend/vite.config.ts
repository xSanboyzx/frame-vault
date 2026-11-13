import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import manifest from './package.json';

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(manifest.version) },
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: { target: 'chrome110' },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
  },
});
