import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // public 下のファイルを変換せずに dist 直下へコピー
    viteStaticCopy({
      targets: [
        { src: 'public/vivlio-host.html', dest: '.' },
      ],
    }),
  ],
  base: './',
  build: {
    manifest: true,
    rollupOptions: {
      input: ['/client-entry.tsx'],
    },
  },
});
