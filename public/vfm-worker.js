/* vfm-worker.js: VFM をワーカーで実行してメインスレッドを塞がない */
self.onmessage = async (ev) => {
  const markdown = ev.data?.markdown || '';
  // CDN 利用の簡易例（本番はバンドル推奨）
  if (!self.vfm) {
    importScripts('https://unpkg.com/@vivliostyle/vfm@2.2.1/dist/vfm.min.js');
  }
  try {
    const html = self.vfm.stringify(markdown);
    self.postMessage({ ok: true, html });
  } catch (e) {
    self.postMessage({ ok: false, error: String(e) });
  }
};
