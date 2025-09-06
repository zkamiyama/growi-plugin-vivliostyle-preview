// vfmWorkerClient.ts
export function createVfmClient() {
  const worker = new Worker('/vfm-worker.js');
  let seq = 0;
  const pending = new Map<number,(r:{ok:boolean;html?:string;error?:string})=>void>();
  worker.onmessage = (ev) => {
    const res = ev.data;
    const cb = pending.get(res.seq);
    if (cb) { pending.delete(res.seq); cb(res); }
  };
  return {
    async stringify(markdown: string): Promise<string> {
      seq += 1;
      const id = seq;
      return new Promise((resolve, reject) => {
        pending.set(id, (r) => r.ok ? resolve(r.html!) : reject(new Error(r.error)));
        worker.postMessage({ seq:id, markdown });
      });
    },
    terminate(){ worker.terminate(); }
  };
}
