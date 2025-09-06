import { stringify } from '@vivliostyle/vfm';

self.addEventListener('message', (ev: MessageEvent) => {
  const data = ev.data || {};
  const seq = data.seq ?? null;
  const md: string = data.markdown ?? '';
  try {
    const html = stringify(md);
    (self as any).postMessage({ seq, ok: true, html });
  } catch (e) {
    (self as any).postMessage({ seq, ok: false, error: String(e) });
  }
});
