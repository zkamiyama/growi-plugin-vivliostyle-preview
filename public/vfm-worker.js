/* vfm-worker.js: VFM をワーカーで実行してメインスレッドを塞がない */
self.onmessage = async (ev) => {
  // Expect messages like { seq, markdown }
  const seq = ev.data?.seq ?? null;
  const markdown = ev.data?.markdown || '';
  // special probe handling: if main thread sends __vfm_probe with payload and a MessagePort,
  // echo it back so client can detect structured clone support.
  try {
    if (ev.data && ev.data.__vfm_probe) {
      // if a port was transferred, the port will appear on ev.ports[0]
      if (ev.ports && ev.ports[0]) {
        try { ev.ports[0].postMessage(ev.data.payload); } catch (e) { /* ignore */ }
        return;
      }
      // otherwise, try to post back directly to main thread
      try { self.postMessage({ seq, __vfm_probe_echo: true, payload: ev.data.payload }); } catch (e) { /* ignore */ }
      return;
    }
  } catch (e) { /* ignore probe errors and continue normal flow */ }
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
