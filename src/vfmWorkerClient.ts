// vfmWorkerClient.ts
export function createVfmClient() {
  let worker: Worker | null = null;
  let seq = 0;
  const pending = new Map<number,(r:{seq?:number;ok:boolean;html?:string;error?:string})=>void>();

  const createWorkerFromUrl = () => new Worker('/vfm-worker.js');

  // create worker from bundled worker file (Vite/Rollup will emit this as a separate chunk)
  const createWorkerFromBundle = () => new Worker(new URL('./vfmWorker.worker.ts', import.meta.url), { type: 'module' });

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
      // fallback: try to fetch the vfm lib on the main thread and inline it into the worker
      try {
        const libUrl = 'https://unpkg.com/@vivliostyle/vfm@2.2.1/dist/vfm.min.js';
        console.debug('[vfmWorkerClient] attempting to fetch vfm lib to inline into worker', libUrl);
        const libRes = await fetch(libUrl);
        if (!libRes.ok) throw new Error('vfm lib fetch failed: ' + libRes.status);
        const libTxt = await libRes.text();
        const workerSrc = libTxt + '\n' +
          `self.onmessage = function(ev){ var seq=ev.data&&ev.data.seq?ev.data.seq:null; var md=ev.data&&ev.data.markdown?ev.data.markdown:''; try{ var html=(typeof self.vfm!=='undefined'&&self.vfm.stringify)?self.vfm.stringify(md): (typeof vfm!=='undefined'&&vfm.stringify)?vfm.stringify(md): ''; self.postMessage({seq,ok:true,html}); }catch(e){ self.postMessage({seq,ok:false,error:String(e)}); } };`;
        const blob = new Blob([workerSrc], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        const w = new Worker(url);
        URL.revokeObjectURL(url);
        return w;
      } catch (e2) {
        console.error('[vfmWorkerClient] inline fetch-of-lib failed; importScripts fallback disabled', e2);
        throw e2;
      }
    }
  };

  const ensureWorker = async (): Promise<Worker> => {
    if (worker) return worker as Worker;
    try {
      // 1) Try bundled worker first (no network/CORS issues)
      try {
        console.debug('[vfmWorkerClient] attempting bundled worker createWorkerFromBundle()');
        worker = createWorkerFromBundle();
        console.debug('[vfmWorkerClient] worker created from bundled worker');
      } catch (bundleErr) {
        // 2) Try fetch-first -> Blob worker
        try {
          console.debug('[vfmWorkerClient] bundled worker failed, attempting fetch-first -> createWorkerFromBlob("/vfm-worker.js")', bundleErr);
          worker = await createWorkerFromBlob();
          console.debug('[vfmWorkerClient] worker created from fetch+blob or inline fallback');
        } catch (e) {
          // 3) Fallback: create worker from URL and ping it
          console.warn('[vfmWorkerClient] fetch+blob fallback failed, attempting direct Worker("/vfm-worker.js") with ping', e);
          worker = createWorkerFromUrl();
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
            try { worker!.postMessage({ seq: 0, markdown: '' }); } catch (e2) { if (!done) { done = true; clearTimeout(timer); resolve(false); } }
          });
          if (!pingOk) {
            try { worker.terminate(); } catch (err) { /* ignore */ }
            worker = null;
            throw new Error('worker ping failed (possible wrong MIME or script error)');
          }
          console.debug('[vfmWorkerClient] worker created and pinged /vfm-worker.js');
        }
      }

      worker.onmessage = (ev) => {
        const res = ev.data as { seq?: number; ok: boolean; html?: string; error?: string };
        console.debug('[vfmWorkerClient] worker.onmessage', res);
        const cb = pending.get(res.seq ?? -1);
        if (cb) { pending.delete(res.seq ?? -1); cb(res); }
      };
      return worker as Worker;
    } catch (err) {
      console.error('[vfmWorkerClient] ensureWorker failed', err);
      throw err;
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
