import { stringify } from '@vivliostyle/vfm';

self.addEventListener('message', (ev: MessageEvent) => {
  try {
    // Accept either object or JSON-string payloads. For robustness we prefer JSON string.
    let data: any = ev.data;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch (e) { /* leave as string */ }
    }
    const seq = data && (data.seq ?? null);
    const md: string = data && data.markdown ? data.markdown : '';
    const html = stringify(md);
    // respond with JSON string to avoid any library expecting string messages
    (self as any).postMessage(JSON.stringify({ seq, ok: true, html }));
  } catch (e) {
    (self as any).postMessage(JSON.stringify({ seq: null, ok: false, error: String(e) }));
  }
});
