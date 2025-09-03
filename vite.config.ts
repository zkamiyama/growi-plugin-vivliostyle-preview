import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@vivliostyle/react': path.resolve(__dirname, 'node_modules/@vivliostyle/react/dist/react-vivliostyle.modern.mjs'),
    },
  },
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

