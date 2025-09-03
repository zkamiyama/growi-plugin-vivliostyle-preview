import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    manifest: true,
    rollupOptions: {
      input: ['/client-entry.tsx'],
      external: ['react', 'react-dom'],
    },
  },
});
