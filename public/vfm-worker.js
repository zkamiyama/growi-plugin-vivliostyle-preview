/* vfm-worker.js: VFM をワーカーで実行してメインスレッドを塞がない */
self.onmessage = async (ev) => {
  // Expect messages like { seq, markdown }
  const seq = ev.data?.seq ?? null;
  const markdown = ev.data?.markdown || '';
  // CDN 利用の簡易例（本番はバンドル推奨）
  if (!self.vfm) {
    try {
      importScripts('https://unpkg.com/@vivliostyle/vfm@2.2.1/dist/vfm.min.js');
    } catch (e) {
      // importScripts may fail in some CSP-restricted hosts
      self.postMessage({ seq, ok: false, error: 'importScripts failed: ' + String(e) });
      return;
    }
  }
  try {
    const html = self.vfm.stringify(markdown);
    self.postMessage({ seq, ok: true, html });
  } catch (e) {
    self.postMessage({ seq, ok: false, error: String(e) });
  }
};
