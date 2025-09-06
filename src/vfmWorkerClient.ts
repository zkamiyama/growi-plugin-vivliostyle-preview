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
      if (!res.ok) throw new Error('fetch failed');
      const txt = await res.text();
      const blob = new Blob([txt], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      const w = new Worker(url);
      // revoke objectURL after worker created (worker keeps source)
      URL.revokeObjectURL(url);
      return w;
    } catch (e) {
      // fallback: small inline worker that imports vfm via importScripts
      const inline = `self.onmessage = ${String((ev:any)=>{})};`;
      const blob = new Blob([`importScripts('https://unpkg.com/@vivliostyle/vfm@2.2.1/dist/vfm.min.js');\nself.onmessage = function(ev){ const seq=ev.data?.seq||null; const md=ev.data?.markdown||''; try{ const html=self.vfm.stringify(md); self.postMessage({seq,ok:true,html}); }catch(e){ self.postMessage({seq,ok:false,error:String(e)}); } };`], { type: 'application/javascript' });
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
        worker = createWorkerFromUrl();
      } catch (e) {
        // try blob fallback
        worker = await createWorkerFromBlob();
      }
      worker.onmessage = (ev) => {
        const res = ev.data as { seq?: number; ok: boolean; html?: string; error?: string };
        const cb = pending.get(res.seq ?? -1);
        if (cb) { pending.delete(res.seq ?? -1); cb(res); }
      };
      return worker;
    } catch (e) {
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
