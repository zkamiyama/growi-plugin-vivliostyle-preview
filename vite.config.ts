import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// PLAN B: 一時HTMLサーバー用のメモリストア
const tempHtmlStore = new Map<string, { html: string; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5分

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // public 下のファイルを変換せずに dist 直下へコピー
    viteStaticCopy({
      targets: [
        { src: 'public/vivlio-host.html', dest: '.' },
        { src: 'public/vivlio-viewer', dest: '.' }, // PLAN B viewer
      ],
    }),
  ],
  server: {
    // PLAN B: 一時HTMLエンドポイント
    middlewareMode: false,
    fs: {
      allow: ['..'],
    },
  },
  configureServer(server) {
    // 一時HTML配信エンドポイント
    server.middlewares.use('/api/vivlio-temp', (req, res, next) => {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const id = url.pathname.split('/').pop()?.replace('.html', '');
      
      if (req.method === 'POST' && url.pathname === '/api/vivlio-temp') {
        // HTML保存
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
          try {
            const { markdown } = JSON.parse(body);
            const tempId = Math.random().toString(36).substr(2, 9);
            
            // 実際のVFM変換（import が使えないのでフロントエンド側で処理する想定）
            // または単純なMarkdown表示
            const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Vivliostyle Preview</title>
  <script src="https://unpkg.com/@vivliostyle/vfm@2.2.1/dist/vfm.min.js"></script>
  <style>
    @page { size: A5; margin: 12mm; }
    body { font-family: system-ui, sans-serif; line-height: 1.5; margin: 2em; }
    h1, h2, h3 { color: #333; }
    pre { background: #f5f5f5; padding: 1em; border-radius: 4px; }
    code { background: #f0f0f0; padding: 0.2em 0.4em; border-radius: 2px; }
  </style>
</head>
<body>
  <div id="content">Loading...</div>
  <script>
    // VFM でマークダウンを変換
    document.addEventListener('DOMContentLoaded', () => {
      if (window.vfm) {
        const markdown = ${JSON.stringify(markdown)};
        try {
          const html = vfm.stringify ? vfm.stringify(markdown) : 
                      vfm.render ? '<div>' + vfm.render(markdown) + '</div>' :
                      '<pre>' + markdown + '</pre>';
          if (vfm.stringify) {
            // stringify は完全HTML を返すのでそのまま置換
            document.open();
            document.write(html);
            document.close();
          } else {
            document.getElementById('content').innerHTML = html;
          }
        } catch (e) {
          document.getElementById('content').innerHTML = '<pre>' + markdown + '</pre>';
        }
      } else {
        document.getElementById('content').innerHTML = '<pre>' + ${JSON.stringify(markdown)} + '</pre>';
      }
    });
  </script>
</body>
</html>`;
            
            tempHtmlStore.set(tempId, { html, timestamp: Date.now() });
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ id: tempId, url: `/api/vivlio-temp/${tempId}.html` }));
          } catch (e) {
            res.statusCode = 400;
            res.end('Invalid JSON');
          }
        });
      } else if (req.method === 'GET' && id) {
        // HTML配信
        const entry = tempHtmlStore.get(id);
        if (!entry || Date.now() - entry.timestamp > CACHE_TTL) {
          res.statusCode = 404;
          res.end('Not found or expired');
          return;
        }
        
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(entry.html);
      } else {
        next();
      }
    });
    
    // 定期クリーンアップ
    setInterval(() => {
      const now = Date.now();
      for (const [id, entry] of tempHtmlStore.entries()) {
        if (now - entry.timestamp > CACHE_TTL) {
          tempHtmlStore.delete(id);
        }
      }
    }, 60000); // 1分ごと
  },
  base: './',
  build: {
    manifest: true,
    rollupOptions: {
      input: ['/client-entry.tsx'],
    },
  },
});
