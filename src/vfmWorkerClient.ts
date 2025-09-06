// vfmWorkerClient.ts
export function createVfmClient() {
  let worker: Worker | null = null;
  let seq = 0;
  const pending = new Map<number,(r:{seq?:number;ok:boolean;html?:string;error?:string})=>void>();

  const createWorkerFromUrl = () => new Worker('/vfm-worker.js');

  const createWorkerFromBlob = async () => {
    // try to fetch the worker script and create blob; fallback to embedded script if fetch fails
    try {
      const res = await fetch('/vfm-worker.js');
      if (!res.ok) throw new Error('fetch failed: ' + res.status);
      const ct = res.headers.get('content-type') || '';
      // if server returns HTML (common misconfig), treat as failure so we fall back
      if (!/javascript|application\/ecmascript|text\/javascript|application\/javascript/i.test(ct)) {
        throw new Error('unexpected content-type: ' + ct);
      }
      const txt = await res.text();
      const blob = new Blob([txt], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      const w = new Worker(url);
      // revoke objectURL after worker created (worker keeps source)
      URL.revokeObjectURL(url);
      return w;
    } catch (e) {
      // fallback: small inline worker that imports vfm via importScripts
      const blob = new Blob([
        `importScripts('https://unpkg.com/@vivliostyle/vfm@2.2.1/dist/vfm.min.js');\n` +
        `self.onmessage = function(ev){ const seq=ev.data?.seq||null; const md=ev.data?.markdown||''; try{ const html=self.vfm.stringify(md); self.postMessage({seq,ok:true,html}); }catch(e){ self.postMessage({seq,ok:false,error:String(e)}); } };`
      ], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      const w = new Worker(url);
      URL.revokeObjectURL(url);
      return w;
    }
  };

  const ensureWorker = async () => {
    if (worker) return worker;
    try {
      try {
        // Try to construct worker directly from URL first. This may succeed but the script
        // may be served with wrong MIME (text/html). We'll detect that by sending a ping
        // message (seq:0) and waiting briefly for a response or an error event.
        console.debug('[vfmWorkerClient] attempting Worker("/vfm-worker.js")');
        worker = createWorkerFromUrl();
        // prepare a one-shot ping responder
        const pingOk = await new Promise<boolean>((resolve) => {
          let done = false;
          const timer = window.setTimeout(() => { if (!done) { done = true; resolve(false); } }, 1500);
          const onMsg = (ev: MessageEvent) => {
            const res = ev.data as { seq?: number } | undefined;
            if (res && res.seq === 0) {
              if (!done) { done = true; clearTimeout(timer); resolve(true); }
            }
          };
          const onErr = (_ev: any) => { if (!done) { done = true; clearTimeout(timer); resolve(false); } };
          // attach temporary handlers
          worker!.addEventListener('message', onMsg as EventListener);
          worker!.addEventListener('error', onErr as EventListener);
          try { worker!.postMessage({ seq: 0, markdown: '' }); } catch (e) { if (!done) { done = true; clearTimeout(timer); resolve(false); } }
        });
        if (!pingOk) {
          // worker created but not responding (likely MIME/script error) -> fallback
          try { worker.terminate(); } catch (e) { /* ignore */ }
          worker = null;
          throw new Error('worker ping failed (possible wrong MIME or script error)');
        }
        console.debug('[vfmWorkerClient] worker created and pinged /vfm-worker.js');
      } catch (e) {
        console.warn('[vfmWorkerClient] Worker(/vfm-worker.js) failed or unresponsive, attempting fetch+blob fallback', e);
        try {
          worker = await createWorkerFromBlob();
          console.debug('[vfmWorkerClient] worker created from blob/fetch fallback');
        } catch (e2) {
          console.error('[vfmWorkerClient] blob fallback failed, attempting inline blob worker', e2);
          worker = await createWorkerFromBlob();
        }
      }
      worker.onmessage = (ev) => {
        const res = ev.data as { seq?: number; ok: boolean; html?: string; error?: string };
        console.debug('[vfmWorkerClient] worker.onmessage', res);
        const cb = pending.get(res.seq ?? -1);
        if (cb) { pending.delete(res.seq ?? -1); cb(res); }
      };
      return worker;
    } catch (e) {
      console.error('[vfmWorkerClient] ensureWorker failed', e);
      throw e;
    }
  };

  return {
    async stringify(markdown: string): Promise<string> {
      seq += 1;
      const id = seq;
      const w = await ensureWorker();
      return new Promise((resolve, reject) => {
        pending.set(id, (r) => r.ok ? resolve(r.html!) : reject(new Error(r.error || 'unknown')));
        try {
          console.debug('[vfmWorkerClient] postMessage to worker', { seq: id, len: markdown.length });
          w.postMessage({ seq: id, markdown });
        } catch (e) {
          pending.delete(id);
          reject(e);
        }
      });
    },
    terminate(){ if (worker) { worker.terminate(); worker = null; } }
  };
}
