// vfmWorkerClient.ts
export function createVfmClient() {
  let worker: Worker | null = null;
  let seq = 0;
  const pending = new Map<number,(r:{seq?:number;ok:boolean;html?:string;error?:string})=>void>();
  let structuredCloneSupported: boolean | null = null;
  const progressHandlers = new Set<(payload: { seq: number | null; stage: string; timestamp: number }) => void>();
  
  // Debouncing state for optimized stringifyDebounced
  let debounceTimer: number | null = null;
  let latestRequest: { markdown: string; options?: any; metadata?: unknown; resolve: (html: string) => void; reject: (err: Error) => void } | null = null;

  const emitProgress = (payload: { seq: number | null; stage: string; timestamp: number }) => {
    for (const handler of progressHandlers) {
      try { handler(payload); } catch (e) { /* ignore */ }
    }
  };

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
          `self.onmessage = function(ev){ var data = ev.data; try{ if(typeof data === 'string'){ data = JSON.parse(data); } }catch(e){} var seq = data && (data.seq?data.seq:null); var md = data && data.markdown?data.markdown : ''; var options = data && data.options?data.options: undefined; var metadata = data && data.metadata?data.metadata: undefined; try{ var runner = null; if(typeof self.vfm !== 'undefined' && self.vfm.stringify){ runner = self.vfm.stringify; } else if (typeof vfm !== 'undefined' && vfm.stringify){ runner = vfm.stringify; } var html = ''; if(runner){ if(typeof metadata !== 'undefined'){ if(typeof options !== 'undefined'){ html = runner(md, options, metadata); } else { html = runner(md, undefined, metadata); } } else { html = typeof options !== 'undefined' ? runner(md, options) : runner(md); } } self.postMessage({seq,ok:true,html}); }catch(e){ self.postMessage({seq,ok:false,error:String(e)}); } };`;
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
        let resRaw = ev.data;
        // worker posts back JSON string; handle both object and string for robustness
        if (typeof resRaw === 'string') {
          try { resRaw = JSON.parse(resRaw); } catch (e) { console.error('[vfmWorkerClient] failed to parse worker JSON', e); resRaw = { seq: null, ok: false, error: 'invalid json from worker' }; }
        }
        const res = resRaw as { seq?: number; ok?: boolean; html?: string; error?: string; type?: string; stage?: string; timestamp?: number };

        if ((res as any)?.type === 'progress' && typeof res.stage === 'string') {
          emitProgress({ seq: typeof res.seq === 'number' ? res.seq : null, stage: res.stage, timestamp: res.timestamp ?? Date.now() });
          return;
        }

        if (typeof res.ok !== 'boolean') {
          console.warn('[vfmWorkerClient] unexpected worker payload', res);
          return;
        }

        console.debug('[vfmWorkerClient] worker.onmessage', { seq: res.seq, ok: res.ok, htmlLen: res.html ? res.html.length : 0 });
        const cb = pending.get(res.seq ?? -1);
        if (cb) {
          pending.delete(res.seq ?? -1);
          const finalRes: { seq?: number; ok: boolean; html?: string; error?: string } = {
            seq: res.seq,
            ok: res.ok,
            html: res.html,
            error: res.error,
          };
          cb(finalRes);
        }
      };
      // Detect structured clone support once: try a round-trip using MessageChannel
      try {
        if (structuredCloneSupported === null) {
          structuredCloneSupported = false;
          const mc = new MessageChannel();
          const testObj = { __vfm_test: true, n: 1 };
          const tPromise = new Promise<boolean>((resolve) => {
            mc.port1.onmessage = (m) => {
              try {
                const d = m.data;
                // if we receive an object with same marker, structured clone works
                if (d && d.__vfm_test === true) resolve(true); else resolve(false);
              } catch (e) { resolve(false); }
            };
            // send the test object to the worker via channel; worker should echo
            try {
              // worker may not support ports; post a message that includes the port
              worker!.postMessage({ seq: 0, __vfm_probe: true, payload: testObj }, [mc.port2]);
            } catch (e) {
              // fallback: try posting without transfer
              try { worker!.postMessage({ seq: 0, __vfm_probe: true, payload: testObj }); } catch (_) { /* ignore */ }
            }
            // fallback timeout
            setTimeout(() => resolve(false), 400);
          });
          try { structuredCloneSupported = await tPromise; } catch (e) { structuredCloneSupported = false; }
          console.debug('[vfmWorkerClient] structuredCloneSupported=', structuredCloneSupported);
        }
      } catch (e) {
        structuredCloneSupported = false;
      }
      return worker as Worker;
    } catch (err) {
      console.error('[vfmWorkerClient] ensureWorker failed', err);
      throw err;
    }
  };

  return {
    async stringify(markdown: string, options?: any, metadata?: unknown): Promise<string> {
      seq += 1;
      const id = seq;
      const w = await ensureWorker();
      return new Promise((resolve, reject) => {
        pending.set(id, (r) => r.ok ? resolve(r.html!) : reject(new Error(r.error || 'unknown')));
        try {
          const payloadObj: any = { seq: id, markdown };
          if (typeof options !== 'undefined') payloadObj.options = options;
          if (typeof metadata !== 'undefined') payloadObj.metadata = metadata;
          // If structured clone is known unsupported, send JSON string only
          if (structuredCloneSupported === false) {
            const payload = JSON.stringify(payloadObj);
            console.debug('[vfmWorkerClient] sending JSON string because structuredClone unsupported', { seq: id, len: markdown.length });
            w.postMessage(payload);
          } else {
            // attempt structured postMessage, but ensure fallback uses JSON.stringify (not String(obj))
            try {
              console.debug('[vfmWorkerClient] postMessage to worker (object)', { seq: id, len: markdown.length });
              w.postMessage(payloadObj);
            } catch (postErr) {
              const payload = JSON.stringify(payloadObj);
              console.debug('[vfmWorkerClient] postMessage fallback to json string', { seq: id, err: String(postErr) });
              try { w.postMessage(payload); }
              catch (e) { console.error('[vfmWorkerClient] postMessage fallback failed', e); throw e; }
            }
          }
        } catch (e) {
          pending.delete(id);
          reject(e);
        }
      });
    },
    /**
     * Debounced stringify: accumulates rapid requests and executes only the latest
     * Reduces redundant worker invocations during rapid markdown updates (e.g., typing)
     * @param markdown - Markdown content to stringify
     * @param options - VFM options
     * @param metadata - Metadata
     * @param debounceMs - Milliseconds to wait before executing (default: 150ms)
     */
    async stringifyDebounced(markdown: string, options?: any, metadata?: unknown, debounceMs = 150): Promise<string> {
      // Cancel any pending request
      if (latestRequest) {
        latestRequest.reject(new Error('superseded by newer request'));
        latestRequest = null;
      }
      
      if (debounceTimer !== null) {
        window.clearTimeout(debounceTimer);
        debounceTimer = null;
      }

      return new Promise<string>((resolve, reject) => {
        latestRequest = { markdown, options, metadata, resolve, reject };
        
        debounceTimer = window.setTimeout(async () => {
          const req = latestRequest;
          latestRequest = null;
          debounceTimer = null;
          
          if (!req) {
            reject(new Error('request cancelled'));
            return;
          }
          
          try {
            const html = await this.stringify(req.markdown, req.options, req.metadata);
            req.resolve(html);
          } catch (err) {
            req.reject(err instanceof Error ? err : new Error(String(err)));
          }
        }, debounceMs);
      });
    },
    /**
     * Cancel all pending requests (reject promises) but keep the worker alive.
     * Pending promises will be rejected with Error('cancelled').
     */
    cancelPending() {
      try {
        for (const [id, cb] of Array.from(pending.entries())) {
          try { pending.delete(id); cb({ seq: id, ok: false, error: 'cancelled' }); } catch (e) { /* ignore */ }
        }
        if (latestRequest) {
          latestRequest.reject(new Error('cancelled'));
          latestRequest = null;
        }
        if (debounceTimer !== null) {
          window.clearTimeout(debounceTimer);
          debounceTimer = null;
        }
        // Do NOT terminate the worker here; allow reuse
      } catch (e) { /* ignore */ }
    },
    /**
     * Convenience: cancel previous pending jobs then start a new stringify job.
     * Useful for editor-update-driven calls where newer input supersedes older.
     */
    async stringifyLatest(markdown: string, options?: any, metadata?: unknown): Promise<string> {
      // Cancel any in-flight jobs first
      try { this.cancelPending(); } catch (e) { /* ignore */ }
      return this.stringify(markdown, options, metadata);
    },
    subscribeProgress(handler: (payload: { seq: number | null; stage: string; timestamp: number }) => void) {
      progressHandlers.add(handler);
      return () => {
        progressHandlers.delete(handler);
      };
    },
    terminate(){ 
      if (worker) { worker.terminate(); worker = null; }
      if (debounceTimer !== null) {
        window.clearTimeout(debounceTimer);
        debounceTimer = null;
      }
      if (latestRequest) {
        latestRequest.reject(new Error('worker terminated'));
        latestRequest = null;
      }
    }
  };
}

// Module-level shared client accessor. Use this to ensure a single client
// is reused across the app (avoids repeated worker creation / network fetch).
const SHARED_CLIENT_KEY = '__vivlio_shared_vfm_client__';

export function getSharedVfmClient() {
  const gw: any = (globalThis as any);
  if (!gw[SHARED_CLIENT_KEY]) gw[SHARED_CLIENT_KEY] = createVfmClient();
  return gw[SHARED_CLIENT_KEY] as ReturnType<typeof createVfmClient>;
}

export function resetSharedVfmClient() {
  const gw: any = (globalThis as any);
  const existing = gw[SHARED_CLIENT_KEY];
  if (existing && typeof existing.terminate === 'function') {
    try { existing.terminate(); } catch (e) { /* ignore */ }
  }
  delete gw[SHARED_CLIENT_KEY];
}
