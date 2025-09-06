// Install defensive highlighter shims and handlers before vfm initializes.
// This module is imported by the worker entry before importing vfm so that
// any internal references to Prism/hljs will resolve to our shims.
(function installShims() {
  try {
    (self as any).onunhandledrejection = (ev: any) => {
      try { console.error('[vfmWorker][unhandledrejection]', ev && ev.reason); } catch (e) { /* ignore */ }
      return true;
    };

    const escapeHtml = (s: string) => s.replace(/[&<>\"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'} as any)[c]);

    const makeWrapper = (name: string) => {
      const globalObj = (globalThis as any);
      const orig = globalObj[name];
      if (orig && typeof orig === 'object' && typeof orig.highlight === 'function') {
        const originalFn = orig.highlight.bind(orig);
        orig.highlight = function(a: any, b: any) {
          try {
            const preview = (a && a.toString && a.toString().slice ? a.toString().slice(0,80) : String(a)).slice(0,80);
            const stack = (new Error()).stack;
            console.debug('[vfmWorker][' + name + '.highlight] called', { lang: b, preview, stack });
          } catch (e) { /* ignore */ }
          if (!b) {
            return { value: escapeHtml(String(a)) };
          }
          try { return originalFn(a, b); } catch (e) {
            try { console.debug('[vfmWorker][' + name + '.highlight] error', e, (new Error()).stack); } catch (e2) { /* ignore */ }
            return { value: escapeHtml(String(a)) };
          }
        };
        globalObj[name] = orig;
      } else if (!globalObj[name]) {
        globalObj[name] = {
          highlight: function(a: any, b: any) {
            try { console.debug('[vfmWorker][' + name + '.highlight shim] called', { lang: b, preview: (a && a.toString && a.toString().slice ? a.toString().slice(0,80) : String(a)).slice(0,80), stack: (new Error()).stack }); } catch (e) { /* ignore */ }
            if (!b) return { value: escapeHtml(String(a)) };
            return { value: escapeHtml(String(a)) };
          },
        };
      }
    };

    try { makeWrapper('hljs'); } catch (e) { /* ignore */ }
    try { makeWrapper('Prism'); } catch (e) { /* ignore */ }
    try { if (!(globalThis as any).highlight) { (globalThis as any).highlight = (a: any, b: any) => { try { console.debug('[vfmWorker][highlight shim] called', { lang: b }); } catch (e) {} return { value: escapeHtml(String(a)) }; }; } } catch (e) { /* ignore */ }
  } catch (e) {
    /* ignore installation errors */
  }
})();
