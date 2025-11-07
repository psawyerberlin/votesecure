import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    lib: {
      entry: 'main.tsx',
      formats: ['es'],
      fileName: 'main'
    },
    rollupOptions: {
      // Don't bundle React - use CDN or external
      external: [],
      output: {
        globals: {}
      }
    }
  },
  server: {
    port: 3000,
    open: true
  }
});
